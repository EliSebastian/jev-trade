import { describe, expect, it } from 'vitest'
import type { JevContext } from '~~/server/utils/jev/context'
import { buildQuestions, createJevOracle, toJudgment } from '~~/server/utils/jev/oracle'
import type { EvaluationAnswers, FakeEvaluationModel } from '~~/server/utils/jev/oracle'

function ctx(overrides: Partial<JevContext> = {}): JevContext {
  const facts = { time: ['It is Wednesday 14:05 ET.'], market: ['open'], price: ['flat'], position: ['No position is held in AAPL.'], account: ['ok'] }
  return {
    symbol: 'AAPL',
    assetClass: 'us_equity',
    hasPosition: false,
    barCount: 60,
    lastPrice: 189.42,
    stale: false,
    facts,
    news: [],
    state: {
      symbol: 'AAPL',
      assetClass: 'stock',
      time: facts.time,
      market: facts.market,
      price: facts.price,
      position: { status: 'flat', facts: facts.position },
      account: facts.account,
      news: [],
      newsNote: 'No news for AAPL in the last 6 hours.'
    },
    ...overrides
  }
}

const newsItem = { headline: 'h', summary: 's', source: 'x', createdAt: '2026-09-23T16:00:00.000Z', url: null }

const answers = (extra: Partial<EvaluationAnswers> = {}): EvaluationAnswers => ({
  action: { type: 'choice', choice: 'buy', probabilities: { buy: 0.82, hold: 0.18 } },
  trend: { type: 'score', score: 3.2, probabilities: { 0: 0, 1: 0, 2: 0.2, 3: 0.4, 4: 0.4 } },
  avoid: { type: 'boolean', probability: 0.1 },
  ...extra
})

/** Minimal Experimental_EvaluationModelV4 that records calls and returns canned answers. */
function fakeModel(result: { answers: EvaluationAnswers, confidence?: Record<string, number> }) {
  const calls: { state: unknown, questions: Record<string, unknown> }[] = []
  const model: FakeEvaluationModel = {
    specificationVersion: 'v4',
    provider: 'test',
    modelId: 'jev',
    supportedQuestionTypes: ['choice', 'score', 'boolean'],
    async doEvaluate(options) {
      calls.push({ state: options.state, questions: options.questions })
      return {
        answers: result.answers,
        warnings: [],
        ...(result.confidence ? { providerMetadata: { typesafe: { confidence: result.confidence } } } : {})
      }
    }
  }
  return { model, calls }
}

describe('buildQuestions', () => {
  it('offers buy or hold when flat and sell or hold when long', () => {
    const flat = buildQuestions(ctx())
    expect(Object.keys(flat.action.criteria)).toEqual(['buy', 'hold'])
    expect(String(flat.action.instructions)).toContain('`position.status` is flat')

    const long = buildQuestions(ctx({ hasPosition: true }))
    expect(Object.keys(long.action.criteria)).toEqual(['sell', 'hold'])
    expect(String(long.action.instructions)).toContain('`position.status` is long')
  })

  it('always asks trend and avoid, and newsTone only when there is news', () => {
    const noNews = buildQuestions(ctx())
    expect(Object.keys(noNews)).toEqual(['action', 'trend', 'avoid'])
    expect(noNews.trend.type).toBe('score')
    expect(noNews.trend.criteria).toHaveLength(5)
    expect(noNews.avoid.type).toBe('boolean')
    expect(noNews.avoid.criteria).toEqual({
      true: 'A concrete reason to stand aside is present in the state.',
      false: 'Nothing in the state singles this asset out as unusually risky right now.'
    })

    const withNews = buildQuestions(ctx({ news: [newsItem] }))
    expect(Object.keys(withNews)).toEqual(['action', 'trend', 'newsTone', 'avoid'])
    expect(withNews.newsTone!.criteria).toHaveLength(5)
  })
})

describe('toJudgment', () => {
  it('maps the answers and the provider confidence of the action question', () => {
    const judgment = toJudgment({ answers: answers(), providerMetadata: { typesafe: { confidence: { action: 0.7, trend: 0.5 } } } })
    expect(judgment).toEqual({
      verdict: 'buy',
      probabilities: { buy: 0.82, hold: 0.18 },
      confidence: 0.7,
      trend: 3.2,
      newsTone: null,
      avoid: 0.1
    })
  })

  it('reports null confidence when the provider omits it and reads newsTone when present', () => {
    const judgment = toJudgment({ answers: answers({ newsTone: { type: 'score', score: 1.4 } }) })
    expect(judgment.confidence).toBeNull()
    expect(judgment.newsTone).toBe(1.4)
  })

  it('falls back to the chosen option probability of 1 when no distribution came back', () => {
    const judgment = toJudgment({ answers: answers({ action: { type: 'choice', choice: 'hold' } }) })
    expect(judgment.verdict).toBe('hold')
    expect(judgment.probabilities).toEqual({ hold: 1 })
  })

  it('rejects a malformed answer set', () => {
    expect(() => toJudgment({ answers: { action: { type: 'boolean', probability: 1 } } as unknown as EvaluationAnswers })).toThrow(/action/)
  })
})

describe('createJevOracle', () => {
  it('sends the context state and questions through experimental_evaluate and returns a judgment', async () => {
    const { model, calls } = fakeModel({ answers: answers(), confidence: { action: 0.7, trend: 0.5 } })
    const oracle = createJevOracle({ model })
    const context = ctx()
    const judgment = await oracle.ask(context)

    expect(calls).toHaveLength(1)
    expect(calls[0]!.state).toEqual(context.state)
    expect(Object.keys(calls[0]!.questions)).toEqual(['action', 'trend', 'avoid'])
    expect(judgment.verdict).toBe('buy')
    expect(judgment.confidence).toBe(0.7)
  })

  it('propagates model failures', async () => {
    const model: FakeEvaluationModel = {
      specificationVersion: 'v4',
      provider: 'test',
      modelId: 'jev',
      supportedQuestionTypes: ['choice', 'score', 'boolean'],
      async doEvaluate() { throw new Error('gateway down') }
    }
    const oracle = createJevOracle({ model })
    await expect(oracle.ask(ctx())).rejects.toThrow('gateway down')
  })
})

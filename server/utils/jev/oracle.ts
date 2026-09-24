import { createGateway, experimental_evaluate } from 'ai'
import type { Experimental_EvaluationModel, Experimental_EvaluationQuestion } from 'ai'
import type { JevVerdict } from '#shared/types/jev'
import type { JevContext } from './context'

/**
 * The only module that talks to the AI SDK. Everything else sees `JevOracle.ask()`.
 * Jev (TypeSafe) answers typed questions over the context state; it never writes prose.
 */

export const JEV_MODEL_ID = 'typesafe-ai/jev'

type Question = Experimental_EvaluationQuestion
type ChoiceQuestion = Extract<Question, { type: 'choice' }>
type ScoreQuestion = Extract<Question, { type: 'score' }>
type BooleanQuestion = Extract<Question, { type: 'boolean' }>

/** A concrete `Experimental_EvaluationModelV4`; tests build one by hand. */
export type FakeEvaluationModel = Exclude<Experimental_EvaluationModel, string>

export type EvaluationAnswer =
  | { type: 'choice', choice: string, probabilities?: Record<string, number> }
  | { type: 'score', score: number, probabilities?: Record<string, number> }
  | { type: 'boolean', probability: number }

export type EvaluationAnswers = Record<string, EvaluationAnswer>

export interface EvaluationOutcome {
  answers: EvaluationAnswers
  providerMetadata?: Record<string, unknown>
}

export interface JevJudgment {
  verdict: JevVerdict
  probabilities: Record<string, number>
  /** Concentration of the `action` distribution, from TypeSafe's provider metadata. */
  confidence: number | null
  trend: number | null
  newsTone: number | null
  avoid: number
}

export interface JevQuestions {
  action: ChoiceQuestion
  trend: ScoreQuestion
  newsTone?: ScoreQuestion
  avoid: BooleanQuestion
}

export interface JevOracle {
  ask(ctx: JevContext): Promise<JevJudgment>
}

/* ---------- questions ---------- */

const ACTION_PREAMBLE = 'Using `price`, `market`, `account` and `news`, decide what a cautious short-term, long-only trader should do with `symbol` right now.'

const ENTRY_CRITERIA = {
  buy: 'Open a small long position now because the evidence favors a higher price over the next hour or so: momentum and trend agree, price is not overextended (not overbought, not far above its average), volume supports the move, and news is neutral or positive. Does not cover: a price that merely looks cheap after a sharp drop with no sign of stabilizing, or a rally that already looks stretched.',
  hold: 'Stay flat because the evidence is mixed, weak, stale or negative: no clear direction, overbought or overextended, unusual volatility, negative news, market about to close, or not enough edge to justify entering. This is the default whenever buying is not clearly better.'
}

const EXIT_CRITERIA = {
  sell: 'Close the whole position now because the evidence has turned against it: momentum reversed, trend broken, negative news arrived, volatility spiked, the market is about to close on a stock position, or a gain is being given back. Does not cover: small ordinary pullbacks inside an intact uptrend.',
  hold: 'Keep the position because the reasons for holding are intact: trend and momentum still favor higher prices or are neutral, no adverse news, and any pullback is ordinary noise. This is the default whenever selling is not clearly better.'
}

const TREND_LEVELS = [
  'Strongly bearish: falling sharply on several horizons, well below its average, weak momentum, volume confirms selling.',
  'Mildly bearish: drifting lower or below its average with soft momentum, no acceleration.',
  'Neutral or range-bound: mixed or flat readings, price near its average, momentum mid-range.',
  'Mildly bullish: drifting higher or above its average with firm momentum, no acceleration.',
  'Strongly bullish: rising sharply on several horizons, well above its average, strong momentum, volume confirms buying.'
]

const NEWS_LEVELS = [
  'Clearly negative: a material adverse event (missed earnings, guidance cut, lawsuit, regulatory action, outage, downgrade, hack).',
  'Somewhat negative: cautious, skeptical or mildly unfavorable coverage without a concrete adverse event.',
  'Neutral or unrelated: routine mentions, market roundups, or items that do not really concern this asset.',
  'Somewhat positive: favorable coverage, analyst optimism, product or partnership news of modest weight.',
  'Clearly positive: a material favorable event (earnings beat, guidance raise, major contract, approval, upgrade).'
]

export function buildQuestions(ctx: JevContext): JevQuestions {
  const action: ChoiceQuestion = ctx.hasPosition
    ? {
        type: 'choice',
        instructions: `${ACTION_PREAMBLE} \`position.status\` is long; decide whether to close the whole position now or keep it.`,
        criteria: EXIT_CRITERIA
      }
    : {
        type: 'choice',
        instructions: `${ACTION_PREAMBLE} \`position.status\` is flat, so there is nothing to sell.`,
        criteria: ENTRY_CRITERIA
      }

  const trend: ScoreQuestion = {
    type: 'score',
    instructions: 'Judging only from the `price` facts, where is the short-term trend of `symbol` on this scale?',
    criteria: TREND_LEVELS
  }

  const newsTone: ScoreQuestion = {
    type: 'score',
    instructions: 'Judging only from `news`, what is the overall tone of the recent coverage for `symbol`?',
    criteria: NEWS_LEVELS
  }

  const avoid: BooleanQuestion = {
    type: 'boolean',
    instructions: 'Is there a specific reason NOT to trade `symbol` right now, independent of direction: breaking negative or ambiguous news, extreme or spiking volatility, stale or insufficient data, the market about to close, or unusual uncertainty? Answer yes only for a concrete reason present in the state, not general caution.',
    criteria: {
      true: 'A concrete reason to stand aside is present in the state.',
      false: 'Nothing in the state singles this asset out as unusually risky right now.'
    }
  }

  return ctx.news.length ? { action, trend, newsTone, avoid } : { action, trend, avoid }
}

/* ---------- answers ---------- */

function confidenceOf(meta: Record<string, unknown> | undefined, id: string): number | null {
  const typesafe = meta?.typesafe as { confidence?: Record<string, unknown> } | undefined
  const value = typesafe?.confidence?.[id]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function toJudgment(outcome: EvaluationOutcome): JevJudgment {
  const { answers } = outcome
  const action = answers.action
  if (!action || action.type !== 'choice') throw new Error('Jev returned no choice for the action question')
  const avoid = answers.avoid
  if (!avoid || avoid.type !== 'boolean') throw new Error('Jev returned no probability for the avoid question')

  const verdict = action.choice as JevVerdict
  const trend = answers.trend
  const newsTone = answers.newsTone
  return {
    verdict,
    probabilities: action.probabilities ?? { [verdict]: 1 },
    confidence: confidenceOf(outcome.providerMetadata, 'action'),
    trend: trend?.type === 'score' ? trend.score : null,
    newsTone: newsTone?.type === 'score' ? newsTone.score : null,
    avoid: avoid.probability
  }
}

/* ---------- oracle ---------- */

type EvaluateFn = typeof experimental_evaluate
type EvaluateArgs = Parameters<EvaluateFn>[0]

export function createJevOracle(opts: { model: Experimental_EvaluationModel, evaluate?: EvaluateFn }): JevOracle {
  const evaluate = opts.evaluate ?? experimental_evaluate
  return {
    async ask(ctx) {
      const questions = buildQuestions(ctx) as Record<string, Question>
      const result = await evaluate({
        model: opts.model,
        state: ctx.state as unknown as EvaluateArgs['state'],
        questions
      })
      return toJudgment(result as unknown as EvaluationOutcome)
    }
  }
}

/** Jev through Vercel AI Gateway with an explicit key (keeps the key inside runtimeConfig). */
export function createGatewayModel(apiKey: string): Experimental_EvaluationModel {
  return createGateway({ apiKey }).evaluationModel(JEV_MODEL_ID)
}

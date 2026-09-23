<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import type { AssetDto, OrderDto, OrderSide, OrderType } from '#shared/types/trading'
import { placeOrderSchema } from '#shared/utils/order-schema'
import { classifySymbol, normalizeSymbol, toPathSymbol } from '#shared/utils/symbols'

const { ticket, closeTicket } = useOrderTicket()
const { quotes, seed } = useQuotes()
const { clock } = useAccount()
const orders = useOrders()
const toast = useToast()

type Sizing = 'qty' | 'notional'
type Step = 'form' | 'review' | 'submitting'

const state = reactive({
  symbol: '',
  side: 'buy' as OrderSide,
  type: 'market' as OrderType,
  sizing: 'qty' as Sizing,
  qty: undefined as number | undefined,
  notional: undefined as number | undefined,
  limitPrice: undefined as number | undefined,
  stopPrice: undefined as number | undefined
})
const step = ref<Step>('form')
const asset = ref<AssetDto | null>(null)
const assetError = ref<string | null>(null)

const typeItems = [
  { label: 'Market', value: 'market' },
  { label: 'Limit', value: 'limit' },
  { label: 'Stop', value: 'stop' },
  { label: 'Stop limit', value: 'stop_limit' }
]

const open = computed({
  get: () => ticket.value.open,
  set: (value) => {
    if (!value) closeTicket()
  }
})

const symbol = computed(() => normalizeSymbol(state.symbol))
const assetClass = computed(() => asset.value?.assetClass ?? classifySymbol(symbol.value))
const isCrypto = computed(() => assetClass.value === 'crypto')
const tif = computed(() => (isCrypto.value ? 'gtc' : 'day'))
const quote = computed(() => quotes.value[symbol.value])
const last = computed(() => quote.value?.price ?? null)
const isMarket = computed(() => state.type === 'market')
const needsLimit = computed(() => state.type === 'limit' || state.type === 'stop_limit')
const needsStop = computed(() => state.type === 'stop' || state.type === 'stop_limit')
const refPrice = computed(() => {
  if (needsLimit.value) return state.limitPrice ?? last.value
  if (needsStop.value) return state.stopPrice ?? last.value
  return last.value
})
const estCost = computed(() => {
  if (state.sizing === 'notional') return state.notional ?? null
  return state.qty && refPrice.value ? state.qty * refPrice.value : null
})
const marketClosedWarning = computed(() => !isCrypto.value && clock.value?.isOpen === false)
const sideColor = computed(() => (state.side === 'buy' ? 'gain' : 'loss'))

const lookupAsset = useDebounceFn(async () => {
  const s = symbol.value
  asset.value = null
  assetError.value = null
  if (!s) return
  try {
    const found = await $fetch<AssetDto>(`/api/assets/${encodeURIComponent(toPathSymbol(s))}`)
    if (normalizeSymbol(state.symbol) !== s) return
    asset.value = found
    if (!quotes.value[found.symbol]?.seeded) seed([found.symbol]).catch(() => {})
  } catch (err) {
    assetError.value = errorMessage(err)
  }
}, 250)

watch(() => ticket.value.nonce, () => {
  const p = ticket.value.prefill
  Object.assign(state, {
    symbol: p.symbol ?? '',
    side: p.side ?? 'buy',
    type: p.type ?? 'market',
    sizing: 'qty',
    qty: p.qty,
    notional: undefined,
    limitPrice: undefined,
    stopPrice: undefined
  })
  step.value = 'form'
  lookupAsset()
})

watch(symbol, () => lookupAsset())

watch(() => state.type, () => {
  if (!isMarket.value && state.sizing === 'notional') {
    state.sizing = 'qty'
    state.notional = undefined
  }
  if (!needsLimit.value) state.limitPrice = undefined
  if (!needsStop.value) state.stopPrice = undefined
})

watch(() => state.sizing, (sizing) => {
  if (sizing === 'qty') state.notional = undefined
  else state.qty = undefined
})

const payload = computed(() => ({
  symbol: symbol.value,
  side: state.side,
  type: state.type,
  qty: state.sizing === 'qty' ? state.qty : undefined,
  notional: state.sizing === 'notional' ? state.notional : undefined,
  limitPrice: needsLimit.value ? state.limitPrice : undefined,
  stopPrice: needsStop.value ? state.stopPrice : undefined
}))

function toReview() {
  step.value = 'review'
}

async function confirm() {
  step.value = 'submitting'
  try {
    const order = await $fetch<OrderDto>('/api/orders', { method: 'POST', body: payload.value })
    orders.applyUpdate({ event: 'new', order })
    const amount = order.qty !== null ? fmtQty(order.qty) : fmtMoney(order.notional)
    toast.add({
      title: 'Order submitted',
      description: `${order.side.toUpperCase()} ${amount} ${order.symbol} ${orderTypeLabel(order.type)}`,
      color: order.side === 'buy' ? 'gain' : 'loss'
    })
    closeTicket()
  } catch (err) {
    toast.add({ title: 'Order rejected', description: errorMessage(err), color: 'error' })
    step.value = 'form'
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :dismissible="step !== 'submitting'"
    :ui="{ content: 'max-w-md', header: 'border-b border-default', footer: 'border-t border-default justify-end gap-2' }"
  >
    <template #header>
      <div class="flex w-full items-center justify-between">
        <h2 class="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
          Order ticket <span v-if="step === 'review'" class="text-primary">· review</span>
        </h2>
        <UBadge label="PAPER" color="primary" variant="outline" size="sm" class="num tracking-[0.2em]" />
      </div>
    </template>

    <template #body>
      <UForm
        v-if="step === 'form'"
        id="order-ticket-form"
        :state="state"
        :schema="placeOrderSchema"
        class="space-y-4"
        @submit="toReview"
      >
        <div class="grid grid-cols-2 gap-2">
          <UButton
            label="BUY"
            color="gain"
            :variant="state.side === 'buy' ? 'solid' : 'outline'"
            size="lg"
            block
            class="num tracking-[0.2em]"
            @click="state.side = 'buy'"
          />
          <UButton
            label="SELL"
            color="loss"
            :variant="state.side === 'sell' ? 'solid' : 'outline'"
            size="lg"
            block
            class="num tracking-[0.2em]"
            @click="state.side = 'sell'"
          />
        </div>

        <UFormField name="symbol" label="Symbol" :hint="asset ? asset.name : undefined" :error="assetError ?? undefined">
          <UInput
            v-model="state.symbol"
            placeholder="AAPL or BTC/USD"
            autocomplete="off"
            spellcheck="false"
            class="num w-full"
            :ui="{ base: 'uppercase placeholder:normal-case' }"
          />
        </UFormField>

        <div class="grid grid-cols-2 gap-3">
          <UFormField name="type" label="Type">
            <USelectMenu v-model="state.type" :items="typeItems" value-key="value" :search-input="false" class="w-full" />
          </UFormField>
          <UFormField label="Size by">
            <UButtonGroup class="w-full">
              <UButton label="Qty" color="neutral" :variant="state.sizing === 'qty' ? 'soft' : 'outline'" class="num flex-1 justify-center" @click="state.sizing = 'qty'" />
              <UButton label="USD" color="neutral" :variant="state.sizing === 'notional' ? 'soft' : 'outline'" :disabled="!isMarket" class="num flex-1 justify-center" @click="state.sizing = 'notional'" />
            </UButtonGroup>
          </UFormField>
        </div>

        <UFormField
          v-if="state.sizing === 'qty'"
          name="qty"
          label="Quantity"
          :help="asset && !asset.fractionable ? 'Whole shares only' : asset?.minOrderSize ? `Minimum ${fmtQty(asset.minOrderSize)}` : undefined"
        >
          <UInputNumber v-model="state.qty" :min="0" :step="asset?.fractionable ? 0.01 : 1" placeholder="0" class="num w-full" />
        </UFormField>
        <UFormField v-else name="notional" label="Amount (USD)" help="Market orders only">
          <UInputNumber v-model="state.notional" :min="0" :step="1" placeholder="0.00" :format-options="{ minimumFractionDigits: 2 }" class="num w-full" />
        </UFormField>

        <div v-if="needsLimit || needsStop" class="grid grid-cols-2 gap-3">
          <UFormField v-if="needsStop" name="stopPrice" label="Stop price">
            <UInputNumber v-model="state.stopPrice" :min="0" :step="0.01" placeholder="0.00" class="num w-full" />
          </UFormField>
          <UFormField v-if="needsLimit" name="limitPrice" label="Limit price">
            <UInputNumber v-model="state.limitPrice" :min="0" :step="0.01" placeholder="0.00" class="num w-full" />
          </UFormField>
        </div>

        <div class="num flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-muted pt-3 text-[12px] text-muted">
          <span>Last <span class="text-highlighted">{{ fmtPrice(last) }}</span></span>
          <span>Est. <span class="text-highlighted">{{ fmtMoney(estCost) }}</span></span>
          <span>TIF <span class="text-highlighted uppercase">{{ tif }}</span></span>
          <span v-if="asset" class="uppercase tracking-[0.12em] text-dimmed">{{ asset.assetClass === 'crypto' ? 'crypto' : 'stock' }}</span>
        </div>
        <p v-if="marketClosedWarning" class="text-[12px] text-primary">
          Market closed. The order queues for the next session and a day order expires at the close.
        </p>
      </UForm>

      <dl v-else class="num divide-y divide-muted text-[13px]">
        <div class="flex justify-between py-2">
          <dt class="text-muted">Side</dt>
          <dd class="font-semibold tracking-[0.2em]" :class="state.side === 'buy' ? 'text-gain' : 'text-loss'">{{ state.side.toUpperCase() }}</dd>
        </div>
        <div class="flex justify-between py-2">
          <dt class="text-muted">Symbol</dt>
          <dd class="text-highlighted">{{ symbol }} <span class="text-[11px] uppercase text-dimmed">{{ assetClass === 'crypto' ? 'crypto' : 'stock' }}</span></dd>
        </div>
        <div class="flex justify-between py-2">
          <dt class="text-muted">Type</dt>
          <dd class="text-highlighted">{{ orderTypeLabel(state.type) }}</dd>
        </div>
        <div class="flex justify-between py-2">
          <dt class="text-muted">{{ state.sizing === 'qty' ? 'Quantity' : 'Amount' }}</dt>
          <dd class="text-highlighted">{{ state.sizing === 'qty' ? fmtQty(state.qty) : fmtMoney(state.notional) }}</dd>
        </div>
        <div v-if="needsStop" class="flex justify-between py-2">
          <dt class="text-muted">Stop price</dt>
          <dd class="text-highlighted">{{ fmtPrice(state.stopPrice) }}</dd>
        </div>
        <div v-if="needsLimit" class="flex justify-between py-2">
          <dt class="text-muted">Limit price</dt>
          <dd class="text-highlighted">{{ fmtPrice(state.limitPrice) }}</dd>
        </div>
        <div class="flex justify-between py-2">
          <dt class="text-muted">Time in force</dt>
          <dd class="text-highlighted uppercase">{{ tif }}</dd>
        </div>
        <div class="flex justify-between py-2">
          <dt class="text-muted">Last price</dt>
          <dd class="text-highlighted">{{ fmtPrice(last) }}</dd>
        </div>
        <div class="flex justify-between py-2">
          <dt class="text-muted">Estimated {{ state.side === 'buy' ? 'cost' : 'proceeds' }}</dt>
          <dd class="text-highlighted">{{ fmtMoney(estCost) }}</dd>
        </div>
        <p v-if="marketClosedWarning" class="pt-3 text-[12px] text-primary">
          Market closed. The order queues for the next session and a day order expires at the close.
        </p>
      </dl>
    </template>

    <template #footer>
      <template v-if="step === 'form'">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="closeTicket()" />
        <UButton label="Review order" type="submit" form="order-ticket-form" color="primary" class="num tracking-wide" />
      </template>
      <template v-else>
        <UButton label="Back" color="neutral" variant="ghost" :disabled="step === 'submitting'" @click="step = 'form'" />
        <UButton
          :label="`Confirm ${state.side.toUpperCase()}`"
          :color="sideColor"
          :loading="step === 'submitting'"
          class="num tracking-[0.12em]"
          @click="confirm"
        />
      </template>
    </template>
  </UModal>
</template>

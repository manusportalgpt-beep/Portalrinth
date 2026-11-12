<script setup lang="ts">
import { ClockIcon, CurrencyIcon, ExternalIcon, HistoryIcon, LibraryIcon } from '@modrinth/assets'
import { Button, injectNotificationManager, useVIntl } from '@modrinth/ui'
import { openUrl } from '@tauri-apps/plugin-opener'
import { computed, ref } from 'vue'

import {
	getPayoutBalance,
	getPayoutHistory,
	MODRINTH_SITE,
	type PayoutBalance,
	type PayoutTransaction,
} from '@/helpers/modrinth-creator'
import { get as getCreds } from '@/helpers/mr_auth.ts'

import { creatorMessages as messages } from './creator-messages'

const { formatMessage, locale } = useVIntl()
const { handleError } = injectNotificationManager()

const signedIn = ref(true)
const balance = ref<PayoutBalance | null>(null)
const history = ref<PayoutTransaction[]>([])

try {
	if (!(await getCreds())) signedIn.value = false
	else {
		const [loadedBalance, loadedHistory] = await Promise.all([
			getPayoutBalance(),
			getPayoutHistory().catch(() => []),
		])
		balance.value = loadedBalance
		history.value = loadedHistory
	}
} catch (error) {
	handleError(error as Error)
}

const money = computed(
	() => new Intl.NumberFormat(locale.value, { style: 'currency', currency: 'USD' }),
)
const dateFormat = computed(
	() => new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'long', year: 'numeric' }),
)

const upcoming = computed(() =>
	Object.entries(balance.value?.dates ?? {})
		.filter(([, amount]) => amount > 0)
		.sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
		.slice(0, 4),
)

function withdraw() {
	openUrl(`${MODRINTH_SITE}/dashboard/revenue`)
}

function statusText(status: string) {
	if (status === 'success') return formatMessage(messages.txStatusSuccess)
	if (status === 'failed' || status === 'cancelled') return formatMessage(messages.txStatusFailed)
	return formatMessage(messages.txStatusPending)
}

function statusTone(status: string) {
	if (status === 'success') return 'green'
	if (status === 'failed' || status === 'cancelled') return 'red'
	return 'orange'
}
</script>

<template>
	<div class="flex flex-col gap-4">
		<div v-if="!signedIn" class="empty-state">
			<CurrencyIcon aria-hidden="true" />
			<p class="m-0 text-lg font-medium text-contrast">{{ formatMessage(messages.signIn) }}</p>
			<p class="m-0 text-sm text-secondary">{{ formatMessage(messages.signInBody) }}</p>
		</div>

		<div v-else-if="!balance" class="empty-state">
			<CurrencyIcon aria-hidden="true" />
			<p class="m-0 text-lg font-medium text-contrast">{{ formatMessage(messages.loadFailed) }}</p>
		</div>

		<template v-else>
			<div class="creator-head">
				<h2>{{ formatMessage(messages.revenueTitle) }}</h2>
			</div>

			<div class="creator-card balance-card">
				<div class="flex min-w-0 flex-col gap-1">
					<span class="inline-flex items-center gap-1 text-sm font-semibold text-secondary">
						<CurrencyIcon aria-hidden="true" class="h-4 w-4" />
						{{ formatMessage(messages.available) }}
					</span>
					<span class="balance tabular-nums">{{ money.format(balance.available) }}</span>
					<span class="text-sm text-secondary">{{ formatMessage(messages.withdrawHint) }}</span>
				</div>
				<Button type="colored" color="brand" size="lg" @click="withdraw">
					<ExternalIcon aria-hidden="true" />
					{{ formatMessage(messages.withdraw) }}
				</Button>
			</div>

			<div class="creator-stats">
				<div class="creator-stat">
					<span class="label"
						><ClockIcon aria-hidden="true" />{{ formatMessage(messages.pending) }}</span
					>
					<span class="value">{{ money.format(balance.pending) }}</span>
					<span class="hint">{{ formatMessage(messages.pendingHint) }}</span>
				</div>
				<div class="creator-stat">
					<span class="label">
						<LibraryIcon aria-hidden="true" />{{ formatMessage(messages.withdrawnYtd) }}
					</span>
					<span class="value">{{ money.format(balance.withdrawn_ytd) }}</span>
				</div>
				<div class="creator-stat">
					<span class="label">
						<HistoryIcon aria-hidden="true" />{{ formatMessage(messages.withdrawnLifetime) }}
					</span>
					<span class="value">{{ money.format(balance.withdrawn_lifetime) }}</span>
				</div>
			</div>

			<div v-if="upcoming.length" class="creator-card">
				<span class="text-lg font-bold text-contrast">{{ formatMessage(messages.upcoming) }}</span>
				<div class="flex flex-col gap-1">
					<div v-for="[date, amount] in upcoming" :key="date" class="tx-row">
						<span class="tx-icon"><ClockIcon aria-hidden="true" /></span>
						<span class="min-w-0 flex-1 truncate text-contrast">{{
							dateFormat.format(new Date(date))
						}}</span>
						<span class="font-semibold tabular-nums text-contrast">{{ money.format(amount) }}</span>
					</div>
				</div>
			</div>

			<div class="creator-card">
				<span class="text-lg font-bold text-contrast">{{
					formatMessage(messages.transactions)
				}}</span>
				<p v-if="history.length === 0" class="m-0 py-6 text-center text-secondary">
					{{ formatMessage(messages.noTransactions) }}
				</p>
				<div v-else class="flex flex-col gap-1">
					<div
						v-for="(item, index) in history"
						:key="item.type === 'withdrawal' ? item.id : `${item.created}-${index}`"
						class="tx-row"
					>
						<span class="tx-icon" :class="item.type === 'withdrawal' ? 'out' : 'in'">
							<ExternalIcon v-if="item.type === 'withdrawal'" aria-hidden="true" />
							<CurrencyIcon v-else aria-hidden="true" />
						</span>
						<span class="flex min-w-0 flex-1 flex-col">
							<span class="truncate font-semibold text-contrast">
								{{
									formatMessage(
										item.type === 'withdrawal' ? messages.txWithdrawal : messages.txIncome,
									)
								}}
								<template v-if="item.type === 'withdrawal' && item.method_type"
									>· {{ item.method_type }}</template
								>
							</span>
							<span class="truncate text-sm text-secondary">
								{{ dateFormat.format(new Date(item.created)) }}
								<template v-if="item.type === 'withdrawal' && item.fee">
									· {{ formatMessage(messages.txFee, { amount: money.format(Number(item.fee)) }) }}
								</template>
							</span>
						</span>
						<span
							v-if="item.type === 'withdrawal'"
							class="status-pill"
							:class="statusTone(item.status)"
						>
							{{ statusText(item.status) }}
						</span>
						<span
							class="font-semibold tabular-nums"
							:class="item.type === 'withdrawal' ? 'text-contrast' : 'text-brand'"
						>
							{{ item.type === 'withdrawal' ? '−' : '+' }}{{ money.format(Math.abs(item.amount)) }}
						</span>
					</div>
				</div>
			</div>
		</template>
	</div>
</template>

<style scoped lang="scss">
@use './creator.scss';

.balance-card {
	flex-direction: row;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	background:
		radial-gradient(
			circle at 0% 0%,
			color-mix(in srgb, var(--color-brand) 16%, transparent),
			transparent 60%
		),
		var(--color-bg-raised);
}

.balance {
	font-size: 2.5rem;
	font-weight: 800;
	line-height: 1.1;
	color: var(--color-contrast);
}

.tx-row {
	display: flex;
	align-items: center;
	gap: var(--gap-md);
	padding: 0.5rem 0.6rem;
	border-radius: var(--radius-lg);
	transition: background-color 0.15s ease;

	&:hover {
		background-color: var(--color-button-bg);
	}
}

.tx-icon {
	display: grid;
	place-items: center;
	width: 2.25rem;
	height: 2.25rem;
	flex-shrink: 0;
	border-radius: var(--radius-md);
	background-color: var(--color-button-bg);
	color: var(--color-secondary);

	&.in {
		color: var(--color-brand);
		background-color: var(--color-brand-highlight);
	}

	svg {
		width: 1.1rem;
		height: 1.1rem;
	}
}
</style>

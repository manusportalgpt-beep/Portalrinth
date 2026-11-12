<script setup lang="ts">
import { defineMessages, useVIntl } from '@modrinth/ui'
import { useNow } from '@vueuse/core'
import { computed, ref } from 'vue'

import { type HostedServerView, isHostedActive } from '@/helpers/hosting'

import UsageRing from './usage-ring.vue'
import type { OnlineSample } from './use-online-history'

const props = defineProps<{
	server: HostedServerView
	samples: OnlineSample[]
}>()

const { formatMessage } = useVIntl()
const messages = defineMessages({
	online: { id: 'app.server-hosting.overview.online', defaultMessage: 'Players online' },
	range24h: { id: 'app.server-hosting.overview.range-24h', defaultMessage: '24 hours' },
	range7d: { id: 'app.server-hosting.overview.range-7d', defaultMessage: '7 days' },
	range30d: { id: 'app.server-hosting.overview.range-30d', defaultMessage: '30 days' },
	now: { id: 'app.server-hosting.overview.now', defaultMessage: 'Online now' },
	peak: { id: 'app.server-hosting.overview.peak', defaultMessage: 'Peak online' },
	min: { id: 'app.server-hosting.overview.min', defaultMessage: 'Minimum online' },
	average: { id: 'app.server-hosting.overview.average', defaultMessage: 'Average online' },
	averageHint: { id: 'app.server-hosting.overview.average-hint', defaultMessage: 'for the period' },
	noData: {
		id: 'app.server-hosting.overview.no-data',
		defaultMessage: 'Start the server and the chart fills in by itself',
	},
	usage: { id: 'app.server-hosting.overview.usage', defaultMessage: 'Server usage' },
	cpu: { id: 'app.server-hosting.overview.cpu', defaultMessage: 'CPU' },
	ram: { id: 'app.server-hosting.overview.ram', defaultMessage: 'RAM' },
	uptime: { id: 'app.server-hosting.overview.uptime', defaultMessage: 'Uptime' },
	uptimeHours: {
		id: 'app.server-hosting.overview.uptime-hours',
		defaultMessage: '{hours} h {minutes} min',
	},
	uptimeMinutes: {
		id: 'app.server-hosting.overview.uptime-minutes',
		defaultMessage: '{minutes} min',
	},
	ramValue: {
		id: 'app.server-hosting.overview.ram-value',
		defaultMessage: '{used} / {total} MB',
	},
})

type Range = '24h' | '7d' | '30d'
const RANGE_MS: Record<Range, number> = {
	'24h': 24 * 60 * 60 * 1000,
	'7d': 7 * 24 * 60 * 60 * 1000,
	'30d': 30 * 24 * 60 * 60 * 1000,
}
const ranges = computed(() => [
	{ id: '24h' as const, label: formatMessage(messages.range24h) },
	{ id: '7d' as const, label: formatMessage(messages.range7d) },
	{ id: '30d' as const, label: formatMessage(messages.range30d) },
])
const range = ref<Range>('24h')
const now = useNow({ interval: 30_000 })

const running = computed(() => props.server.status === 'running')
const current = computed(() => (running.value ? props.server.players.length : 0))

const windowed = computed<OnlineSample[]>(() => {
	const from = now.value.getTime() - RANGE_MS[range.value]
	const inside = props.samples.filter(([time]) => time >= from)
	const before = props.samples.filter(([time]) => time < from).at(-1)
	const points: OnlineSample[] = before ? [[from, before[1]], ...inside] : inside
	if (points.length > 0) points.push([now.value.getTime(), current.value])
	return points
})

const stats = computed(() => {
	const points = windowed.value
	if (points.length === 0) return null
	let peak = points[0]
	let min = points[0]
	let weighted = 0
	for (let index = 0; index < points.length; index++) {
		const point = points[index]
		if (point[1] > peak[1]) peak = point
		if (point[1] < min[1]) min = point
		const next = points[index + 1]
		if (next) weighted += point[1] * (next[0] - point[0])
	}
	const span = points[points.length - 1][0] - points[0][0]
	const average = span > 0 ? weighted / span : points[0][1]
	return { peak, min, average: Math.round(average * 10) / 10 }
})

const WIDTH = 600
const HEIGHT = 160
const chart = computed(() => {
	const points = windowed.value
	if (points.length < 2) return null
	const start = points[0][0]
	const end = points[points.length - 1][0]
	const span = Math.max(1, end - start)
	const top = Math.max(1, ...points.map(([, players]) => players))
	const x = (time: number) => ((time - start) / span) * WIDTH
	const y = (players: number) => HEIGHT - 8 - (players / top) * (HEIGHT - 24)
	let line = `M ${x(points[0][0])} ${y(points[0][1])}`
	for (let index = 1; index < points.length; index++) {
		line += ` H ${x(points[index][0])} V ${y(points[index][1])}`
	}
	return {
		line,
		area: `${line} V ${HEIGHT} H 0 Z`,
		top,
		start,
		end,
	}
})

function formatTime(time: number) {
	return new Date(time).toLocaleString(undefined, {
		day: '2-digit',
		month: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
	})
}

const ramPercent = computed(() =>
	isHostedActive(props.server.status) && props.server.memory_mb > 0
		? (props.server.ram_used_mb / props.server.memory_mb) * 100
		: null,
)
const cpuPercent = computed(() =>
	isHostedActive(props.server.status) ? props.server.cpu_percent : null,
)

const uptime = computed(() => {
	if (!props.server.started_at || !isHostedActive(props.server.status)) return '—'
	const seconds = Math.max(0, Math.floor((now.value.getTime() - props.server.started_at) / 1000))
	const hours = Math.floor(seconds / 3600)
	const minutes = Math.floor((seconds % 3600) / 60)
	return hours > 0
		? formatMessage(messages.uptimeHours, { hours, minutes })
		: formatMessage(messages.uptimeMinutes, { minutes })
})
</script>

<template>
	<section class="hosting-panel flex flex-col gap-3">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div class="flex flex-wrap items-center gap-3">
				<h2 class="m-0 text-lg font-bold text-contrast">{{ formatMessage(messages.online) }}</h2>
				<div class="hosting-segment">
					<button
						v-for="option in ranges"
						:key="option.id"
						type="button"
						:class="{ 'is-active': range === option.id }"
						@click="range = option.id"
					>
						{{ option.label }}
					</button>
				</div>
			</div>
			<div class="hosting-stat hosting-stat--inline">
				<span class="text-xs text-secondary">{{ formatMessage(messages.now) }}</span>
				<span class="text-xl font-bold text-contrast">{{ current }}</span>
			</div>
		</div>

		<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
			<div class="flex min-w-0 flex-col">
				<svg
					v-if="chart"
					:viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
					preserveAspectRatio="none"
					class="hosting-chart"
					aria-hidden="true"
				>
					<defs>
						<linearGradient id="hosting-chart-fill" x1="0" x2="0" y1="0" y2="1">
							<stop offset="0%" stop-color="var(--color-brand)" stop-opacity="0.35" />
							<stop offset="100%" stop-color="var(--color-brand)" stop-opacity="0" />
						</linearGradient>
					</defs>
					<path :d="chart.area" fill="url(#hosting-chart-fill)" />
					<path :d="chart.line" class="hosting-chart-line" vector-effect="non-scaling-stroke" />
				</svg>
				<div v-else class="hosting-chart hosting-chart--empty">
					<span class="text-sm text-secondary">{{ formatMessage(messages.noData) }}</span>
				</div>
				<div v-if="chart" class="mt-1 flex justify-between text-xs text-secondary">
					<span>{{ formatTime(chart.start) }}</span>
					<span>{{ formatTime(chart.end) }}</span>
				</div>
			</div>

			<div class="hosting-usage flex min-w-0 flex-col gap-2">
				<span class="text-sm font-bold text-contrast">{{ formatMessage(messages.usage) }}</span>
				<div class="grid grid-cols-2 gap-2">
					<UsageRing
						:label="formatMessage(messages.cpu)"
						:percent="cpuPercent"
						:value="cpuPercent === null ? '—' : `${Math.round(cpuPercent)}%`"
					/>
					<UsageRing
						:label="formatMessage(messages.ram)"
						:percent="ramPercent"
						:value="
							ramPercent === null
								? '—'
								: formatMessage(messages.ramValue, {
										used: server.ram_used_mb,
										total: server.memory_mb,
									})
						"
					/>
				</div>
				<div class="hosting-stat flex-row items-center justify-between gap-2">
					<span class="truncate text-sm text-secondary">{{ formatMessage(messages.uptime) }}</span>
					<span class="shrink-0 text-sm font-bold text-contrast">{{ uptime }}</span>
				</div>
			</div>
		</div>

		<div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
			<div class="hosting-stat">
				<span class="truncate text-xs text-secondary">{{ formatMessage(messages.peak) }}</span>
				<span class="text-lg font-bold text-contrast">{{ stats?.peak[1] ?? 0 }}</span>
				<span class="truncate text-xs text-secondary">
					{{ stats ? formatTime(stats.peak[0]) : '—' }}
				</span>
			</div>
			<div class="hosting-stat">
				<span class="truncate text-xs text-secondary">{{ formatMessage(messages.min) }}</span>
				<span class="text-lg font-bold text-contrast">{{ stats?.min[1] ?? 0 }}</span>
				<span class="truncate text-xs text-secondary">
					{{ stats ? formatTime(stats.min[0]) : '—' }}
				</span>
			</div>
			<div class="hosting-stat">
				<span class="truncate text-xs text-secondary">{{ formatMessage(messages.average) }}</span>
				<span class="text-lg font-bold text-contrast">{{ stats?.average ?? 0 }}</span>
				<span class="truncate text-xs text-secondary">{{
					formatMessage(messages.averageHint)
				}}</span>
			</div>
		</div>
	</section>
</template>

<style scoped lang="scss">
.hosting-panel {
	padding: 1rem;
	border-radius: var(--radius-lg, 0.75rem);
	border: 1px solid var(--surface-5);
	background: var(--surface-4);
	min-width: 0;
}

.hosting-stat {
	display: flex;
	flex-direction: column;
	gap: 0.125rem;
	min-width: 0;
	padding: 0.625rem 0.875rem;
	border-radius: var(--radius-md, 0.5rem);
	border: 1px solid var(--surface-5);
	background: var(--surface-3);
}

.hosting-stat--inline {
	flex-direction: row;
	align-items: baseline;
	gap: 0.5rem;
	padding: 0.375rem 0.75rem;
}

.hosting-usage {
	padding-left: 1rem;
	border-left: 1px solid var(--surface-5);

	@media (max-width: 1023px) {
		padding-left: 0;
		border-left: none;
	}
}

.hosting-segment {
	display: inline-flex;
	gap: 0.25rem;
	padding: 0.25rem;
	border-radius: var(--radius-md, 0.5rem);
	background: var(--surface-3);

	button {
		padding: 0.25rem 0.75rem;
		border: none;
		border-radius: calc(var(--radius-md, 0.5rem) - 0.125rem);
		background: transparent;
		color: var(--color-secondary);
		font-size: 0.8125rem;
		font-weight: 600;
		cursor: pointer;
		transition:
			color 0.15s ease,
			background-color 0.15s ease;

		&:hover {
			color: var(--color-contrast);
		}

		&.is-active {
			background: var(--color-brand-highlight);
			color: var(--color-brand);
		}
	}
}

.hosting-chart {
	display: block;
	width: 100%;
	height: clamp(5rem, calc(100vh - 36rem), 14rem);

	&--empty {
		display: grid;
		place-items: center;
		border-radius: var(--radius-md, 0.5rem);
		border: 1px dashed var(--surface-5);
		background: var(--surface-3);
		text-align: center;
		padding: 0 1rem;
	}
}

.hosting-chart-line {
	fill: none;
	stroke: var(--color-brand);
	stroke-width: 2;
	stroke-linejoin: round;
}
</style>

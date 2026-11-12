<script setup lang="ts">
import { ChartIcon, DownloadIcon, EyeIcon, SpinnerIcon } from '@modrinth/assets'
import { Avatar, Chips, injectNotificationManager, useCompactNumber, useVIntl } from '@modrinth/ui'
import { computed, ref, watch } from 'vue'

import {
	type AnalyticsMetric,
	type AnalyticsSeries,
	type CreatorProject,
	getAnalytics,
	getMyProjects,
} from '@/helpers/modrinth-creator'
import { get as getCreds } from '@/helpers/mr_auth.ts'

import { creatorMessages as messages } from './creator-messages'

const { formatMessage, locale } = useVIntl()
const { formatCompactNumber } = useCompactNumber()
const { handleError } = injectNotificationManager()

const metrics: AnalyticsMetric[] = ['downloads', 'views']
const ranges = [1, 7, 30, 90] as const
type Range = (typeof ranges)[number]

const signedIn = ref(true)
const projects = ref<CreatorProject[]>([])
const metric = ref<AnalyticsMetric>('downloads')
const range = ref<Range>(30)
const series = ref<AnalyticsSeries | null>(null)
const loading = ref(false)
const hover = ref<number | null>(null)

let token = 0
async function load() {
	const ids = projects.value.map((project) => project.id)
	if (!ids.length) return
	const current = ++token
	loading.value = true
	try {
		const result = await getAnalytics(ids, metric.value, range.value)
		if (current === token) series.value = result
	} catch (error) {
		if (current === token) handleError(error as Error)
	} finally {
		if (current === token) loading.value = false
	}
}

try {
	if (!(await getCreds())) signedIn.value = false
	else {
		projects.value = await getMyProjects()
		await load()
	}
} catch (error) {
	handleError(error as Error)
}

watch([metric, range], load)

const totals = computed(() => {
	const data = series.value
	if (!data) return [] as number[]
	return data.times.map((_, index) =>
		Object.values(data.byProject).reduce((sum, values) => sum + (values[index] ?? 0), 0),
	)
})

const total = computed(() => totals.value.reduce((sum, value) => sum + value, 0))
const peak = computed(() => Math.max(1, ...totals.value))

const perProject = computed(() => {
	const data = series.value
	if (!data) return []
	return projects.value
		.map((project) => ({
			project,
			value: (data.byProject[project.id] ?? []).reduce((sum, value) => sum + value, 0),
		}))
		.sort((a, b) => b.value - a.value)
})

const bestProject = computed(() => Math.max(1, ...perProject.value.map((entry) => entry.value)))

const W = 800
const H = 220
const points = computed(() => {
	const values = totals.value
	if (values.length < 2) return [] as { x: number; y: number }[]
	return values.map((value, index) => ({
		x: (index / (values.length - 1)) * W,
		y: H - (value / peak.value) * (H - 12) - 4,
	}))
})

const linePath = computed(() =>
	points.value
		.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
		.join(' '),
)
const areaPath = computed(() =>
	points.value.length ? `${linePath.value} L${W},${H} L0,${H} Z` : '',
)

function formatTime(time: number) {
	const options: Intl.DateTimeFormatOptions =
		range.value === 1 ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short' }
	return new Intl.DateTimeFormat(locale.value, options).format(new Date(time))
}

const hoverPoint = computed(() => {
	if (hover.value === null || !series.value) return null
	const point = points.value[hover.value]
	if (!point) return null
	return {
		left: `${(point.x / W) * 100}%`,
		top: `${(point.y / H) * 100}%`,
		label: formatTime(series.value.times[hover.value]),
		value: totals.value[hover.value],
	}
})

function onMove(event: MouseEvent) {
	const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
	const count = totals.value.length
	if (count < 2) return
	const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
	hover.value = Math.round(ratio * (count - 1))
}

function metricLabel(item: AnalyticsMetric) {
	return formatMessage(item === 'views' ? messages.metricViews : messages.metricDownloads)
}

function rangeLabel(item: Range) {
	if (item === 1) return formatMessage(messages.range1)
	if (item === 7) return formatMessage(messages.range7)
	if (item === 90) return formatMessage(messages.range90)
	return formatMessage(messages.range30)
}
</script>

<template>
	<div class="flex flex-col gap-4">
		<div v-if="!signedIn" class="empty-state">
			<ChartIcon aria-hidden="true" />
			<p class="m-0 text-lg font-medium text-contrast">{{ formatMessage(messages.signIn) }}</p>
			<p class="m-0 text-sm text-secondary">{{ formatMessage(messages.signInBody) }}</p>
		</div>

		<div v-else-if="projects.length === 0" class="empty-state">
			<ChartIcon aria-hidden="true" />
			<p class="m-0 text-lg font-medium text-contrast">
				{{ formatMessage(messages.analyticsTitle) }}
			</p>
			<p class="m-0 text-sm text-secondary">{{ formatMessage(messages.noAnalytics) }}</p>
		</div>

		<template v-else>
			<div class="creator-head">
				<h2>{{ formatMessage(messages.analyticsTitle) }}</h2>
				<Chips
					v-model="metric"
					:items="metrics"
					:format-label="metricLabel"
					:capitalize="false"
					size="small"
				/>
				<Chips
					v-model="range"
					:items="[...ranges]"
					:format-label="rangeLabel"
					:capitalize="false"
					size="small"
				/>
			</div>

			<div class="creator-card">
				<div class="flex items-end justify-between gap-3">
					<div class="flex flex-col">
						<span class="inline-flex items-center gap-1 text-sm font-semibold text-secondary">
							<EyeIcon v-if="metric === 'views'" aria-hidden="true" class="h-4 w-4" />
							<DownloadIcon v-else aria-hidden="true" class="h-4 w-4" />
							{{ formatMessage(messages.totalInRange) }}
						</span>
						<span class="text-3xl font-extrabold tabular-nums text-contrast">
							{{ total.toLocaleString(locale) }}
						</span>
					</div>
					<SpinnerIcon
						v-if="loading"
						class="h-5 w-5 animate-spin text-secondary"
						aria-hidden="true"
					/>
				</div>
				<div
					class="chart"
					:class="{ 'chart--loading': loading }"
					@mousemove="onMove"
					@mouseleave="hover = null"
				>
					<svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" aria-hidden="true">
						<defs>
							<linearGradient id="creator-area" x1="0" x2="0" y1="0" y2="1">
								<stop offset="0%" stop-color="var(--color-brand)" stop-opacity="0.35" />
								<stop offset="100%" stop-color="var(--color-brand)" stop-opacity="0" />
							</linearGradient>
						</defs>
						<line
							v-for="step in 3"
							:key="step"
							x1="0"
							:x2="W"
							:y1="(H / 4) * step"
							:y2="(H / 4) * step"
							class="grid-line"
						/>
						<path v-if="areaPath" :d="areaPath" fill="url(#creator-area)" />
						<path v-if="linePath" :d="linePath" class="line" vector-effect="non-scaling-stroke" />
					</svg>
					<template v-if="hoverPoint">
						<span class="cursor" :style="{ left: hoverPoint.left }" />
						<span class="dot" :style="{ left: hoverPoint.left, top: hoverPoint.top }" />
						<span class="tip" :style="{ left: hoverPoint.left }">
							<b>{{ hoverPoint.value.toLocaleString(locale) }}</b>
							<span>{{ hoverPoint.label }}</span>
						</span>
					</template>
				</div>
				<div v-if="series" class="flex justify-between text-xs text-secondary">
					<span>{{ formatTime(series.times[0]) }}</span>
					<span>{{ formatTime(series.times[Math.floor(series.times.length / 2)]) }}</span>
					<span>{{ formatTime(series.times[series.times.length - 1]) }}</span>
				</div>
			</div>

			<div class="creator-card">
				<span class="text-lg font-bold text-contrast">{{
					formatMessage(messages.topProjects)
				}}</span>
				<div class="flex flex-col gap-2">
					<div v-for="entry in perProject" :key="entry.project.id" class="project-bar">
						<Avatar :src="entry.project.icon_url" size="2rem" :tint-by="entry.project.id" />
						<span class="flex min-w-0 flex-1 flex-col gap-1">
							<span class="flex items-center justify-between gap-2">
								<span class="truncate font-semibold text-contrast">{{ entry.project.title }}</span>
								<span class="shrink-0 font-semibold tabular-nums text-contrast">
									{{ formatCompactNumber(entry.value) }}
								</span>
							</span>
							<span class="bar"
								><span :style="{ width: `${(entry.value / bestProject) * 100}%` }"
							/></span>
						</span>
					</div>
				</div>
			</div>
		</template>
	</div>
</template>

<style scoped lang="scss">
@use './creator.scss';

.chart {
	position: relative;
	height: 14rem;
	transition: opacity 0.2s ease;

	&--loading {
		opacity: 0.55;
	}

	svg {
		width: 100%;
		height: 100%;
		overflow: visible;
	}
}

.grid-line {
	stroke: var(--color-button-bg);
	stroke-width: 1;
	vector-effect: non-scaling-stroke;
}

.line {
	fill: none;
	stroke: var(--color-brand);
	stroke-width: 2.5;
	stroke-linejoin: round;
	stroke-linecap: round;
}

.cursor {
	position: absolute;
	top: 0;
	bottom: 0;
	width: 1px;
	background-color: var(--color-secondary);
	opacity: 0.4;
	pointer-events: none;
}

.dot {
	position: absolute;
	width: 0.7rem;
	height: 0.7rem;
	border: 2px solid var(--color-bg-raised);
	border-radius: 50%;
	background-color: var(--color-brand);
	transform: translate(-50%, -50%);
	pointer-events: none;
}

.tip {
	position: absolute;
	top: -0.25rem;
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 0.3rem 0.6rem;
	border-radius: var(--radius-md);
	background-color: color-mix(in srgb, var(--color-bg) 80%, transparent);
	backdrop-filter: blur(8px);
	box-shadow: var(--shadow-floating, 0 4px 16px rgb(0 0 0 / 25%));
	font-size: var(--font-size-xs, 0.75rem);
	color: var(--color-secondary);
	white-space: nowrap;
	transform: translate(-50%, -100%);
	pointer-events: none;

	b {
		font-size: var(--font-size-sm);
		color: var(--color-contrast);
	}
}

.project-bar {
	display: flex;
	align-items: center;
	gap: var(--gap-md);
}

.bar {
	display: block;
	height: 0.4rem;
	border-radius: 999px;
	background-color: var(--color-button-bg);
	overflow: hidden;

	span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background-color: var(--color-brand);
		transition: width 0.4s ease;
	}
}
</style>

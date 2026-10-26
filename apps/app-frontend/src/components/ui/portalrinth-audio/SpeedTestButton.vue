<template>
	<FloatingMenu placement="bottom-end" panel-class="!p-3" @open="onOpen">
		<IconButton
			v-tooltip="formatMessage(messages.title)"
			type="quiet"
			:color="state === 'running' ? 'brand' : undefined"
			:label="formatMessage(messages.title)"
		>
			<GaugeIcon :class="{ 'ai-speed-pulse': state === 'running' }" />
		</IconButton>
		<template #popper>
			<div class="flex w-[17rem] flex-col gap-3 p-1">
				<div class="flex items-center justify-between">
					<span class="text-sm font-semibold text-contrast">
						{{ formatMessage(messages.title) }}
					</span>
					<span
						v-if="state === 'running'"
						class="animate-pulse text-xs font-medium text-brand"
					>
						{{ formatMessage(messages.running) }}
					</span>
				</div>

				<!-- Автомобильный счётчик скорости -->
				<svg viewBox="0 0 220 126" class="mx-auto w-full max-w-[13.5rem]">
					<!-- Дорожка: зелёная / жёлтая / красная зоны -->
					<path :d="paths.zone0" stroke="#34d399" stroke-opacity="0.4" stroke-width="9" fill="none" stroke-linecap="round" />
					<path :d="paths.zone1" stroke="#fbbf24" stroke-opacity="0.45" stroke-width="9" fill="none" />
					<path :d="paths.zone2" stroke="#f87171" stroke-opacity="0.45" stroke-width="9" fill="none" stroke-linecap="round" />
					<!-- Пройденный путь -->
					<path
						v-if="needlePct > 0.004"
						:d="progressPath"
						stroke="var(--color-brand)"
						stroke-width="4"
						fill="none"
						stroke-linecap="round"
					/>
					<!-- Деления -->
					<g v-for="(tick, i) in ticks" :key="`t${i}`" stroke="currentColor" :stroke-opacity="tick.major ? 0.55 : 0.25" :stroke-width="tick.major ? 2 : 1">
						<line :x1="tick.outer[0]" :y1="tick.outer[1]" :x2="tick.inner[0]" :y2="tick.inner[1]" />
					</g>
					<text
						v-for="(tick, i) in ticks.filter((t) => t.major)"
						:key="`l${i}`"
						:x="tick.label[0]"
						:y="tick.label[1]"
						text-anchor="middle"
						font-size="9.5"
						fill="currentColor"
						fill-opacity="0.65"
					>
						{{ tick.labelText }}
					</text>
					<!-- Стрелка -->
					<g class="speed-needle" :style="{ transform: `rotate(${needleAngle}deg)` }">
						<line x1="110" y1="105" x2="30" y2="105" stroke="var(--color-brand)" stroke-width="3" stroke-linecap="round" />
						<line x1="110" y1="105" x2="52" y2="105" stroke="var(--color-brand)" stroke-width="6" stroke-linecap="round" />
					</g>
					<circle cx="110" cy="105" r="7" fill="var(--color-brand)" />
					<circle cx="110" cy="105" r="2.6" fill="var(--color-raised-bg)" />
				</svg>

				<div class="flex items-end justify-between px-1">
					<div class="flex items-baseline gap-1.5">
						<span class="text-2xl font-bold tabular-nums text-contrast">{{ state === 'fail' ? '—' : mbpsLabel }}</span>
						<span class="text-xs text-secondary">{{ formatMessage(messages.down) }}</span>
					</div>
					<div class="flex items-baseline gap-1">
						<span class="text-sm font-semibold tabular-nums text-contrast">{{ state === 'fail' ? '—' : pingLabel }}</span>
						<span class="text-xs text-secondary">{{ formatMessage(messages.ping) }}</span>
					</div>
				</div>

				<p v-if="state === 'fail'" class="m-0 text-sm text-red">
					{{ formatMessage(messages.fail) }}
				</p>

				<Button size="sm" :disabled="state === 'running'" @click="runTest">
					{{ state === 'done' || state === 'fail'
						? formatMessage(messages.again)
						: formatMessage(messages.measure) }}
				</Button>
			</div>
		</template>
	</FloatingMenu>
</template>

<script setup lang="ts">
/**
 * The title bar's internet speed test, drawn as a car speedometer. Lives
 * where the sound button sits; when music is playing it stands right of it.
 * Measures ping and download speed against Cloudflare's speed endpoints -
 * straight through the Tauri HTTP client, so a configured proxy does not
 * skew the numbers. The download is measured while streaming, so the
 * needle sweeps live instead of jumping at the end; the scale stretches
 * (10 -> 25 -> 50 -> 100 -> 250 -> 500 -> 1000 Мбит/с) when the needle
 * runs out of dial, like a proper dash gauge.
 */
import { GaugeIcon } from '@modrinth/assets'
import { Button, defineMessages, FloatingMenu, IconButton, useVIntl } from '@modrinth/ui'
import { computed, ref } from 'vue'

import { fetch as tauriFetch } from '@tauri-apps/plugin-http'

const { formatMessage } = useVIntl()

const messages = defineMessages({
	title: { id: 'app.speed.title', defaultMessage: 'Скорость интернета' },
	measure: { id: 'app.speed.measure', defaultMessage: 'Измерить' },
	again: { id: 'app.speed.again', defaultMessage: 'Измерить снова' },
	running: { id: 'app.speed.running', defaultMessage: 'Измеряю…' },
	down: { id: 'app.speed.down', defaultMessage: 'Мбит/с' },
	ping: { id: 'app.speed.ping', defaultMessage: 'мс' },
	fail: { id: 'app.speed.fail', defaultMessage: 'Не получилось измерить' },
})

const SCALE_STEPS = [10, 25, 50, 100, 250, 500, 1000]
const CX = 110
const CY = 105
const R = 85

const state = ref<'idle' | 'running' | 'done' | 'fail'>('idle')
const mbps = ref(0)
const ping = ref(0)
const scaleIdx = ref(0)
const needlePct = ref(0)

const scaleMax = computed(() => SCALE_STEPS[scaleIdx.value])
const mbpsLabel = computed(() => mbps.value.toFixed(1))
const pingLabel = computed(() => String(ping.value))
const needleAngle = computed(() => needlePct.value * 180)

function polar(r: number, deg: number): [number, number] {
	const rad = (deg * Math.PI) / 180
	return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)]
}

function arcPath(r: number, a0: number, a1: number): string {
	const [x0, y0] = polar(r, a0)
	const [x1, y1] = polar(r, a1)
	const large = Math.abs(a1 - a0) > 180 ? 1 : 0
	return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

const paths = computed(() => ({
	zone0: arcPath(R, 181, 288),
	zone1: arcPath(R, 288, 324),
	zone2: arcPath(R, 324, 359),
}))

const progressPath = computed(() => arcPath(R, 180, 180 + needlePct.value * 180))

function tickLabel(value: number): string {
	if (value < 1000) return String(Math.round(value))
	const thousands = value / 1000
	return Number.isInteger(thousands) ? `${thousands}к` : `${thousands.toFixed(1)}к`
}

const ticks = computed(() => {
	const result: {
		major: boolean
		outer: [number, number]
		inner: [number, number]
		label: [number, number]
		labelText: string
	}[] = []
	for (let i = 0; i <= 10; i++) {
		const deg = 180 + i * 18
		const major = i % 2 === 0
		result.push({
			major,
			outer: polar(R - 7, deg),
			inner: polar(R - (major ? 16 : 12), deg),
			label: polar(R - 27, deg),
			labelText: tickLabel((scaleMax.value * i) / 10),
		})
	}
	return result
})

function fitScale() {
	while (scaleIdx.value < SCALE_STEPS.length - 1 && mbps.value / scaleMax.value > 0.85) {
		scaleIdx.value++
	}
	needlePct.value = Math.min(1, mbps.value / scaleMax.value)
}

async function measurePing(): Promise<number> {
	const times: number[] = []
	for (let attempt = 0; attempt < 3; attempt++) {
		const started = performance.now()
		await tauriFetch('https://speed.cloudflare.com/__down?bytes=0', {
			signal: AbortSignal.timeout(8000),
		})
		times.push(performance.now() - started)
	}
	return Math.round(Math.min(...times))
}

async function runTest() {
	if (state.value === 'running') return
	state.value = 'running'
	mbps.value = 0
	ping.value = 0
	scaleIdx.value = 0
	needlePct.value = 0
	try {
		ping.value = await measurePing()
		const bytes = 26_000_000
		const deadlineMs = 9000
		const started = performance.now()
		const response = await tauriFetch(`https://speed.cloudflare.com/__down?bytes=${bytes}`, {
			signal: AbortSignal.timeout(30000),
		})
		if (!response.ok) throw new Error(`HTTP ${response.status}`)

		let received = 0
		if (response.body) {
			const reader = response.body.getReader()
			const samples: { t: number; b: number }[] = [{ t: started, b: 0 }]
			for (;;) {
				const { done, value } = await reader.read()
				if (done) break
				received += value.byteLength
				const now = performance.now()
				samples.push({ t: now, b: received })
				while (samples.length > 2 && now - samples[0].t > 900) samples.shift()
				const dt = (now - samples[0].t) / 1000
				const db = received - samples[0].b
				if (dt > 0.2) {
					mbps.value = Math.round(((db * 8) / dt / 1_000_000) * 10) / 10
					fitScale()
				}
				if (now - started > deadlineMs) {
					void reader.cancel().catch(() => {})
					break
				}
			}
		} else {
			const buffer = await response.arrayBuffer()
			received = buffer.byteLength
		}

		const seconds = Math.max(0.25, (performance.now() - started) / 1000)
		mbps.value = Math.round(((received * 8) / seconds / 1_000_000) * 10) / 10
		fitScale()
		state.value = 'done'
	} catch {
		state.value = 'fail'
	}
}

function onOpen() {
	if (state.value === 'idle') void runTest()
}
</script>

<style scoped>
.speed-needle {
	transform-origin: 110px 105px;
	transition: transform 0.55s cubic-bezier(0.3, 1.25, 0.5, 1);
}

.ai-speed-pulse {
	animation: speed-pulse 1.1s ease-in-out infinite;
}

@keyframes speed-pulse {
	0%,
	100% {
		opacity: 0.45;
		transform: scale(0.94);
	}
	50% {
		opacity: 1;
		transform: scale(1.06);
	}
}

@media (prefers-reduced-motion: reduce) {
	.speed-needle {
		transition: none;
	}

	.ai-speed-pulse {
		animation: none;
	}
}
</style>

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
			<div class="flex w-[21rem] flex-col gap-3 p-1">
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
				<svg viewBox="0 0 220 126" class="mx-auto h-auto w-full max-w-[19rem]">
					<!-- Дорожка: зелёная / жёлтая / красная зоны -->
					<path :d="paths.zone0" stroke="#34d399" stroke-opacity="0.4" stroke-width="9" fill="none" stroke-linecap="round" />
					<path :d="paths.zone1" stroke="#fbbf24" stroke-opacity="0.45" stroke-width="9" fill="none" />
					<path :d="paths.zone2" stroke="#f87171" stroke-opacity="0.45" stroke-width="9" fill="none" stroke-linecap="round" />
					<!-- Пройденный путь -->
					<path
						:d="progressPath"
						pathLength="1"
						stroke-dasharray="1 1"
						:stroke-dashoffset="1 - needlePct"
						:stroke-opacity="needlePct > 0.004 ? 1 : 0"
						stroke="var(--color-brand)"
						stroke-width="4"
						fill="none"
						stroke-linecap="round"
						class="speed-progress"
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
					<g class="speed-needle" :style="{ transform: `rotate(${needleAngle.toFixed(2)}deg)` }">
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
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { computed, onBeforeUnmount, ref } from 'vue'

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
/** What the digits show: eased toward the measured speed every frame. */
const shownMbps = ref(0)
const mbpsLabel = computed(() => shownMbps.value.toFixed(1))
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

// One fixed arc; the filled part is drawn with a dash offset, so the path
// never has to be rebuilt while the needle moves.
const progressPath = arcPath(R, 180, 359.99)

// ---- Smooth needle -----------------------------------------------------------
//
// Network chunks arrive in uneven bursts. Writing every burst straight into the
// gauge made it stutter (a CSS transition restarted on each update). Now the
// stream only stores a target; one requestAnimationFrame loop glides the
// needle and the digits toward it with a damped spring - 60 fps, no jitter.

let targetMbps = 0
let velocity = 0
let frame = 0
let lastFrame = 0

function animate(time: number) {
	const dt = Math.min(0.05, lastFrame ? (time - lastFrame) / 1000 : 0.016)
	lastFrame = time
	const target = Math.min(1, targetMbps / scaleMax.value)
	const stiffness = 90
	const damping = 2 * Math.sqrt(stiffness) * 0.9
	velocity += ((target - needlePct.value) * stiffness - velocity * damping) * dt
	needlePct.value = Math.max(0, Math.min(1.02, needlePct.value + velocity * dt))
	shownMbps.value += (targetMbps - shownMbps.value) * Math.min(1, dt * 9)
	const settled =
		Math.abs(target - needlePct.value) < 0.0008 &&
		Math.abs(velocity) < 0.001 &&
		Math.abs(targetMbps - shownMbps.value) < 0.05
	if (settled && state.value !== 'running') {
		needlePct.value = target
		shownMbps.value = targetMbps
		frame = 0
		lastFrame = 0
		return
	}
	frame = requestAnimationFrame(animate)
}

function kick() {
	if (!frame) {
		lastFrame = 0
		frame = requestAnimationFrame(animate)
	}
}

onBeforeUnmount(() => {
	if (frame) cancelAnimationFrame(frame)
	frame = 0
})

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
	targetMbps = mbps.value
	kick()
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
	targetMbps = 0
	kick()
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
			let lastReport = 0
			for (;;) {
				const { done, value } = await reader.read()
				if (done) break
				received += value.byteLength
				const now = performance.now()
				samples.push({ t: now, b: received })
				while (samples.length > 2 && now - samples[0].t > 900) samples.shift()
				const dt = (now - samples[0].t) / 1000
				const db = received - samples[0].b
				// Report at most ~8 times a second; the frame loop does the rest.
				if (dt > 0.2 && now - lastReport > 120) {
					lastReport = now
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
		targetMbps = 0
		kick()
	}
}

function onOpen() {
	if (state.value === 'idle') void runTest()
}
</script>

<style scoped>
.speed-needle {
	transform-origin: 110px 105px;
	will-change: transform;
}

.speed-progress {
	transition: stroke-opacity 0.2s ease;
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
	.ai-speed-pulse {
		animation: none;
	}
}
</style>

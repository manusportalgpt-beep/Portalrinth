<template>
	<canvas ref="canvas" class="music-visualizer" aria-hidden="true" />
</template>

<script setup lang="ts">
/**
 * Bars that move with the beat of what is playing, in the accent colour.
 * Drawn from the player's analyser; at rest they lie low and still.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { analyser, player } from '@/helpers/portalrinth-audio'

const props = withDefaults(defineProps<{ bars?: number }>(), { bars: 14 })

const canvas = ref<HTMLCanvasElement>()
let frame = 0
let levels: number[] = []
let data: Uint8Array<ArrayBuffer> | null = null

function accentColors(element: HTMLElement): [string, string] {
	const style = getComputedStyle(element)
	const brand = style.getPropertyValue('--color-brand').trim() || '#e5484d'
	const gradient = document.documentElement.style.getPropertyValue('--portalrinth-accent-gradient')
	const stops = gradient.match(/#[\da-f]{6}/gi)
	return stops && stops.length > 1 ? [stops[0], stops[stops.length - 1]] : [brand, brand]
}

function draw() {
	frame = requestAnimationFrame(draw)
	const element = canvas.value
	if (!element) return
	const ratio = window.devicePixelRatio || 1
	const width = Math.round(element.clientWidth * ratio)
	const height = Math.round(element.clientHeight * ratio)
	if (!width || !height) return
	if (element.width !== width || element.height !== height) {
		element.width = width
		element.height = height
	}
	const context = element.getContext('2d')
	if (!context) return
	const node = analyser.value
	if (levels.length !== props.bars) levels = Array.from({ length: props.bars }, () => 0)
	if (node && player.playing) {
		if (!data || data.length !== node.frequencyBinCount) {
			data = new Uint8Array(new ArrayBuffer(node.frequencyBinCount))
		}
		node.getByteFrequencyData(data)
	}
	// The lower part of the spectrum is where the beat is; spread it over the bars.
	const usable = data ? Math.floor(data.length * 0.7) : 0
	for (let i = 0; i < props.bars; i++) {
		let target = 0.08
		if (data && player.playing && usable) {
			const from = Math.floor((i / props.bars) * usable)
			const to = Math.max(from + 1, Math.floor(((i + 1) / props.bars) * usable))
			let sum = 0
			for (let j = from; j < to; j++) sum += data[j]
			target = Math.max(0.08, sum / (to - from) / 255)
		}
		levels[i] += (target - levels[i]) * (target > levels[i] ? 0.55 : 0.18)
	}
	context.clearRect(0, 0, width, height)
	const [from, to] = accentColors(element)
	const fill = context.createLinearGradient(0, 0, width, 0)
	fill.addColorStop(0, from)
	fill.addColorStop(1, to)
	context.fillStyle = fill
	const gap = 3 * ratio
	const barWidth = Math.max(2 * ratio, (width - gap * (props.bars - 1)) / props.bars)
	for (let i = 0; i < props.bars; i++) {
		const barHeight = Math.max(barWidth, levels[i] * height)
		const x = i * (barWidth + gap)
		const y = (height - barHeight) / 2
		context.beginPath()
		context.roundRect(x, y, barWidth, barHeight, barWidth / 2)
		context.fill()
	}
}

onMounted(() => {
	frame = requestAnimationFrame(draw)
})
onBeforeUnmount(() => cancelAnimationFrame(frame))
</script>

<style scoped>
.music-visualizer {
	display: block;
	width: 100%;
	height: 100%;
}
</style>

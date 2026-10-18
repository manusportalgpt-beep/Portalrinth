<script setup lang="ts">
/**
 * Choosing the accent by eye rather than by name.
 *
 * A list of presets can only offer the colours someone thought of. A wheel
 * offers every colour, and shows what each one actually looks like before it is
 * chosen, which is the thing a list of names cannot do.
 *
 * The wheel is the usual arrangement: hue runs around the rim, saturation runs
 * in towards the middle, and brightness is separate below. It is drawn with two
 * gradients rather than a canvas, so it scales with the interface, follows the
 * theme, and costs nothing to repaint on every drag frame.
 */
import { defineMessages, Slider, useVIntl } from '@modrinth/ui'
import { computed, ref, watch } from 'vue'

const props = defineProps<{
	/** The accent in force, as `#rrggbb`. */
	modelValue: string
}>()

const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>()

const { formatMessage } = useVIntl()

const messages = defineMessages({
	brightness: {
		id: 'settings.appearance.accent-wheel.brightness',
		defaultMessage: 'Brightness',
	},
})

const SIZE = 224
const RADIUS = SIZE / 2
/** How far from the middle the pointer sits, as a share of the radius. */
const HUE_STOPS = Array.from({ length: 12 }, (_, step) => {
	const degrees = step * 30
	return `hsl(${degrees} 100% 50%) ${degrees}deg`
}).join(', ')

function clamp(value: number, low: number, high: number) {
	return Math.min(high, Math.max(low, value))
}

function parseHex(hex: string): [number, number, number] | null {
	const match = /^#?([\da-f]{6})$/i.exec(hex.trim())
	if (!match) return null
	const value = parseInt(match[1], 16)
	return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function toHex([red, green, blue]: [number, number, number]) {
	const part = (channel: number) => channel.toString(16).padStart(2, '0')
	return `#${part(red)}${part(green)}${part(blue)}`
}

function rgbToHsv([red, green, blue]: [number, number, number]) {
	const r = red / 255
	const g = green / 255
	const b = blue / 255
	const max = Math.max(r, g, b)
	const min = Math.min(r, g, b)
	const delta = max - min

	let hue = 0
	if (delta !== 0) {
		if (max === r) hue = ((g - b) / delta) % 6
		else if (max === g) hue = (b - r) / delta + 2
		else hue = (r - g) / delta + 4
		hue = (hue * 60 + 360) % 360
	}

	return {
		hue,
		saturation: max === 0 ? 0 : delta / max,
		value: max,
	}
}

function hsvToRgb(hue: number, saturation: number, value: number): [number, number, number] {
	const c = value * saturation
	const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
	const m = value - c
	const [r, g, b] =
		hue < 60
			? [c, x, 0]
			: hue < 120
				? [x, c, 0]
				: hue < 180
					? [0, c, x]
					: hue < 240
						? [0, x, c]
						: hue < 300
							? [x, 0, c]
							: [c, 0, x]
	return [(r + m) * 255, (g + m) * 255, (b + m) * 255].map(Math.round) as [number, number, number]
}

const current = computed(() => rgbToHsv(parseHex(props.modelValue) ?? [145, 40, 100]))

/**
 * Brightness is held here rather than read back out of the colour.
 *
 * Reading it from the colour means every step of the drag is round-tripped
 * through a hex string and back, and a slider fed by its own output lags the
 * cursor by however long that takes — which is what made it feel like it was
 * moving on its own.
 */
const brightness = ref(Math.round(current.value.value * 100))
watch(
	() => props.modelValue,
	(hex) => {
		brightness.value = Math.round(rgbToHsv(parseHex(hex) ?? [145, 40, 100]).value * 100)
	},
)

const wheelStyle = computed(() => ({
	width: `${SIZE}px`,
	height: `${SIZE}px`,
	background: `conic-gradient(from -90deg, ${HUE_STOPS})`,
}))

const pointerStyle = computed(() => {
	const angle = (current.value.hue * Math.PI) / 180
	const distance = current.value.saturation * (RADIUS - 10)
	return {
		transform: `translate(-50%, -50%) translate(${Math.cos(angle) * distance}px, ${
			Math.sin(angle) * distance
		}px)`,
		background: toHex(hsvToRgb(current.value.hue, current.value.saturation, 1)),
	}
})

const brightnessStyle = computed(() => ({
	background: `linear-gradient(to right, #000000, ${toHex(
		hsvToRgb(current.value.hue, current.value.saturation, 1),
	)})`,
}))

let dragging = false

/**
 * Turns a point on the wheel into a colour.
 *
 * The angle gives the hue and the distance from the middle gives the
 * saturation, which is the one arrangement where "further out" and "more
 * colourful" are the same thing.
 */
function pick(event: PointerEvent) {
	const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
	const x = event.clientX - (bounds.left + bounds.width / 2)
	const y = event.clientY - (bounds.top + bounds.height / 2)
	const distance = Math.hypot(x, y)
	const saturation = clamp(distance / (RADIUS - 10), 0, 1)
	// With the pointer exactly at the middle the angle is meaningless, and any
	// angle would make the colour jump; the hue stays where it was.
	const hue = distance < 1 ? current.value.hue : ((Math.atan2(y, x) * 180) / Math.PI + 450) % 360

	emit('update:modelValue', toHex(hsvToRgb(hue, saturation, current.value.value)))
}

function startDrag(event: PointerEvent) {
	dragging = true
	;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
	pick(event)
}

function moveDrag(event: PointerEvent) {
	if (dragging) pick(event)
}

function endDrag() {
	dragging = false
}

function setBrightness(value: number | [number, number]) {
	const next = Array.isArray(value) ? value[0] : value
	brightness.value = next
	emit(
		'update:modelValue',
		toHex(hsvToRgb(current.value.hue, current.value.saturation, clamp(next / 100, 0, 1))),
	)
}
</script>

<template>
	<div class="flex flex-wrap items-center gap-6">
		<div class="flex flex-col items-center gap-3">
			<div
				role="slider"
				tabindex="0"
				aria-label="Accent colour"
				:aria-valuetext="modelValue"
				class="relative touch-none rounded-full"
				:class="dragging ? 'cursor-grabbing' : 'cursor-grab'"
				:style="wheelStyle"
				@pointerdown="startDrag"
				@pointermove="moveDrag"
				@pointerup="endDrag"
				@pointercancel="endDrag"
			>
				<div
					class="pointer-events-none absolute inset-0 rounded-full"
					style="background: radial-gradient(circle, #ffffff 0%, #ffffff00 72%)"
				/>
				<span
					class="pointer-events-none absolute top-1/2 left-1/2 h-4 w-4 rounded-full border-2 border-white shadow-md"
					:style="pointerStyle"
				/>
			</div>

			<div class="flex items-center gap-2">
				<span
					class="h-6 w-6 rounded-md border border-surface-5"
					:style="{ background: modelValue }"
					aria-hidden="true"
				/>
				<code class="text-sm text-secondary">{{ modelValue }}</code>
			</div>
		</div>

		<div class="flex min-w-[14rem] flex-1 flex-col gap-3">
			<div class="h-3 w-full rounded" :style="brightnessStyle" aria-hidden="true" />
			<Slider
				id="accent-brightness"
				v-model="brightness"
				:min="0"
				:max="100"
				:step="1"
				:aria-label="formatMessage(messages.brightness)"
				@update:model-value="setBrightness"
			/>
		</div>
	</div>
</template>

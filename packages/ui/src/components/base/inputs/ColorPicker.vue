<template>
	<button
		ref="triggerRef"
		v-tooltip="label"
		type="button"
		class="relative flex shrink-0 cursor-pointer items-center justify-center rounded-xl transition-[filter,box-shadow] hover:brightness-125 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-shadow disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100"
		:class="triggerSizeClass"
		:disabled="disabled"
		:aria-expanded="isOpen"
		:aria-controls="panelId"
		aria-haspopup="dialog"
		@click="toggle"
	>
		<!--
			What the button draws is the caller's to decide. The default is a
			swatch of the colour, which is right for a field; a row of circles
			wants an empty circle with a plus in it, and the same picker opens
			underneath either way.
		-->
		<slot name="trigger" :model="model">
			<span
				class="size-full rounded-xl border border-solid border-surface-5"
				:style="{ background: model }"
			/>
		</slot>
	</button>

	<Teleport v-if="isClient" to="body">
		<Transition name="floating-expand">
			<div
				v-if="isOpen"
				:id="panelId"
				ref="panelRef"
				class="fixed isolate z-[9999] rounded-[14px] bg-surface-3 p-3 shadow-lg ring-1 ring-surface-5"
				:class="allowGradient ? 'w-64' : 'w-56'"
				:style="panelStyle"
				role="dialog"
				:aria-label="label"
				tabindex="-1"
				@keydown="handlePanelKeydown"
			>
				<!--
					A colour, or a run of them. The switch is the same two-way
					choice the rest of the app draws as a pair of chips.
				-->
				<div
					v-if="allowGradient"
					class="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-surface-4 p-1"
					role="tablist"
				>
					<button
						v-for="option in ['solid', 'gradient'] as const"
						:key="option"
						type="button"
						role="tab"
						:aria-selected="mode === option"
						class="cursor-pointer rounded-lg border-0 px-2 py-1 text-sm font-semibold transition-colors"
						:class="
							mode === option
								? 'bg-brand-highlight text-brand'
								: 'bg-transparent text-secondary hover:text-contrast'
						"
						@click="setMode(option)"
					>
						{{ option === 'solid' ? solidLabel : gradientLabel }}
					</button>
				</div>

				<div v-if="mode === 'gradient'" class="mb-3 flex flex-col gap-2">
					<!-- The run itself, and its colours under it, one to pick and edit. -->
					<div
						class="h-8 w-full rounded-lg border border-solid border-surface-5"
						:style="{ background: gradientCss(90, stops) }"
					/>
					<div class="flex flex-wrap items-center gap-1.5">
						<span v-for="(stop, index) in stops" :key="index" class="group relative inline-flex">
							<button
								type="button"
								class="size-6 cursor-pointer rounded-full border-2 border-solid p-0 transition-transform"
								:class="index === activeStop ? 'scale-110 border-contrast' : 'border-transparent'"
								:style="{ backgroundColor: stop }"
								:aria-label="`${gradientLabel} ${index + 1}: ${stop}`"
								:aria-pressed="index === activeStop"
								@click="selectStop(index)"
							/>
							<button
								v-if="stops.length > 2"
								type="button"
								class="absolute -right-1 -top-1 hidden size-3.5 cursor-pointer place-items-center rounded-full border-0 bg-surface-5 p-0 text-[10px] leading-none text-contrast group-hover:grid"
								:aria-label="`${removeStopLabel}: ${stop}`"
								@click="removeStop(index)"
							>
								×
							</button>
						</span>
						<button
							type="button"
							class="size-6 cursor-pointer rounded-full border-0 p-0 disabled:cursor-not-allowed disabled:opacity-40"
							:disabled="stops.length >= maxStops"
							:title="addStopLabel"
							:aria-label="addStopLabel"
							@click="addStop"
						>
							<span
								class="grid size-full place-items-center rounded-full border-2 border-dashed border-surface-5 text-secondary"
								>+</span
							>
						</button>
						<span class="ml-auto text-xs text-secondary">{{ stops.length }}/{{ maxStops }}</span>
					</div>

					<!--
						Which way it runs, as arrows around a picture of it: the
						arrow is the direction, so nothing has to be read.
					-->
					<div class="flex items-center gap-3">
						<span class="text-xs text-secondary">{{ directionLabel }}</span>
						<div
							class="ml-auto grid grid-cols-3 gap-1"
							role="radiogroup"
							:aria-label="directionLabel"
						>
							<template v-for="cell in DIRECTION_GRID" :key="cell">
								<span
									v-if="cell === null"
									class="size-7 rounded-md border border-solid border-surface-5"
									:style="{ background: gradientCss(angle, stops) }"
									aria-hidden="true"
								/>
								<button
									v-else
									type="button"
									role="radio"
									:aria-checked="angle === cell"
									:aria-label="`${directionLabel}: ${cell}°`"
									class="grid size-7 cursor-pointer place-items-center rounded-md border-0 p-0 transition-colors"
									:class="
										angle === cell
											? 'bg-brand text-brand-inverted'
											: 'bg-surface-4 text-secondary hover:text-contrast'
									"
									@click="setAngle(cell)"
								>
									<ArrowUpIcon class="size-4" :style="{ transform: `rotate(${cell}deg)` }" />
								</button>
							</template>
						</div>
					</div>
				</div>

				<div
					ref="svRef"
					class="relative h-36 w-full touch-none select-none rounded-lg outline-none focus-visible:ring-4 focus-visible:ring-brand-shadow"
					role="group"
					:aria-label="`${label} saturation and brightness`"
					tabindex="0"
					:style="svBackgroundStyle"
					@pointerdown="onSvPointerDown"
					@pointermove="onSvPointerMove"
					@keydown="onSvKeydown"
				>
					<span
						class="pointer-events-none absolute size-[1.125rem] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0_/_40%)]"
						:style="svThumbStyle"
					/>
				</div>

				<input
					type="range"
					min="0"
					max="360"
					step="1"
					class="color-picker-hue-slider relative z-10 h-5 w-full"
					:aria-label="`${label} hue`"
					:value="hue"
					@input="onHueInput"
				/>

				<InputFrame appearance="surface" size="standard" class="w-full">
					<template #leading>
						<span class="text-secondary" aria-hidden="true">#</span>
					</template>
					<input
						v-model="hexInput"
						class="w-full min-w-0 appearance-none border-0 bg-transparent p-0 text-base font-medium uppercase shadow-none outline-none focus:ring-0"
						:aria-label="`${label} hex value`"
						maxlength="6"
						spellcheck="false"
						@keydown.enter="commitHexInput"
						@blur="commitHexInput"
					/>
				</InputFrame>

				<!--
					The tick, which is what applies the colour. Everything above
					this is looking at one.
				-->
				<div class="mt-3 flex justify-end">
					<button
						type="button"
						class="grid size-8 cursor-pointer place-items-center rounded-full border-0 bg-brand text-brand-inverted transition-transform hover:scale-110 motion-reduce:transition-none"
						:aria-label="applyLabel"
						:title="applyLabel"
						@click="applyPicked"
					>
						<CheckIcon class="size-4" />
					</button>
				</div>

				<!--
					The colours the person has kept, under the picker that made
					them. Kept rather than chosen from a list, so a colour that
					took a moment to find is not lost the next time.
				-->
				<div v-if="customColors !== undefined" class="mt-3 flex flex-col gap-1.5">
					<span class="text-xs text-secondary">{{ customColorsLabel }}</span>
					<div class="flex flex-wrap items-center gap-1.5">
						<span v-for="color in customColors" :key="color" class="group relative inline-flex">
							<button
								type="button"
								class="size-6 cursor-pointer rounded-full border-0 p-0"
								:style="{ background: color }"
								:aria-label="`${customColorsLabel}: ${color}`"
								@click="pickColor(color)"
							/>
							<!--
								Its own button rather than a mark inside the colour's:
								nested buttons are not something a browser will let a key
								press reach, and this one has to be reachable by keyboard
								as well as by pointer.
							-->
							<button
								type="button"
								class="absolute -right-1 -top-1 hidden size-3.5 cursor-pointer place-items-center rounded-full border-0 bg-surface-5 p-0 text-[10px] leading-none text-contrast group-hover:grid"
								:aria-label="`${customColorsRemoveLabel}: ${color}`"
								@click="removeCustomColor(color)"
							>
								×
							</button>
						</span>
						<button
							type="button"
							class="size-6 cursor-pointer rounded-full border-0 p-0 disabled:cursor-not-allowed disabled:opacity-40"
							:disabled="customColors.length >= customColorsLimit"
							:title="
								customColors.length >= customColorsLimit
									? customColorsFullLabel
									: customColorsAddLabel
							"
							:aria-label="customColorsAddLabel"
							@click="addCustomColor"
						>
							<span
								class="grid size-full place-items-center rounded-full border-2 border-dashed border-surface-5 text-secondary"
								>+</span
							>
						</button>
					</div>
				</div>
			</div>
		</Transition>
	</Teleport>
</template>

<script setup lang="ts">
import { ArrowUpIcon, CheckIcon } from '@modrinth/assets'
import { colord } from 'colord'
import { computed, onMounted, ref, useId, watch } from 'vue'

import {
	type AnchoredTeleportPlacement,
	useAnchoredTeleport,
} from '../../../utils/use-anchored-teleport'
import InputFrame from './InputFrame.vue'

const model = defineModel<string>({ required: true })

const props = withDefaults(
	defineProps<{
		label: string
		disabled?: boolean
		/** Size of the swatch trigger button. */
		size?: 'sm' | 'md'
		placement?: AnchoredTeleportPlacement
		/**
		 * Colours the person has kept, shown under the picker.
		 *
		 * Left undefined the section is not drawn at all, so a caller that has
		 * no list of its own is not shown an empty one.
		 */
		customColors?: string[]
		customColorsLabel?: string
		customColorsAddLabel?: string
		customColorsRemoveLabel?: string
		customColorsFullLabel?: string
		/** How many of them the row has room for. */
		customColorsLimit?: number
		/** What the tick says it does. */
		applyLabel?: string
		/**
		 * Whether a run of colours can be picked as well as one. The model is
		 * then either a hex colour or `linear-gradient(<angle>deg, #hex, ...)`.
		 */
		allowGradient?: boolean
		/** How many colours a run can have. */
		maxStops?: number
		solidLabel?: string
		gradientLabel?: string
		directionLabel?: string
		addStopLabel?: string
		removeStopLabel?: string
	}>(),
	{
		disabled: false,
		size: 'md',
		placement: 'bottom-start',
		customColorsLabel: 'My colours',
		customColorsAddLabel: 'Keep this colour',
		customColorsRemoveLabel: 'Remove this colour',
		customColorsFullLabel: 'The row is full - remove one of your colours first',
		customColorsLimit: 8,
		applyLabel: 'Use this colour',
		allowGradient: false,
		maxStops: 10,
		solidLabel: 'Colour',
		gradientLabel: 'Gradient',
		directionLabel: 'Direction',
		addStopLabel: 'Add a colour',
		removeStopLabel: 'Remove this colour',
	},
)

const emit = defineEmits<{
	/** Fired when the picker is opened and an edit session begins. */
	focus: []
	/** Fired when the picker closes and the edit session is committed. */
	change: [value: string]
	/** Fired when a kept colour is added or removed. */
	'update:customColors': [colors: string[]]
	/**
	 * The colour being looked at while the picker is open — under the pointer
	 * or in the wheel — and `null` once it closes. For showing it, not keeping it.
	 */
	preview: [value: string | null]
}>()

/** Puts a colour in the wheel without applying it; the tick does that. */
function pickColor(color: string) {
	if (mode.value === 'gradient' && !parseGradient(color)) {
		// A plain colour clicked while editing a run goes into the colour
		// being edited, rather than throwing the run away.
		stops.value[activeStop.value] = color
		syncWheel(color)
		picked.value = gradientCss(angle.value, stops.value)
		return
	}
	picked.value = color
	syncFromModel(color)
}

function addCustomColor() {
	const colors = props.customColors
	if (!colors) return
	if (colors.length >= props.customColorsLimit) return
	const color = model.value.toLowerCase()
	if (!colors.includes(color)) {
		emit('update:customColors', [...colors, color])
	}
}

function removeCustomColor(color: string) {
	const colors = props.customColors
	if (!colors) return
	emit(
		'update:customColors',
		colors.filter((kept) => kept !== color),
	)
}

const panelId = `color-picker-${useId()}`
const triggerRef = ref<HTMLButtonElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const svRef = ref<HTMLElement | null>(null)
const resolvedPlacement = computed(() => props.placement)

const { isOpen, panelStyle, open, close } = useAnchoredTeleport(
	triggerRef,
	panelRef,
	resolvedPlacement,
)

const hue = ref(0)
const saturation = ref(0)
const brightness = ref(100)
const hexInput = ref('')

/**
 * A run of colours: the direction it goes in, and the colours it goes through,
 * evenly spaced. Written the way CSS draws it, so the string is the picture.
 */
const DIRECTION_GRID = [315, 0, 45, 270, null, 90, 225, 180, 135] as const
const GRADIENT = /^linear-gradient\(\s*(-?\d+(?:\.\d+)?)deg\s*,(.+)\)$/i

function parseGradient(value: string): { angle: number; stops: string[] } | null {
	const match = GRADIENT.exec(value.trim())
	if (!match) return null
	const colors = match[2].split(',').map((part) => part.trim().toLowerCase())
	if (colors.length < 2 || colors.some((color) => !/^#[0-9a-f]{6}$/.test(color))) return null
	return { angle: ((Number(match[1]) % 360) + 360) % 360, stops: colors }
}

function gradientCss(direction: number, colors: string[]): string {
	return `linear-gradient(${direction}deg, ${colors.join(', ')})`
}

const mode = ref<'solid' | 'gradient'>('solid')
const stops = ref<string[]>(['#c1121f', '#ff8f4a'])
const angle = ref(180)
const activeStop = ref(0)

/** The colour being edited in the wheel: the one colour, or one of the run. */
function syncWheel(color: string) {
	const hsv = hexToHsv(color)
	if (!hsv) return
	hue.value = hsv.h
	saturation.value = hsv.s
	brightness.value = hsv.v
	hexInput.value = color.replace('#', '').toUpperCase()
}

function setMode(next: 'solid' | 'gradient') {
	if (mode.value === next) return
	if (next === 'gradient') {
		// The run starts from the colour that was being looked at, so
		// switching keeps what was there.
		const base = /^#[0-9a-f]{6}$/i.test(picked.value) ? picked.value.toLowerCase() : stops.value[0]
		const second = colord(base).rotate(40).lighten(0.08).toHex()
		stops.value = [base, second]
		activeStop.value = 0
		mode.value = 'gradient'
		syncWheel(base)
		picked.value = gradientCss(angle.value, stops.value)
	} else {
		const base = stops.value[activeStop.value] ?? stops.value[0]
		mode.value = 'solid'
		picked.value = base
		syncWheel(base)
	}
}

function selectStop(index: number) {
	activeStop.value = index
	syncWheel(stops.value[index])
}

function addStop() {
	if (stops.value.length >= props.maxStops) return
	const last = stops.value[stops.value.length - 1]
	stops.value = [...stops.value, colord(last).rotate(30).toHex()]
	selectStop(stops.value.length - 1)
	picked.value = gradientCss(angle.value, stops.value)
}

function removeStop(index: number) {
	if (stops.value.length <= 2) return
	stops.value = stops.value.filter((_, at) => at !== index)
	selectStop(Math.min(activeStop.value, stops.value.length - 1))
	picked.value = gradientCss(angle.value, stops.value)
}

function setAngle(next: number) {
	angle.value = next
	picked.value = gradientCss(angle.value, stops.value)
}
/**
 * The colour being looked at, which is not yet the colour in force.
 *
 * Choosing a colour in the wheel is looking, not deciding: the wheel is
 * dragged through every colour on the way to one, and the interface would
 * be repainting itself for each of them. The one that is chosen is applied
 * with the tick at the bottom, and everything else is left as it was.
 */
const picked = ref(model.value)

const suppressModelSync = false

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value))
}

function hexToHsv(hex: string) {
	if (!/^#[0-9a-f]{6}$/i.test(hex)) return undefined
	const { h, s, v } = colord(hex).toHsv()
	return { h, s, v }
}

function hsvToHex(h: number, s: number, v: number) {
	return colord({ h, s, v }).toHex()
}

function syncFromModel(value: string) {
	const gradient = props.allowGradient ? parseGradient(value) : null
	if (gradient) {
		mode.value = 'gradient'
		stops.value = gradient.stops
		angle.value = gradient.angle
		activeStop.value = 0
		syncWheel(gradient.stops[0])
		return
	}
	if (!hexToHsv(value)) return
	mode.value = 'solid'
	syncWheel(value)
}

watch(
	model,
	(value) => {
		if (suppressModelSync) return
		picked.value = value
		syncFromModel(value)
	},
	{ immediate: true },
)

// Opening the picker starts from the colour in force, whatever was looked at
// last time.
watch(isOpen, (open) => {
	if (open) {
		picked.value = model.value
		syncFromModel(model.value)
	}
})

function applyHsv() {
	const hex = hsvToHex(hue.value, saturation.value, brightness.value)
	hexInput.value = hex.replace('#', '').toUpperCase()
	setEdited(hex)
}

/** Puts a colour into whatever is being edited: the one colour, or one of the run. */
function setEdited(hex: string) {
	if (mode.value === 'gradient') {
		const next = [...stops.value]
		next[activeStop.value] = hex
		stops.value = next
		picked.value = gradientCss(angle.value, next)
	} else {
		picked.value = hex
	}
}

/**
 * Applies the colour that was looked at.
 *
 * The one moment the interface changes: everything above it is looking.
 */
function applyPicked() {
	if (picked.value.toLowerCase() !== model.value.toLowerCase()) {
		model.value = picked.value
		emit('change', picked.value)
	}
	close()
}

function updateSvFromPointer(event: PointerEvent) {
	const rect = svRef.value?.getBoundingClientRect()
	if (!rect) return
	const x = clamp(event.clientX - rect.left, 0, rect.width)
	const y = clamp(event.clientY - rect.top, 0, rect.height)
	saturation.value = (x / rect.width) * 100
	brightness.value = 100 - (y / rect.height) * 100
	applyHsv()
}

function onSvPointerDown(event: PointerEvent) {
	;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
	updateSvFromPointer(event)
}

function onSvPointerMove(event: PointerEvent) {
	if (event.buttons !== 1) return
	updateSvFromPointer(event)
}

function onSvKeydown(event: KeyboardEvent) {
	const step = event.shiftKey ? 10 : 2
	switch (event.key) {
		case 'ArrowLeft':
			saturation.value = clamp(saturation.value - step, 0, 100)
			break
		case 'ArrowRight':
			saturation.value = clamp(saturation.value + step, 0, 100)
			break
		case 'ArrowUp':
			brightness.value = clamp(brightness.value + step, 0, 100)
			break
		case 'ArrowDown':
			brightness.value = clamp(brightness.value - step, 0, 100)
			break
		default:
			return
	}
	event.preventDefault()
	applyHsv()
}

function onHueInput(event: Event) {
	hue.value = Number((event.target as HTMLInputElement).value)
	applyHsv()
}

function commitHexInput() {
	const normalized = hexInput.value.trim().replace('#', '')
	if (/^[0-9a-f]{6}$/i.test(normalized)) {
		const hex = `#${normalized.toLowerCase()}`
		setEdited(hex)
		syncWheel(hex)
	} else {
		const current = mode.value === 'gradient' ? stops.value[activeStop.value] : picked.value
		hexInput.value = (current ?? '').replace('#', '').toUpperCase()
	}
}

const svBackgroundStyle = computed(() => ({
	backgroundImage:
		'linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)',
	backgroundColor: `hsl(${hue.value}, 100%, 50%)`,
}))

const svThumbStyle = computed(() => ({
	left: `${saturation.value}%`,
	top: `${100 - brightness.value}%`,
}))

const triggerSizeClass = computed(() => (props.size === 'sm' ? 'size-8' : 'size-9'))

function handlePanelKeydown(event: KeyboardEvent) {
	if (event.key !== 'Escape') return
	event.preventDefault()
	// Escape is the one way out that means "never mind".
	discardOnClose = true
	closePicker(true)
}

async function openPicker() {
	if (props.disabled || isOpen.value) return
	await open()
	emit('focus')
}

function closePicker(restoreFocus = false) {
	if (!isOpen.value) return
	close(restoreFocus)
}

function toggle() {
	if (isOpen.value) closePicker()
	else openPicker()
}

/**
 * Whether the picker is being closed to throw away what was looked at.
 *
 * Only Escape does that. Clicking anywhere outside the panel counts as the
 * check mark: a colour picked and then left behind is a colour chosen, and the
 * settings that own it ask whether to save it like they would after the mark.
 */
let discardOnClose = false

watch(isOpen, (openState, previousOpenState) => {
	if (!openState && previousOpenState) {
		const discard = discardOnClose
		discardOnClose = false
		if (!discard && picked.value && picked.value.toLowerCase() !== model.value.toLowerCase()) {
			model.value = picked.value
		}
		emit('preview', null)
		emit('change', model.value)
	}
})

watch(picked, (value) => {
	if (isOpen.value) emit('preview', value)
})

const isClient = ref(false)
onMounted(() => {
	isClient.value = true
})

defineExpose({ open: openPicker, close: closePicker })
</script>

<style scoped>
.color-picker-hue-slider {
	display: block;
	margin: 0;
	padding: 0;
	cursor: pointer;
	background: transparent;
	outline: none;
	appearance: none;

	&::-webkit-slider-runnable-track {
		height: 1.125rem;
		border-radius: 999px;
		background: linear-gradient(
			to right,
			#f00 0%,
			#ff0 17%,
			#0f0 33%,
			#0ff 50%,
			#00f 67%,
			#f0f 83%,
			#f00 100%
		);
	}

	&::-webkit-slider-thumb {
		width: 1.125rem;
		height: 1.125rem;
		margin-top: 0;
		border: 2px solid #fff;
		border-radius: 999px;
		background: transparent;
		box-shadow: 0 0 0 1px rgb(0 0 0 / 40%);
		appearance: none;
	}

	&:focus-visible::-webkit-slider-thumb {
		box-shadow:
			0 0 0 1px rgb(0 0 0 / 40%),
			0 0 0 0.25rem var(--color-brand-shadow);
	}

	&::-moz-range-track {
		height: 1.125rem;
		border-radius: 999px;
		background: linear-gradient(
			to right,
			#f00 0%,
			#ff0 17%,
			#0f0 33%,
			#0ff 50%,
			#00f 67%,
			#f0f 83%,
			#f00 100%
		);
	}

	&::-moz-range-thumb {
		width: 1.125rem;
		height: 1.125rem;
		border: 2px solid #fff;
		border-radius: 999px;
		background: transparent;
		box-shadow: 0 0 0 1px rgb(0 0 0 / 40%);
	}
}
</style>

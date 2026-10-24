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
				:style="{ backgroundColor: model }"
			/>
		</slot>
	</button>

	<Teleport v-if="isClient" to="body">
		<Transition name="floating-expand">
			<div
				v-if="isOpen"
				:id="panelId"
				ref="panelRef"
				class="fixed isolate z-[9999] w-56 rounded-[14px] bg-surface-3 p-3 shadow-lg ring-1 ring-surface-5"
				:style="panelStyle"
				role="dialog"
				:aria-label="label"
				tabindex="-1"
				@keydown="handlePanelKeydown"
			>
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
								:style="{ backgroundColor: color }"
								:aria-label="`${customColorsLabel}: ${color}`"
								@mouseenter="emit('preview', color)"
								@mouseleave="emit('preview', picked)"
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
import { CheckIcon } from '@modrinth/assets'
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
	const hsv = hexToHsv(value)
	if (!hsv) return
	hue.value = hsv.h
	saturation.value = hsv.s
	brightness.value = hsv.v
	hexInput.value = value.replace('#', '').toUpperCase()
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
	picked.value = hex
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
		picked.value = `#${normalized.toLowerCase()}`
		syncFromModel(picked.value)
	} else {
		hexInput.value = model.value.replace('#', '').toUpperCase()
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

watch(isOpen, (openState, previousOpenState) => {
	if (!openState && previousOpenState) {
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

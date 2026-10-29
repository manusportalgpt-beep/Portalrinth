<template>
	<div class="flex items-center gap-1.5">
		<button
			v-tooltip="label"
			class="grid size-8 shrink-0 place-items-center rounded-full border-0 bg-transparent text-secondary transition-colors hover:bg-surface-4 hover:text-contrast"
			:aria-label="label"
			@click="toggleMute"
		>
			<VolumeXIcon v-if="model === 0" class="size-5" />
			<Volume1Icon v-else-if="model < 50" class="size-5" />
			<Volume2Icon v-else class="size-5" />
		</button>
		<input
			v-model.number="model"
			class="portalrinth-range min-w-0 flex-1"
			type="range"
			min="0"
			max="100"
			step="1"
			:style="{ '--p': String(Math.min(100, Math.max(0, model)) / 100) }"
			:aria-label="label"
		/>
	</div>
</template>

<script setup lang="ts">
import { Volume1Icon, Volume2Icon, VolumeXIcon } from '@modrinth/assets'

defineProps<{ label: string }>()
const model = defineModel<number>({ required: true })

/** The volume before muting, so unmuting puts it back. */
let beforeMute = 60
function toggleMute() {
	if (model.value > 0) {
		beforeMute = model.value
		model.value = 0
	} else model.value = beforeMute || 60
}
</script>

<style>
/* A thin bar in the accent, filled up to where it is; shared by every audio
   control. The input itself is a generous invisible grab area - the visible
   bar is the gradient, squeezed into a thin centred strip by background-size. */
.portalrinth-range {
	/* The thumb travels half its own width short of each end, so the
	   colour is filled to the thumb's centre, not to where the raw
	   percent lands: the ball stays pinned to the tip of the line
	   instead of drifting off it. */
	--p: 0;
	--progress: calc(0.4375rem + (100% - 0.875rem) * var(--p));
	appearance: none;
	height: 1.1rem;
	margin: 0;
	border-radius: 999px;
	background:
		linear-gradient(
				to right,
				transparent var(--progress),
				var(--surface-5, rgb(255 255 255 / 15%)) var(--progress)
			)
			no-repeat center / 100% 0.375rem,
		var(--portalrinth-accent-gradient, var(--color-brand)) no-repeat center / 100% 0.375rem;
	cursor: pointer;
	outline: none;
}

.portalrinth-range:disabled {
	cursor: default;
	opacity: 0.5;
}

.portalrinth-range::-webkit-slider-thumb {
	appearance: none;
	width: 0.875rem;
	height: 0.875rem;
	border-radius: 999px;
	background: var(--portalrinth-accent-gradient, var(--color-brand));
	box-shadow: 0 1px 4px rgb(0 0 0 / 40%);
	transition: transform 0.12s ease;
}

.portalrinth-range:hover::-webkit-slider-thumb,
.portalrinth-range:focus-visible::-webkit-slider-thumb,
.portalrinth-range:active::-webkit-slider-thumb {
	transform: scale(1.25);
}

.portalrinth-range::-moz-range-thumb {
	width: 0.875rem;
	height: 0.875rem;
	border: 0;
	border-radius: 999px;
	background: var(--portalrinth-accent-gradient, var(--color-brand));
}
</style>

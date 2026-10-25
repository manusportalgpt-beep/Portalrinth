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
			:style="{ '--progress': `${model}%` }"
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
/* A thin bar in the accent, filled up to where it is; shared by every audio control. */
.portalrinth-range {
	--progress: 0%;
	appearance: none;
	height: 0.375rem;
	margin: 0;
	border-radius: 999px;
	background:
		linear-gradient(
			to right,
			transparent var(--progress),
			var(--surface-5, rgb(255 255 255 / 15%)) var(--progress)
		),
		var(--portalrinth-accent-gradient, var(--color-brand));
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
	background: var(--color-contrast, #fff);
	box-shadow: 0 1px 4px rgb(0 0 0 / 40%);
	transition: transform 0.12s ease;
}

.portalrinth-range:hover::-webkit-slider-thumb,
.portalrinth-range:focus-visible::-webkit-slider-thumb {
	transform: scale(1.2);
}

.portalrinth-range::-moz-range-thumb {
	width: 0.875rem;
	height: 0.875rem;
	border: 0;
	border-radius: 999px;
	background: var(--color-contrast, #fff);
}
</style>

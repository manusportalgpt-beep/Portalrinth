<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
	label: string
	value: string
	percent: number | null
}>()

const RADIUS = 26
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const offset = computed(() => {
	const percent = Math.min(100, Math.max(0, props.percent ?? 0))
	return CIRCUMFERENCE * (1 - percent / 100)
})

const tone = computed(() => {
	const percent = props.percent ?? 0
	if (percent >= 90) return 'danger'
	if (percent >= 70) return 'warning'
	return 'normal'
})
</script>

<template>
	<div class="usage-ring" :data-tone="tone">
		<svg viewBox="0 0 64 64" class="usage-ring-svg" aria-hidden="true">
			<circle cx="32" cy="32" :r="RADIUS" class="usage-ring-track" />
			<circle
				v-if="percent !== null"
				cx="32"
				cy="32"
				:r="RADIUS"
				class="usage-ring-bar"
				:stroke-dasharray="CIRCUMFERENCE"
				:stroke-dashoffset="offset"
			/>
		</svg>
		<span class="text-sm font-semibold text-secondary">{{ label }}</span>
		<span class="max-w-full truncate text-sm font-bold text-contrast">{{ value }}</span>
	</div>
</template>

<style scoped lang="scss">
.usage-ring {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.375rem;
	min-width: 0;
	padding: 1rem 0.75rem;
	border-radius: var(--radius-md, 0.5rem);
	border: 1px solid var(--surface-5);
	background: var(--surface-3);
}

.usage-ring-svg {
	width: 4rem;
	height: 4rem;
	transform: rotate(-90deg);
}

.usage-ring-track {
	fill: none;
	stroke: var(--surface-5);
	stroke-width: 6;
}

.usage-ring-bar {
	fill: none;
	stroke: var(--color-brand);
	stroke-width: 6;
	stroke-linecap: round;
	transition: stroke-dashoffset 0.6s ease;

	[data-tone='warning'] & {
		stroke: var(--color-orange);
	}

	[data-tone='danger'] & {
		stroke: var(--color-red);
	}
}
</style>

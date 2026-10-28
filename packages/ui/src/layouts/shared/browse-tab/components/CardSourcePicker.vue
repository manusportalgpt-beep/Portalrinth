<script setup lang="ts">
/**
 * The platform on a card when Discover lists two at once: a small toggle
 * before the install button when the project is on both (the install comes
 * from the picked one), or a quiet badge naming the only one it is on.
 */
import type { CardSources } from '../types'

defineProps<{ sources: CardSources }>()
</script>

<template>
	<div
		v-if="sources.options.length > 1"
		class="card-sources"
		role="radiogroup"
		:aria-label="sources.label"
	>
		<button
			v-for="option in sources.options"
			:key="option.key"
			v-tooltip="option.label"
			type="button"
			role="radio"
			:aria-checked="option.active"
			:aria-label="option.label"
			class="card-source"
			:class="{ 'card-source--active': option.active }"
			@click.stop.prevent="option.onSelect()"
		>
			<component :is="option.icon" class="card-source__icon" :class="option.iconClass" />
		</button>
	</div>
	<span
		v-else-if="sources.options.length === 1"
		v-tooltip="sources.options[0].label"
		class="card-sources card-sources--badge"
		:aria-label="sources.options[0].label"
		role="img"
	>
		<component
			:is="sources.options[0].icon"
			class="card-source__icon"
			:class="sources.options[0].iconClass"
		/>
	</span>
</template>

<style scoped>
.card-sources {
	display: inline-flex;
	align-items: center;
	align-self: stretch;
	gap: 2px;
	padding: 3px;
	border-radius: 999px;
	border: 1px solid var(--surface-5);
	background: color-mix(in srgb, var(--surface-4) 70%, transparent);
	min-height: 2.25rem;
}

.card-sources--badge {
	justify-content: center;
	aspect-ratio: 1;
	padding: 0;
	cursor: default;
}

.card-source {
	display: grid;
	place-items: center;
	align-self: stretch;
	aspect-ratio: 1;
	min-width: 1.85rem;
	padding: 0;
	border: none;
	border-radius: 999px;
	background: transparent;
	cursor: pointer;
	opacity: 0.55;
	filter: grayscale(0.6);
	transition:
		background-color 0.2s ease,
		opacity 0.2s ease,
		filter 0.2s ease,
		transform 0.15s ease;
}

.card-source:hover {
	opacity: 0.9;
	filter: none;
	background: var(--surface-5);
}

.card-source:active {
	transform: scale(0.92);
}

.card-source:focus-visible {
	outline: 2px solid var(--color-brand);
	outline-offset: 1px;
}

.card-source--active,
.card-source--active:hover {
	opacity: 1;
	filter: none;
	background: var(--color-brand-highlight);
	box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-brand) 45%, transparent);
}

.card-source__icon {
	width: 1.05rem;
	height: 1.05rem;
}
</style>

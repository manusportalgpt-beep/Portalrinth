<script setup lang="ts">
import { CheckIcon, CoffeeIcon, DownloadIcon, PowerIcon, WorldIcon } from '@modrinth/assets'
import { useVIntl } from '@modrinth/ui'
import { computed } from 'vue'

import type { HostedServerView } from '@/helpers/hosting'

import { bootMessages } from './messages'

const props = defineProps<{ server: HostedServerView }>()

const { formatMessage } = useVIntl()

const steps = [
	{ icon: DownloadIcon, label: bootMessages.core },
	{ icon: CoffeeIcon, label: bootMessages.java },
	{ icon: WorldIcon, label: bootMessages.world },
	{ icon: PowerIcon, label: bootMessages.done },
]

const current = computed(() => Math.min(Math.max(props.server.boot_step, 1), 4))
const hint = computed(() => {
	if (current.value <= 1) return formatMessage(bootMessages.coreHint)
	if (current.value === 2) return formatMessage(bootMessages.javaHint)
	if (props.server.boot_progress !== null) {
		return formatMessage(bootMessages.worldProgress, { percent: props.server.boot_progress })
	}
	return formatMessage(bootMessages.worldHint)
})
const fill = computed(() => {
	const base = ((current.value - 1) / (steps.length - 1)) * 100
	if (current.value === 3 && props.server.boot_progress !== null) {
		return base + (props.server.boot_progress / 100) * (100 / (steps.length - 1))
	}
	return base
})
</script>

<template>
	<section class="boot" aria-live="polite">
		<div class="boot-track">
			<div class="boot-rail"><span :style="{ width: `${fill}%` }" /></div>
			<div
				v-for="(step, index) in steps"
				:key="index"
				class="boot-step"
				:data-state="index + 1 < current ? 'done' : index + 1 === current ? 'active' : 'todo'"
			>
				<span class="boot-dot">
					<CheckIcon v-if="index + 1 < current" />
					<component :is="step.icon" v-else />
				</span>
				<span class="boot-label">{{ formatMessage(step.label) }}</span>
			</div>
		</div>
		<span class="boot-hint">{{ hint }}</span>
	</section>
</template>

<style scoped lang="scss">
.boot {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
	padding: 1rem 1.25rem;
	border-radius: var(--radius-lg, 0.75rem);
	border: 1px solid color-mix(in srgb, var(--color-brand) 30%, var(--surface-5));
	background: color-mix(in srgb, var(--surface-4) 85%, transparent);
	backdrop-filter: blur(12px);
}

.boot-track {
	position: relative;
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
}

.boot-rail {
	position: absolute;
	top: 0.875rem;
	right: 12.5%;
	left: 12.5%;
	height: 2px;
	border-radius: 2px;
	background: var(--surface-5);

	span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--color-brand);
		transition: width 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
	}
}

.boot-step {
	position: relative;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.375rem;
	min-width: 0;
}

.boot-dot {
	display: grid;
	place-items: center;
	width: 1.75rem;
	height: 1.75rem;
	border-radius: 999px;
	border: 2px solid var(--surface-5);
	background: var(--surface-3);
	color: var(--color-secondary);
	transition:
		background-color 0.25s ease,
		border-color 0.25s ease,
		color 0.25s ease;

	svg {
		width: 0.875rem;
		height: 0.875rem;
	}

	[data-state='done'] & {
		border-color: var(--color-brand);
		background: var(--color-brand);
		color: var(--color-accent-contrast, #000);
	}

	[data-state='active'] & {
		border-color: var(--color-brand);
		background: var(--color-brand-highlight);
		color: var(--color-brand);
		animation: boot-pulse 1.6s ease-in-out infinite;
	}
}

.boot-label {
	max-width: 100%;
	overflow: hidden;
	color: var(--color-secondary);
	font-size: 0.75rem;
	font-weight: 600;
	text-overflow: ellipsis;
	white-space: nowrap;

	[data-state='active'] &,
	[data-state='done'] & {
		color: var(--color-contrast);
	}
}

.boot-hint {
	color: var(--color-secondary);
	font-size: 0.875rem;
	text-align: center;
}

@keyframes boot-pulse {
	50% {
		box-shadow: 0 0 0 6px color-mix(in srgb, var(--color-brand) 18%, transparent);
	}
}

@media (prefers-reduced-motion: reduce) {
	.boot-dot {
		animation: none !important;
	}
}
</style>

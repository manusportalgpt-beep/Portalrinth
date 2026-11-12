<script setup lang="ts">
/**
 * What the assistant is up to before it has a step to show: a small live
 * line with an icon that changes as the wait goes on, instead of a bare
 * "thinking" box.
 */
import {
	BrainCircuitIcon,
	ClockIcon,
	EditIcon,
	HammerIcon,
	MessageIcon,
	SparklesIcon,
} from '@modrinth/assets'
import { type Component, computed, onBeforeUnmount, onMounted, ref } from 'vue'

import type { AgentPhase } from '@/helpers/ai-assistant'

const props = defineProps<{ phase: AgentPhase }>()

const startedAt = Date.now()
const now = ref(startedAt)
let ticker: ReturnType<typeof setInterval> | undefined
onMounted(() => {
	ticker = setInterval(() => (now.value = Date.now()), 250)
})
onBeforeUnmount(() => clearInterval(ticker))

const elapsed = computed(() => (now.value - startedAt) / 1000)

const state = computed<{ key: string; icon: Component; text: string }>(() => {
	if (props.phase === 'working') return { key: 'work', icon: HammerIcon, text: 'Работаю' }
	if (props.phase === 'speaking') return { key: 'speak', icon: EditIcon, text: 'Пишу ответ' }
	const seconds = elapsed.value
	if (seconds < 1.5) return { key: 'read', icon: MessageIcon, text: 'Читаю сообщение' }
	if (seconds < 5) return { key: 'think', icon: BrainCircuitIcon, text: 'Обдумываю' }
	if (seconds < 12) return { key: 'shape', icon: SparklesIcon, text: 'Собираю ответ' }
	return { key: 'slow', icon: ClockIcon, text: 'Модель думает дольше обычного' }
})

const clock = computed(() => {
	const seconds = elapsed.value
	return seconds < 10 ? `${seconds.toFixed(1).replace('.', ',')} с` : `${Math.floor(seconds)} с`
})
</script>

<template>
	<div class="ai-activity" role="status" aria-live="polite">
		<span class="ai-activity-icon">
			<Transition name="ai-activity-swap" mode="out-in">
				<component :is="state.icon" :key="state.key" class="size-3.5" />
			</Transition>
		</span>
		<Transition name="ai-activity-swap" mode="out-in">
			<span :key="state.key" class="ai-activity-text">{{ state.text }}…</span>
		</Transition>
		<span class="ai-activity-clock">{{ clock }}</span>
	</div>
</template>

<style scoped>
.ai-activity {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	min-width: 0;
	padding: 0.15rem 0.25rem;
	font-size: 0.8125rem;
}

.ai-activity-icon {
	position: relative;
	display: grid;
	flex-shrink: 0;
	place-items: center;
	width: 1.5rem;
	height: 1.5rem;
	border-radius: 999px;
	background: color-mix(in srgb, var(--color-brand) 16%, transparent);
	color: var(--color-brand);
}

.ai-activity-icon::after {
	position: absolute;
	inset: -3px;
	border: 2px solid transparent;
	border-top-color: var(--color-brand);
	border-radius: inherit;
	content: '';
	animation: ai-activity-orbit 1.1s linear infinite;
}

.ai-activity-text {
	min-width: 0;
	overflow: hidden;
	font-weight: 600;
	text-overflow: ellipsis;
	white-space: nowrap;
	background: linear-gradient(
		90deg,
		var(--color-secondary) 0%,
		var(--color-contrast) 45%,
		var(--color-secondary) 90%
	);
	background-size: 200% 100%;
	-webkit-background-clip: text;
	background-clip: text;
	color: transparent;
	animation: ai-activity-sweep 1.8s linear infinite;
}

.ai-activity-clock {
	flex-shrink: 0;
	margin-left: auto;
	color: var(--color-secondary);
	font-size: 0.75rem;
	font-variant-numeric: tabular-nums;
}

.ai-activity-swap-enter-active,
.ai-activity-swap-leave-active {
	transition:
		opacity 0.18s ease,
		transform 0.18s ease;
}

.ai-activity-swap-enter-from {
	opacity: 0;
	transform: translateY(4px);
}

.ai-activity-swap-leave-to {
	opacity: 0;
	transform: translateY(-4px);
}

@keyframes ai-activity-orbit {
	to {
		transform: rotate(360deg);
	}
}

@keyframes ai-activity-sweep {
	from {
		background-position: 100% 0;
	}
	to {
		background-position: -100% 0;
	}
}

@media (prefers-reduced-motion: reduce) {
	.ai-activity-icon::after,
	.ai-activity-text {
		animation: none;
	}
}
</style>

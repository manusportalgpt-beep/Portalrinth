<script setup lang="ts">
/**
 * The craft task card: what Portalus is building right now and which stage
 * the work has reached - plan, structure, code, packing, hand-over. Drawn
 * live while the run is in flight and kept on the finished reply.
 */
import {
	BoxIcon,
	CheckCheckIcon,
	CheckIcon,
	HammerIcon,
	PackageIcon,
	PaintbrushIcon,
	SparklesIcon,
} from '@modrinth/assets'
import { type Component, computed } from 'vue'

import type { AiTask, AiTaskKind } from '@/helpers/ai-assistant'

const props = withDefaults(
	defineProps<{
		task: AiTask
		/** The run is still going: the next stage pulses. */
		live?: boolean
	}>(),
	{ live: false },
)

const KINDS: Record<AiTaskKind, { label: string; icon: Component }> = {
	mod: { label: 'Мод', icon: HammerIcon },
	shader: { label: 'Шейдер', icon: SparklesIcon },
	resourcepack: { label: 'Ресурс-пак', icon: PaintbrushIcon },
	datapack: { label: 'Датапак', icon: PackageIcon },
	plan: { label: 'План', icon: CheckCheckIcon },
}

const kind = computed(() => KINDS[props.task.kind] ?? { label: 'Задача', icon: BoxIcon })

/** The first unfinished stage is the one the work is on right now. */
const currentStage = computed(() => {
	const index = props.task.stages.findIndex((stage) => !stage.done)
	return index
})

const doneCount = computed(() => props.task.stages.filter((stage) => stage.done).length)
const progress = computed(() =>
	props.task.stages.length ? Math.round((doneCount.value / props.task.stages.length) * 100) : 0,
)

function stateOf(index: number): 'done' | 'current' | 'ahead' {
	// A plan can be ticked out of order: trust the stage flag, not the position.
	if (props.task.stages[index].done) return 'done'
	if (index === currentStage.value) return props.live ? 'current' : 'ahead'
	return 'ahead'
}
</script>

<template>
	<div class="ai-task" :class="{ 'ai-task--done': currentStage < 0 }">
		<div class="ai-task-head">
			<span class="ai-task-icon">
				<component :is="kind.icon" class="size-4" />
			</span>
			<span class="ai-task-kind">{{ kind.label }}</span>
			<span class="ai-task-title">{{ task.title }}</span>
			<span v-if="task.stages.length" class="ai-task-count">
				{{ doneCount }}/{{ task.stages.length }}
			</span>
			<CheckIcon v-if="currentStage < 0" class="size-4 shrink-0 text-green" />
		</div>
		<div
			v-if="task.stages.length"
			class="ai-task-progress"
			:class="{ 'ai-task-progress--live': live && currentStage >= 0 }"
			role="progressbar"
			:aria-valuenow="progress"
			aria-valuemin="0"
			aria-valuemax="100"
		>
			<span class="ai-task-progress-fill" :style="{ width: `${progress}%` }" />
		</div>
		<ol class="ai-task-stages">
			<li
				v-for="(stage, index) in task.stages"
				:key="stage.label"
				class="ai-task-stage"
				:class="`ai-task-stage--${stateOf(index)}`"
			>
				<span class="ai-task-dot">
					<CheckIcon v-if="stateOf(index) === 'done'" class="size-3" />
					<span v-else-if="stateOf(index) === 'current'" class="ai-task-pulse" />
				</span>
				<span class="ai-task-label">{{ stage.label }}</span>
			</li>
		</ol>
	</div>
</template>

<style scoped>
.ai-task {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
	padding: 0.625rem 0.75rem;
	border: 1px solid color-mix(in srgb, var(--color-brand) 22%, transparent);
	border-radius: 0.75rem;
	background: color-mix(in srgb, var(--color-bg) 55%, transparent);
	backdrop-filter: blur(14px) saturate(1.2);
	-webkit-backdrop-filter: blur(14px) saturate(1.2);
}

.ai-task-count {
	flex-shrink: 0;
	margin-left: auto;
	color: var(--color-secondary);
	font-size: 0.6875rem;
	font-variant-numeric: tabular-nums;
}

.ai-task-progress {
	position: relative;
	height: 4px;
	overflow: hidden;
	border-radius: 999px;
	background: color-mix(in srgb, var(--color-contrast) 8%, transparent);
}

.ai-task-progress-fill {
	position: absolute;
	inset: 0 auto 0 0;
	border-radius: inherit;
	background: linear-gradient(
		90deg,
		var(--color-brand),
		color-mix(in srgb, var(--color-brand) 55%, #fff)
	);
	transition: width 0.45s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.ai-task-progress--live .ai-task-progress-fill::after {
	content: '';
	position: absolute;
	inset: 0;
	background: linear-gradient(90deg, transparent, rgb(255 255 255 / 45%), transparent);
	animation: ai-task-sheen 1.3s ease-in-out infinite;
}

@keyframes ai-task-sheen {
	from {
		transform: translateX(-100%);
	}
	to {
		transform: translateX(100%);
	}
}

@media (prefers-reduced-motion: reduce) {
	.ai-task-progress-fill {
		transition: none;
	}

	.ai-task-progress--live .ai-task-progress-fill::after {
		animation: none;
	}
}

.ai-task-head {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	min-width: 0;
}

.ai-task-icon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 1.5rem;
	height: 1.5rem;
	flex-shrink: 0;
	border-radius: 0.5rem;
	background: color-mix(in srgb, var(--color-brand) 18%, transparent);
	color: var(--color-brand);
}

.ai-task-kind {
	flex-shrink: 0;
	padding: 0.05rem 0.4rem;
	border-radius: 0.375rem;
	background: color-mix(in srgb, var(--color-brand) 14%, transparent);
	color: var(--color-brand);
	font-size: 0.6875rem;
	font-weight: 700;
	letter-spacing: 0.02em;
}

.ai-task-title {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 0.8125rem;
	font-weight: 600;
	color: var(--color-contrast);
}

.ai-task-stages {
	display: flex;
	flex-wrap: wrap;
	gap: 0.25rem 1rem;
	margin: 0;
	padding: 0;
	list-style: none;
}

.ai-task-stage {
	display: flex;
	align-items: center;
	gap: 0.375rem;
	font-size: 0.75rem;
	line-height: 1.4;
}

.ai-task-dot {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 1rem;
	height: 1rem;
	flex-shrink: 0;
	border-radius: 999px;
	border: 1px solid color-mix(in srgb, var(--color-contrast) 22%, transparent);
	color: var(--color-green);
}

.ai-task-stage--done .ai-task-dot {
	border-color: transparent;
	background: color-mix(in srgb, var(--color-green) 22%, transparent);
}

.ai-task-stage--current .ai-task-dot {
	border-color: var(--color-brand);
	color: var(--color-brand);
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-brand) 18%, transparent);
}

.ai-task-stage--done .ai-task-label {
	color: var(--color-secondary);
	text-decoration: line-through;
	text-decoration-color: color-mix(in srgb, var(--color-secondary) 45%, transparent);
}

.ai-task-stage--current .ai-task-label {
	color: var(--color-contrast);
	font-weight: 600;
}

.ai-task-stage--ahead .ai-task-label {
	color: var(--color-secondary);
	opacity: 0.7;
}

.ai-task--done {
	border-color: color-mix(in srgb, var(--color-green) 30%, transparent);
}

.ai-task-pulse {
	width: 0.375rem;
	height: 0.375rem;
	border-radius: 999px;
	background: var(--color-brand);
	animation: ai-task-pulse 1.1s ease-in-out infinite;
}

@keyframes ai-task-pulse {
	0%,
	100% {
		transform: scale(1);
		opacity: 1;
	}
	50% {
		transform: scale(1.6);
		opacity: 0.55;
	}
}
</style>

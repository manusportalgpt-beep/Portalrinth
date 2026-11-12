<script setup lang="ts">
import {
	BrainCogIcon,
	FileIcon,
	GaugeIcon,
	GlobeIcon,
	HammerIcon,
	MessagesSquareIcon,
	TerminalSquareIcon,
} from '@modrinth/assets'
import { Toggle, useVIntl } from '@modrinth/ui'
import { type Component, computed, onBeforeUnmount, onMounted } from 'vue'

import { type AiFocus, type AiMode, aiSettings, saveAiSettings } from '@/helpers/ai-assistant'

defineProps<{
	focusOptions: { id: AiFocus; icon: Component; label: string }[]
}>()

const emit = defineEmits<{ attach: []; slash: []; close: [] }>()

const { formatMessage } = useVIntl()
const messages = {
	modeAsk: { id: 'app.ai.composer.mode.ask', defaultMessage: 'Ask' },
	modeBuild: { id: 'app.ai.composer.mode.build', defaultMessage: 'Build' },
	modeAskHint: {
		id: 'app.ai.composer.mode.ask-hint',
		defaultMessage: 'Только отвечает и ищет, ничего не меняет в лаунчере',
	},
	modeBuildHint: {
		id: 'app.ai.composer.mode.build-hint',
		defaultMessage: 'Отвечает на вопросы и сам выполняет задачи в лаунчере',
	},
	focus: { id: 'app.ai.composer.focus', defaultMessage: 'Где искать' },
	attach: { id: 'app.ai.composer.attach', defaultMessage: 'Файл' },
	attachHint: { id: 'app.ai.composer.attach-hint', defaultMessage: 'Картинка, лог, конфиг' },
	commands: { id: 'app.ai.composer.commands', defaultMessage: 'Команды' },
	commandsHint: { id: 'app.ai.composer.commands-hint', defaultMessage: 'Задачи и навыки' },
	tools: { id: 'app.ai.composer.tools', defaultMessage: 'Возможности' },
	web: { id: 'app.ai.composer.web', defaultMessage: 'Веб-поиск' },
	webHint: { id: 'app.ai.composer.web-hint', defaultMessage: 'Свежие данные из интернета' },
	deep: { id: 'app.ai.composer.deep', defaultMessage: 'Глубокое мышление' },
	deepHint: { id: 'app.ai.composer.deep-hint', defaultMessage: 'Умнее и внимательнее, но дольше' },
	effort: { id: 'app.ai.composer.effort', defaultMessage: 'Раздумье' },
	effortLow: { id: 'app.ai.composer.effort.low', defaultMessage: 'Низкое' },
	effortMedium: { id: 'app.ai.composer.effort.medium', defaultMessage: 'Среднее' },
	effortHigh: { id: 'app.ai.composer.effort.high', defaultMessage: 'Высокое' },
}

const modes = computed(() => [
	{ id: 'ask' as AiMode, icon: MessagesSquareIcon, label: formatMessage(messages.modeAsk) },
	{ id: 'build' as AiMode, icon: HammerIcon, label: formatMessage(messages.modeBuild) },
])

const modeHint = computed(() =>
	formatMessage(aiSettings.value.mode === 'ask' ? messages.modeAskHint : messages.modeBuildHint),
)

const efforts = computed(() => [
	{ id: 'low' as const, label: formatMessage(messages.effortLow) },
	{ id: 'medium' as const, label: formatMessage(messages.effortMedium) },
	{ id: 'high' as const, label: formatMessage(messages.effortHigh) },
])

function setMode(mode: AiMode) {
	saveAiSettings({ mode })
}

function setFocus(focus: AiFocus) {
	saveAiSettings({ focus })
}

function setEffort(effort: 'low' | 'medium' | 'high') {
	saveAiSettings({ effort })
}

function onKeydown(event: KeyboardEvent) {
	if (event.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
	<div class="ai-composer" role="dialog">
		<div class="ai-composer-modes" role="radiogroup">
			<span
				class="ai-composer-modes-thumb"
				:class="{ 'ai-composer-modes-thumb--right': aiSettings.mode === 'build' }"
			/>
			<button
				v-for="mode in modes"
				:key="mode.id"
				type="button"
				role="radio"
				class="ai-composer-mode"
				:class="{ 'ai-composer-mode--on': aiSettings.mode === mode.id }"
				:aria-checked="aiSettings.mode === mode.id"
				@click="setMode(mode.id)"
			>
				<component :is="mode.icon" class="size-4" />
				{{ mode.label }}
			</button>
		</div>
		<p class="ai-composer-hint">{{ modeHint }}</p>

		<div class="ai-composer-actions">
			<button type="button" class="ai-composer-action" @click="emit('attach')">
				<span class="ai-composer-action-icon"><FileIcon class="size-4" /></span>
				<span class="min-w-0">
					<span class="ai-composer-action-title">{{ formatMessage(messages.attach) }}</span>
					<span class="ai-composer-action-hint">{{ formatMessage(messages.attachHint) }}</span>
				</span>
			</button>
			<button type="button" class="ai-composer-action" @click="emit('slash')">
				<span class="ai-composer-action-icon"><TerminalSquareIcon class="size-4" /></span>
				<span class="min-w-0">
					<span class="ai-composer-action-title">
						{{ formatMessage(messages.commands) }}
						<kbd class="ai-composer-kbd">/</kbd>
					</span>
					<span class="ai-composer-action-hint">{{ formatMessage(messages.commandsHint) }}</span>
				</span>
			</button>
		</div>

		<p class="ai-composer-caption">{{ formatMessage(messages.focus) }}</p>
		<div class="ai-composer-chips" role="radiogroup">
			<button
				v-for="option in focusOptions"
				:key="option.id"
				type="button"
				role="radio"
				class="ai-composer-chip"
				:class="{ 'ai-composer-chip--on': aiSettings.focus === option.id }"
				:aria-checked="aiSettings.focus === option.id"
				@click="setFocus(option.id)"
			>
				<component :is="option.icon" class="size-3.5 shrink-0" />
				<span class="truncate">{{ option.label }}</span>
			</button>
		</div>

		<p class="ai-composer-caption">{{ formatMessage(messages.tools) }}</p>
		<div class="ai-composer-card">
			<label class="ai-composer-row">
				<span class="ai-composer-row-icon"><GlobeIcon class="size-4" /></span>
				<span class="min-w-0 grow">
					<span class="ai-composer-row-title">{{ formatMessage(messages.web) }}</span>
					<span class="ai-composer-row-hint">{{ formatMessage(messages.webHint) }}</span>
				</span>
				<Toggle
					small
					:model-value="aiSettings.webSearch"
					@update:model-value="(value) => saveAiSettings({ webSearch: !!value })"
				/>
			</label>
			<label class="ai-composer-row">
				<span class="ai-composer-row-icon"><BrainCogIcon class="size-4" /></span>
				<span class="min-w-0 grow">
					<span class="ai-composer-row-title">{{ formatMessage(messages.deep) }}</span>
					<span class="ai-composer-row-hint">{{ formatMessage(messages.deepHint) }}</span>
				</span>
				<Toggle
					small
					:model-value="aiSettings.deepThink"
					@update:model-value="(value) => saveAiSettings({ deepThink: !!value })"
				/>
			</label>
			<div class="ai-composer-row ai-composer-row--stack">
				<span class="flex items-center gap-2.5">
					<span class="ai-composer-row-icon"><GaugeIcon class="size-4" /></span>
					<span class="ai-composer-row-title">{{ formatMessage(messages.effort) }}</span>
				</span>
				<div
					class="ai-composer-effort"
					role="radiogroup"
					:aria-label="formatMessage(messages.effort)"
				>
					<button
						v-for="(level, index) in efforts"
						:key="level.id"
						type="button"
						role="radio"
						class="ai-composer-effort-step"
						:class="{ 'ai-composer-effort-step--on': aiSettings.effort === level.id }"
						:aria-checked="aiSettings.effort === level.id"
						@click="setEffort(level.id)"
					>
						<span class="ai-composer-effort-bars" aria-hidden="true">
							<span
								v-for="bar in 3"
								:key="bar"
								:class="{ 'ai-composer-effort-bar--lit': bar <= index + 1 }"
							/>
						</span>
						{{ level.label }}
					</button>
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.ai-composer {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
	width: 20.5rem;
	max-height: min(36rem, calc(100vh - 12rem));
	overflow-y: auto;
	padding: 0.625rem;
	border: 1px solid var(--surface-5);
	border-radius: 1rem;
	background: color-mix(in srgb, var(--color-raised-bg) 82%, transparent);
	backdrop-filter: blur(24px) saturate(1.2);
	-webkit-backdrop-filter: blur(24px) saturate(1.2);
	box-shadow: 0 12px 32px rgb(0 0 0 / 24%);
	transform-origin: bottom left;
}

.ai-composer-modes {
	position: relative;
	display: grid;
	grid-template-columns: 1fr 1fr;
	padding: 0.2rem;
	border-radius: 0.7rem;
	background: var(--color-button-bg);
}

.ai-composer-modes-thumb {
	position: absolute;
	top: 0.2rem;
	bottom: 0.2rem;
	left: 0.2rem;
	width: calc(50% - 0.2rem);
	border-radius: 0.55rem;
	background: var(--color-raised-bg);
	box-shadow: 0 2px 8px rgb(0 0 0 / 18%);
	transition: transform 0.22s cubic-bezier(0.3, 0.9, 0.4, 1);
}

.ai-composer-modes-thumb--right {
	transform: translateX(100%);
}

.ai-composer-mode {
	position: relative;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 0.375rem;
	padding: 0.4rem 0.5rem;
	border: 0;
	background: transparent;
	color: var(--color-secondary);
	font: inherit;
	font-size: 0.8125rem;
	font-weight: 600;
	cursor: pointer;
	transition: color 0.15s ease;
}

.ai-composer-mode:hover,
.ai-composer-mode--on {
	color: var(--color-contrast);
}

.ai-composer-hint {
	margin: 0 0.25rem;
	font-size: 0.75rem;
	line-height: 1.35;
	color: var(--color-secondary);
}

.ai-composer-actions {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 0.375rem;
}

.ai-composer-action {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	min-width: 0;
	padding: 0.5rem;
	border: 1px solid var(--surface-5);
	border-radius: 0.7rem;
	background: var(--color-button-bg);
	color: var(--color-primary);
	font: inherit;
	text-align: left;
	cursor: pointer;
	transition:
		border-color 0.15s ease,
		background-color 0.15s ease;
}

.ai-composer-action:hover {
	border-color: color-mix(in srgb, var(--color-brand) 50%, var(--surface-5));
	background: color-mix(in srgb, var(--color-brand) 8%, var(--color-button-bg));
}

.ai-composer-action-icon,
.ai-composer-row-icon {
	display: grid;
	flex-shrink: 0;
	place-items: center;
	width: 1.9rem;
	height: 1.9rem;
	border-radius: 0.55rem;
	background: color-mix(in srgb, var(--color-brand) 14%, transparent);
	color: var(--color-brand);
}

.ai-composer-action-title,
.ai-composer-row-title {
	display: flex;
	align-items: center;
	gap: 0.35rem;
	overflow: hidden;
	font-size: 0.8125rem;
	font-weight: 600;
	color: var(--color-contrast);
	white-space: nowrap;
	text-overflow: ellipsis;
}

.ai-composer-action-hint,
.ai-composer-row-hint {
	display: block;
	overflow: hidden;
	font-size: 0.6875rem;
	color: var(--color-secondary);
	white-space: nowrap;
	text-overflow: ellipsis;
}

.ai-composer-kbd {
	padding: 0 0.3rem;
	border: 1px solid var(--surface-5);
	border-radius: 0.3rem;
	font-size: 0.625rem;
	font-weight: 600;
	color: var(--color-secondary);
}

.ai-composer-caption {
	margin: 0.25rem 0.25rem 0;
	font-size: 0.6875rem;
	font-weight: 700;
	letter-spacing: 0.04em;
	text-transform: uppercase;
	color: var(--color-secondary);
}

.ai-composer-chips {
	display: flex;
	flex-wrap: wrap;
	gap: 0.3rem;
}

.ai-composer-chip {
	display: inline-flex;
	align-items: center;
	gap: 0.3rem;
	max-width: 100%;
	padding: 0.3rem 0.6rem;
	border: 1px solid var(--surface-5);
	border-radius: 999px;
	background: transparent;
	color: var(--color-secondary);
	font: inherit;
	font-size: 0.75rem;
	font-weight: 600;
	cursor: pointer;
	transition:
		border-color 0.15s ease,
		background-color 0.15s ease,
		color 0.15s ease;
}

.ai-composer-chip:hover {
	color: var(--color-contrast);
}

.ai-composer-chip--on {
	border-color: color-mix(in srgb, var(--color-brand) 55%, transparent);
	background: color-mix(in srgb, var(--color-brand) 14%, transparent);
	color: var(--color-brand);
}

.ai-composer-card {
	display: flex;
	flex-direction: column;
	overflow: hidden;
	border: 1px solid var(--surface-5);
	border-radius: 0.8rem;
	background: color-mix(in srgb, var(--color-button-bg) 70%, transparent);
}

.ai-composer-row {
	display: flex;
	align-items: center;
	gap: 0.625rem;
	padding: 0.5rem 0.625rem;
	cursor: pointer;
}

.ai-composer-row + .ai-composer-row {
	border-top: 1px solid var(--surface-5);
}

.ai-composer-row--stack {
	flex-direction: column;
	align-items: stretch;
	gap: 0.5rem;
	cursor: default;
}

.ai-composer-effort {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 0.25rem;
}

.ai-composer-effort-step {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.25rem;
	min-width: 0;
	padding: 0.4rem 0.25rem;
	border: 1px solid var(--surface-5);
	border-radius: 0.55rem;
	background: transparent;
	color: var(--color-secondary);
	font: inherit;
	font-size: 0.6875rem;
	font-weight: 600;
	cursor: pointer;
	transition:
		border-color 0.15s ease,
		background-color 0.15s ease,
		color 0.15s ease;
}

.ai-composer-effort-step:hover {
	color: var(--color-contrast);
}

.ai-composer-effort-step--on {
	border-color: color-mix(in srgb, var(--color-brand) 55%, transparent);
	background: color-mix(in srgb, var(--color-brand) 12%, transparent);
	color: var(--color-brand);
}

.ai-composer-effort-bars {
	display: flex;
	align-items: flex-end;
	gap: 0.15rem;
	height: 0.75rem;
}

.ai-composer-effort-bars > span {
	width: 0.25rem;
	border-radius: 999px;
	background: var(--surface-5);
	transition: background-color 0.15s ease;
}

.ai-composer-effort-bars > span:nth-child(1) {
	height: 40%;
}

.ai-composer-effort-bars > span:nth-child(2) {
	height: 70%;
}

.ai-composer-effort-bars > span:nth-child(3) {
	height: 100%;
}

.ai-composer-effort-step--on .ai-composer-effort-bar--lit {
	background: var(--color-brand);
}

.ai-composer-effort-step:not(.ai-composer-effort-step--on) .ai-composer-effort-bar--lit {
	background: var(--color-secondary);
}
</style>

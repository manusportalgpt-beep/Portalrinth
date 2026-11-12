<script setup lang="ts">
import {
	CheckIcon,
	CoffeeIcon,
	CopyIcon,
	CpuIcon,
	FileTextIcon,
	GlobeIcon,
	PlayIcon,
	PlugIcon,
	SettingsIcon,
	TerminalSquareIcon,
	TriangleAlertIcon,
	WorldIcon,
} from '@modrinth/assets'
import { Button, useVIntl } from '@modrinth/ui'
import { type Component, computed, ref } from 'vue'

import type { HostedCrashReason, HostedServerView } from '@/helpers/hosting'

import { crashMessages } from './messages'

const props = defineProps<{ server: HostedServerView; busy: boolean }>()

const emit = defineEmits<{
	retry: []
	console: []
	settings: []
	resetJava: []
}>()

const { formatMessage } = useVIntl()

const icons: Record<HostedCrashReason, Component> = {
	bad_option: SettingsIcon,
	java_version: CoffeeIcon,
	memory: CpuIcon,
	port_in_use: GlobeIcon,
	eula: FileTextIcon,
	mods: PlugIcon,
	plugin: PlugIcon,
	world: WorldIcon,
	jvm: CoffeeIcon,
	launch: TriangleAlertIcon,
	unknown: TriangleAlertIcon,
}

const reason = computed<HostedCrashReason>(() => props.server.crash_reason ?? 'unknown')
const values = computed(() => ({
	port: props.server.port,
	version: props.server.game_version,
	need: props.server.java_need,
}))
const title = computed(() => formatMessage(crashMessages[`${reason.value}Title`], values.value))
const hint = computed(() => formatMessage(crashMessages[`${reason.value}Hint`], values.value))
const line = computed(() => props.server.crash_line ?? props.server.error)
const wantsSettings = computed(() =>
	['memory', 'port_in_use', 'world', 'jvm', 'bad_option'].includes(reason.value),
)
const canResetJava = computed(
	() => reason.value === 'java_version' && props.server.java_path.trim() !== '',
)

const copied = ref(false)
async function copyLine() {
	if (!line.value) return
	try {
		await navigator.clipboard.writeText(line.value)
		copied.value = true
		setTimeout(() => (copied.value = false), 1500)
	} catch {
		copied.value = false
	}
}
</script>

<template>
	<section class="crash-card" role="alert">
		<div class="crash-card-icon">
			<component :is="icons[reason]" />
		</div>
		<div class="flex min-w-0 flex-1 flex-col gap-3">
			<div class="flex flex-col gap-1">
				<span class="text-lg font-bold text-contrast">{{ title }}</span>
				<span class="text-sm leading-relaxed text-secondary">{{ hint }}</span>
			</div>
			<div v-if="line" class="crash-card-line">
				<span class="crash-card-line-label">{{ formatMessage(crashMessages.whatHappened) }}</span>
				<code>{{ line }}</code>
				<button
					v-tooltip="formatMessage(crashMessages.copyLine)"
					type="button"
					class="crash-card-copy"
					:aria-label="formatMessage(crashMessages.copyLine)"
					@click="copyLine"
				>
					<CheckIcon v-if="copied" />
					<CopyIcon v-else />
				</button>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<Button
					v-if="canResetJava"
					type="colored"
					color="brand"
					:disabled="busy"
					@click="emit('resetJava')"
				>
					<CoffeeIcon />
					{{ formatMessage(crashMessages.resetJava) }}
				</Button>
				<Button
					:type="canResetJava ? 'outlined' : 'colored'"
					:color="canResetJava ? undefined : 'brand'"
					:disabled="busy"
					@click="emit('retry')"
				>
					<PlayIcon />
					{{ formatMessage(crashMessages.tryAgain) }}
				</Button>
				<Button type="outlined" @click="emit('console')">
					<TerminalSquareIcon />
					{{ formatMessage(crashMessages.openConsole) }}
				</Button>
				<Button
					v-if="wantsSettings || reason === 'java_version'"
					type="outlined"
					@click="emit('settings')"
				>
					<SettingsIcon />
					{{ formatMessage(crashMessages.openSettings) }}
				</Button>
			</div>
		</div>
	</section>
</template>

<style scoped lang="scss">
.crash-card {
	display: flex;
	gap: 1rem;
	padding: 1.125rem;
	border-radius: var(--radius-lg, 0.75rem);
	border: 1px solid color-mix(in srgb, var(--color-red) 40%, var(--surface-5));
	background:
		radial-gradient(
			120% 140% at 0% 0%,
			color-mix(in srgb, var(--color-red) 14%, transparent),
			transparent 60%
		),
		var(--surface-4);
	animation: crash-in 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.crash-card-icon {
	display: grid;
	flex-shrink: 0;
	place-items: center;
	width: 2.75rem;
	height: 2.75rem;
	border-radius: var(--radius-md, 0.5rem);
	background: color-mix(in srgb, var(--color-red) 16%, transparent);
	color: var(--color-red);

	svg {
		width: 1.5rem;
		height: 1.5rem;
	}
}

.crash-card-line {
	position: relative;
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
	padding: 0.625rem 2.5rem 0.625rem 0.75rem;
	border-radius: var(--radius-md, 0.5rem);
	border: 1px solid var(--surface-5);
	background: color-mix(in srgb, var(--surface-2) 70%, transparent);

	code {
		max-height: 6rem;
		overflow: auto;
		color: var(--color-contrast);
		font-size: 0.8rem;
		line-height: 1.45;
		white-space: pre-wrap;
		word-break: break-word;
	}
}

.crash-card-line-label {
	color: var(--color-secondary);
	font-size: 0.7rem;
	font-weight: 700;
	letter-spacing: 0.04em;
	text-transform: uppercase;
}

.crash-card-copy {
	position: absolute;
	top: 0.5rem;
	right: 0.5rem;
	display: grid;
	place-items: center;
	width: 1.75rem;
	height: 1.75rem;
	border: none;
	border-radius: var(--radius-sm, 0.375rem);
	background: transparent;
	color: var(--color-secondary);
	cursor: pointer;
	transition:
		color 0.15s ease,
		background-color 0.15s ease;

	&:hover {
		background: var(--surface-5);
		color: var(--color-contrast);
	}

	svg {
		width: 1rem;
		height: 1rem;
	}
}

@keyframes crash-in {
	from {
		opacity: 0;
		transform: translateY(-4px);
	}
}

@media (prefers-reduced-motion: reduce) {
	.crash-card {
		animation: none;
	}
}
</style>

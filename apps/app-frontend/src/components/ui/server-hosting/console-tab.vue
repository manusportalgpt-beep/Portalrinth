<script setup lang="ts">
import { CopyIcon, SendIcon, TerminalSquareIcon } from '@modrinth/assets'
import { Button, defineMessages, injectNotificationManager, Input, useVIntl } from '@modrinth/ui'
import { useQuery } from '@tanstack/vue-query'
import { computed, nextTick, ref, watch } from 'vue'

import { type HostedServerView, hosting_command, hosting_log } from '@/helpers/hosting'

const props = defineProps<{ server: HostedServerView }>()

const { formatMessage } = useVIntl()
const { addNotification, handleError } = injectNotificationManager()
const messages = defineMessages({
	placeholder: {
		id: 'app.server-hosting.console.placeholder',
		defaultMessage: 'Type a command, for example: say Hello',
	},
	offlinePlaceholder: {
		id: 'app.server-hosting.console.offline-placeholder',
		defaultMessage: 'Start the server to send commands',
	},
	send: { id: 'app.server-hosting.console.send', defaultMessage: 'Send' },
	empty: { id: 'app.server-hosting.console.empty', defaultMessage: 'The console is empty for now' },
	copy: { id: 'app.server-hosting.console.copy', defaultMessage: 'Copy log' },
	copied: { id: 'app.server-hosting.console.copied', defaultMessage: 'Log copied' },
})

const logQuery = useQuery({
	queryKey: computed(() => ['server-hosting', 'log', props.server.id] as const),
	queryFn: () => hosting_log(props.server.id),
	refetchInterval: 1500,
	refetchOnWindowFocus: false,
})
const lines = computed(() => logQuery.data.value ?? [])

const output = ref<HTMLElement>()
let stickToBottom = true

function onScroll() {
	const element = output.value
	if (!element) return
	stickToBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 24
}

watch(
	() => lines.value.length,
	async () => {
		if (!stickToBottom) return
		await nextTick()
		output.value?.scrollTo({ top: output.value.scrollHeight })
	},
	{ immediate: true },
)

const canSend = computed(
	() => props.server.status === 'running' || props.server.status === 'starting',
)
const command = ref('')
const sending = ref(false)
const history: string[] = []
let historyIndex = -1

async function send() {
	const text = command.value.trim()
	if (!text || sending.value || !canSend.value) return
	sending.value = true
	try {
		await hosting_command(props.server.id, text.replace(/^\//, ''))
		history.unshift(text)
		historyIndex = -1
		command.value = ''
		stickToBottom = true
		await logQuery.refetch()
	} catch (error) {
		handleError(error as Error)
	} finally {
		sending.value = false
	}
}

function browseHistory(step: number) {
	if (history.length === 0) return
	historyIndex = Math.min(history.length - 1, Math.max(-1, historyIndex + step))
	command.value = historyIndex === -1 ? '' : history[historyIndex]
}

async function copyLog() {
	try {
		await navigator.clipboard.writeText(lines.value.join('\n'))
		addNotification({ type: 'success', title: formatMessage(messages.copied) })
	} catch (error) {
		handleError(error as Error)
	}
}

function lineTone(line: string) {
	if (/\b(ERROR|FATAL|SEVERE)\b|Exception/.test(line)) return 'error'
	if (/\bWARN(ING)?\b/.test(line)) return 'warn'
	return undefined
}
</script>

<template>
	<section class="hosting-console">
		<div class="hosting-console-head">
			<span class="flex items-center gap-2 text-sm font-semibold text-secondary">
				<TerminalSquareIcon class="shrink-0" />
				{{ server.name }}
			</span>
			<Button
				v-tooltip="formatMessage(messages.copy)"
				size="sm"
				type="quiet"
				:disabled="lines.length === 0"
				:aria-label="formatMessage(messages.copy)"
				@click="copyLog"
			>
				<CopyIcon />
			</Button>
		</div>
		<div ref="output" class="hosting-console-output" @scroll="onScroll">
			<span v-if="lines.length === 0" class="text-secondary">{{
				formatMessage(messages.empty)
			}}</span>
			<div v-for="(line, index) in lines" :key="index" :data-tone="lineTone(line)">{{ line }}</div>
		</div>
		<form class="flex gap-2" @submit.prevent="send">
			<Input
				v-model="command"
				class="flex-1"
				autocomplete="off"
				:spellcheck="false"
				:disabled="!canSend || sending"
				:placeholder="formatMessage(canSend ? messages.placeholder : messages.offlinePlaceholder)"
				@keydown.up.prevent="browseHistory(1)"
				@keydown.down.prevent="browseHistory(-1)"
			/>
			<Button
				native-type="submit"
				type="colored"
				color="brand"
				:loading="sending"
				:disabled="!canSend || !command.trim()"
			>
				<SendIcon />
				{{ formatMessage(messages.send) }}
			</Button>
		</form>
	</section>
</template>

<style scoped lang="scss">
.hosting-console {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
	padding: 1rem;
	border-radius: var(--radius-lg, 0.75rem);
	border: 1px solid var(--surface-5);
	background: var(--surface-4);
	min-width: 0;
}

.hosting-console-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.5rem;
}

.hosting-console-output {
	height: min(28rem, 55vh);
	overflow: auto;
	padding: 0.75rem 0.875rem;
	border-radius: var(--radius-md, 0.5rem);
	border: 1px solid var(--surface-5);
	background: var(--surface-2);
	color: var(--color-contrast);
	font-family: var(--mono-font, ui-monospace, monospace);
	font-size: 0.8125rem;
	line-height: 1.45;
	white-space: pre-wrap;
	word-break: break-word;
	user-select: text;

	[data-tone='warn'] {
		color: var(--color-orange);
	}

	[data-tone='error'] {
		color: var(--color-red);
	}
}
</style>

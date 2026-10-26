<script setup lang="ts">
import { ExternalIcon, TrashIcon } from '@modrinth/assets'
import { Button, defineMessages, useVIntl } from '@modrinth/ui'
import { ref } from 'vue'

import {
	type ConnectionEntry,
	clearConnectionLog,
	connectionLog,
} from '@/helpers/portalrinth-connections'

const { formatMessage } = useVIntl()

const messages = defineMessages({
	title: {
		id: 'app.settings.connections.title',
		defaultMessage: 'Подключения',
	},
	description: {
		id: 'app.settings.connections.description',
		defaultMessage:
			'Куда ходит лаунчер: каждый сетевой запрос — к какому серверу или CDN, когда, с каким ответом и за сколько. Список живёт с момента запуска.',
	},
	empty: {
		id: 'app.settings.connections.empty',
		defaultMessage: 'Пока тихо — запросов ещё не было.',
	},
	clear: {
		id: 'app.settings.connections.clear',
		defaultMessage: 'Очистить',
	},
	copy: {
		id: 'app.settings.connections.copy',
		defaultMessage: 'Скопировать список',
	},
	copied: {
		id: 'app.settings.connections.copied',
		defaultMessage: 'Скопировано!',
	},
})

const copied = ref(false)

function hostOf(url: string): string {
	try {
		return new URL(url).host
	} catch {
		return url
	}
}

function timeOf(entry: ConnectionEntry): string {
	const date = new Date(entry.at)
	return Number.isNaN(date.getTime())
		? ''
		: date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function statusOf(entry: ConnectionEntry): string {
	if (entry.error) return `сбой: ${entry.error}`
	if (entry.status === 0) return 'не ответил'
	return String(entry.status)
}

async function copyAll() {
	try {
		await navigator.clipboard.writeText(
			connectionLog.value
				.map((entry) => `${timeOf(entry)} ${entry.method} ${entry.url} → ${statusOf(entry)} (${entry.ms} мс)`)
				.join('\n'),
		)
		copied.value = true
		setTimeout(() => (copied.value = false), 1500)
	} catch {
		/* the list stays on screen anyway */
	}
}

function pathOf(url: string): string {
	try {
		const parsed = new URL(url)
		const tail = `${parsed.pathname}${parsed.search}`
		return tail.length > 40 ? `${tail.slice(0, 40)}…` : tail || '/'
	} catch {
		return ''
	}
}
</script>

<template>
	<div class="flex flex-col gap-4">
		<section class="flex flex-col gap-2">
			<h2 class="m-0 flex items-center gap-2 text-lg font-bold text-primary">
				<ExternalIcon class="text-brand" />
				{{ formatMessage(messages.title) }}
			</h2>
			<p class="m-0 max-w-3xl text-sm text-secondary">
				{{ formatMessage(messages.description) }}
			</p>
			<div class="flex gap-2">
				<Button size="sm" @click="clearConnectionLog">
					<TrashIcon class="size-4" />
					{{ formatMessage(messages.clear) }}
				</Button>
				<Button size="sm" @click="copyAll">
					{{ copied ? formatMessage(messages.copied) : formatMessage(messages.copy) }}
				</Button>
			</div>
		</section>

		<p v-if="connectionLog.length === 0" class="m-0 text-sm text-secondary">
			{{ formatMessage(messages.empty) }}
		</p>
		<div v-else class="flex min-h-0 flex-col overflow-hidden rounded-xl border border-solid border-surface-5">
			<div class="connections-list max-h-[32rem] overflow-y-auto">
				<div v-for="entry in connectionLog" :key="entry.id" class="connections-row">
					<span class="connections-time">{{ timeOf(entry) }}</span>
					<span class="connections-method">{{ entry.method }}</span>
					<span class="connections-url" :title="entry.url">
						{{ hostOf(entry.url) }}<span class="text-secondary">{{ pathOf(entry.url) }}</span>
					</span>
					<span class="connections-status" :class="{ 'connections-fail': entry.status === 0 || entry.status >= 400 }">
						{{ statusOf(entry) }} · {{ entry.ms }} мс
					</span>
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.connections-row {
	display: flex;
	align-items: baseline;
	gap: 0.625rem;
	padding: 0.3rem 0.75rem;
	font-size: 0.75rem;
	border-bottom: 1px solid var(--surface-4);
}

.connections-row:last-child {
	border-bottom: none;
}

.connections-time {
	color: var(--color-secondary);
	font-variant-numeric: tabular-nums;
	flex-shrink: 0;
}

.connections-method {
	color: var(--color-brand);
	font-weight: 600;
	width: 3.5rem;
	flex-shrink: 0;
}

.connections-url {
	min-width: 0;
	flex-grow: 1;
	overflow-wrap: anywhere;
}

.connections-status {
	color: var(--color-secondary);
	flex-shrink: 0;
	font-variant-numeric: tabular-nums;
}

.connections-fail {
	color: var(--color-red);
}
</style>

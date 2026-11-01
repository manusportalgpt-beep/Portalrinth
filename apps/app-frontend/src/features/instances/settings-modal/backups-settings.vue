<script setup lang="ts">
import { ArchiveIcon, PlusIcon } from '@modrinth/assets'
import { Button, defineMessages, useVIntl } from '@modrinth/ui'
import { ref } from 'vue'

import {
	createInstanceBackup,
	instanceBackupsDir,
	restoreInstanceBackup,
} from '@/helpers/portalrinth-mods'

import { injectInstanceSettings } from './instance-settings-context'

const { instance } = injectInstanceSettings()

const { formatMessage } = useVIntl()

const messages = defineMessages({
	title: {
		id: 'instance.settings.backups.title',
		defaultMessage: 'Бэкапы',
	},
	description: {
		id: 'instance.settings.backups.description',
		defaultMessage:
			'Копии сборки целиком: моды, конфиги, миры. Лаунчер сам делает бэкап перед обновлением сборки, а ты можешь сохранить ещё один в любой момент кнопкой ниже. Восстановление разворачивает копию поверх сборки.',
	},
	newBackup: {
		id: 'instance.settings.backups.new',
		defaultMessage: 'Новый Бэкап',
	},
	making: {
		id: 'instance.settings.backups.making',
		defaultMessage: 'Собираю копию… Готовые версии сюда не изменяются.',
	},
	empty: {
		id: 'instance.settings.backups.empty',
		defaultMessage: 'Копий пока нет — сделай первую, чтобы не потерять прогресс.',
	},
	restore: {
		id: 'instance.settings.backups.restore',
		defaultMessage: 'Восстановить',
	},
	restoreConfirm: {
		id: 'instance.settings.backups.restore-confirm',
		defaultMessage: 'Точно? Поверх сборки',
	},
	restoring: {
		id: 'instance.settings.backups.restoring',
		defaultMessage: 'Разворачиваю копию…',
	},
	delete: {
		id: 'instance.settings.backups.delete',
		defaultMessage: 'Удалить',
	},
	fail: {
		id: 'instance.settings.backups.fail',
		defaultMessage: 'Не получилось',
	},
	running: {
		id: 'instance.settings.backups.running',
		defaultMessage: 'Сначала закрой игру — пока она запущена, файлы сборки заняты.',
	},
	restored: {
		id: 'instance.settings.backups.restored',
		defaultMessage: 'Копия восстановлена.',
	},
})

interface BackupEntry {
	path: string
	name: string
	size: number
	timestamp: number
}

const backups = ref<BackupEntry[]>([])
const loading = ref(false)
const making = ref(false)
const restoringPath = ref('')
const confirmPath = ref('')
const errorText = ref('')
const doneText = ref('')

function failText(error: unknown): string {
	if (error instanceof Error && error.message === 'instance-running') return formatMessage(messages.running)
	return `${formatMessage(messages.fail)}: ${String(error).slice(0, 200)}`
}

async function refresh() {
	loading.value = true
	try {
		const fs = await import('@tauri-apps/plugin-fs')
		const dir = await instanceBackupsDir(instance.value.id)
		const entries = await fs.readDir(dir).catch(() => [])
		const found: BackupEntry[] = []
		for (const entry of entries) {
			if (!entry.name?.endsWith('.zip')) continue
			const path = `${dir}${dir.includes('\\') ? '\\' : '/'}${entry.name}`
			const size = await fs.stat(path).then((info) => info.size ?? 0).catch(() => 0)
			found.push({ path, name: entry.name, size, timestamp: stampOf(entry.name) })
		}
		found.sort((a, b) => b.timestamp - a.timestamp)
		backups.value = found
	} finally {
		loading.value = false
	}
}

function stampOf(name: string): number {
	const match = /backup-(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})/.exec(name)
	if (!match) return 0
	const [, y, mo, d, h, mi, s] = match
	return new Date(+y, +mo - 1, +d, +h, +mi, +s).getTime()
}

function labelOf(entry: BackupEntry): string {
	const date = new Date(entry.timestamp)
	if (Number.isNaN(date.getTime())) return entry.name
	const size = entry.size > 1024 * 1024 * 1024
		? `${(entry.size / 1024 / 1024 / 1024).toFixed(1)} ГБ`
		: entry.size > 1024 * 1024
			? `${(entry.size / 1024 / 1024).toFixed(1)} МБ`
			: `${Math.max(1, Math.round(entry.size / 1024))} КБ`
	return `${date.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${size}`
}

async function makeBackup() {
	if (making.value) return
	errorText.value = ''
	doneText.value = ''
	making.value = true
	try {
		await createInstanceBackup(instance.value.id)
		await refresh()
	} catch (error) {
		errorText.value = failText(error)
	} finally {
		making.value = false
	}
}

async function restoreBackup(entry: BackupEntry) {
	if (restoringPath.value) return
	if (confirmPath.value !== entry.path) {
		confirmPath.value = entry.path
		return
	}
	confirmPath.value = ''
	restoringPath.value = entry.path
	errorText.value = ''
	doneText.value = ''
	try {
		await restoreInstanceBackup(instance.value.id, entry.path)
		doneText.value = formatMessage(messages.restored)
		await refresh()
	} catch (error) {
		errorText.value = failText(error)
	} finally {
		restoringPath.value = ''
	}
}

async function deleteBackup(entry: BackupEntry) {
	try {
		const fs = await import('@tauri-apps/plugin-fs')
		await fs.remove(entry.path)
		await refresh()
	} catch (error) {
		errorText.value = failText(error)
	}
}

void refresh()
</script>

<template>
	<div class="flex flex-col gap-4">
		<section class="flex flex-col gap-3">
			<h2 class="m-0 flex items-center gap-2 text-lg font-bold text-primary">
				<ArchiveIcon class="text-brand" />
				{{ formatMessage(messages.title) }}
			</h2>
			<p class="m-0 max-w-3xl text-sm text-secondary">
				{{ formatMessage(messages.description) }}
			</p>
			<div>
				<Button color="brand" :disabled="making || restoringPath !== ''" @click="makeBackup">
					<PlusIcon class="size-4" />
					{{ making ? formatMessage(messages.making) : formatMessage(messages.newBackup) }}
				</Button>
			</div>
			<p v-if="errorText" class="m-0 text-sm text-red">{{ errorText }}</p>
			<p v-else-if="doneText" class="m-0 text-sm text-green">{{ doneText }}</p>

			<p v-if="!loading && backups.length === 0" class="m-0 text-sm text-secondary">
				{{ formatMessage(messages.empty) }}
			</p>
			<div v-else class="flex flex-col gap-1.5">
				<div v-for="entry in backups" :key="entry.path" class="backup-row">
					<ArchiveIcon class="size-4 shrink-0 text-secondary" />
					<span class="min-w-0 grow truncate">{{ labelOf(entry) }}</span>
					<Button size="sm" :disabled="restoringPath !== ''" @click="() => restoreBackup(entry)">
						{{
							restoringPath === entry.path
								? formatMessage(messages.restoring)
								: confirmPath === entry.path
									? formatMessage(messages.restoreConfirm)
									: formatMessage(messages.restore)
						}}
					</Button>
					<Button size="sm" :disabled="restoringPath !== ''" @click="() => deleteBackup(entry)">
						{{ formatMessage(messages.delete) }}
					</Button>
				</div>
			</div>
		</section>
	</div>
</template>

<style scoped>
.backup-row {
	display: flex;
	align-items: center;
	gap: 0.625rem;
	border: 1px solid var(--surface-5);
	border-radius: 0.625rem;
	background: var(--color-button-bg);
	padding: 0.5rem 0.75rem;
}
</style>

<script setup lang="ts">
import { ArchiveIcon, PlusIcon } from '@modrinth/assets'
import { Button, defineMessages, useVIntl } from '@modrinth/ui'
import { ref } from 'vue'

import { get_full_path } from '@/helpers/instance'

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

async function backupsDir(): Promise<string> {
	const { appDataDir } = await import('@tauri-apps/api/path')
	const base = await appDataDir()
	const sep = base.includes('\\') ? '\\' : '/'
	return `${base.replace(/[\\/]+$/, '')}${sep}portalrinth-backups${sep}${instance.value.id}`
}

async function refresh() {
	loading.value = true
	try {
		const fs = await import('@tauri-apps/plugin-fs')
		const dir = await backupsDir()
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
	making.value = true
	try {
		const instancePath = await get_full_path(instance.value.id)
		const stamp = new Date()
		const pad = (value: number) => String(value).padStart(2, '0')
		const name = `backup-${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())}-${pad(stamp.getHours())}-${pad(stamp.getMinutes())}-${pad(stamp.getSeconds())}.zip`
		const dir = await backupsDir()
		const sep = dir.includes('\\') ? '\\' : '/'
		const destination = `${dir}${sep}${name}`
		const fs = await import('@tauri-apps/plugin-fs')
		await fs.mkdir(dir, { recursive: true })
		const { invoke } = await import('@tauri-apps/api/core')
		await invoke('plugin:portalrinth-archiver|archiver_pack', {
			sources: [instancePath],
			dest: destination,
		})
		await refresh()
	} catch (error) {
		errorText.value = `${formatMessage(messages.fail)}: ${String(error).slice(0, 200)}`
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
	try {
		const instancePath = await get_full_path(instance.value.id)
		const parent = instancePath.replace(/[\\/][^\\/]+$/, '')
		const { invoke } = await import('@tauri-apps/api/core')
		await invoke('plugin:portalrinth-archiver|archiver_unpack', {
			archive: entry.path,
			destDir: parent,
		})
		await refresh()
	} catch (error) {
		errorText.value = `${formatMessage(messages.fail)}: ${String(error).slice(0, 200)}`
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
		errorText.value = `${formatMessage(messages.fail)}: ${String(error).slice(0, 200)}`
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

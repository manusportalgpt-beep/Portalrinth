/**
 * Portalrinth's own: two instance-care features.
 *
 * Clean launch - runs the game with every mod parked aside (`.disabled`),
 * so a broken build can be told apart from a broken mod; the mods come
 * back on their own the moment the game closes (or the next time the
 * instance launches, whatever happens first).
 *
 * Mod sync between builds - instances signed up for sync share mod
 * updates: install or update a mod in one, and every other synced
 * instance carrying the same project gets brought up to date too.
 */
import { ref } from 'vue'

import {
	get_content_items,
	get_full_path,
	list,
	run,
	toggle_disable_project,
	update_project,
} from './instance'
import { get_by_instance_id } from './process'

const RESTORE_KEY = 'portalrinth-clean-launch-disabled'
const SYNC_PREFIX = 'portalrinth-mod-sync-'

type PendingMap = Record<string, string[]>

function readPending(): PendingMap {
	try {
		const parsed = JSON.parse(localStorage.getItem(RESTORE_KEY) ?? '{}')
		return parsed && typeof parsed === 'object' ? (parsed as PendingMap) : {}
	} catch {
		return {}
	}
}

function writePending(map: PendingMap) {
	try {
		localStorage.setItem(RESTORE_KEY, JSON.stringify(map))
	} catch {
		/* without storage the restore just does not survive a restart */
	}
}

/** True while a clean launch is being prepared. */
export const cleanLaunchBusy = ref(false)

/** Brings back the mods a previous clean launch parked. Returns how many. */
export async function restoreCleanLaunch(instanceId: string): Promise<number> {
	const pending = readPending()
	const paths = pending[instanceId]
	if (!paths || paths.length === 0) return 0
	let restored = 0
	for (const path of paths) {
		try {
			await toggle_disable_project(instanceId, path, true)
			restored++
		} catch {
			/* a deleted mod stays deleted */
		}
	}
	delete pending[instanceId]
	writePending(pending)
	return restored
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Launches without mods, then puts every mod back once the game is closed. */
export async function cleanLaunch(instanceId: string): Promise<void> {
	cleanLaunchBusy.value = true
	try {
		// Leftovers from a previous run go back first, so nothing is lost.
		await restoreCleanLaunch(instanceId)
		const items = await get_content_items(instanceId)
		const paths: string[] = []
		for (const item of items) {
			const path = item.file_path ?? item.file_name
			if (!path || item.project_type !== 'mod' || item.disabled || item.installing) continue
			try {
				await toggle_disable_project(instanceId, path, false)
				paths.push(path)
			} catch {
				/* an untoggleable mod simply rides along */
			}
		}
		if (paths.length > 0) {
			const pending = readPending()
			pending[instanceId] = paths
			writePending(pending)
		}
		await run(instanceId)
		// The game is up: wait it out, then hand the mods back.
		void (async () => {
			await sleep(10000)
			for (;;) {
				try {
					const pids = await get_by_instance_id(instanceId)
					if (!pids || pids.length === 0) break
				} catch {
					break
				}
				await sleep(5000)
			}
			await restoreCleanLaunch(instanceId)
		})()
	} finally {
		cleanLaunchBusy.value = false
	}
}

// ---- Backups --------------------------------------------------------------

/** Packs the whole instance into a timestamped backup zip. Used by the
 * Backups tab and fired automatically before big updates, so a broken
 * update never costs the player their worlds. */
export async function backupInstance(instanceId: string): Promise<string | null> {
	try {
		const instancePath = await get_full_path(instanceId)
		const { appDataDir } = await import('@tauri-apps/api/path')
		const base = (await appDataDir()).replace(/[\\/]+$/, '')
		const sep = base.includes('\\') ? '\\' : '/'
		const dir = `${base}${sep}portalrinth-backups${sep}${instanceId}`
		const fs = await import('@tauri-apps/plugin-fs')
		await fs.mkdir(dir, { recursive: true })
		const stamp = new Date()
		const pad = (value: number) => String(value).padStart(2, '0')
		const name = `backup-${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())}-${pad(stamp.getHours())}-${pad(stamp.getMinutes())}-${pad(stamp.getSeconds())}.zip`
		const dest = `${dir}${sep}${name}`
		const { invoke } = await import('@tauri-apps/api/core')
		await invoke('plugin:portalrinth-archiver|archiver_pack', { sources: [instancePath], dest })
		return dest
	} catch {
		return null
	}
}

// ---- Mod sync between builds ---------------------------------------------

/** Whether the instance signed up for mod sync (default: off). */
export function modSyncEnabled(instanceId: string): boolean {
	try {
		return localStorage.getItem(`${SYNC_PREFIX}${instanceId}`) === '1'
	} catch {
		return false
	}
}

export function setModSyncEnabled(instanceId: string, enabled: boolean): void {
	try {
		if (enabled) localStorage.setItem(`${SYNC_PREFIX}${instanceId}`, '1')
		else localStorage.removeItem(`${SYNC_PREFIX}${instanceId}`)
	} catch {
		/* the toggle just does not survive a restart */
	}
}

export const syncRunning = ref(false)

/** Result line for the settings screen. */
export const syncReport = ref('')

/**
 * Applies this instance's mod versions to every other synced instance that
 * already carries the same project (missing mods are not copied - sync
 * updates what is shared, it does not sprinkle mods everywhere).
 */
export async function syncModsFrom(sourceInstanceId: string): Promise<string> {
	if (syncRunning.value) return syncReport.value
	const all = await list()
	const targets = all.filter(
		(instance) => instance.id !== sourceInstanceId && modSyncEnabled(instance.id),
	)
	if (targets.length === 0) {
		syncReport.value = 'Нет других сборок с включённой синхронизацией.'
		return syncReport.value
	}
	syncRunning.value = true
	try {
		const sourceItems = await get_content_items(sourceInstanceId)
		const byProject = new Map<string, { path: string; version: string | null }>()
		for (const item of sourceItems) {
			if (item.project_type !== 'mod' || !item.id) continue
			if (item.source_kind && item.source_kind !== 'modrinth') continue
			const path = item.file_path ?? item.file_name
			if (path) byProject.set(item.id, { path, version: item.version ?? null })
		}
		let updated = 0
		let same = 0
		for (const target of targets) {
			const targetItems = await get_content_items(target.id)
			for (const item of targetItems) {
				const shared = item.id ? byProject.get(item.id) : undefined
				const targetPath = item.file_path ?? item.file_name
				if (!shared || !targetPath) continue
				if (item.version && shared.version && item.version === shared.version) {
					same++
					continue
				}
				try {
					await update_project(target.id, targetPath)
					updated++
				} catch {
					/* one stubborn mod does not stop the rest */
				}
			}
		}
		syncReport.value = `Готово: обновлено ${updated}, уже совпадали ${same}.`
	} catch (error) {
		syncReport.value = `Не получилось: ${String(error).slice(0, 160)}`
	} finally {
		syncRunning.value = false
	}
	return syncReport.value
}

/** Quiet pass after installs: updates shared mods in the other synced builds. */
export async function propagateModUpdates(sourceInstanceId: string): Promise<void> {
	if (syncRunning.value) return
	const all = await list()
	if (!all.some((instance) => instance.id !== sourceInstanceId && modSyncEnabled(instance.id))) return
	await syncModsFrom(sourceInstanceId).catch(() => {})
}

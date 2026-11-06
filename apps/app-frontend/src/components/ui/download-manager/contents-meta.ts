import { invoke } from '@tauri-apps/api/core'

import type { PackManifestEntry } from '@/generated/app-events/PackManifestEntry'
import { proxiedFetch } from '@/helpers/proxy-fetch'

/**
 * What the eye view of a running pack install says about each file.
 *
 * The installer names every file it fetches, but a name is not much of a
 * story: the author, the picture, how many people use the mod and when it
 * was last touched all live on Modrinth or CurseForge. This goes and asks,
 * once per project, and keeps the answers for as long as the window is
 * open - a pack of three hundred mods is three hundred names, and nobody
 * wants them fetched twice.
 */

export interface ContentEntryMeta {
	title: string
	description: string
	author: string
	iconUrl: string | null
	downloads: number | null
	likes: number | null
	/** ISO date of the last update, as the source serves it. */
	updated: string | null
	url: string | null
}

class Deferred {
	promise: Promise<ContentEntryMeta | null>
	settle!: (value: ContentEntryMeta | null) => void

	constructor() {
		this.promise = new Promise((resolve) => {
			this.settle = resolve
		})
	}
}

const cache = new Map<string, Deferred>()

const keyOf = (entry: PackManifestEntry) => `${entry.source}:${entry.id || entry.key}`

interface MrProject {
	id: string
	title: string
	description: string
	author?: { username?: string } | string
	icon_url?: string | null
	downloads?: number
	followers?: number
	updated?: string
	slug?: string | null
}

function fromModrinth(project: MrProject): ContentEntryMeta {
	const author = typeof project.author === 'string' ? project.author : project.author?.username
	return {
		title: project.title,
		description: project.description || '',
		author: author ?? '',
		iconUrl: project.icon_url ?? null,
		downloads: project.downloads ?? null,
		likes: project.followers ?? null,
		updated: project.updated ?? null,
		url: project.slug ? `https://modrinth.com/project/${project.slug}` : null,
	}
}

interface CfProject {
	name: string
	summary: string
	icon_url: string | null
	website_url: string | null
	downloads: number
	follows: number
	date_modified: string | null
	authors: { name: string }[]
}

function fromCurseforge(project: CfProject): ContentEntryMeta {
	return {
		title: project.name,
		description: project.summary,
		author: project.authors?.[0]?.name ?? '',
		iconUrl: project.icon_url ?? null,
		downloads: project.downloads ?? null,
		likes: project.follows ?? null,
		updated: project.date_modified ?? null,
		url: project.website_url ?? null,
	}
}

/** Entries waiting for a Modrinth round trip: hashes first, projects after. */
let mrQueue: PackManifestEntry[] = []
let mrFlush: ReturnType<typeof setTimeout> | undefined

function flushModrinth(): void {
	const batch = mrQueue
	mrQueue = []
	mrFlush = undefined
	if (!batch.length) return

	void (async () => {
		try {
			const hashes = [...new Set(batch.map((entry) => entry.id || entry.key).filter(Boolean))]
			const versionResponse = await proxiedFetch('https://api.modrinth.com/v2/version_files', {
				method: 'POST',
				headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
				body: JSON.stringify({ hashes }),
				signal: AbortSignal.timeout(20000),
			})
			const versions = versionResponse.ok
				? ((await versionResponse.json()) as Record<string, { project_id?: string }>)
				: {}
			const projectIds = [
				...new Set(Object.values(versions).map((version) => version.project_id ?? '')),
			].filter(Boolean)
			const projects = new Map<string, MrProject>()
			if (projectIds.length) {
				const projectResponse = await proxiedFetch(
					`https://api.modrinth.com/v2/projects?ids=${encodeURIComponent(JSON.stringify(projectIds))}`,
					{ headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) },
				)
				if (projectResponse.ok) {
					for (const project of (await projectResponse.json()) as MrProject[]) {
						projects.set(project.id, project)
					}
				}
			}
			for (const entry of batch) {
				const version = versions[entry.id || entry.key]
				const project = version?.project_id ? projects.get(version.project_id) : undefined
				cache.get(keyOf(entry))?.settle(project ? fromModrinth(project) : null)
			}
		} catch {
			for (const entry of batch) cache.get(keyOf(entry))?.settle(null)
		}
	})()
}

/** CurseForge is asked one project at a time, a few at once.
 *
 * Two, not more: the same client and the same rate limit serve the install
 * itself, and a peek at what is downloading must not be able to starve the
 * install - or its canceling - of the API's attention. */
let cfRunning = 0
const cfWaiting: (() => void)[] = []
const CF_CONCURRENCY = 2

async function withCfSlot<T>(task: () => Promise<T>): Promise<T> {
	while (cfRunning >= CF_CONCURRENCY) {
		await new Promise<void>((resolve) => cfWaiting.push(resolve))
	}
	cfRunning += 1
	try {
		return await task()
	} finally {
		cfRunning -= 1
		cfWaiting.shift()?.()
	}
}

/**
 * What is known about one content file: asked for once, answered with
 * whatever the source told us, or nothing when it told us nothing.
 */
export function entryMeta(entry: PackManifestEntry): Promise<ContentEntryMeta | null> {
	const key = keyOf(entry)
	const cached = cache.get(key)
	if (cached) return cached.promise

	if (entry.source === 'curseforge' && entry.id) {
		const deferred = new Deferred()
		cache.set(key, deferred)
		void withCfSlot(() =>
			invoke<CfProject>('plugin:portalrinth-curseforge|curseforge_get_project', {
				id: entry.id,
			})
				.then((project) => deferred.settle(fromCurseforge(project)))
				.catch(() => deferred.settle(null)),
		)
		return deferred.promise
	}

	// Modrinth goes in batches: every entry waits a moment, then the whole
	// waiting set is asked about in two round trips.
	const deferred = new Deferred()
	cache.set(key, deferred)
	mrQueue.push(entry)
	if (!mrFlush) mrFlush = setTimeout(flushModrinth, 150)
	return deferred.promise
}

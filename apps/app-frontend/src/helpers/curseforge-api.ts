/**
 * Searching CurseForge from the interface.
 *
 * Everything here goes through the backend rather than fetching in the window,
 * for one reason: CurseForge's API key must not live in the frontend bundle,
 * and the frontend has no business holding one. The backend also knows things
 * about CurseForge that would be duplicated here otherwise — its ten-thousand
 * result window, its `All` game version meaning no filter at all, its loader
 * numbering — and having a second copy of those here is how the two drift apart.
 *
 * The shapes below therefore mirror `packages/app-lib/src/api/curseforge_search.rs`
 * and are worth changing together with it.
 */

import { invoke } from '@tauri-apps/api/core'

import { CURSEFORGE_API_KEY } from './curseforge-key'

/** CurseForge's own loader ids, which are not the launcher's. */
const LOADER_IDS: Record<string, number> = {
	forge: 1,
	cauldron: 2,
	liteloader: 3,
	fabric: 4,
	quilt: 5,
	neoforge: 6,
}

/** The dropdown's own way of saying "any version", which CurseForge reads as a version. */
const ANY_VERSION = 'All'

export interface CurseforgeFile {
	id: string
	mod_id: string
	display_name: string
	file_name: string
	game_version: string | null
	loader: string | null
	file_date: string | null
	sha1: string | null
}

export interface CurseforgeHit {
	id: string
	name: string
	slug: string | null
	summary: string | null
	icon_url: string | null
	author_name: string | null
	download_count: number
	date_modified: string | null
	/** The file to install for the version searched for, when the project has one. */
	latest_file: CurseforgeFile | null
}

export interface CurseforgeSearchPage {
	hits: CurseforgeHit[]
	index: number
	page_size: number
	total_count: number
	/** How far this query can actually be paged — always less than `total_count` for big ones. */
	reachable_count: number
	/** True when CurseForge's index window blocked the requested page. */
	capped: boolean
}

export interface CurseforgeSearchOptions {
	filter: string
	index?: number
	pageSize?: number
	gameVersion?: string | null
	loader?: string | null
	sortField?: number
	sortOrder?: number
}

/** Whether this launcher can ask CurseForge anything. */
export async function isCurseforgeAvailable(): Promise<boolean> {
	try {
		return await invoke<boolean>('plugin:noctrinth-curseforge|curseforge_is_available')
	} catch {
		return false
	}
}

export async function searchCurseforge(
	options: CurseforgeSearchOptions,
): Promise<CurseforgeSearchPage> {
	// The class id is deliberately left to the caller. Sending it to a query
	// that is not about mods is what makes CurseForge answer with nothing.
	const gameVersion =
		options.gameVersion && options.gameVersion !== ANY_VERSION ? options.gameVersion : null
	const loader = options.loader ? LOADER_IDS[options.loader] : null

	return await invoke<CurseforgeSearchPage>('plugin:noctrinth-curseforge|curseforge_search', {
		query: {
			searchFilter: options.filter,
			index: options.index ?? 0,
			pageSize: options.pageSize ?? 20,
			game_id: 432,
			game_version: gameVersion,
			loader: options.loader ?? null,
			class_id: null,
			category_id: null,
			sort_field: options.sortField ?? 2,
			sort_order: options.sortOrder ?? 1,
		},
	})
}

export async function curseforgeFiles(
	modId: string,
	gameVersion?: string | null,
	loader?: string | null,
): Promise<CurseforgeFile[]> {
	return await invoke<CurseforgeFile[]>('plugin:noctrinth-curseforge|curseforge_files', {
		modId: Number(modId),
		gameVersion: gameVersion && gameVersion !== ANY_VERSION ? gameVersion : null,
		loader: loader ?? null,
	})
}

export async function installCurseforgeMod(
	instanceId: string,
	modId: string,
	fileId: string,
): Promise<string> {
	return await invoke<string>('plugin:noctrinth-curseforge|curseforge_install_mod', {
		instanceId,
		modId: Number(modId),
		fileId: Number(fileId),
	})
}

/**
 * The address of the CurseForge page for a project, for the "open on
 * CurseForge" link. Built here rather than asked for, because it is a URL on
 * their website rather than anything to do with their API.
 */
export function curseforgeProjectUrl(hit: CurseforgeHit): string {
	const section = 'minecraft-mods'
	return `https://www.curseforge.com/${section}/${hit.slug ?? hit.name}`
}

export { CURSEFORGE_API_KEY }

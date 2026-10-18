import { invoke } from '@tauri-apps/api/core'

/**
 * Reading what is inside a modpack before installing it.
 *
 * The archive itself says almost nothing: a CurseForge `manifest.json` is a list
 * of numeric ids and a Modrinth `modrinth.index.json` is a list of hashes and
 * paths. Names, authors and icons live on the services, so the backend asks them
 * and sends back something a person can read.
 */

export type PackEntryKind = 'mod' | 'resource_pack' | 'data_pack' | 'shader' | 'other'

export interface PackManifestEntry {
	source: string
	/** The string the installer matches on; never changes once read. */
	key: string
	id: string
	file_id: string | null
	path: string
	kind: PackEntryKind
	title: string
	version: string | null
	author: string | null
	icon_url: string | null
	description: string | null
	download_count: number | null
	website_url: string | null
	/** Set by the person looking at the list; not part of what was read. */
	enabled: boolean
}

export interface PackManifest {
	format: string
	name: string | null
	version: string | null
	summary: string | null
	game_version: string | null
	loader: string | null
	loader_version: string | null
	entries: PackManifestEntry[]
}

/** The classes a pack is split into, in the order they are worth reading in. */
export const PACK_ENTRY_KINDS: PackEntryKind[] = [
	'mod',
	'resource_pack',
	'data_pack',
	'shader',
	'other',
]

export async function readPackManifest(path: string): Promise<PackManifest> {
	const manifest = await invoke<PackManifest>('plugin:portalrinth-curseforge|pack_manifest', {
		path,
	})

	// Nothing is switched off to begin with: a person is being shown what the
	// pack would install, and only their own choices remove any of it.
	return { ...manifest, entries: manifest.entries.map((entry) => ({ ...entry, enabled: true })) }
}

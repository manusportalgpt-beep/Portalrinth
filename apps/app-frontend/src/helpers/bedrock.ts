import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { ref } from 'vue'

import { users } from '@/helpers/auth.js'

/**
 * Minecraft: Bedrock Edition — a separate core with its own content.
 *
 * Nothing here touches Java instances: Bedrock builds live in their own file,
 * the game itself comes from the Microsoft Store, and their content is
 * unpacked into the game's `com.mojang` folders by the backend.
 */

export type BedrockPackKind = 'resource' | 'behavior' | 'skin' | 'world' | 'world_template'

export interface BedrockStatus {
	supported: boolean
	installed: boolean
	packs_dir: string | null
	worlds_dir: string | null
	store_url: string
	store_web_url: string
}

export interface BedrockInstalledPack {
	kind: BedrockPackKind
	name: string
	path: string
	uuid: string | null
	version: [number, number, number] | null
}

export interface BedrockContent {
	project_id: number
	file_id: number
	name: string
	file_name: string
	icon_url: string | null
	author: string | null
	class_id: number | null
	installed_at: string
	packs: BedrockInstalledPack[]
}

export interface BedrockProfile {
	id: string
	name: string
	icon_path: string | null
	created: string
	last_played: string | null
	content: BedrockContent[]
}

export interface BedrockClass {
	id: number
	name: string
	slug: string
	icon_url: string | null
}

export interface BedrockCategory {
	id: number
	class_id: number | null
	name: string
	slug: string
	icon_url: string | null
}

export interface BedrockProject {
	id: number
	name: string
	slug: string
	summary: string
	icon_url: string | null
	author: string | null
	downloads: number
	class_id: number | null
	website_url: string | null
	date_modified: string | null
	categories: string[]
}

export interface BedrockSearchPage {
	hits: BedrockProject[]
	total: number
	index: number
	page_size: number
}

export interface BedrockFile {
	id: number
	display_name: string
	file_name: string
	file_date: string | null
	game_versions: string[]
	downloads: number
}

/** CurseForge's sort fields: featured, popularity, last updated, name, downloads. */
export const BEDROCK_SORTS = [
	{ id: 2, key: 'popularity' },
	{ id: 6, key: 'downloads' },
	{ id: 3, key: 'updated' },
	{ id: 4, key: 'name' },
] as const

const plugin = (command: string) => `plugin:portalrinth-bedrock|${command}`

export const bedrockStatus = () => invoke<BedrockStatus>(plugin('bedrock_status'))
export const listBedrock = () => invoke<BedrockProfile[]>(plugin('bedrock_list'))
export const getBedrock = (id: string) => invoke<BedrockProfile>(plugin('bedrock_get'), { id })
export const createBedrock = (name: string, iconPath: string | null) =>
	invoke<BedrockProfile>(plugin('bedrock_create'), { name, iconPath })
export const renameBedrock = (id: string, name: string) =>
	invoke<BedrockProfile>(plugin('bedrock_rename'), { id, name })
export const setBedrockIcon = (id: string, iconPath: string | null) =>
	invoke<BedrockProfile>(plugin('bedrock_set_icon'), { id, iconPath })
export const removeBedrock = (id: string, removeContent: boolean) =>
	invoke<void>(plugin('bedrock_remove'), { id, removeContent })
export const launchBedrock = (id: string) => invoke<void>(plugin('bedrock_launch'), { id })
export const bedrockCurseforgeAvailable = () => invoke<boolean>(plugin('bedrock_available'))
export const bedrockClasses = () => invoke<BedrockClass[]>(plugin('bedrock_classes'))
export const bedrockCategories = (classId: number) =>
	invoke<BedrockCategory[]>(plugin('bedrock_categories'), { classId })
export const searchBedrock = (args: {
	classId: number | null
	categoryId: number | null
	query: string
	sortField: number
	index: number
	pageSize: number
}) => invoke<BedrockSearchPage>(plugin('bedrock_search'), args)
export const bedrockProject = (projectId: number) =>
	invoke<BedrockProject>(plugin('bedrock_project'), { projectId })
export const bedrockDescription = (projectId: number) =>
	invoke<string>(plugin('bedrock_description'), { projectId })
export const bedrockFiles = (projectId: number) =>
	invoke<BedrockFile[]>(plugin('bedrock_files'), { projectId })
export const installBedrockContent = (profileId: string, projectId: number, fileId: number) =>
	invoke<BedrockProfile>(plugin('bedrock_install'), { profileId, projectId, fileId })
export const uninstallBedrockContent = (profileId: string, projectId: number) =>
	invoke<BedrockProfile>(plugin('bedrock_uninstall'), { profileId, projectId })

export function bedrockIconUrl(profile: Pick<BedrockProfile, 'icon_path'> | null | undefined) {
	return profile?.icon_path ? convertFileSrc(profile.icon_path) : null
}

/**
 * Bedrock is offered only to someone who owns the game: a signed-in
 * Microsoft account, on Windows, where the Store build can run.
 */
export async function bedrockOffered(): Promise<boolean> {
	try {
		const [status, accounts] = await Promise.all([bedrockStatus(), users()])
		return status.supported && Array.isArray(accounts) && accounts.length > 0
	} catch {
		return false
	}
}

export function bedrockKindOf(content: BedrockContent): BedrockPackKind | null {
	return content.packs[0]?.kind ?? null
}

/** Bedrock builds shown in the sidebar, refreshed after every change. */
export const bedrockProfiles = ref<BedrockProfile[]>([])
export const bedrockVisible = ref(false)

export async function refreshBedrockProfiles() {
	bedrockVisible.value = await bedrockOffered()
	if (!bedrockVisible.value) {
		bedrockProfiles.value = []
		return
	}
	try {
		bedrockProfiles.value = await listBedrock()
	} catch {
		bedrockProfiles.value = []
	}
}

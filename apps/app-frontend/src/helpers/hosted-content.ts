import {
	type HostedPlugin,
	type HostedServerView,
	type HostedSoftware,
	hosting_plugin_download,
} from '@/helpers/hosting'

export type HostedProjectType = 'plugin' | 'mod' | 'datapack'

export interface HostedSearchHit {
	project_id: string
	slug: string
	title: string
	description: string
	author: string
	icon_url: string | null
	downloads: number
	follows: number
}

interface ModrinthVersion {
	id: string
	version_type: 'release' | 'beta' | 'alpha'
	date_published: string
	files: { url: string; filename: string; primary: boolean }[]
}

const API = 'https://api.modrinth.com/v2'

const LOADERS: Record<HostedSoftware, string[]> = {
	paper: ['paper', 'spigot', 'bukkit'],
	purpur: ['purpur', 'paper', 'spigot', 'bukkit'],
	folia: ['folia'],
	fabric: ['fabric'],
	quilt: ['quilt', 'fabric'],
	vanilla: ['datapack'],
}

export function hostedProjectType(software: HostedSoftware): HostedProjectType {
	if (software === 'fabric' || software === 'quilt') return 'mod'
	if (software === 'vanilla') return 'datapack'
	return 'plugin'
}

export function hostedLoaders(software: HostedSoftware): string[] {
	return LOADERS[software] ?? []
}

/** A server can take a project when its core is one of the project's loaders. */
export function hostedServerFits(server: HostedServerView, loaders: string[]): boolean {
	const own = hostedLoaders(server.software)
	return loaders.some((loader) => own.includes(loader))
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
	const response = await fetch(url, { headers: { Accept: 'application/json' }, signal })
	if (!response.ok) throw new Error(`Modrinth answered HTTP ${response.status}`)
	return (await response.json()) as T
}

export async function searchHostedContent(
	server: HostedServerView,
	query: string,
	offset: number,
	signal?: AbortSignal,
): Promise<{ hits: HostedSearchHit[]; total: number }> {
	const type = hostedProjectType(server.software)
	const facets = [
		[`project_type:${type}`],
		hostedLoaders(server.software).map((loader) => `categories:${loader}`),
		[`versions:${server.game_version}`],
	]
	if (type === 'mod') facets.push(['server_side:required', 'server_side:optional'])
	const params = new URLSearchParams({
		query,
		limit: '20',
		offset: String(offset),
		index: query.trim() ? 'relevance' : 'downloads',
		facets: JSON.stringify(facets),
	})
	const data = await getJson<{ hits: HostedSearchHit[]; total_hits: number }>(
		`${API}/search?${params}`,
		signal,
	)
	return { hits: data.hits ?? [], total: data.total_hits ?? 0 }
}

/** Releases first, newest first; a beta only when nothing stable fits. */
async function pickVersion(
	server: HostedServerView,
	projectId: string,
): Promise<ModrinthVersion | null> {
	const params = new URLSearchParams({
		loaders: JSON.stringify(hostedLoaders(server.software)),
		game_versions: JSON.stringify([server.game_version]),
	})
	const versions = await getJson<ModrinthVersion[]>(
		`${API}/project/${encodeURIComponent(projectId)}/version?${params}`,
	)
	const rank = { release: 0, beta: 1, alpha: 2 }
	return (
		[...versions].sort(
			(a, b) =>
				rank[a.version_type] - rank[b.version_type] ||
				Date.parse(b.date_published) - Date.parse(a.date_published),
		)[0] ?? null
	)
}

export class NoFittingVersionError extends Error {}

export async function installToHostedServer(
	server: HostedServerView,
	projectId: string,
): Promise<HostedPlugin[]> {
	const version = await pickVersion(server, projectId)
	const file = version?.files.find((entry) => entry.primary) ?? version?.files[0]
	if (!file) throw new NoFittingVersionError()
	return hosting_plugin_download(server.id, file.url, file.filename)
}

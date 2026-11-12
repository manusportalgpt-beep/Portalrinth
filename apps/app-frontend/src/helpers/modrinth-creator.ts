/**
 * The creator side of modrinth.com, through the launcher: the player's own
 * projects and their versions, organizations, analytics, revenue and the
 * reports they filed. Every request goes through the proxy from Settings.
 */
import { get as getCreds } from '@/helpers/mr_auth.ts'
import { proxiedFetch } from '@/helpers/proxy-fetch'

const API = 'https://api.modrinth.com'

export const MODRINTH_SITE = 'https://modrinth.com'

export type CreatorProjectType =
	| 'mod'
	| 'modpack'
	| 'resourcepack'
	| 'shader'
	| 'datapack'
	| 'plugin'

export type CreatorProjectStatus =
	| 'approved'
	| 'archived'
	| 'rejected'
	| 'draft'
	| 'unlisted'
	| 'processing'
	| 'withheld'
	| 'scheduled'
	| 'private'
	| 'unknown'

export interface CreatorProject {
	id: string
	slug: string
	title: string
	description: string
	body?: string
	project_type: CreatorProjectType
	status: CreatorProjectStatus
	requested_status?: string | null
	icon_url: string | null
	downloads: number
	followers: number
	categories: string[]
	client_side: string
	server_side: string
	game_versions: string[]
	loaders: string[]
	versions: string[]
	published: string
	updated: string
	source_url?: string | null
	issues_url?: string | null
	wiki_url?: string | null
	discord_url?: string | null
	license?: { id: string; name: string } | null
	color?: number | null
}

export interface CreatorVersion {
	id: string
	name: string
	version_number: string
	version_type: 'release' | 'beta' | 'alpha'
	status: string
	downloads: number
	date_published: string
	game_versions: string[]
	loaders: string[]
	files: { filename: string; size: number; primary: boolean; url: string }[]
}

export interface CreatorOrganization {
	id: string
	slug: string
	name: string
	description: string
	icon_url: string | null
	members: { user: { id: string; username: string; avatar_url: string | null } }[]
}

export interface PayoutBalance {
	available: number
	pending: number
	withdrawn_lifetime: number
	withdrawn_ytd: number
	dates: Record<string, number>
}

export type PayoutTransaction =
	| {
			type: 'withdrawal'
			id: string
			status: string
			created: string
			amount: number
			fee: number | null
			method_type: string | null
	  }
	| { type: 'payout_available'; created: string; payout_source: string; amount: number }

export interface CreatorReport {
	id: string
	report_type: string
	item_id: string
	item_type: 'project' | 'version' | 'user' | string
	body: string
	created: string
	closed: boolean
	thread_id: string
}

export interface GameVersionTag {
	version: string
	version_type: 'release' | 'snapshot' | 'alpha' | 'beta'
	major: boolean
}

export interface LoaderTag {
	name: string
	icon: string
	supported_project_types: string[]
}

async function session() {
	const creds = await getCreds()
	if (!creds) throw new Error('Sign in to your Modrinth account first.')
	return creds
}

function apiMessage(text: string) {
	try {
		const parsed = JSON.parse(text)
		return parsed?.description || parsed?.message || parsed?.error || ''
	} catch {
		return text.slice(0, 160)
	}
}

async function request<T>(
	method: string,
	path: string,
	body?: unknown,
	headers: Record<string, string> = {},
): Promise<T> {
	const creds = await session()
	const init: Parameters<typeof proxiedFetch>[1] = {
		method,
		headers: { Authorization: creds.session, ...headers },
	}
	if (body instanceof FormData || body instanceof Blob || body instanceof Uint8Array) {
		init.body = body as BodyInit
	} else if (body !== undefined) {
		init.body = JSON.stringify(body)
		;(init.headers as Record<string, string>)['Content-Type'] = 'application/json'
	}
	const res = await proxiedFetch(`${API}${path}`, init)
	if (!res.ok) {
		const text = await res.text().catch(() => '')
		const detail = apiMessage(text)
		throw new Error(`Modrinth ${res.status}${detail ? `: ${detail}` : ''}`)
	}
	if (res.status === 204) return undefined as T
	const text = await res.text()
	return (text ? JSON.parse(text) : undefined) as T
}

export async function getMe(): Promise<{
	id: string
	username: string
	avatar_url: string | null
}> {
	return request('GET', '/v2/user')
}

export async function getMyProjects(): Promise<CreatorProject[]> {
	const creds = await session()
	return request<CreatorProject[]>('GET', `/v2/user/${creds.user_id}/projects`)
}

export async function getProject(id: string): Promise<CreatorProject> {
	return request<CreatorProject>('GET', `/v2/project/${encodeURIComponent(id)}`)
}

export interface NewProject {
	title: string
	slug: string
	description: string
	project_type: CreatorProjectType
	visibility: 'approved' | 'unlisted' | 'private'
	icon?: File | null
}

/** Modrinth keeps every uploadable kind under "mod" or "modpack" at creation. */
function wireProjectType(type: CreatorProjectType) {
	return type === 'modpack' ? 'modpack' : 'mod'
}

export async function createProject(project: NewProject): Promise<CreatorProject> {
	const form = new FormData()
	const data = {
		title: project.title,
		slug: project.slug,
		description: project.description,
		body: '',
		categories: [],
		additional_categories: [],
		client_side: 'required',
		server_side: 'optional',
		license_id: 'LicenseRef-All-Rights-Reserved',
		project_type: wireProjectType(project.project_type),
		initial_versions: [],
		is_draft: true,
		requested_status: project.visibility,
	}
	form.append('data', JSON.stringify(data))
	if (project.icon) form.append('icon', project.icon, project.icon.name)
	return request<CreatorProject>('POST', '/v2/project', form)
}

export type ProjectPatch = Partial<
	Pick<
		CreatorProject,
		| 'title'
		| 'slug'
		| 'description'
		| 'body'
		| 'client_side'
		| 'server_side'
		| 'source_url'
		| 'issues_url'
		| 'wiki_url'
		| 'discord_url'
		| 'categories'
	>
> & { status?: CreatorProjectStatus; requested_status?: string | null; license_id?: string }

export async function editProject(id: string, patch: ProjectPatch): Promise<void> {
	await request<void>('PATCH', `/v2/project/${encodeURIComponent(id)}`, patch)
}

export async function setProjectIcon(id: string, file: File): Promise<void> {
	const ext = (file.name.split('.').pop() || 'png').toLowerCase()
	const bytes = new Uint8Array(await file.arrayBuffer())
	await request<void>('PATCH', `/v2/project/${encodeURIComponent(id)}/icon?ext=${ext}`, bytes, {
		'Content-Type': file.type || `image/${ext}`,
	})
}

export async function deleteProject(id: string): Promise<void> {
	await request<void>('DELETE', `/v2/project/${encodeURIComponent(id)}`)
}

export async function submitForReview(id: string): Promise<void> {
	await editProject(id, { status: 'processing' })
}

export async function getProjectVersions(id: string): Promise<CreatorVersion[]> {
	return request<CreatorVersion[]>(
		'GET',
		`/v2/project/${encodeURIComponent(id)}/version?include_changelog=false`,
	)
}

export interface NewVersion {
	project_id: string
	name: string
	version_number: string
	changelog: string
	version_type: 'release' | 'beta' | 'alpha'
	game_versions: string[]
	loaders: string[]
	featured: boolean
	files: File[]
}

export async function createVersion(version: NewVersion): Promise<CreatorVersion> {
	const form = new FormData()
	const parts = version.files.map((_, index) => `file-${index}`)
	form.append(
		'data',
		JSON.stringify({
			project_id: version.project_id,
			name: version.name,
			version_number: version.version_number,
			changelog: version.changelog,
			version_type: version.version_type,
			game_versions: version.game_versions,
			loaders: version.loaders,
			featured: version.featured,
			dependencies: [],
			status: 'listed',
			file_parts: parts,
			primary_file: parts[0],
		}),
	)
	version.files.forEach((file, index) => form.append(parts[index], file, file.name))
	return request<CreatorVersion>('POST', '/v2/version', form)
}

export async function deleteVersion(id: string): Promise<void> {
	await request<void>('DELETE', `/v2/version/${encodeURIComponent(id)}`)
}

let gameVersionsCache: Promise<GameVersionTag[]> | null = null
let loadersCache: Promise<LoaderTag[]> | null = null

export function getGameVersions(): Promise<GameVersionTag[]> {
	gameVersionsCache ??= request<GameVersionTag[]>('GET', '/v2/tag/game_version').catch((error) => {
		gameVersionsCache = null
		throw error
	})
	return gameVersionsCache
}

export function getLoaders(): Promise<LoaderTag[]> {
	loadersCache ??= request<LoaderTag[]>('GET', '/v2/tag/loader').catch((error) => {
		loadersCache = null
		throw error
	})
	return loadersCache
}

export async function getMyOrganizations(): Promise<CreatorOrganization[]> {
	const creds = await session()
	return request<CreatorOrganization[]>('GET', `/v3/user/${creds.user_id}/organizations`)
}

export async function createOrganization(data: {
	name: string
	slug: string
	description: string
}): Promise<CreatorOrganization> {
	return request<CreatorOrganization>('POST', '/v3/organization', data)
}

export async function getPayoutBalance(): Promise<PayoutBalance> {
	const raw = await request<Record<string, unknown>>('GET', '/v3/payout/balance')
	const num = (value: unknown) => Number(value ?? 0) || 0
	const dates: Record<string, number> = {}
	for (const [date, value] of Object.entries((raw.dates as Record<string, unknown>) ?? {}))
		dates[date] = num(value)
	return {
		available: num(raw.available),
		pending: num(raw.pending),
		withdrawn_lifetime: num(raw.withdrawn_lifetime),
		withdrawn_ytd: num(raw.withdrawn_ytd),
		dates,
	}
}

export async function getPayoutHistory(): Promise<PayoutTransaction[]> {
	const items = await request<PayoutTransaction[]>('GET', '/v3/payout/history')
	return items
		.map((item) => ({ ...item, amount: Number(item.amount) || 0 }))
		.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())
}

export async function getMyReports(): Promise<CreatorReport[]> {
	return request<CreatorReport[]>('GET', '/v3/report?count=100')
}

export type AnalyticsMetric = 'downloads' | 'views'

export interface AnalyticsSeries {
	/** Slice start times. */
	times: number[]
	/** Per project, one value per slice. */
	byProject: Record<string, number[]>
}

export async function getAnalytics(
	projectIds: string[],
	metric: AnalyticsMetric,
	days: number,
): Promise<AnalyticsSeries> {
	const end = new Date()
	const start = new Date(end.getTime() - days * 86400000)
	const slices = days <= 1 ? 24 : Math.min(days, 90)
	const returnMetrics =
		metric === 'downloads'
			? { project_downloads: { bucket_by: ['project_id'] } }
			: { project_views: { bucket_by: ['project_id'] } }
	const response = await request<{
		metrics: {
			source_project?: string
			metric_kind: string
			downloads?: number
			views?: number
		}[][]
	}>('POST', '/v3/analytics', {
		time_range: { start: start.toISOString(), end: end.toISOString(), resolution: { slices } },
		return_metrics: returnMetrics,
		project_ids: projectIds,
	})
	const step = (end.getTime() - start.getTime()) / slices
	const times = Array.from({ length: slices }, (_, index) => start.getTime() + index * step)
	const byProject: Record<string, number[]> = {}
	for (const id of projectIds) byProject[id] = new Array(slices).fill(0)
	;(response.metrics ?? []).forEach((slice, index) => {
		if (index >= slices) return
		for (const point of slice ?? []) {
			if (!point.source_project) continue
			const value = metric === 'downloads' ? point.downloads : point.views
			byProject[point.source_project] ??= new Array(slices).fill(0)
			byProject[point.source_project][index] += Number(value) || 0
		}
	})
	return { times, byProject }
}

export function projectUrl(project: Pick<CreatorProject, 'project_type' | 'slug' | 'id'>) {
	return `${MODRINTH_SITE}/${project.project_type}/${project.slug || project.id}`
}

export function slugify(text: string) {
	return text
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9!@$().+,"'-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 64)
}

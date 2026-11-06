/**
 * Portalus's launcher hands beyond search-and-install: describe a build, start
 * and stop the game, open the world to friends (LAN), update mods, create a
 * build or a modpack, read a guide on a wiki, preview a site built in the
 * sandbox. Registered once from App.vue; every result is a short plain text
 * the model can act on, cards ride along as markers.
 */
import type { ContentItem } from '@modrinth/ui'
import { invoke } from '@tauri-apps/api/core'
import * as fs from '@tauri-apps/plugin-fs'
import {
	noteAgentThought,
	playerTookOver,
	readSelectedBuild,
	registerAiToolHandler,
	searchWeb,
} from './ai-assistant'
import { describeBuild, loaderLabel } from './ai-build-info'
import { setPendingConfirm } from './ai-pending-confirm'
import { sandboxAbsolutePath, sandboxRead } from './ai-sandbox'
import {
	install_bulk_update_content,
	install_create_instance,
	install_create_modpack_instance,
	install_job_get,
	installJobInstanceId,
	isInstallJobFinished,
} from './install'
import {
	get,
	get_content_items,
	get_full_path,
	kill,
	list,
	refresh_content_updates,
	remove_project,
	run,
	toggle_disable_project,
} from './instance'
import { list_lan_relays, start_lan_relay, stop_lan_relay } from './lan'
import { proxiedFetch } from './proxy-fetch'
import type { InstanceLoader } from './types'

/** The build a tool means: the id given, a build named so, or the selected one. */
async function resolveBuild(raw: string): Promise<{ id: string; name: string } | string> {
	const wanted = raw.trim()
	const all = await list().catch(() => [])
	if (wanted) {
		const exact = all.find((instance) => instance.id === wanted)
		if (exact) return { id: exact.id, name: exact.name }
		const lower = wanted.toLowerCase()
		const byName =
			all.find((instance) => instance.name.toLowerCase() === lower) ??
			all.find((instance) => instance.name.toLowerCase().includes(lower))
		if (byName) return { id: byName.id, name: byName.name }
		return `Сборки «${wanted}» нет. Есть: ${all
			.slice(0, 15)
			.map((instance) => `«${instance.name}» (${instance.id})`)
			.join(', ')}`
	}
	const selected = readSelectedBuild()
	if (selected) return selected
	if (all.length === 1) return { id: all[0].id, name: all[0].name }
	return 'Не понял, какая сборка: укажи id или название (список — <<list_instances|>>)'
}

// ---- Wikis ------------------------------------------------------------------

interface WikiTarget {
	/** Host plus language prefix, e.g. create.fandom.com or minecraft.fandom.com/ru */
	base: string
	/** The article, when a link already named it. */
	title?: string
	articlePath: 'wiki' | 'w'
}

const WIKI_URL =
	/https?:\/\/((?:[a-z0-9-]+\.)+fandom\.com|(?:[a-z]{2}\.)?minecraft\.wiki)(\/[a-z]{2}(?:-[a-z]{2})?)?\/(wiki|w)\/([^?#\s"'<>]+)/i

function targetFromUrl(url: string): WikiTarget | null {
	const match = WIKI_URL.exec(url)
	if (!match) return null
	return {
		base: `${match[1]}${match[2] ?? ''}`,
		title: decodeURIComponent(match[4]).replace(/_/g, ' '),
		articlePath: match[3].toLowerCase() === 'w' ? 'w' : 'wiki',
	}
}

const wikiHeaders = { 'User-Agent': 'Portalrinth-Launcher (Portalus wiki helper)' }

async function wikiApi(base: string, params: Record<string, string>): Promise<unknown> {
	const query = new URLSearchParams({ format: 'json', ...params })
	const response = await proxiedFetch(`https://${base}/api.php?${query}`, {
		headers: wikiHeaders,
		signal: AbortSignal.timeout(12000),
	})
	if (!response.ok) throw new Error(`HTTP ${response.status}`)
	return await response.json()
}

async function wikiExists(base: string): Promise<boolean> {
	try {
		await wikiApi(base, { action: 'query', meta: 'siteinfo' })
		return true
	} catch {
		return false
	}
}

function plainFromHtml(html: string): string {
	return html
		.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, '')
		.replace(/<table[^>]*class="[^"]*navbox[\s\S]*?<\/table>/gi, '')
		.replace(/<sup[\s\S]*?<\/sup>/gi, '')
		.replace(/<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi, '\n\n## $2\n')
		.replace(/<li[^>]*>/gi, '\n- ')
		.replace(/<br\s*\/?>|<\/p>|<\/tr>|<\/div>/gi, '\n')
		.replace(/<\/t[dh]>/gi, ' | ')
		.replace(/<[^>]+>/g, '')
		.replace(/\[edit\]|\[править\]|\[править код\]/gi, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;/g, "'")
		.replace(/[ \t]+/g, ' ')
		.replace(/\n\s*\n\s*\n+/g, '\n\n')
		.trim()
}

const slug = (text: string) =>
	text
		.toLowerCase()
		.replace(/['’]/g, '')
		.replace(/[^a-z0-9]+/g, '')

/**
 * A guide from a wiki: Fandom first (every big mod has one), the Minecraft
 * Wiki for vanilla things. `query` may be "предмет::мод" - then the mod's
 * own Fandom is asked directly.
 */
async function wikiLookup(raw: string): Promise<string> {
	const [query = '', hint = ''] = raw.split('::').map((part) => part.trim())
	if (!query) return 'Нужен запрос: <<fandom|что ищем::мод или вики (необязательно)>>'
	let target: WikiTarget | null = null
	const direct = targetFromUrl(query)
	if (direct) target = direct
	if (!target && hint) {
		const base = hint.includes('.')
			? hint.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
			: `${slug(hint)}.fandom.com`
		if (await wikiExists(base))
			target = { base, articlePath: base.includes('minecraft.wiki') ? 'w' : 'wiki' }
	}
	if (!target) {
		// The web knows which wiki covers a mod better than any guess.
		const hits = await searchWeb(`${query} ${hint} fandom wiki`).catch(() => [])
		for (const hit of hits) {
			const fromHit = targetFromUrl(hit.url)
			if (fromHit) {
				target = fromHit
				break
			}
		}
	}
	if (!target) {
		const guess = `${slug(hint || query.split(/\s+/)[0])}.fandom.com`
		if (guess !== '.fandom.com' && (await wikiExists(guess)))
			target = { base: guess, articlePath: 'wiki' }
	}
	if (!target) {
		target = {
			base: /[а-яё]/i.test(query) ? 'ru.minecraft.wiki' : 'minecraft.wiki',
			articlePath: 'w',
		}
	}
	try {
		let title = target.title
		if (!title || hint) {
			const search = (await wikiApi(target.base, {
				action: 'query',
				list: 'search',
				srsearch: query,
				srlimit: '5',
			})) as { query?: { search?: { title: string }[] } }
			title = search.query?.search?.[0]?.title ?? title
		}
		if (!title)
			return `На ${target.base} ничего не нашлось по «${query}». Попробуй другой запрос или web_search.`
		const parsed = (await wikiApi(target.base, {
			action: 'parse',
			page: title,
			prop: 'text',
			redirects: '1',
			disabletoc: '1',
		})) as { parse?: { title?: string; text?: { '*'?: string } } }
		const html = parsed.parse?.text?.['*'] ?? ''
		const realTitle = parsed.parse?.title ?? title
		let image = ''
		try {
			const info = (await wikiApi(target.base, {
				action: 'query',
				prop: 'pageimages',
				titles: realTitle,
				pithumbsize: '480',
				redirects: '1',
			})) as { query?: { pages?: Record<string, { thumbnail?: { source?: string } }> } }
			image = Object.values(info.query?.pages ?? {})[0]?.thumbnail?.source ?? ''
		} catch {
			/* a guide without a picture is still a guide */
		}
		const text = plainFromHtml(html)
		const url = `https://${target.base}/${target.articlePath}/${encodeURIComponent(realTitle.replace(/ /g, '_'))}`
		const wikiName = target.base
			.replace(/\.fandom\.com.*/, ' Wiki (Fandom)')
			.replace(/^((?:[a-z]{2}\.)?minecraft\.wiki)$/, 'Minecraft Wiki')
		const card = {
			title: realTitle,
			url,
			wiki: wikiName,
			image: image || undefined,
			excerpt: text.replace(/\s+/g, ' ').slice(0, 260),
		}
		return `Статья «${realTitle}» — ${url}\n${text.slice(0, 3600)}\n@@WIKI@@${JSON.stringify(card)}`
	} catch (error) {
		return `Вики ${target.base} не ответила (${String(error).slice(0, 100)}). Попробуй web_fetch по ссылке или другой запрос.`
	}
}

// ---- Site preview --------------------------------------------------------------

/**
 * Turns a sandbox site into one self-contained page: linked CSS and scripts
 * that live next to it are folded inline, so the chat can show the site in
 * a frame without a web server.
 */
export async function buildSitePreview(path: string): Promise<string> {
	const html = await sandboxRead(path)
	const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : ''
	const local = (ref: string) => !/^(https?:|data:|\/\/)/i.test(ref)
	let out = html
	for (const match of [...html.matchAll(/<link[^>]+href="([^"]+\.css)"[^>]*>/gi)]) {
		if (!local(match[1])) continue
		const css = await sandboxRead(dir + match[1]).catch(() => '')
		out = out.replace(match[0], `<style>\n${css}\n</style>`)
	}
	for (const match of [...html.matchAll(/<script([^>]*)src="([^"]+\.js)"([^>]*)><\/script>/gi)]) {
		if (!local(match[2])) continue
		const js = await sandboxRead(dir + match[2]).catch(() => '')
		out = out.replace(
			match[0],
			`<script${match[1]}${match[3]}>\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>`,
		)
	}
	return out
}

// ---- The handler -----------------------------------------------------------------

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** True when this build is fully usable: installed, or a modpack whose
 * content is in place. */
function buildReady(stage: string | undefined): boolean {
	return stage === 'installed' || stage === 'pack_installed'
}

/** A build whose files are already in place: fully installed, a modpack
 * with its pack in place, or a recovered/imported one ('not_installed' -
 * the game downloads itself at first launch, and content can be added
 * right away). Waiting on any of these is wasted time. */
function buildUsable(stage: string | undefined): boolean {
	return buildReady(stage) || stage === 'not_installed'
}

/**
 * Waits until the install job settles, thinking out loud every so often.
 * Returns 'готова', 'остановлено', 'время ожидания вышло' or a failure text.
 */
async function waitInstallDone(
	jobId: string,
	instanceId: string | null,
	label: string,
	timeoutMs: number,
): Promise<string> {
	const deadline = Date.now() + timeoutMs
	let tick = 0
	while (Date.now() < deadline) {
		if (playerTookOver()) return 'остановлено'
		if (jobId) {
			const job = await install_job_get(jobId).catch(() => null)
			if (job && isInstallJobFinished(job.status)) {
				if (job.status === 'succeeded') return 'готова'
				const detail = job.error
					? String(
							(job.error as { message?: string }).message ?? JSON.stringify(job.error),
					  ).slice(0, 200)
					: job.status
				return `установка не удалась: ${detail}`
			}
		}
		const instance = instanceId ? await get(instanceId).catch(() => null) : null
		if (instance && buildReady(instance.install_stage)) return 'готова'
		tick += 1
		if (tick % 10 === 0) noteAgentThought(`Жду, пока установится ${label}…`)
		await sleep(2000)
	}
	return 'время ожидания вышло'
}

/** A build with this exact name already exists: reuse it, never a twin. */
async function reuseExistingBuild(
	instance: { id: string; name: string; install_stage: string },
	timeoutMs: number,
): Promise<string> {
	if (buildUsable(instance.install_stage)) {
		return `Сборка «${instance.name}» уже есть (id: ${instance.id}) — не создаю дубль, работаем с ней.`
	}
	// The build is mid-download: a short grace only, never minutes - the
	// player watches the very same download in the manager and a hung
	// "Работаю..." helps nobody.
	noteAgentThought(`Сборка «${instance.name}» уже скачивается — коротко проверяю, подолгу не жду`)
	const outcome = await waitInstallDone(
		'',
		instance.id,
		`«${instance.name}»`,
		Math.min(timeoutMs, 20000),
	)
	if (outcome === 'готова') {
		return `Сборка «${instance.name}» уже была и теперь готова (id: ${instance.id}) — работаем с ней.`
	}
	if (outcome === 'остановлено') return outcome
	return `Сборка «${instance.name}» (id: ${instance.id}) ещё скачивается (${outcome}) — ждать не стал: прогресс виден в загрузках. Когда загрузка кончится, проверь <<instance_info|${instance.id}>> и продолжай работу с ней; новую сборку не создавай.`
}

const LOADERS: Record<string, InstanceLoader> = {
	fabric: 'fabric',
	фабрик: 'fabric',
	forge: 'forge',
	фордж: 'forge',
	форж: 'forge',
	neoforge: 'neoforge',
	неофордж: 'neoforge',
	неофорж: 'neoforge',
	quilt: 'quilt',
	квилт: 'quilt',
	vanilla: 'vanilla',
	ванилла: 'vanilla',
	ванила: 'vanilla',
}

/** Finds a content item by title or file name, loosely. A string is an error. */
async function findContentItem(buildId: string, wanted: string) {
	const items = await get_content_items(buildId).catch(() => [])
	const lower = wanted.toLowerCase()
	const found =
		items.find((item) => (item.project?.title ?? '').toLowerCase() === lower) ??
		items.find((item) => (item.project?.title ?? '').toLowerCase().includes(lower)) ??
		items.find((item) => item.file_name.toLowerCase() === lower) ??
		items.find((item) => item.file_name.toLowerCase().includes(lower))
	if (!found) {
		return `Не нашёл «${wanted}». Контент сборки: ${items
			.slice(0, 30)
			.map((item) => item.project?.title ?? item.file_name)
			.join(', ')} (полный список — <<instance_mods|>>)`
	}
	return found
}

/**
 * Библиотеки-зависимости: на них держатся другие моды, и выключить или удалить
 * такую при разборе краша — сломать сборку сильнее, чем был сам краш.
 */
const LIB_NAME_RE = /\b(lib|library|api|core|config|framework|kotlin)\b/i
const LIB_NAME_PARTS = [
	'geckolib',
	'architectury',
	'citadel',
	'moonlight',
	'collective',
	'balm',
	'bookshelf',
	'clothconfig',
	'owo-lib',
	'puzzleslib',
	'iceberg',
	'curios',
	'kotlinforforge',
	'forgeconfig',
	'nightconfig',
	'azurelib',
	'smartbrainlib',
]
const libWarned = new Set<string>()
// ---- Зависимости: граф Modrinth и манифесты jar -----------------------------

interface ModrinthDep {
	project_id?: string | null
	version_id?: string | null
	dependency_type?: string | null
}

interface ModrinthVersionFull {
	id: string
	dependencies?: ModrinthDep[]
}

const DEP_LABELS: Record<string, string> = {
	required: 'обязательно',
	optional: 'опционально',
	embedded: 'встроено',
	incompatible: 'НЕСОВМЕСТИМО',
}

/** Modrinth batch: полные версии по id, пачками по 100 (лимит API). */
async function fetchModrinthVersions(ids: string[]): Promise<ModrinthVersionFull[]> {
	const out: ModrinthVersionFull[] = []
	for (let index = 0; index < ids.length; index += 100) {
		const chunk = ids.slice(index, index + 100)
		const response = await proxiedFetch(
			`https://api.modrinth.com/v2/versions?ids=${encodeURIComponent(JSON.stringify(chunk))}`,
			{ headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) },
		)
		if (!response.ok) continue
		const data = (await response.json()) as ModrinthVersionFull[]
		if (Array.isArray(data)) out.push(...data)
	}
	return out
}

/** Modrinth batch: названия проектов по id — для зависимостей вне сборки. */
async function fetchModrinthTitles(ids: string[]): Promise<Map<string, string>> {
	const out = new Map<string, string>()
	for (let index = 0; index < ids.length; index += 100) {
		const chunk = ids.slice(index, index + 100)
		try {
			const response = await proxiedFetch(
				`https://api.modrinth.com/v2/projects?ids=${encodeURIComponent(JSON.stringify(chunk))}`,
				{ headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) },
			)
			if (!response.ok) continue
			const data = (await response.json()) as { id: string; title: string }[]
			for (const project of Array.isArray(data) ? data : []) out.set(project.id, project.title)
		} catch {
			/* чужие названия — приятное дополнение, не обязанность */
		}
	}
	return out
}

/** Установленные моды, чья версия Modrinth ТРЕБУЕТ целевой проект: при
 * выключении или удалении цели сломаются именно они. */
async function requiredDependents(items: ContentItem[], target: ContentItem): Promise<string[]> {
	const targetProjectId = target.project?.id
	if (!targetProjectId) return []
	const versionIds = [...new Set(items.map((item) => item.version?.id).filter(Boolean) as string[])]
	if (versionIds.length === 0) return []
	const versions = await fetchModrinthVersions(versionIds).catch(() => [])
	if (versions.length === 0) return []
	const selfKey = target.file_path ?? target.file_name
	const dependents: string[] = []
	for (const version of versions) {
		const owner = items.find((item) => item.version?.id === version.id)
		if (!owner || (owner.file_path ?? owner.file_name) === selfKey) continue
		if (
			version.dependencies?.some(
				(dep) =>
					dep.project_id === targetProjectId &&
					((dep.dependency_type ?? 'required') as string) === 'required',
			)
		) {
			dependents.push(owner.project?.title ?? owner.file_name)
		}
	}
	return dependents
}

/** Свободный матч id зависимости с установленными модами: "geckolib"
 * находит geckolib-forge-1.20.1-4.4.9.jar. Короткие id — шум, пропускаем. */
function matchDepToItems(depId: string, items: ContentItem[]): ContentItem[] {
	const needle = depId.toLowerCase().replace(/[^a-z0-9]+/g, '')
	if (needle.length < 4) return []
	return items.filter((item) => {
		const hay = `${item.project?.title ?? ''} ${item.file_name}`.toLowerCase().replace(/[^a-z0-9]+/g, '')
		return hay.includes(needle)
	})
}

/** Что заявляет сам jar мода: вскрываем его во временную папку песочницы,
 * читаем fabric.mod.json / quilt.mod.json / mods.toml, убираем за собой. */
async function jarDependencies(
	jarPath: string,
): Promise<{ id: string; deps: { id: string; kind: string }[] } | string> {
	let tmp = ''
	try {
		tmp = await sandboxAbsolutePath('.jardeps')
		await invoke('plugin:portalrinth-archiver|archiver_unpack', { archive: jarPath, destDir: tmp })
	} catch (error) {
		if (tmp) await fs.remove(tmp, { recursive: true }).catch(() => {})
		return `не смог вскрыть jar: ${String(error).slice(0, 140)}`
	}
	const sep = tmp.includes('\\') ? '\\' : '/'
	const read = async (rel: string): Promise<string | null> => {
		try {
			return await fs.readTextFile(`${tmp}${sep}${rel}`)
		} catch {
			return null
		}
	}
	const deps: { id: string; kind: string }[] = []
	let id = ''
	const fabric = await read('fabric.mod.json')
	if (fabric) {
		try {
			const meta = JSON.parse(fabric) as {
				id?: string
				provides?: string[]
				depends?: Record<string, string>
				recommends?: Record<string, string>
				suggests?: Record<string, string>
			}
			id = meta.id ?? ''
			for (const key of Object.keys(meta.depends ?? {})) deps.push({ id: key, kind: 'обязательно' })
			for (const key of Object.keys(meta.recommends ?? {})) deps.push({ id: key, kind: 'опционально' })
			for (const key of Object.keys(meta.suggests ?? {})) deps.push({ id: key, kind: 'опционально' })
			for (const alias of meta.provides ?? []) deps.push({ id: alias, kind: 'алиас' })
		} catch {
			/* битый манифест — всё ещё jar */
		}
	}
	if (!fabric) {
		const quilt = await read('quilt.mod.json')
		if (quilt) {
			try {
				const meta = JSON.parse(quilt) as {
					quilt_loader?: { id?: string; depends?: ({ id?: string } | string)[] }
				}
				id = meta.quilt_loader?.id ?? id
				for (const dep of meta.quilt_loader?.depends ?? []) {
					const depId = typeof dep === 'string' ? dep : dep.id
					if (depId) deps.push({ id: depId, kind: 'обязательно' })
				}
			} catch {
				/* ignore */
			}
		}
	}
	if (!fabric && deps.length === 0) {
		const toml = (await read('META-INF/mods.toml')) ?? (await read('META-INF/neoforge.mods.toml'))
		if (toml) {
			id = /(?:^|\n)\s*modId\s*=\s*"([^"]+)"/.exec(toml)?.[1] ?? id
			for (const block of toml.split(/\[\[dependencies\.[^\]]*\]\]/).slice(1)) {
				const depId = /modId\s*=\s*"([^"]+)"/.exec(block)?.[1]
				if (!depId) continue
				const required = /mandatory\s*=\s*true|type\s*=\s*"required"/i.test(block)
				deps.push({ id: depId, kind: required ? 'обязательно' : 'опционально' })
			}
		}
	}
	await fs.remove(tmp, { recursive: true }).catch(() => {})
	return { id, deps }
}

function looksLikeLibrary(item: { project?: { title?: string } | null; file_name: string }): boolean {
	const title = item.project?.title ?? ''
	const file = item.file_name ?? ''
	const lowTitle = title.toLowerCase()
	const lowFile = file.toLowerCase()
	return (
		LIB_NAME_RE.test(title) ||
		LIB_NAME_RE.test(file) ||
		LIB_NAME_PARTS.some((part) => lowTitle.includes(part) || lowFile.includes(part))
	)
}

registerAiToolHandler(async (tool, args) => {
	switch (tool) {
		case 'instance_info': {
			const build = await resolveBuild(args)
			if (typeof build === 'string') return build
			return await describeBuild(build.id, true)
		}
		case 'launch_instance': {
			const build = await resolveBuild(args)
			if (typeof build === 'string') return build
			try {
				const fresh = await get(build.id).catch(() => null)
				if (fresh && !buildReady(fresh.install_stage)) {
					noteAgentThought(`Сборка «${build.name}» ещё устанавливается — жду конца`)
					const outcome = await waitInstallDone('', build.id, `«${build.name}»`, 180000)
					if (outcome !== 'готова') {
						return `«${build.name}» ещё не готова (${outcome}) — подожди и попробуй запустить снова.`
					}
				}
				await run(build.id)
				return `Запустил «${build.name}» — игра загружается. Для игры с друзьями: в игре Esc → «Открыть для сети», потом <<lan_publish|${build.id}>>.`
			} catch (error) {
				return `Не запустилась «${build.name}»: ${String(error).slice(0, 300)}`
			}
		}
		case 'stop_instance': {
			const build = await resolveBuild(args)
			if (typeof build === 'string') return build
			try {
				await kill(build.id)
				return `Закрыл игру «${build.name}».`
			} catch (error) {
				return `Не получилось закрыть: ${String(error).slice(0, 200)}`
			}
		}
		case 'lan_status': {
			const relays = await list_lan_relays().catch(() => [])
			if (relays.length === 0)
				return 'Ни одна сборка сейчас не запущена — LAN открывать нечему. Сначала <<launch_instance|id>>.'
			return relays
				.map((relay) => {
					const state =
						relay.state === 'live'
							? `открыт для друзей, адрес \`${relay.public_host}:${relay.public_port}\``
							: relay.state === 'ready'
								? `мир открыт в игре (порт ${relay.local_port}) — можно опубликовать: <<lan_publish|${relay.instance_id}>>`
								: relay.state === 'lost'
									? `связь потеряна${relay.error ? `: ${relay.error}` : ''}`
									: 'мир для сети ещё не открыт — в игре Esc → «Открыть для сети»'
					const players = relay.players.length ? `; в мире: ${relay.players.join(', ')}` : ''
					return `- «${relay.instance_name}» (${relay.account_name}): ${state}${players}`
				})
				.join('\n')
		}
		case 'lan_publish':
		case 'lan_stop': {
			const relays = await list_lan_relays().catch(() => [])
			const wanted = args.trim().toLowerCase()
			const relay =
				relays.find(
					(item) =>
						!wanted ||
						item.instance_id === args.trim() ||
						item.process_uuid === args.trim() ||
						item.instance_name.toLowerCase().includes(wanted),
				) ?? (relays.length === 1 ? relays[0] : undefined)
			if (!relay) {
				return relays.length === 0
					? 'Игра не запущена. Запусти сборку (<<launch_instance|id>>), открой мир, Esc → «Открыть для сети», и снова <<lan_publish|>>.'
					: `Какую? Запущены: ${relays.map((item) => `«${item.instance_name}» (${item.instance_id})`).join(', ')}`
			}
			if (tool === 'lan_stop') {
				await stop_lan_relay(relay.process_uuid).catch(() => {})
				return `Закрыл мир «${relay.instance_name}» для друзей.`
			}
			if (relay.state === 'live')
				return `Уже открыт. Адрес для друзей: \`${relay.public_host}:${relay.public_port}\` (дай его игроку именно так, в обратных кавычках — в чате он копируется кликом). Экран: [LAN](/lan)`
			if (relay.state === 'closed') {
				return 'Мир ещё не открыт в самой игре: зайди в мир, Esc → «Открыть для сети» → «Открыть мир», потом скажи — опубликую.'
			}
			try {
				const live = await start_lan_relay(relay.process_uuid)
				return live.public_host
					? `Готово, мир открыт для друзей. Адрес: \`${live.public_host}:${live.public_port}\` — пусть добавят его как сервер (дай адрес игроку в обратных кавычках — он копируется кликом). Экран: [LAN](/lan)`
					: `Публикую мир «${relay.instance_name}»… Адрес появится на экране [LAN](/lan) через пару секунд — потом снова <<lan_status|>>.`
			} catch (error) {
				return `Не удалось открыть мир: ${String(error).slice(0, 300)}. Экран /lan покажет подробности.`
			}
		}
		case 'update_mods': {
			const build = await resolveBuild(args)
			if (typeof build === 'string') return build
			try {
				await refresh_content_updates(build.id).catch(() => {})
				const items = await get_content_items(build.id)
				const updates = items.filter(
					(item) => item.has_update && item.update_version_id && item.file_path,
				)
				if (updates.length === 0) return `В «${build.name}» всё уже свежее — обновлять нечего.`
				await install_bulk_update_content(
					build.id,
					updates.map((item) => ({
						project_path: item.file_path!,
						version_id: item.update_version_id!,
					})),
				)
				return `Обновляю ${updates.length} в «${build.name}»: ${updates
					.slice(0, 15)
					.map((item) => item.project?.title ?? item.file_name)
						.join(', ')} — идёт в фоне. Точечно (один-два мода) — <<mod_update|сборка::мод>>.`
			} catch (error) {
				return `Обновление не удалось: ${String(error).slice(0, 300)}`
			}
		}
		case 'mod_update': {
			const [buildRaw = '', modsRaw = ''] = args.split('::').map((part) => part.trim())
			const build = await resolveBuild(buildRaw)
			if (typeof build === 'string') return build
			if (!modsRaw)
				return 'Формат: <<mod_update|сборка::мод1;;мод2>> — обновить только названные моды (всю сборку разом — <<update_mods|сборка>>)'
			try {
				await refresh_content_updates(build.id).catch(() => {})
				const items = await get_content_items(build.id)
				const names = modsRaw.split(';;').map((part) => part.trim()).filter(Boolean)
				const picked: { path: string; versionId: string; title: string }[] = []
				const fresh: string[] = []
				const missing: string[] = []
				for (const name of names) {
					const lower = name.toLowerCase()
					const item =
						items.find((x) => (x.project?.title ?? '').toLowerCase() === lower) ??
						items.find((x) => (x.project?.title ?? '').toLowerCase().includes(lower)) ??
						items.find((x) => x.file_name.toLowerCase() === lower) ??
						items.find((x) => x.file_name.toLowerCase().includes(lower))
					if (!item) {
						missing.push(name)
						continue
					}
					if (item.has_update && item.update_version_id && item.file_path) {
						picked.push({
							path: item.file_path,
							versionId: item.update_version_id,
							title: item.project?.title ?? item.file_name,
						})
					} else {
						fresh.push(item.project?.title ?? item.file_name)
					}
				}
				if (picked.length === 0) {
					const parts = [
						fresh.length ? `«${fresh.join('», «')}» уже свежие — обновлять нечего` : '',
						missing.length ? `не нашёл в сборке: ${missing.join(', ')}` : '',
					].filter(Boolean)
					return `Обновлений для названных модов нет${parts.length ? `: ${parts.join('; ')}` : ''}. Список того, что устарело: <<instance_mods|${build.name}::обновления>>.`
				}
				await install_bulk_update_content(
					build.id,
					picked.map((item) => ({
						project_path: item.path,
						version_id: item.versionId,
					})),
				)
				return `Обновляю в «${build.name}» (${picked.length}): ${picked
					.map((item) => item.title)
					.join(', ')} — идёт в фоне.${
					fresh.length ? ` Уже свежие, не трогал: ${fresh.join(', ')}.` : ''
				}${missing.length ? ` Не нашёл в сборке: ${missing.join(', ')}.` : ''}`
			} catch (error) {
				return `Обновление не удалось: ${String(error).slice(0, 300)}`
			}
		}
		case 'create_instance': {
			const [name = '', version = '', loaderRaw = 'vanilla', loaderVersion = ''] = args
				.split('::')
				.map((part) => part.trim())
			const loader = LOADERS[loaderRaw.toLowerCase()]
			if (!/^\d+\.\d+(\.\d+)?$|^\d{2}w\d{2}[a-z]$/i.test(version)) {
				return 'Нужна версия Minecraft, например <<create_instance|Моя сборка::1.21.1::fabric>>'
			}
			if (!loader)
				return `Ядро «${loaderRaw}» не знаю. Есть: fabric, forge, neoforge, quilt, vanilla.`
			try {
				const finalName = name || `${loaderLabel(loader)} ${version}`
				// One build per name: the answer comes only when the game and the
				// loader are fully downloaded, so mods can be added right away.
				const existing = (await list().catch(() => [])).find(
					(instance) => instance.name.toLowerCase() === finalName.toLowerCase(),
				)
				if (existing) return await reuseExistingBuild(existing, 420000)
				const job = await install_create_instance({
					name: finalName,
					gameVersion: version,
					loader,
					loaderVersion: loader === 'vanilla' ? null : loaderVersion || 'stable',
					iconPath: null,
				})
				const id = installJobInstanceId(job)
				if (!id) {
					return `Создаю сборку «${finalName}» — Minecraft ${version}, ${loaderLabel(loader)}. Ставится в фоне, прогресс в загрузках.`
				}
				noteAgentThought(`Скачиваю Minecraft ${version} и ядро ${loaderLabel(loader)} для «${finalName}»`)
				const outcome = await waitInstallDone(job.job_id, id, `«${finalName}»`, 420000)
				if (outcome === 'готова') {
					return `Сборка «${finalName}» готова — Minecraft ${version}, ${loaderLabel(loader)} (id: ${id}). Моды ставь через launcher_install.`
				}
				if (outcome.startsWith('установка не удалась')) {
					return `Сборка «${finalName}» не установилась: ${outcome.replace('установка не удалась: ', '')}. Разбери ошибку и попробуй снова — заново создавать эту же сборку не нужно.`
				}
				if (outcome === 'остановлено') return outcome
				return `Сборка «${finalName}» (id: ${id}) ещё скачивается (${outcome}) — проверь позже через <<instance_info|${id}>>, новую не создавай.`
			} catch (error) {
				return `Не создалась: ${String(error).slice(0, 300)}`
			}
		}
		case 'install_modpack': {
			const id = args.trim()
			if (!id) return 'Нужен id модпака (Modrinth) или cf:ID (CurseForge)'
			try {
				if (/^cf:\d+$/i.test(id)) {
					const projectId = id.slice(3)
					const title = `CurseForge ${projectId}`
					const existing = (await list().catch(() => [])).find(
						(instance) => instance.name.toLowerCase() === title.toLowerCase(),
					)
					if (existing) return await reuseExistingBuild(existing, 720000)
					const job = await install_create_modpack_instance({
						type: 'fromCurseforge',
						project_id: projectId,
						title,
					})
					const mid = installJobInstanceId(job)
					if (!mid) {
						return `Ставлю модпак с CurseForge (id ${projectId}) как новую сборку — прогресс в загрузках.`
					}
					noteAgentThought(`Скачиваю модпак CurseForge ${projectId} — жду конца скачивания`)
					const outcome = await waitInstallDone(job.job_id, mid, 'модпак с CurseForge', 720000)
					if (outcome === 'готова') {
						return `Модпак с CurseForge (id ${projectId}) установлен как сборка (id: ${mid}) — готов к запуску <<launch_instance|${mid}>>.`
					}
					if (outcome === 'остановлено') return outcome
					return `Модпак с CurseForge (id ${projectId}) ещё ставится (${outcome}), сборка (id: ${mid}) — проверь <<instance_info|${mid}>>, новую не создавай.`
				}
				const response = await proxiedFetch(
					`https://api.modrinth.com/v2/project/${encodeURIComponent(id)}`,
					{
						headers: { Accept: 'application/json' },
						signal: AbortSignal.timeout(12000),
					},
				)
				if (!response.ok) return `Модпак ${id} не найден на Modrinth`
				const project = (await response.json()) as {
					id: string
					title: string
					project_type: string
					icon_url?: string
					versions?: string[]
				}
				if (project.project_type !== 'modpack') {
					return `«${project.title}» — это не модпак (${project.project_type}); ставь его через launcher_install в сборку.`
				}
				const versionsResponse = await proxiedFetch(
					`https://api.modrinth.com/v2/project/${encodeURIComponent(project.id)}/version`,
					{ headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) },
				)
				const versions = versionsResponse.ok
					? ((await versionsResponse.json()) as {
							id: string
							version_number: string
							game_versions: string[]
							version_type: string
						}[])
					: []
				const version = versions.find((item) => item.version_type === 'release') ?? versions[0]
				if (!version) return `У «${project.title}» нет версий для установки`
				const existing = (await list().catch(() => [])).find(
					(instance) => instance.name.toLowerCase() === project.title.toLowerCase(),
				)
				if (existing) return await reuseExistingBuild(existing, 720000)
				const job = await install_create_modpack_instance({
					type: 'fromVersionId',
					project_id: project.id,
					version_id: version.id,
					title: project.title,
					icon_url: project.icon_url ?? null,
				})
				const mid = installJobInstanceId(job)
				if (!mid) {
					return `Ставлю модпак «${project.title}» ${version.version_number} как новую сборку — прогресс в загрузках.`
				}
				noteAgentThought(`Скачиваю модпак «${project.title}» — жду конца скачивания`)
				const outcome = await waitInstallDone(job.job_id, mid, `«${project.title}»`, 720000)
				if (outcome === 'готова') {
					return `Модпак «${project.title}» ${version.version_number} (Minecraft ${version.game_versions.join(', ')}) установлен как сборка (id: ${mid}) — готов к запуску <<launch_instance|${mid}>>.`
				}
				if (outcome === 'остановлено') return outcome
				return `Модпак «${project.title}» ещё ставится (${outcome}), сборка (id: ${mid}) — проверь <<instance_info|${mid}>>, новую не создавай.`
			} catch (error) {
				return `Модпак не установился: ${String(error).slice(0, 300)}`
			}
		}
		case 'instance_mods': {
			const [buildRaw = '', filterRaw = ''] = args.split('::').map((part) => part.trim())
			const build = await resolveBuild(buildRaw)
			if (typeof build === 'string') return build
			try {
				const items = await get_content_items(build.id)
				if (items.length === 0) return `В «${build.name}» контента нет — чистая сборка.`
				const filter = filterRaw.toLowerCase()
				const wantsUpdates = /^обнов|update|^апдейт/.test(filter)
				const wantsOff = /^выкл|disabled|^off/.test(filter)
				const filtered = filter
					? items.filter((item) => {
							if (wantsUpdates) return Boolean(item.has_update)
							if (wantsOff) return item.enabled === false
							const title = (item.project?.title ?? '').toLowerCase()
							return title.includes(filter) || item.file_name.toLowerCase().includes(filter)
						  })
					: items
				if (filtered.length === 0) {
					return wantsUpdates
						? `В «${build.name}» обновлений нет — всё свежее (проверял по данным Modrinth/CurseForge).`
						: wantsOff
							? `В «${build.name}» выключенного контента нет — включено всё.`
							: `По фильтру «${filterRaw}» в «${build.name}» ничего не нашлось (всего контента: ${items.length}). Попробуй короче: <<instance_mods|${build.name}::часть имени>>.`
				}
				const typeLabel: Record<string, string> = {
					mod: 'мод',
					resourcepack: 'ресурс-пак',
					shaderpack: 'шейдер',
					datapack: 'датапак',
				}
				const shown = filtered.slice(0, 200)
				const lines = shown.map((item) => {
					const kind = typeLabel[item.project_type] ?? item.project_type
					const state = item.enabled === false ? 'ВЫКЛ' : 'вкл'
					const version = item.version?.version_number ?? ''
					const mark = item.has_update ? ' [есть обновление]' : ''
					return `- ${kind} «${item.project?.title ?? item.file_name}» ${version} — ${state}${mark}${looksLikeLibrary(item) ? ' [библиотека]' : ''}`
				})
				const tail =
					filtered.length > 200
						? `\n…и ещё ${filtered.length - 200} — сузь фильтр: <<instance_mods|${build.name}::часть имени>>`
						: ''
				return `Контент «${build.name}»${filter ? ` (фильтр: «${filterRaw}»)` : ''} — ${filtered.length} из ${items.length}:\n${lines.join('\n')}${tail}\nОбновить названные: <<mod_update|сборка::мод1;;мод2>>. Выключить/включить — <<mod_toggle|…>>, удалить — <<mod_delete|…>>. Зависимости мода — <<mod_deps|сборка::мод>>.`
			} catch (error) {
				return `Список контента не получился: ${String(error).slice(0, 300)}`
			}
		}
		case 'mod_toggle': {
			const [buildRaw = '', modRaw = '', stateRaw = ''] = args.split('::').map((part) => part.trim())
			const build = await resolveBuild(buildRaw)
			if (typeof build === 'string') return build
			if (!modRaw) return 'Формат: <<mod_toggle|сборка::мод::вкл или выкл>>'
			const item = await findContentItem(build.id, modRaw)
			if (typeof item === 'string') return item
			const wantOn = /вкл|on|enable/i.test(stateRaw)
				? true
				: /выкл|off|disable/i.test(stateRaw)
					? false
					: item.enabled === false
			// Зависимость других модов: первый вызов предупреждает и ничего
			// не делает, повторный с теми же аргументами выполняет —
			// решение взвешено дважды, а зависимые не пострадали молча.
			const targetTitle = item.project?.title ?? item.file_name
			if (!wantOn) {
				const items = await get_content_items(build.id).catch(() => [])
				const dependents =
					items.length > 1 && item.project?.id ? await requiredDependents(items, item) : []
				if (dependents.length > 0 || looksLikeLibrary(item)) {
					const key = `${build.id}::${item.file_path ?? item.file_name}`
					if (!libWarned.has(key)) {
						libWarned.add(key)
						const holders = dependents.length
							? ` На нём держатся (${dependents.length}): ${dependents.slice(0, 12).join(', ')} — выключишь его, сломаются ОНИ, и сборка станет хуже, чем была до проблемы.`
							: ' По имени похоже на библиотеку: на таких модах обычно держатся другие.'
						return `СТОП: выключение «${targetTitle}» сломает зависимые моды.${holders} Краш указывает на библиотеку или зависимость? Настоящий виновник — мод, который использует её не той версией: проверь <<mod_deps|${build.name}::${targetTitle}>> и чини только виновника (обнови, выключи или замени ЕГО). Если игрок сам прямо попросил выключить именно этот мод — вызови ту же команду ещё раз, и я выполню.`
					}
					libWarned.delete(key)
				}
			}
			try {
				await toggle_disable_project(build.id, item.file_path ?? item.file_name, wantOn)
				// Слово «выключил» стоит чего-то только тогда, когда состояние в
				// сборке реально изменилось: перечитываем контент и сверяем,
				// иначе честно сообщаем, что нет.
				const after = await get_content_items(build.id).catch(() => [])
				const verified = after.find(
					(x) => (x.file_path ?? x.file_name) === (item.file_path ?? item.file_name),
				)
				const nowOn = verified ? verified.enabled !== false : wantOn
				if (nowOn !== wantOn) {
					return `Команду отправил, но состояние «${item.project?.title ?? item.file_name}» в «${build.name}» не изменилось (${nowOn ? 'всё ещё вкл' : 'всё ещё выкл'}) — проверь список контента сборки руками и скажи игроку правду.`
				}
				return `${wantOn ? 'Включил' : 'Выключил'} «${item.project?.title ?? item.file_name}» в «${build.name}» — проверил, состояние применилось.`
			} catch (error) {
				return `Не получилось переключить: ${String(error).slice(0, 300)}`
			}
		}
		case 'mod_delete': {
			const [first = '', second = '', third = ''] = args.split('::').map((part) => part.trim())
			const confirmed = Boolean(third) && /да|confirm|yes/i.test(third)
			const buildRaw = second ? first : ''
			const modsRaw = second || first
			const build = await resolveBuild(buildRaw)
			if (typeof build === 'string') return build
			if (!modsRaw) return 'Формат: <<mod_delete|сборка::мод1;;мод2::да>>'
			const names = modsRaw.split(';;').map((part) => part.trim()).filter(Boolean)
			const libHits = names.filter(
				(name) =>
					LIB_NAME_RE.test(name) ||
					LIB_NAME_PARTS.some((part) => name.toLowerCase().includes(part)),
			)
			const libNote = libHits.length
				? ` ВНИМАНИЕ: ${libHits.join(', ')} похоже на библиотеку — на ней держатся другие моды, удаление сломает их. Предупреди игрока об этом прямо в вопросе.`
				: ''
			// Само удаление: по клику «Да, удалить» его выполняет отложенное
			// подтверждение (минуя модель), повторный вызов с «::да» — тоже работает.
			const deleteNow = async (): Promise<string> => {
				const results: string[] = []
				for (const name of names) {
					const item = await findContentItem(build.id, name)
					if (typeof item === 'string') {
						results.push(`- ${name}: ${item}`)
						continue
					}
					try {
						await remove_project(build.id, item.file_path ?? item.file_name)
						results.push(`- удалил «${item.project?.title ?? item.file_name}»`)
					} catch (error) {
						results.push(`- «${item.project?.title ?? item.file_name}»: ${String(error).slice(0, 160)}`)
					}
				}
				return `Удаление в «${build.name}»:\n${results.join('\n')}`
			}
			if (!confirmed) {
				// Парковка: клик игрока по «Да, удалить» выполнит удаление сам,
				// без нового хода модели — «Хорошо, удаляю» без дела исключено.
				setPendingConfirm({
					question: `Удалить из «${build.name}»: ${names.join(', ')}?`,
					confirmOption: 'Да, удалить',
					cancelOption: 'Отмена',
					run: async (answer) => {
						if (/отмен|нет|не надо|не нужно|cancel|^no/i.test(answer)) {
							return `Отменил: ничего не стёрто — ${names.join(', ')} остаются в «${build.name}».`
						}
						return await deleteNow()
					},
				})
				const toggles = names.map((name) => `<<mod_toggle|${buildRaw || build.name}::${name}::выкл>>`).join(' ')
				return `Удаление необратимо, но сначала проверь, нельзя ли обойтись выключением: ${toggles} — это обратимо, файл остаётся в сборке и мод можно вернуть. Удаляй только когда это крайне необходимо: битый файл, дубль, ломающий загрузку, или игрок сам прямо велел стереть. Если удалять действительно нужно — спроси игрока: <<ask_user|Удалить из «${build.name}»: ${names.join(', ')}? Файлы модов будут стёрты.::Да, удалить;;Отмена>> — по клику «Да, удалить» лаунчер сам выполнит удаление и покажет итог, повторно вызывать mod_delete не нужно.${libNote}`
			}
			return await deleteNow()
		}
		case 'mod_deps': {
			const [buildRaw = '', modRaw = ''] = args.split('::').map((part) => part.trim())
			const build = await resolveBuild(buildRaw)
			if (typeof build === 'string') return build
			if (!modRaw) return 'Формат: <<mod_deps|сборка::мод>>'
			const items = await get_content_items(build.id).catch(() => [])
			if (items.length === 0) return `В «${build.name}» контента нет — зависимости смотреть не у чего.`
			const lower = modRaw.toLowerCase()
			const target =
				items.find((item) => (item.project?.title ?? '').toLowerCase() === lower) ??
				items.find((item) => (item.project?.title ?? '').toLowerCase().includes(lower)) ??
				items.find((item) => item.file_name.toLowerCase() === lower) ??
				items.find((item) => item.file_name.toLowerCase().includes(lower))
			if (!target) {
				return `Не нашёл «${modRaw}» в «${build.name}». Контент: ${items
					.slice(0, 30)
					.map((item) => item.project?.title ?? item.file_name)
					.join(', ')}`
			}
			const targetTitle = target.project?.title ?? target.file_name
			const projectTitleOf = new Map<string, string>()
			for (const item of items) {
				if (item.project?.id && item.project?.title) projectTitleOf.set(item.project.id, item.project.title)
			}
			const versionDeps = new Map<string, ModrinthDep[]>()
			const versionIds = [...new Set(items.map((item) => item.version?.id).filter(Boolean) as string[])]
			if (versionIds.length > 0) {
				const versions = await fetchModrinthVersions(versionIds).catch(() => [])
				for (const version of versions) versionDeps.set(version.id, version.dependencies ?? [])
			}
			const unknownProjectIds = new Set<string>()
			for (const deps of versionDeps.values()) {
				for (const dep of deps) {
					if (dep.project_id && !projectTitleOf.has(dep.project_id)) unknownProjectIds.add(dep.project_id)
				}
			}
			if (unknownProjectIds.size > 0) {
				for (const [key, title] of await fetchModrinthTitles([...unknownProjectIds])) {
					projectTitleOf.set(key, title)
				}
			}
			const requires: string[] = []
			const seenDeps = new Set<string>()
			const targetVersionId = target.version?.id
			if (targetVersionId && versionDeps.has(targetVersionId)) {
				for (const dep of versionDeps.get(targetVersionId) ?? []) {
					const name = dep.project_id ? (projectTitleOf.get(dep.project_id) ?? dep.project_id) : null
					if (!name || seenDeps.has(name)) continue
					seenDeps.add(name)
					const label = DEP_LABELS[dep.dependency_type ?? 'required'] ?? dep.dependency_type ?? 'зависимость'
					requires.push(`${name} (${label})`)
				}
			}
			let metaNote = ''
			if (requires.length === 0) {
				// Данных Modrinth нет (версия не привязана или сеть молчит) —
				// спросим сам jar: fabric.mod.json / mods.toml знают точно.
				const base = (await get_full_path(build.id).catch(() => '')).replace(/[\\/]+$/, '')
				const rel = (target.file_path ?? target.file_name).replace(/\\/g, '/').replace(/^\//, '')
				if (base && rel && /\.jar$/i.test(rel)) {
					const meta = await jarDependencies(`${base}/${rel}`)
					if (typeof meta === 'string') {
						metaNote = ` (метаданные jar: ${meta})`
					} else {
						for (const dep of meta.deps) {
							if (dep.kind === 'алиас' || seenDeps.has(dep.id)) continue
							seenDeps.add(dep.id)
							const hits = matchDepToItems(dep.id, items)
							const name = hits.length > 0 ? (hits[0].project?.title ?? hits[0].file_name) : dep.id
							if (seenDeps.has(name)) continue
							seenDeps.add(name)
							const where = hits.length > 0 ? '' : ' — в сборке НЕ НАЙДЕН, скорее всего не хватает мода'
							requires.push(`${name} (${dep.kind}${where})`)
						}
						if (meta.id) metaNote = ` (по метаданным jar это мод «${meta.id}»)`
					}
				}
			}
			const requiredBy: string[] = []
			const targetProjectId = target.project?.id
			if (targetProjectId) {
				for (const item of items) {
					if ((item.file_path ?? item.file_name) === (target.file_path ?? target.file_name)) continue
					const deps = item.version?.id ? versionDeps.get(item.version.id) : undefined
					if (!deps) continue
					const dep = deps.find((entry) => entry.project_id === targetProjectId)
					if (!dep) continue
					const label =
						dep.dependency_type && dep.dependency_type !== 'required'
							? ` (${DEP_LABELS[dep.dependency_type] ?? dep.dependency_type})`
							: ''
					requiredBy.push(`${item.project?.title ?? item.file_name}${label}`)
				}
			}
			const parts = [`Зависимости «${targetTitle}» в «${build.name}»${metaNote}:`]
			parts.push(
				requires.length
					? `Требует: ${requires.join(', ')}`
					: 'Требует: ничего обязательного по доступным данным (Modrinth или манифест jar).',
			)
			parts.push(
				requiredBy.length
					? `На нём держатся (${requiredBy.length}): ${requiredBy.join(', ')} — выключишь или удалишь его, сломаются ОНИ.`
					: 'На нём никто в сборке не держится (по данным Modrinth) — выключение или удаление другим модам не навредит.',
			)
			if (looksLikeLibrary(target)) {
				parts.push('Похоже на библиотеку — такие моды обычно нужны многим; сверяйся со списком «на нём держатся».')
			}
			parts.push('Правило: требуемая зависимость чужого мода — не трогай её; находи и чини зависимого виновника.')
			return parts.join('\n')
		}
		case 'fandom':
		case 'wiki':
			return await wikiLookup(args)
		case 'site_preview': {
			const path = args.trim() || 'site/index.html'
			try {
				const html = await sandboxRead(path)
				const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() || path
				return `Предпросмотр сайта готов: ${path} — игрок видит его карточкой в чате.\n@@SITE@@${JSON.stringify({ path, title })}`
			} catch (error) {
				return `Нет файла ${path} в песочнице (${String(error).slice(0, 120)})`
			}
		}
		default:
			return undefined
	}
})

/**
 * Portalus's launcher hands beyond search-and-install: describe a build, start
 * and stop the game, open the world to friends (LAN), update mods, create a
 * build or a modpack, read a guide on a wiki, preview a site built in the
 * sandbox. Registered once from App.vue; every result is a short plain text
 * the model can act on, cards ride along as markers.
 */
import { readSelectedBuild, registerAiToolHandler, searchWeb } from './ai-assistant'
import { describeBuild, loaderLabel } from './ai-build-info'
import { sandboxRead } from './ai-sandbox'
import {
	install_bulk_update_content,
	install_create_instance,
	install_create_modpack_instance,
	installJobInstanceId,
} from './install'
import { get_content_items, kill, list, refresh_content_updates, run } from './instance'
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
							? `открыт для друзей: ${relay.public_host}:${relay.public_port}`
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
				return `Уже открыт: адрес для друзей ${relay.public_host}:${relay.public_port}`
			if (relay.state === 'closed') {
				return 'Мир ещё не открыт в самой игре: зайди в мир, Esc → «Открыть для сети» → «Открыть мир», потом скажи — опубликую.'
			}
			try {
				const live = await start_lan_relay(relay.process_uuid)
				return live.public_host
					? `Готово, мир открыт для друзей. Адрес: ${live.public_host}:${live.public_port} — пусть добавят его как сервер.`
					: `Публикую мир «${relay.instance_name}»… Адрес появится на экране /lan через пару секунд.`
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
					.join(', ')} — идёт в фоне.`
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
				const job = await install_create_instance({
					name: name || `${loaderLabel(loader)} ${version}`,
					gameVersion: version,
					loader,
					loaderVersion: loader === 'vanilla' ? null : loaderVersion || 'stable',
					iconPath: null,
				})
				const id = installJobInstanceId(job)
				return `Создаю сборку «${name || version}» — Minecraft ${version}, ${loaderLabel(loader)}${id ? ` (id: ${id})` : ''}. Ставится в фоне; моды можно добавлять сразу через launcher_install с этим id.`
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
					const job = await install_create_modpack_instance({
						type: 'fromCurseforge',
						project_id: projectId,
						title: `CurseForge ${projectId}`,
					})
					return `Ставлю модпак с CurseForge (id ${projectId}) как новую сборку${installJobInstanceId(job) ? ` (id: ${installJobInstanceId(job)})` : ''} — прогресс в загрузках.`
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
				const job = await install_create_modpack_instance({
					type: 'fromVersionId',
					project_id: project.id,
					version_id: version.id,
					title: project.title,
					icon_url: project.icon_url ?? null,
				})
				return `Ставлю модпак «${project.title}» ${version.version_number} (Minecraft ${version.game_versions.join(', ')}) как новую сборку${installJobInstanceId(job) ? ` (id: ${installJobInstanceId(job)})` : ''} — прогресс в загрузках.`
			} catch (error) {
				return `Модпак не установился: ${String(error).slice(0, 300)}`
			}
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

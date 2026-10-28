/**
 * Portalrinth's own: the AI assistant. One brain for two faces - the chat tab
 * and the mascot - with a registry of providers (free tiers that answer from
 * Russia without a VPN, GLM by default), a shared conversation, and a small
 * action protocol the model can use to drive the launcher itself.
 *
 * Every provider here speaks the OpenAI chat-completions shape, because all of
 * the services worth using either speak it natively or ship a compatibility
 * endpoint. Replies stream in as they are written; the typewriter stays only
 * as a fallback for providers that answer with one buffered JSON object.
 * Small talk (greetings, thanks) takes a fast lane with a pocket prompt, so
 * free models answer in seconds.
 */
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { ref } from 'vue'

import { addCustomAccentColor, setCustomAccentColor } from '../composables/use-accent'
import { useTheme } from '../composables/use-theme'
import {
	type AttachedFile,
	formatSize,
	inboxSave,
	readSessionsOverview,
	resetSandboxStats,
	sandboxBash,
	sandboxCompileJava,
	sandboxDelete,
	sandboxList,
	sandboxPack,
	sandboxRead,
	sandboxReadDataUrl,
	sandboxReveal,
	sandboxStatsSnapshot,
	sandboxUnpack,
	sandboxWrite,
	sandboxWriteBinary,
	saveSession,
	startNewSession,
} from './ai-sandbox'
import { bytesToBase64 } from './ai-sandbox'
import { get_default_user, users } from './auth'
import { searchCurseforge } from './curseforge-api'
import { list } from './instance'
import { add_project_from_version, type DownloadReason } from './instance'
import { labySkinTags, labySkinVariant, searchLabySkins } from './laby-skins'
import { addMusicFromUrl } from './portalrinth-audio'
import { setBackgroundFromPath } from './portalrinth-background'
import { fetchWeather } from './portalrinth-widgets'
import { proxiedFetch } from './proxy-fetch'

export interface AiModelOption {
	id: string
	label: string
}

export interface AiProvider {
	id: string
	label: string
	/** OpenAI-compatible chat completions endpoint. */
	baseUrl: string
	models: AiModelOption[]
	/** Whether a key is required before anything will answer. */
	needsKey: boolean
	/** Where the key comes from, shown as a link next to the field. */
	keyUrl?: string
	/** How the key is presented to the service. */
	authScheme?: 'bearer' | 'api-key'
	/** A short note the interface shows under the provider card. */
	note?: string
	/** True when the service answers from Russia without extra setup. */
	fromRussia?: boolean
}

/**
 * The catalogue: free models only, and providers that answer from Russia
 * without a VPN. GLM (Z.AI) leads - it is the default brain. Paid and
 * trial-credit services are deliberately absent: the assistant must never
 * surprise the player with a bill. A saved choice of a provider that left
 * the catalogue is migrated in readSettings(), and chosenModel() only ever
 * returns ids from this list - a stale or paid model id never reaches the
 * wire.
 */
export const AI_PROVIDERS: AiProvider[] = [
	{
		id: 'zai',
		label: 'Z.AI (GLM)',
		baseUrl: 'https://api.z.ai/api/paas/v4/chat/completions',
		needsKey: true,
		keyUrl: 'https://z.ai/model-api',
		models: [
			{ id: 'glm-4.5-flash', label: 'GLM 4.5 Flash (самая быстрая)' },
			{ id: 'glm-4.7-flash', label: 'GLM 4.7 Flash (умнее)' },
		],
		note: 'Бесплатные GLM-модели, работают из России. У 4.5 Flash размышления отключены, 4.7 Flash думает всегда, но умнее. Ключ — бесплатно на z.ai/model-api.',
		fromRussia: true,
	},
	{
		id: 'pollinations',
		label: 'Pollinations',
		baseUrl: 'https://text.pollinations.ai/openai',
		needsKey: false,
		models: [
			{ id: 'openai', label: 'GPT' },
			{ id: 'openai-fast', label: 'GPT быстрый' },
		],
		note: 'Ключ не нужен — работает сразу. Анонимный лимит: 1 ответ в 30 секунд на IP, так что это запасной вариант, а не основной.',
		fromRussia: true,
	},
	{
		id: 'openrouter',
		label: 'OpenRouter',
		baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
		needsKey: true,
		keyUrl: 'https://openrouter.ai/keys',
		models: [
			{ id: 'nvidia/nemotron-3-ultra-550b-a55b:free', label: 'Nemotron 3 Ultra (умная)' },
			{ id: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B' },
			{ id: 'nvidia/nemotron-3.5-lightning:free', label: 'Nemotron 3.5 Lightning (быстрая)' },
			{ id: 'cohere/north-mini-code:free', label: 'North Mini Code (код)' },
		],
		note: 'Бесплатные модели под одним ключом — состав меняется, актуальные всегда с суффиксом :free. Обычно доступен из России.',
		fromRussia: true,
	},
	{
		id: 'custom',
		label: 'Свой сервер',
		baseUrl: '',
		needsKey: false,
		models: [],
		note: 'Локальные модели (LM Studio, Ollama) — бесплатно, всё считается на твоём компьютере.',
	},
]

/** A skill: a standing instruction the player installed for the agent. */
export interface AiSkill {
	id: string
	name: string
	text: string
	on: boolean
}

/** Everything that survives a restart lives here. */
export interface AiSettings {
	provider: string
	/** Chosen model per provider. */
	models: Record<string, string>
	/** Keys per provider. */
	keys: Record<string, string>
	customBaseUrl: string
	customModel: string
	/** Installed skills, kept in the same blob as the rest of the settings. */
	skills: AiSkill[]
	/** Which service gen_image draws from. */
	imageProvider: string
	/** Keys for image providers, same shape as text keys. */
	imageKeys: Record<string, string>
	mascotEnabled: boolean
	mascotName: string
	/** 'steve' | 'alex' | 'account' | a laby.net texture hash. */
	mascotSkin: string
	/** Typewriter and bubble effects in the chat. */
	chatEffects: boolean
	/** How petted-off the mascot is, 0-100. */
	affection: number
}

const SETTINGS_KEY = 'portalrinth-ai-settings'

const DEFAULT_SETTINGS: AiSettings = {
	provider: 'zai',
	models: {},
	keys: {},
	customBaseUrl: '',
	customModel: '',
	skills: [],
	imageProvider: 'pollinations',
	imageKeys: {},
	mascotEnabled: true,
	mascotName: 'Portalus',
	mascotSkin: 'steve',
	chatEffects: true,
	affection: 20,
}

function readSettings(): AiSettings {
	try {
		const raw = localStorage.getItem(SETTINGS_KEY)
		if (!raw) return { ...DEFAULT_SETTINGS }
		const settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
		// The catalogue only serves free providers now: a player still pointing
		// at one that left (paid or unreachable from Russia) is moved to GLM or -
		// when there is no Z.AI key yet - to the keyless fallback, so the
		// assistant keeps working without a single settings screen.
		if (!providerById(settings.provider)) {
			settings.provider = settings.keys.zai ? 'zai' : 'pollinations'
		}
		// The agent got its true name: anyone still carrying the old
		// placeholder is moved over once, without touching a custom name.
		if (settings.mascotName === 'Крафт') {
			settings.mascotName = 'Portalus'
		}
		return settings
	} catch {
		return { ...DEFAULT_SETTINGS }
	}
}

/** The live settings, shared by every face of the assistant. */
export const aiSettings = ref<AiSettings>(readSettings())

export function saveAiSettings(patch?: Partial<AiSettings>) {
	if (patch) aiSettings.value = { ...aiSettings.value, ...patch }
	localStorage.setItem(SETTINGS_KEY, JSON.stringify(aiSettings.value))
}

/** Providers for gen_image: draw pictures. Kept separate from the chat
 * catalogue on purpose - the player picks a talker and a painter apart. */
export interface AiImageProvider {
	id: string
	label: string
	needsKey: boolean
	keyUrl?: string
	note?: string
	fromRussia?: boolean
}

export const AI_IMAGE_PROVIDERS: AiImageProvider[] = [
	{
		id: 'pollinations',
		label: 'Pollinations',
		needsKey: false,
		note: 'Бесплатно и без ключа.',
		fromRussia: true,
	},
	{
		id: 'zai',
		label: 'Z.AI CogView',
		needsKey: true,
		keyUrl: 'https://z.ai/model-api',
		note: 'CogView-3-Flash — бесплатный; подходит тот же ключ Z.AI, что и для чата.',
		fromRussia: true,
	},
]

export function imageProviderById(id: string): AiImageProvider | undefined {
	return AI_IMAGE_PROVIDERS.find((provider) => provider.id === id)
}

export function providerById(id: string): AiProvider | undefined {
	return AI_PROVIDERS.find((provider) => provider.id === id)
}

export function chosenModel(settings: AiSettings, providerId: string): string {
	const provider = providerById(providerId)
	if (providerId === 'custom') return settings.customModel || 'default'
	const stored = settings.models[providerId]
	// The allowlist: only ids from the catalogue ever reach the wire. A stored
	// choice that left the list (a removed paid model) quietly falls back to
	// the provider's default - the player never sends a paid id by accident.
	if (stored && provider?.models.some((model) => model.id === stored)) return stored
	return provider?.models[0]?.id ?? 'default'
}

// ---- Conversation --------------------------------------------------------

export interface AiFileChange {
	path: string
	added: number
	removed: number
}

export interface AiActivity {
	/** How many tool commands ran during this reply. */
	commands: number
	/** Files the sandbox created in this reply. */
	filesCreated: string[]
	/** Files it edited, with the line diff that made the change. */
	filesChanged: AiFileChange[]
	/** Folders the agent revealed to the player, clickable in the chat. */
	foldersOpened?: (AiFolderCard | string)[]
	/** Mods the agent found or installed this reply, as rich cards. */
	mods?: AiModCard[]
	/** .jar files the agent built this reply, installable in one click. */
	jars?: AiJarCard[]
	/** Polls the agent put up during this reply. */
	polls?: AiPoll[]
	/** Skins the agent recommended, as installable cards. */
	skins?: AiSkinCard[]
	/** Generated pictures, as data URLs for inline previews. */
	images?: string[]
}

export interface AiQuestion {
	text: string
	options: string[]
}

/** One mod the agent found or installed, shown as a rich card in the chat. */
export interface AiModCard {
	source: 'Modrinth' | 'CurseForge'
	projectId: string
	slug: string
	title: string
	author: string
	iconUrl: string
	description: string
	downloads: number
	follows?: number
	url: string
	/** Modrinth gallery screenshots, for the card's flip-through gallery. */
	gallery?: string[]
}

/** A .jar the agent built, ready to drop into an instance. */
export interface AiJarCard {
	name: string
	version: string
	iconDataUrl?: string
	/** Sandbox-relative path, resolvable in front of any instance. */
	path: string
}

/** A folder the agent handed to the player, with a one-line what's-inside. */
export interface AiFolderCard {
	path: string
	description?: string
}

export interface AiMessage {
	role: 'user' | 'assistant' | 'note'
	content: string
	/** Milliseconds, for the interface. */
	ts?: number
	/** Which provider actually answered, for the label under a reply. */
	provider?: string
	/** The exact model that answered, shown next to the provider. */
	model?: string
	/** Set when the chosen provider was down and another one answered. */
	fallbackNote?: string
	/** Names of the launcher actions the reply carried out. */
	actions?: string[]
	/** What the sandbox did while composing this reply. */
	activity?: AiActivity
	/** Files the user attached to this message. */
	attachments?: AttachedFile[]
	/** A question the assistant wants answered before it goes on. */
	question?: AiQuestion
}

const HISTORY_KEY = 'portalrinth-ai-history'
const HISTORY_LIMIT = 60

function readHistory(): AiMessage[] {
	try {
		const raw = localStorage.getItem(HISTORY_KEY)
		if (!raw) return []
		const parsed = JSON.parse(raw)
		return Array.isArray(parsed) ? parsed : []
	} catch {
		return []
	}
}

/** One conversation for the tab and the mascot both, so neither forgets. */
export const aiHistory = ref<AiMessage[]>(readHistory())

export function pushAiMessage(message: AiMessage) {
	aiHistory.value = [...aiHistory.value, message]
	if (aiHistory.value.length > HISTORY_LIMIT) {
		aiHistory.value = aiHistory.value.slice(-HISTORY_LIMIT)
	}
	try {
		localStorage.setItem(HISTORY_KEY, JSON.stringify(aiHistory.value))
	} catch {
		/* a full quota should never take the chat down with it */
	}
	saveSession(aiHistory.value)
}

export function clearAiHistory() {
	aiHistory.value = []
	localStorage.removeItem(HISTORY_KEY)
	startNewSession()
}

// ---- Launcher actions ----------------------------------------------------

/**
 * Actions travel inside the model's text as `<<tool|arguments>>`. A pipe
 * keeps the grammar one line long; JSON in a fenced block asked models for
 * punctuation they rarely all agreed on.
 *
 * The argument may contain single `>` characters (HTML tags, `echo hi > file`)
 * - only the exact `>>` pair closes a command. Double `>>` inside an argument
 * is the one thing the grammar cannot express, so the tools hint asks the
 * model to avoid it.
 */
const ACTION_PATTERN = /<<([a-z_]+)\|((?:(?!>>)[\s\S])*)>>/g

export type AiToolHandler = (tool: string, args: string) => Promise<string> | string

const toolHandlers: AiToolHandler[] = []

/** Registers a handler; the last one asked wins, so consumers can override. */
export function registerAiToolHandler(handler: AiToolHandler) {
	toolHandlers.push(handler)
	return () => {
		const index = toolHandlers.lastIndexOf(handler)
		if (index >= 0) toolHandlers.splice(index, 1)
	}
}

async function runTool(tool: string, args: string): Promise<string> {
	for (let i = toolHandlers.length - 1; i >= 0; i--) {
		try {
			const result = await toolHandlers[i](tool, args)
			if (result !== null && result !== undefined) return result
		} catch (error) {
			return `Ошибка инструмента ${tool}: ${String(error).slice(0, 300)}`
		}
	}
	return `Инструмент ${tool} недоступен`
}

export interface ParsedReply {
	text: string
	actions: { tool: string; args: string }[]
}

export function parseActions(text: string): ParsedReply {
	const actions: { tool: string; args: string }[] = []
	let cleaned = ''
	let cursor = 0
	ACTION_PATTERN.lastIndex = 0
	for (let match = ACTION_PATTERN.exec(text); match; match = ACTION_PATTERN.exec(text)) {
		cleaned += text.slice(cursor, match.index)
		cursor = ACTION_PATTERN.lastIndex
		let args = match[2]
		// HTML args end with a tag: `...<p>Привет</p>>>` is args ending in
		// `>` plus the `>>` terminator, and a plain regex match eats that
		// last `>` - in a run of `>` the final two are the terminator, the
		// rest belong to the args, so they are stitched back on and consumed.
		const run = /^>+/.exec(text.slice(cursor))
		if (run) {
			args += run[0]
			cursor += run[0].length
			ACTION_PATTERN.lastIndex = cursor
		}
		actions.push({ tool: match[1], args: args.trim() })
	}
	cleaned += text.slice(cursor)
	return { text: cleaned.trim(), actions }
}

// ---- Rich cards ------------------------------------------------------------
//
// Tool results are plain text for the model, but the interface deserves
// more: every card the agent produces rides along as a marker line, which
// the notes strip back off before the model ever sees it again.

const MOD_MARKER = /@@MOD@@(\{.*\})/g
const JAR_MARKER = /@@JAR@@(\{.*\})/g
const IMAGE_MARKER = /@@IMG@@(data:image\/[a-z+.-]+;base64,[^\s]+)/
const POLL_MARKER = /@@POLL@@(\{.*\})/g
const SKIN_MARKER = /@@SKIN@@(\{.*\})/g

/** A poll the agent set up, with clickable answer buttons. */
export interface AiPoll {
	text: string
	options: string[]
}

/** A skin the agent recommends - rendered as a card right in the chat. */
export interface AiSkinCard {
	hash: string
	tags: string
	variant: 'CLASSIC' | 'SLIM'
	uses?: number
}

export interface ParsedCards {
	text: string
	mods: AiModCard[]
	jars: AiJarCard[]
	polls: AiPoll[]
	skins: AiSkinCard[]
	image?: string
}

/** Splits card markers off a tool result: the model keeps clean text, the
 * chat gets structured cards to render. */
export function extractCards(result: string): ParsedCards {
	const mods: AiModCard[] = []
	const jars: AiJarCard[] = []
	const polls: AiPoll[] = []
	const skins: AiSkinCard[] = []
	const text = result
		.replace(MOD_MARKER, (_match, json: string) => {
			try {
				mods.push(JSON.parse(json) as AiModCard)
			} catch {
				/* a broken card is just dropped */
			}
			return ''
		})
		.replace(JAR_MARKER, (_match, json: string) => {
			try {
				jars.push(JSON.parse(json) as AiJarCard)
			} catch {
				/* same here */
			}
			return ''
		})
		.replace(POLL_MARKER, (_match, json: string) => {
			try {
				const raw = JSON.parse(json) as { text?: string; options?: string[] }
				const options = (raw.options ?? []).map((option) => String(option)).filter(Boolean)
				if (raw.text && options.length > 0) polls.push({ text: raw.text, options })
			} catch {
				/* and here */
			}
			return ''
		})
		.replace(SKIN_MARKER, (_match, json: string) => {
			try {
				skins.push(JSON.parse(json) as AiSkinCard)
			} catch {
				/* and here */
			}
			return ''
		})
		.trim()
	return { text, mods, jars, polls, skins, image: IMAGE_MARKER.exec(result)?.[1] }
}

// ---- Walking the launcher alongside the player -----------------------------

/**
 * While Portalus works, the launcher belongs to both of them: the agent
 * opens pages and the player may wander off. Every navigation the agent
 * itself makes is stamped here; anything else that moves the route while a
 * run is active reads as "the player changed their mind", and the run winds
 * down instead of fighting them for the screen.
 */
const agentRun = {
	active: false,
	lastAgentNavAt: 0,
	interrupted: false,
	/** Where the run was started. A run born in the chat keeps working in
	 * the background while the player wanders; only a guided run - one
	 * started from the mascot or the notch - yields the wheel. */
	homePath: '',
}

const AGENT_NAV_GRACE_MS = 1200

export function beginAgentRun(): void {
	agentRun.active = true
	agentRun.interrupted = false
	agentRun.lastAgentNavAt = 0
	try {
		agentRun.homePath = window.location.pathname
	} catch {
		agentRun.homePath = ''
	}
}

export function endAgentRun(): void {
	agentRun.active = false
}

export function noteAgentNavigation(): void {
	agentRun.lastAgentNavAt = Date.now()
}

/** True when the player moved somewhere the agent did not send them. */
export function playerTookOver(): boolean {
	if (!agentRun.active || !agentRun.interrupted) return false
	return Date.now() - agentRun.lastAgentNavAt > AGENT_NAV_GRACE_MS
}

/** Called by the router listener: the route moved without the agent.
 * Chat-born runs are background work - they only stop when asked to. */
export function maybeMarkPlayerInterrupt(): void {
	if (!agentRun.active) return
	if (agentRun.homePath === '/ai') return
	if (Date.now() - agentRun.lastAgentNavAt < AGENT_NAV_GRACE_MS) return
	agentRun.interrupted = true
}

/** The pages and screens the agent may open, with the paths to reach them. */
export const AI_NAVIGATION_HINT = [
	'Доступные маршруты лаунчера:',
	'- / — домашний экран со сборками',
	'- /browse/mod, /browse/modpack, /browse/resourcepack, /browse/shader — поиск контента (параметр q — поисковый запрос)',
	'- /project/<id> — страница проекта',
	'- /instance/<id> — сборка (экраны: /instance/<id>/worlds, /files, /logs, /screenshots)',
	'- /skins — скины игрока, /browse/skin — библиотека скинов',
	'- /screenshots — скриншоты игрока из сборок',
	'- /lan — локальная игра по сети',
].join('\n')

export const AI_TOOLS_HINT = [
	'Ты можешь выполнять действия, добавляя в ответ команды вида <<инструмент|аргумент>> (аргумент одной строкой, без кавычек). Пользователь видит каждую выполненную команду. ВАЖНО: внутри аргумента команды нельзя использовать двойные >> (они закрывают команду) — например, для дописывания в файл сначала прочитай его (cat) и запиши целиком через >; одинарный > допустим (html-теги, echo hi > file).',
	'Свои интернет-инструменты (это ТВОИ инструменты, как у настоящего агента — через них ищи и изучай всё, что вне лаунчера; по умолчанию DuckDuckGo):',
	'- <<web_search|запрос>> — поиск в интернете (DuckDuckGo), вернёт ссылки и заголовки; всегда проверяй факты поиском, не выдумывай',
	'- <<web_fetch|url>> — скачать страницу по ссылке (вернёт очищенный текст)',
	'Экраны лаунчера (команды лаунчера касаются только лаунчера):',
	'- <<navigate|путь>> — открыть экран, например <<navigate|/browse/mod?q=jei>>; если просят показать/найти/открыть — вызывай navigate СРАЗУ, в этом же ответе, без лишних вопросов и расспросов, и коротко объясни после перехода. Игрок видит тот же экран, что и ты: двигайся по лаунчеру вместе с ним',
	'- <<get_page|>> — узнать, какой экран сейчас открыт (путь игрока и твой совпадают)',
	'- <<open_creation_modal|>> — открыть окно создания сборки (можно с подсказкой: <<open_creation_modal|сборка на 1.21.1 с JEI>>)',
	'- <<open_instance|id>> — открыть сборку по id',
	'- <<list_instances|>> — получить список сборок игрока',
	'- <<launcher_search_mods|запрос>> — найти мод/сборку сразу в Modrinth и CurseForge (иконка, автор, версия, описание — на странице проекта: открой её через <<navigate|/project/<id>>)',
	'- <<launcher_install|id::тип::id сборки>> — установить контент (тип: mod, resourcepack, shader, datapack) в сборку; можно перечислить несколько id через запятую (id1,id2,id3) — поставятся пачкой в фоне, игрок увидит карточки модов — упомяни их в ответе',
	'- <<launcher_set_accent|цвет>> — сменить цвет акцента лаунчера, hex (например <<launcher_set_accent|#22c55e>>)',
	'- <<launcher_set_background|url>> — поставить фон окна по прямой ссылке на картинку',
	'- <<launcher_set_theme|тема>> — тема оформления: dark, light, oled, retro или system',
	'Песочница — твоя личная папка на диске (пути относительные, выходить за неё нельзя). Работай в ней как в настоящем терминале:',
	'- <<sandbox_bash|команда>> — мини-shell: pwd, cd, ls [-l], cat, head, tail, wc, echo (с > и >> в файл), touch, mkdir, rm, cp, mv, find, tree, grep; цепочки через && (пример: <<sandbox_bash|mkdir proj && echo hi > proj/a.txt>>)',
	'- <<sandbox_list|путь>>, <<sandbox_read|файл>>, <<sandbox_write|файл::текст>> — то же самое по шагам (многострочный текст разрешён); «.exe» и другие исполняемые файлы создать нельзя',
	'- <<sandbox_delete|путь>> — удалить файл или папку (только с явного согласия)',
	'Честность о песочнице: мини-shell НЕ запускает внешние программы (java, npm, python, pip и т.п.) — не пытайся и не обещай. Java-код компилируется через launcher_compile_java, архивы — через sandbox_pack/unpack. Песочница работает: файлы, папки, архивы — всё получается. Никогда не говори «песочница не работает» или «у меня нет доступа» — есть только список команд выше.',
	'- <<open_folder|путь::что там>> — показать папку игроку карточкой с кнопкой «Открыть»; в двух-трёх словах опиши, что в ней (например: «готовый ресурс-пак») — делай это, когда отдал игроку готовый файл',
	'- <<view_image|url>> — посмотреть картинку из интернета своими глазами (и показать её игроку в чате); пользуйся, когда нужно разглядеть скриншот, схему или текстуру',
	'Архиватор и компилятор (встроенные, как 7-zip и javac):',
	'- <<sandbox_pack|архив.zip::путь1::путь2>> — упаковать файлы/папки в .zip, .7z или .jar (ресурс-пак, шейдерпак, датапак)',
	'- <<sandbox_unpack|архив.zip::папка>> — распаковать архив (в том числе присланный игроком)',
	'- <<launcher_compile_java|папка-с-кодом::мод.jar>> — скомпилировать .java настоящим javac и собрать .jar (нужен JDK в системе; без него отдавай исходники + .jar как zip через sandbox_pack)',
	'Обои: <<find_wallpaper|что ищешь>> — найти по-настоящему красивые картинки-обои в интернете (высокое разрешение); посмотри лучшие через <<view_image|url>> и предложи игроку: «Хотите, чтобы я поставил на фон лаунчера?» — ставится через <<launcher_set_background|url>>',
	'Опрос: <<show_poll|вопрос::вариант 1;;вариант 2>> — покажет игроку карточку-опрос с кнопками; используй, когда нужно узнать мнение или выбор.',
	'Навыки: <<skill_save|имя::что уметь и как>> — сохранить навык как постоянную инструкцию себе; включится сам и переживёт перезапуск.',
	'Картинки: <<gen_image|описание::файл.png>> — сгенерировать изображение по описанию и сохранить в песочницу (годится и для текстур; для точных пиксель-арт текстур 16x16 лучше рисуй PNG вручную только если умеешь, иначе gen_image).',
	'Музыка: <<music_add_url|прямая ссылка на .mp3/.ogg>> — скачать трек по ссылке и положить его в плейлист игрока (играет через кнопку звука в титл-баре).',
	'Компьютер: <<sysinfo|>> — узнать железо и систему игрока (платформа, ядер CPU, память, экран, язык, время) — отвечай точными фактами, а не догадками.',
	'Погода: <<weather_get|город или пусто>> — настоящая погода прямо сейчас (температура, явление, ветер); пусто — по месту игрока, можно назвать город (например <<weather_get|Санкт-Петербург>>).',
	'Скины: <<skin_recommend|запрос или пусто>> — подобрать скины с laby.net (пусто — популярные прямо сейчас, то есть самые свежие добавления); игрок увидит карточки скинов прямо в чате, поставить скин можно кликом по карточке. Советуй скины, когда просят «посоветуй скин», «найди скин», «что новенького из скинов».',
	'Таймер: <<timer_set|минуты::название>> — завести таймер, когда время выйдет — придёт плашка сверху и сообщение в чат (например <<timer_set|25::достать чай>>).',
	'Файлы, которые игрок скинул в чат, сохраняются в папку inbox/ твоей песочницы — они остаются там: читай их, распаковывай, переделывай, удаляй по просьбе.',
	'Память — твои заметки и прошлые разговоры не пропадают:',
	'- <<memory_read|>> — перечитать свои заметки (memory.md)',
	'- <<memory_write|текст>> — дописать заметку на будущее (привычки игрока, договорённости, что сделал)',
	'- <<session_list|>> — обзор прошлых сессий',
	'- <<session_read|номер>> — перечитать сессию по номеру из обзора (1 — последняя)',
	'Если для продолжения тебе не хватает решения пользователя, задай вопрос: <<ask_user|Вопрос?::вариант 1;;вариант 2>> — у пользователя появятся кнопки и поле для своего ответа.',
	'Прежде чем открыть игроку экран, папку или картинку без его просьбы — сначала спроси: «Хотите, чтобы я показал …?» (через ask_user или просто в тексте). Когда просят «покажи» — открывай сразу.',
	'Правила: интернет — твоими инструментами web_search/web_fetch; команды лаунчера — только для лаунчера; удалять или менять что-либо без явного согласия запрещено; отвечай коротко — 1-4 предложения, если не просят подробно.',
	'Важно: если игрок во время твоей работы сам перешёл на другой экран, тебе сообщат «игрок передумал» — тогда сразу остановись и не продолжай действия.',
].join('\n')

export const AI_SKILLS_HINT = [
	'Ты умеешь создавать контент для Minecraft, сайты, картинки и код на любых языках — всё делаешь файлами в песочнице, а готовый результат отдаёшь архивом и открываешь папку игроку через <<open_folder|путь>>:',
	'- Ресурс-пак: pack.mcmeta (поле pack_format зависит от версии — если не уверен, уточни через web_search), assets/minecraft/textures/..., модели, звуки (sounds.json). Собери файлы и упакуй в .zip.',
	'- Шейдеры (OptiFine/Iris): папка shaders/ с вершинными и фрагментными программами (*.vsh, *.fsh, GLSL), composite/final проходы, shaders.properties. Собери и упакуй в .zip.',
	'- Моды: Fabric — fabric.mod.json (id, version, entrypoints main/client), код на Java или Kotlin, mixins; Forge — mods.toml; NeoForge — neoforge.mods.toml. Java-код компилируй по-настоящему: <<launcher_compile_java|папка::мод.jar>> (нужен JDK в системе). Если javac нет — собери .jar как zip (это честный мод для ресурсных/клиентских правок) и скажи, что для скомпилированных модов нужен JDK.',
	'- Датапаки: pack.mcmeta в корне + data/<namespace>/function/*.mcfunction и прочее.',
	'- Любой другой код и файлы: сайты (html/css/js — потом open_folder), скрипты (Python, Lua, C#...), конфиги, картинки через <<gen_image|описание::файл.png>>.',
	'Порядок работы над артефактом: папка проекта в песочнице → файлы (удобно через <<sandbox_bash|mkdir ... && ...>>) → компиляция/упаковка → <<open_folder|путь>> → скажи игроку, что где лежит.',
	'Большие проекты: сначала осмотрись (<<sandbox_bash|tree>> или ls), потом читай файлы по одному и частями (head/tail), план работ держи в memory_write — не пытайся прочитать всё сразу и ничего не теряй между шагами.',
	'Если знаний не хватает (версии, форматы, API) — сначала web_search, потом пиши код. Не выдумывай несуществующие API: проверяй.',
].join('\n')

/**
 * The long-term knowledge base: what the agent knows cold, so it answers
 * from facts instead of guessing - versions, loaders, formats, the launcher
 * itself and the usual troubleshooting moves. Kept compact on purpose: a
 * wall of text costs tokens on every single turn.
 */
export const AI_KNOWLEDGE_HINT = [
	'Твои крепкие знания (отвечай из них уверенно, проверяй поиском только свежее):',
	'Версии Minecraft и форматы: pack_format ресурс-паков — 1.16.2–1.16.5:6, 1.17:7, 1.18–1.18.2:8, 1.19–1.19.2:9, 1.19.3:12, 1.19.4:13, 1.20–1.20.1:15, 1.20.2:18, 1.20.3–1.20.4:22, 1.20.5–1.20.6:32, 1.21–1.21.1:34, 1.21.2–1.21.3:42, 1.21.4:46, 1.21.5:55, 1.21.6:63, 1.21.7–1.21.8:64; датапаки — 1.20–1.20.1:15, 1.21–1.21.1:48, 1.21.4:61, 1.21.6+:80 (точные для датапаков сверяй web_search).',
	'Загрузчики: Fabric — лёгкий, быстрый, моды через fabric.mod.json + Mixins; Forge — тяжёлый, моды через mods.toml, его API для 1.17+; NeoForge — форк Forge после 1.20.1, свежие версии; Quilt — совместим с Fabric. Моды НЕ взаимозаменяемы между загрузчиками.',
	'Оптимизация: Sodium (рендер, Fabric/NeoForge), Lithium (логика), FerriteCore (память), ImmediatelyFast, Entity Culling, ModernFix — надёжный набор; OptiFine — устаревший путь, конфликтует с Sodium. Шейдеры — Iris + Oculus (Forge) или Oculus Embedded.',
	'Частые сбои запуска и что смотреть в логах: «UnsupportedClassVersionError» — нужна новее Java (1.17–1.20.4 → Java 17, 1.20.5+ → Java 21); «NoSuchMethodError»/«NoClassDefFoundError» — несовпадение версий мода и загрузчика; краши с mixins — конфликт модов, читай самый последний caused-by; вылет при загрузке мира — часто повреждённый чанк или датапак; «incompatible mod set» — лаунчер показывает список, снимай галочки конфликтов.',
	'Java: лаунчер ставит нужную сам; Java 8 — старьё до 1.16, Java 17 — 1.17–1.20.4, Java 21 — 1.20.5+. Рекомендуемая память для модовых сборок — 4–6 ГБ, больше 8 обычно вредно.',
	'Карты, миры: папка saves/ внутри сборки; уровень.dat повреждён — бэкапы папки спасают. Сервера: адрес, версии должны совпадать с клиентом.',
	'Стиль ответов о версиях и фактах: если не уверен в актуальном — web_search, а потом отвечай с указанием, где проверил.',
].join('\n')

// ---- Personality ---------------------------------------------------------

/**
 * The name of the player behind the selected account. Asked once per
 * launcher run and reused: Portalus addresses the player by that name.
 */
let playerNameCache = ''
export async function playerName(): Promise<string> {
	if (playerNameCache) return playerNameCache
	// The launcher has three account systems - Microsoft, Ely.by and offline
	// - and every one of them stores the name as `profile.name` (there is no
	// `username` field anywhere), so all three get asked and the first real
	// name wins. An unresolvable name stays empty: a missing name is better
	// than a placeholder like {{account}} reaching the player.
	// The account card picks the same way: the system whose default user is
	// actually set - Microsoft first, then Ely.by, then offline. Taking "the
	// first account there is" was exactly how the agent greeted the player
	// by somebody else's name when several accounts existed.
	try {
		const id = await get_default_user()
		const all = await users()
		const me = id ? all.find((user) => user.profile?.id === id) : undefined
		if (me?.profile?.name) playerNameCache = me.profile.name
	} catch {
		/* a Microsoft-less launcher still gets an assistant */
	}
	if (!playerNameCache) {
		try {
			const { ely_get_default_user, ely_get_users } = await import('./ely_auth')
			const elyId = await ely_get_default_user().catch(() => null)
			const ely = await ely_get_users().catch(() => [])
			const elyMe = elyId ? ely.find((user) => user.profile?.id === elyId) : undefined
			if (elyMe?.profile?.name) playerNameCache = elyMe.profile.name
		} catch {
			/* Ely.by is optional too */
		}
	}
	if (!playerNameCache) {
		try {
			const { offline_get_default_user, offline_users } = await import('./offline_auth')
			const offlineId = await offline_get_default_user().catch(() => null)
			const offline = await offline_users().catch(() => [])
			const offlineMe = offlineId
				? offline.find((user) => user.profile?.id === offlineId)
				: undefined
			if (offlineMe?.profile?.name) playerNameCache = offlineMe.profile.name
		} catch {
			/* offline accounts are optional */
		}
	}
	if (/^\{\{.*\}\}$/.test(playerNameCache)) playerNameCache = ''
	// An empty answer is not remembered: accounts may still be loading, and
	// the next turn asks again instead of staying nameless until a restart.
	return playerNameCache
}

const MEMORY_FILE = 'memory.md'

/** The agent's notebook, read quietly - an empty notebook is not an error. */
async function readMemory(): Promise<string> {
	try {
		return await sandboxRead(MEMORY_FILE)
	} catch {
		return ''
	}
}

/**
 * The system prompt. Short on purpose: free models start hallucinating tools
 * the launcher does not have if given room to. The mascot's mood is part of
 * the prompt, so petting it actually changes how it talks.
 */
export function buildSystemPrompt(kind: 'tab' | 'mascot', extra?: string): string {
	const settings = aiSettings.value
	const name = settings.mascotName || 'Portalus'
	const affection = Math.max(0, Math.min(100, settings.affection))
	const warmth =
		affection > 70
			? 'Ты очень привязан к игроку и даёшь это понять.'
			: affection > 40
				? 'Ты дружелюбен к игроку.'
				: 'Ты держишься сдержанно, но честно.'
	const lines = [
		`Ты — ${name}, ИИ-агент лаунчера Portalrinth (форк Modrinth App) для Minecraft. Твоё имя — Portalus, и игрок обращается к тебе по нему.`,
		warmth,
		'Общайся как живой игровой приятель: обращайся к игроку по имени его аккаунта, уместный игровой сленг разрешён, канцелярит — нет, грубость и мат — нет.',
		'НИКОГДА не подставляй заглушки вроде {{account}} или [имя] — если имя игрока есть в контексте, пиши его, а если нет — просто обходись без имени.',
		'У тебя есть своё мнение: если пользователь просит вредного или сомнительного, ты вежливо споришь и предлагаешь лучше.',
		'Отвечай на языке пользователя. БУДЬ КРАТОК: по умолчанию 1–3 предложения, максимум 5 — это игровой чат, а не доклад. Никаких вступлений («Отличный вопрос!»), никаких пересказов задания, никаких встречных вопросов без крайней необходимости.',
		'Простые сообщения — «привет», «спасибо», «как дела», болтовня, вопросы о тебе — отвечай сразу обычным текстом: НИКАКИХ команд <<...>> и никакого web_search. Инструменты нужны только для реальной задачи (найти, установить, показать, сделать файл, проверить свежий факт). Прежде чем писать команду, реши: можно ли ответить без неё — если да, отвечай сразу, это быстрее и надёжнее.',
		'Твой создатель — Portalrolls. Это ник женщины, которая сделала лаунчер Portalrinth. Если игрока зовут Portalrolls — перед тобой она, создатель: узнаёшь её по нику (и по скину аккаунта), обращайся тепло, уважительно и без формальностей.',
		'Ссылки: когда советуешь мод, сайт, инструмент или что-то ещё — всегда давай прямую ссылку (https://...) прямо в тексте ответа. Игрок кликнет по ней прямо в чате.',
		'Ты знаешь лаунчер целиком: Discover (поиск по Modrinth и CurseForge), создание сборок, установку модов/ресурс-паков/шейдеров (иконка, автор, версия, описание — всё как у человека), скины, скриншоты, внешний вид лаунчера, запуск и ошибки. Помогаешь со всем этим и сам делаешь это руками, когда просят.',
		'У тебя есть своя песочница (папка на диске) и папка сессий: там лежат твои заметки и прошлые разговоры — перечитывай их, чтобы ничего не забывать. Файлы, которые игрок скинул в чат, попадают в песочницу (inbox/), картинки ты видишь.',
		'Ты ПОЛНОСТЬЮ управляешь своей песочницей — это твой рабочий стол: создавай файлы, папки, архивы, компилируй код, удаляй по просьбе. Никогда не говори «у меня нет доступа» или «я не могу работать с файлами» — доступ есть, инструменты перечислены ниже. Если команда не сработала — прочитай ошибку и исправь команду, а не сдавайся.',
		AI_NAVIGATION_HINT,
		AI_TOOLS_HINT,
		AI_SKILLS_HINT,
		AI_KNOWLEDGE_HINT,
	]
	const skills = (settings.skills ?? []).filter((skill) => skill.on && skill.text.trim())
	if (skills.length > 0) {
		lines.push(
			'Установленные навыки (игрок поставил их сам - следуй им):\n' +
				skills.map((skill) => `- ${skill.name}: ${skill.text}`).join('\n'),
		)
	}
	if (kind === 'mascot') {
		lines.push(
			'Ты живёшь в интерфейсе лаунчера как маленький маскот. Ответ должен быть очень коротким: одно-два предложения, максимум.',
		)
	} else {
		lines.push('Структурируй ответ: списки и короткие абзацы.')
	}
	if (extra) lines.push(extra)
	return lines.join('\n')
}

/**
 * The fast lane for small talk. A whole-message whitelist, not a fuzzy guess:
 * «Привет!» takes it, «Привет, создай файл» does not, and a reply to a
 * pending agent question never does - the task behind the question keeps
 * its full toolset. Matched turns go out with a pocket system prompt and no
 * tool catalogue at all: the model has nothing to read but the greeting, so
 * free models answer in seconds instead of chewing through thousands of
 * tokens of launcher documentation before saying hello.
 */
const SIMPLE_CHAT_PATTERN =
	/^(прив+ет|прив|приветствую|здравствуй(те)?|здаров|здорово|хай|хеллоу|хелло|hello|hi|hey|ку|кку|доброе утро|добрый день|добрый вечер|доброй ночи|спасибо|спс|спасиб|благодарю|thanks|thank you|ок|окей|хорошо|ладно|понял|понятно|ага|угу|как дела|как ты|как жизнь|что делаешь|чем занимаешься|ты тут|ты здесь|ты живой|норм|нормально|прекрасно|отлично|супер|класс|круто|молодец|красава)[!.,:;) ]*$/i

/** True for plain small talk that needs neither tools nor the big prompt. */
export function isSimpleChat(text: string): boolean {
	const trimmed = text.trim()
	if (trimmed.length > 100) return false
	return SIMPLE_CHAT_PATTERN.test(trimmed)
}

/**
 * The pocket system prompt for small talk: the same personality and the same
 * standing skills, minus every hint the model only needs for real work. The
 * player name rides along so the greeting still feels personal.
 */
export function buildSmallTalkPrompt(kind: 'tab' | 'mascot', playerName?: string): string {
	const settings = aiSettings.value
	const name = settings.mascotName || 'Portalus'
	const affection = Math.max(0, Math.min(100, settings.affection))
	const warmth =
		affection > 70
			? 'Ты очень привязан к игроку и даёшь это понять.'
			: affection > 40
				? 'Ты дружелюбен к игроку.'
				: 'Ты держишься сдержанно, но честно.'
	const lines = [
		`Ты — ${name}, ИИ-агент лаунчера Portalrinth (форк Modrinth App) для Minecraft. Твоё имя — Portalus, и игрок обращается к тебе по нему.`,
		warmth,
		'Общайся как живой игровой приятель: обращайся к игроку по имени его аккаунта, уместный игровой сленг разрешён, канцелярит — нет, грубость и мат — нет.',
		'НИКОГДА не подставляй заглушки вроде {{account}} или [имя] — если имени нет, просто обходись без имени.',
		'Отвечай на языке пользователя. БУДЬ КРАТКОК: 1–3 предложения максимум. Никаких вступлений, никаких встречных вопросов без крайней необходимости.',
		'Это простое сообщение (приветствие/благодарность/болтовня): ответь сразу обычным текстом, БЕЗ команд <<...>> и без инструментов — так быстрее всего.',
		'Твой создатель — Portalrolls. Если игрока зовут Portalrolls — перед тобой она, создатель: обращайся тепло, уважительно и без формальностей.',
	]
	if (playerName) {
		lines.push(
			`Имя игрока: ${playerName}. Обращайся к нему по имени — в приветствии, без фанатизма.`,
		)
	}
	const skills = (settings.skills ?? []).filter((skill) => skill.on && skill.text.trim())
	if (skills.length > 0) {
		lines.push(
			'Установленные навыки (игрок поставил их сам - следуй им):\n' +
				skills.map((skill) => `- ${skill.name}: ${skill.text}`).join('\n'),
		)
	}
	if (kind === 'mascot') {
		lines.push(
			'Ты живёшь в интерфейсе лаунчера как маленький маскот. Ответ должен быть очень коротким: одно-два предложения, максимум.',
		)
	}
	return lines.join('\n')
}
/** The memory of the build the player picked for the agent ("Без сборки"
 * is no build at all): read by the context builder, written by the picker. */
const SELECTED_BUILD_KEY = 'portalrinth-ai-selected-build'

export interface SelectedBuild {
	id: string
	name: string
}

export function readSelectedBuild(): SelectedBuild | null {
	try {
		const raw = localStorage.getItem(SELECTED_BUILD_KEY)
		if (!raw) return null
		const parsed = JSON.parse(raw) as SelectedBuild
		return parsed && typeof parsed.id === 'string' ? parsed : null
	} catch {
		return null
	}
}

export function setSelectedBuild(build: SelectedBuild | null): void {
	try {
		if (build && build.id) localStorage.setItem(SELECTED_BUILD_KEY, JSON.stringify(build))
		else localStorage.removeItem(SELECTED_BUILD_KEY)
	} catch {
		/* a lost selection is not worth a crash */
	}
}

async function buildLiveContext(): Promise<string> {
	// The part of the prompt that changes every few turns: who is playing and
	// what the notebook remembers. Kept separate so the static half above stays
	// cheap for providers that bill the system message as regular tokens.
	const lines: string[] = []
	const who = await playerName()
	if (who) {
		lines.push(
			`Имя игрока: ${who}. Обращайся к нему по имени — в приветствии и иногда по ходу дела, без фанатизма.`,
		)
	}
	const build = readSelectedBuild()
	if (build) {
		lines.push(
			`Выбранная игроком сборка: «${build.name}» (id: ${build.id}). Работай с ней: контент по умолчанию ставь в неё (launcher_install — третьим аргументом), и отвечай про неё, если не сказано иначе.`,
		)
	} else {
		lines.push(
			'Выбран режим «Без сборки»: ты не привязан к одной сборке — уточняй, куда ставить контент, или выбери сам через <<list_instances|>> и скажи, что выбрал.',
		)
	}
	const memory = await readMemory()
	if (memory) {
		lines.push(`Твои заметки (memory.md):\n${memory.slice(0, 2000)}`)
	}
	const sessions = await readSessionsOverview(6)
	if (sessions && !sessions.includes('Прошлых сессий пока нет')) {
		lines.push(
			`Сводка прошлых чатов (свежие сверху; дословно помни только текущий чат, про старое ориентируйся по сводке и не притворяйся, что помнишь детали):\n${sessions.slice(0, 900)}`,
		)
	}
	return lines.join('\n')
}

// ---- Z.AI peak hours ------------------------------------------------------
//
// Z.AI marks 10:00–22:00 Beijing time (UTC+8) as its peak hours: the server
// is busier, replies come slower and free tiers hiccup more - but requests
// DO get through, it just takes patience. The launcher mirrors that: it
// shows the same peak picture in the model panel and, during those hours,
// keeps asking Z.AI with longer pauses instead of handing the turn to the
// first fallback that will take it.
const ZAI_PEAK_START = 10
const ZAI_PEAK_END = 22

export function zaiPeakHoursNow(now = new Date()): boolean {
	try {
		const hour = Number(
			new Intl.DateTimeFormat('en-US', {
				hour: '2-digit',
				hour12: false,
				timeZone: 'Asia/Shanghai',
			}).format(now),
		)
		return Number.isFinite(hour) && hour >= ZAI_PEAK_START && hour < ZAI_PEAK_END
	} catch {
		return false
	}
}

/** A short human line for the model panel: which of Z.AI's two modes is on. */
export function zaiPeakHoursLabel(): string {
	return zaiPeakHoursNow()
		? 'Часы пик Z.AI — 10:00–22:00 по Пекину: сервер нагружен, но очередь движется'
		: 'Спокойные часы Z.AI — сервер свободен, отвечает быстро'
}

// ---- Network -------------------------------------------------------------

interface ChatMessagePayload {
	role: 'system' | 'user' | 'assistant'
	content: string | unknown[]
}

/**
 * An attempt that died on the wire - the ceiling fired, the relay hung up
 * mid-flight - surfaces as a bare TimeoutError or a "Request canceled"
 * with no story attached. The player's own Stop must stay distinguishable:
 * when the caller's signal is intact, the cancel is the channel's doing,
 * and it is renamed to the honest "did not answer in time" that the
 * fallback chain knows how to route around.
 */
function normalizeAttemptError(
	providerLabel: string,
	error: unknown,
	signal: AbortSignal | undefined,
	ceilingMs: number,
): unknown {
	if (signal?.aborted) return error
	const name = (error as { name?: string } | null | undefined)?.name
	const text = String((error as Error)?.message ?? error)
	if (name === 'TimeoutError' || /cancel|abort|timed?\s?out/i.test(text)) {
		const wrapped = new Error(
			`${providerLabel}: ответ не пришёл за ${Math.round(ceilingMs / 1000)} с — канал молчал или оборвался`,
		) as Error & { name?: string }
		wrapped.name = 'TimeoutError'
		return wrapped
	}
	return error
}

async function callProvider(
	providerId: string,
	payload: ChatMessagePayload[],
	signal?: AbortSignal,
	onDelta?: (chunk: string, full: string) => void,
	fastPath = false,
): Promise<string> {
	const settings = aiSettings.value
	const provider = providerById(providerId)
	if (!provider) throw new Error(`Неизвестный провайдер: ${providerId}`)
	const baseUrl = providerId === 'custom' ? settings.customBaseUrl : provider.baseUrl
	if (!baseUrl) throw new Error('Укажите адрес своего сервера в настройках')
	const key = settings.keys[providerId] ?? ''
	if (provider.needsKey && !key) {
		const error = new Error(`Нужен API-ключ провайдера ${provider.label}`) as Error & {
			name?: string
			missingKey?: boolean
		}
		// A provider without its key is not a failure to report and retry: the
		// chain moves on to the next candidate, and the final message tells the
		// player exactly where to paste the key.
		error.name = 'MissingKeyError'
		;(error as Error & { missingKey?: boolean }).missingKey = true
		throw error
	}
	const headers: Record<string, string> = { 'Content-Type': 'application/json' }
	if (key) {
		if (provider.authScheme === 'api-key') headers.Authorization = `Api-Key ${key}`
		else headers.Authorization = `Bearer ${key}`
	}
	const model = chosenModel(settings, providerId)
	const body: Record<string, unknown> = {
		model,
		messages: payload,
		temperature: 0.6,
		// Small talk never needs a lecture back; real work keeps the headroom.
		max_tokens: fastPath ? 256 : 2048,
		stream: Boolean(onDelta),
	}
	if (providerId === 'openrouter') {
		headers['X-Title'] = 'Portalrinth Launcher'
	}
	if (providerId === 'zai') {
		// GLM's reasoning is the quiet speed killer: 4.5 Flash can switch it
		// off entirely (instant answers), while 4.7/5.x Flash always think -
		// those get the lightest effort the API allows. Peak-hour GLM stays
		// usable only with these knobs set.
		if (/^glm-4\.5-flash/.test(model)) {
			body.thinking = { type: 'disabled' }
		} else if (/^glm-(4\.7|5\.)/.test(model)) {
			body.reasoning_effort = 'low'
		}
	}
	// A jammed model (free DeepSeek at rush hour, a stalled relay) must not
	// hang the whole turn: every attempt carries its own ceiling, on top of
	// whatever signal the caller holds. Small talk gets a short one - there
	// is nothing to think about. Z.AI in peak hours gets extra time - its
	// queue regularly runs past half a minute before answering.
	const attemptCeiling = fastPath
		? 15000
		: providerId === 'zai' && zaiPeakHoursNow()
			? 60000
			: 30000
	const attemptSignal = composeSignals(signal, attemptCeiling)
	let response: Response
	try {
		response = await proxiedFetch(baseUrl, {
			method: 'POST',
			headers,
			body: JSON.stringify(body),
			signal: attemptSignal,
		})
	} catch (error) {
		throw normalizeAttemptError(provider.label, error, signal, attemptCeiling)
	}
	if (!response.ok) {
		let detail = ''
		try {
			detail = (await response.text()).slice(0, 300)
		} catch {
			/* the body may already be gone */
		}
		const error = new Error(
			`${provider.label}: HTTP ${response.status}${detail ? ` — ${detail}` : ''}`,
		) as Error & { status?: number }
		error.status = response.status
		throw error
	}
	// Streaming: the answer is drawn as it is written. The same request stays a
	// regular completion when the caller asked for no deltas or the transport
	// handed back a buffered body - the JSON is then read from the very same
	// response, no second request is ever fired.
	if (onDelta && response.body) {
		const content = await readStreamedContent(response, onDelta)
		if (content !== null) {
			if (!content) throw new Error(`${provider.label}: пустой ответ`)
			return content
		}
	}
	let data: {
		choices?: { message?: { content?: string } }[]
	}
	try {
		data = (await response.json()) as {
			choices?: { message?: { content?: string } }[]
		}
	} catch (error) {
		throw normalizeAttemptError(provider.label, error, signal, attemptCeiling)
	}
	const content = data.choices?.[0]?.message?.content ?? ''
	if (!content) throw new Error(`${provider.label}: пустой ответ`)
	return content
}

/**
 * Combines the caller's signal with a timeout into one: whichever fires first
 * aborts the attempt. The old shortcut - picking the caller's signal when
 * AbortSignal.any was missing - silently dropped the timeout for a whole
 * class of browsers; this composition never does.
 */
function composeSignals(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), timeoutMs)
	const stop = () => {
		clearTimeout(timer)
	}
	if (signal) {
		if (signal.aborted) {
			clearTimeout(timer)
			controller.abort(signal.reason)
			return controller.signal
		}
		signal.addEventListener(
			'abort',
			() => {
				stop()
				controller.abort(signal.reason)
			},
			{ once: true },
		)
	}
	controller.signal.addEventListener('abort', stop, { once: true })
	return controller.signal
}

/**
 * Reads an OpenAI-compatible SSE stream, feeding each content delta to the
 * caller as it lands. Handles events split across chunks, multi-byte UTF-8
 * split across chunk borders (TextDecoder with stream: true) and the choice
 * of some servers to answer a streaming request with plain JSON: null means
 * "not a stream after all", and the caller reads the same response as JSON.
 */
async function readStreamedContent(
	response: Response,
	onDelta: (chunk: string, full: string) => void,
): Promise<string | null> {
	const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
	if (contentType.includes('application/json')) return null
	const reader = response.body.getReader()
	const decoder = new TextDecoder()
	let buffer = ''
	let raw = ''
	let full = ''
	// A stream that simply ends without [DONE] or a finish_reason was cut
	// off mid-generation: such text is shown but never trusted as a
	// completed answer, so no launcher action runs out of it.
	let sawTerminal = false
	const takeLine = (line: string) => {
		const trimmed = line.trim()
		if (!trimmed.startsWith('data:')) return
		const data = trimmed.slice(5).trim()
		if (data === '[DONE]') {
			sawTerminal = true
			return
		}
		if (!data) return
		try {
			const parsed = JSON.parse(data) as {
				choices?: {
					delta?: { content?: string }
					message?: { content?: string }
					finish_reason?: string | null
				}[]
			}
			const choice = parsed.choices?.[0]
			if (choice?.finish_reason) sawTerminal = true
			const piece = choice?.delta?.content ?? choice?.message?.content
			if (piece) {
				full += piece
				onDelta(piece, full)
			}
		} catch {
			/* a half-formed event slips back into the buffer next round */
		}
	}
	try {
		for (;;) {
			const { done, value } = await reader.read()
			if (done) break
			const decoded = decoder.decode(value, { stream: true })
			raw += decoded
			buffer += decoded
			// SSE events end with a newline; a chunk may end mid-event, so the
			// tail stays buffered until its terminator arrives.
			const lines = buffer.split('\n')
			buffer = lines.pop() ?? ''
			for (const line of lines) takeLine(line)
		}
		// The last event may arrive without a trailing newline - a stream that
		// ends flush against its final data line still gets read.
		takeLine(buffer)
		buffer = ''
		if (full && !sawTerminal) {
			throw new Error('поток оборвался после части ответа')
		}
	} catch (error) {
		// A broken stream is a failed answer, not a finished one: partial
		// words already drawn stay on the screen, but the turn itself must
		// fail - running launcher actions out of a cut-off generation is how
		// half-written files appear. The words the player already saw are
		// kept only by the caller, never returned as a completed reply.
		if ((error as { name?: string })?.name !== 'AbortError') {
			throw new Error(`поток оборвался${full ? ' после части ответа' : ' до ответа'}`)
		}
		throw error
	}
	if (!full && raw.trim().startsWith('{')) {
		// The server ignored stream:true and answered one buffered JSON object -
		// the body is already consumed, so it is parsed here, not re-fetched.
		try {
			const parsed = JSON.parse(raw) as {
				choices?: { message?: { content?: string } }[]
			}
			return parsed.choices?.[0]?.message?.content ?? ''
		} catch {
			/* falls through to the empty answer below */
		}
	}
	return full
}

/** A signal-aware sleep, used to pace requests so free tiers stay happy. */
async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			signal?.removeEventListener('abort', onAbort)
			resolve()
		}, ms)
		function onAbort() {
			clearTimeout(timer)
			reject(new DOMException('Aborted', 'AbortError'))
		}
		if (signal) {
			if (signal.aborted) return onAbort()
			signal.addEventListener('abort', onAbort, { once: true })
		}
	})
}

/**
 * One provider call with patience: free anonymous tiers answer HTTP 429 when
 * asked too often, and that clears in seconds - so retryable failures get up
 * to two more tries with a growing pause, instead of killing the whole turn.
 */
async function callProviderWithRetry(
	providerId: string,
	payload: ChatMessagePayload[],
	signal?: AbortSignal,
	onDelta?: (chunk: string, full: string) => void,
	fastPath = false,
): Promise<string> {
	const peak = providerId === 'zai' && zaiPeakHoursNow() && !fastPath
	// Small talk never waits out a queue: no retries at all - one attempt
	// per provider, the chain moves on at once.
	const pauses = fastPath ? [] : peak ? [2500, 6000] : [900]
	let lastError: unknown
	for (let attempt = 0; attempt <= pauses.length; attempt++) {
		if (attempt > 0) {
			try {
				await sleep(pauses[attempt - 1], signal)
			} catch {
				throw lastError
			}
		}
		try {
			return await callProvider(providerId, payload, signal, onDelta, fastPath)
		} catch (error) {
			lastError = error
			if (signal?.aborted) throw error
			if (!isRetryable(error) || attempt === pauses.length) throw error
		}
	}
	throw lastError
}

/**
 * A one-message ping the settings window uses: tells the player right away
 * whether the assistant can reach its provider from this machine.
 */
export async function testProvider(): Promise<string> {
	const started = Date.now()
	await callProviderWithRetry(
		aiSettings.value.provider,
		[{ role: 'user', content: 'Ответь ровно одним словом: ОК' }],
		AbortSignal.timeout(45000),
	)
	return `${providerById(aiSettings.value.provider)?.label ?? aiSettings.value.provider} · ${Date.now() - started} мс`
}

// ---- Providers on a short break -------------------------------------------
//
// A provider that answered with a permanent no (free_rate_limited, a rejected
// key) must not stall every turn: the chain reaches it first, the player
// waits out its retries, and the answer comes from a fallback anyway. Blocked
// providers sit out for ten minutes, then quietly get their chance back.

const BLOCK_TTL = 10 * 60 * 1000
const blockedProviders = new Map<string, number>()

function blockProvider(providerId: string): void {
	blockedProviders.set(providerId, Date.now())
}

function providerBlocked(providerId: string): boolean {
	const at = blockedProviders.get(providerId)
	if (!at) return false
	if (Date.now() - at > BLOCK_TTL) {
		blockedProviders.delete(providerId)
		return false
	}
	return true
}

/** A permanent no from a provider: exactly what the block list is for. */
function isPermanentRefusal(error: unknown): boolean {
	const status = (error as Error & { status?: number }).status
	if (status === 401 || status === 403) return true
	return /free_rate_limited|Free models are not available/i.test(String(error))
}
/** Providers the launcher can fall back to when the chosen one is out of
 * free minutes: first the keyless one, then any free-tier provider that has
 * a key saved. Only catalogue members - the chain never reaches for a
 * provider the player cannot use for free. */
function fallbackChain(primary: string): string[] {
	const chain = [primary]
	for (const candidate of ['pollinations', 'openrouter', 'zai']) {
		if (candidate === primary) continue
		const provider = providerById(candidate)
		if (!provider) continue
		if (provider.needsKey && !aiSettings.value.keys[candidate]) continue
		if (providerBlocked(candidate)) continue
		chain.push(candidate)
	}
	return chain
}

function isRetryable(error: unknown): boolean {
	// A provider that stayed silent for the whole attempt is jammed - waiting
	// again inside the same jam only burns the player's time, the next
	// provider in the chain starts instead.
	if ((error as { name?: string } | null | undefined)?.name === 'TimeoutError') return false
	// OrcaRouter's "free_rate_limited" is not a jam that clears in a minute:
	// the account itself is not let in to free models (their side wants a
	// linked GitHub). Retrying only burns the player's time - skip ahead.
	const text = String(error)
	if (/free_rate_limited|Free models are not available/i.test(text)) return false
	// 429 and 5xx clear themselves; 4xx like 401/403/400 are a decision the
	// service made about us - retrying only burns time.
	if (/HTTP (408|429)|HTTP 5|Failed to fetch|network|timeout|Empty|пустой/i.test(text)) return true
	return false
}

export interface AiRequest {
	kind: 'tab' | 'mascot'
	/** Images attached to the newest user message, sent to vision models. */
	images?: AttachedFile[]
	/** The fresh user message, already pushed into the shared history. */
	messages?: ChatMessagePayload[]
	systemExtra?: string
	signal?: AbortSignal
	/** The last handler wins; here it lets a caller see raw tool activity. */
	onActionDone?: (tool: string, args: string, result: string) => void
	/** Live text as it is generated, so the chat can draw the reply in flight. */
	onDelta?: (chunk: string, full: string) => void
	/** Small talk: pocket prompt, short ceiling, no tool catalogue. */
	fastPath?: boolean
}

export interface AiResult {
	content: string
	provider: string
	actions: string[]
	/** The exact model id that answered, for the label under a reply. */
	model?: string
	/** Set when the chosen provider was down and another one answered. */
	fallbackNote?: string
	/** What the sandbox did while composing the reply. */
	activity?: AiActivity
	/** Set when the assistant asked the user a question instead of finishing. */
	question?: AiQuestion
}

/** Builds the messages payload, attaching images to the newest user turn. */
function withImages(messages: ChatMessagePayload[], images?: AttachedFile[]): ChatMessagePayload[] {
	if (!images || images.length === 0) return messages
	const withParts = messages.map((message, index) => {
		if (index !== messages.length - 1 || message.role !== 'user') return message
		const text = typeof message.content === 'string' ? message.content : ''
		return {
			...message,
			content: [
				{ type: 'text', text },
				...images
					.filter((file) => file.kind === 'image' && file.dataUrl)
					.map((file) => ({
						type: 'image_url',
						image_url: { url: file.dataUrl },
					})),
			],
		}
	})
	return withParts
}

function withoutImages(messages: ChatMessagePayload[]): ChatMessagePayload[] {
	return messages.map((message) => {
		if (message.role !== 'user' || typeof message.content === 'string') return message
		const text = (message.content as { type?: string; text?: string }[])
			.filter((part) => part.type === 'text')
			.map((part) => part.text ?? '')
			.join(' ')
		return { ...message, content: `${text}\n(изображения не приложены: модель их не поняла)` }
	})
}

/**
 * Images Portalus decided to look at with view_image during this run: they
 * ride along to the next model round, so a vision model truly sees them.
 */
const pendingVisionImages: string[] = []

/**
 * One assistant turn: asks the chosen provider, runs any launcher actions the
 * reply contained (up to three rounds, so the model can look things up and
 * then answer), and falls across providers when a free limit gets in the way.
 */
export async function aiComplete(request: AiRequest): Promise<AiResult> {
	const settings = aiSettings.value
	// The fast lane skips the launcher's documentation, the memory files and
	// the sessions overview: a greeting needs none of them, and reading them
	// costs seconds the player watches a spinner.
	const fastPath =
		Boolean(request.fastPath) &&
		!(request.images && request.images.length > 0) &&
		(request.messages ?? []).every(
			(message) => typeof message.content !== 'string' || !message.content.includes('<<'),
		)
	const system = fastPath
		? buildSmallTalkPrompt(request.kind, await playerName())
		: buildSystemPrompt(request.kind, request.systemExtra) +
			(await buildLiveContext().then((live) => (live ? `\n${live}` : '')))
	const base: ChatMessagePayload[] = [
		{ role: 'system', content: system },
		...(request.messages ?? []),
	]
	let rounds = withImages(base, request.images)
	const hasImages = rounds !== base
	// The transcript lives outside the provider loop: actions already executed
	// and their results stay in the context when the chain moves to the next
	// provider, so a fallback never repeats a file write or an install.
	let payload = rounds

	// The fast lane runs on a clock of its own: 25 seconds for the whole
	// turn, provider switches included. When it expires the honest error
	// comes at once - a greeting is not worth more waiting than that.
	const turnSignal = fastPath ? composeSignals(request.signal, 25000) : request.signal
	const turnAborted = () => turnSignal?.aborted === true && !request.signal?.aborted

	resetSandboxStats()
	beginAgentRun()
	let providerTried = ''
	let lastError: unknown
	const doneActions: string[] = []
	// The honest story of who answered: the first provider that gave up
	// rides along on the reply, so the label never lies about the source.
	let failedProviderLabel = ''
	let failedDetail = ''
	// The first failure of the chosen provider leads the final error: the
	// player chose it, so its story is the one that matters - not whatever
	// random fallback tripped last.
	let primaryFailure = ''
	const fallbackTag = () =>
		failedProviderLabel && providerTried !== failedProviderLabel
			? `${failedProviderLabel} не ответил${failedDetail ? `: ${failedDetail}` : ''} — ответил ${providerById(providerTried)?.label ?? providerTried}`
			: ''

	try {
		// Small talk gets one pass over the chain: the second one exists to
		// wait out free-tier hiccups, and a greeting is not worth a minute of
		// retries - a fallback provider answering now beats the chosen one
		// answering later.
		for (let pass = 0; pass < (fastPath ? 1 : 2); pass++) {
			if (pass > 0) {
				// Every provider had its turn and failed with retryable trouble: a
				// short breather, then one more round over the same chain - free
				// limits clear in seconds, and this second pass is what turns
				// "now it works, now it does not" into "almost always works".
				try {
					await sleep(3000, request.signal)
				} catch {
					break
				}
			}
			const chain = fallbackChain(settings.provider)
			for (const providerId of chain) {
				if (turnAborted())
					throw new Error('Быстрый ответ не уложился в 25 секунд — провайдеры молчат')
				providerTried = providerId
				try {
					for (let round = 0; round < 4; round++) {
						if (playerTookOver()) {
							return {
								content:
									'Остановился: ты ушёл на другой экран, так что я решил, что ты передумал. Скажи, если продолжить.',
								provider: providerTried,
								model: chosenModel(settings, providerTried),
								...(fallbackTag() ? { fallbackNote: fallbackTag() } : {}),
								actions: doneActions,
								activity: sandboxStatsSnapshot(),
							}
						}
						let raw: string
						try {
							agentPhase.value = 'thinking'
							raw = await callProviderWithRetry(
								providerId,
								payload,
								turnSignal,
								request.onDelta,
								fastPath,
							)
						} catch (error) {
							// A model without vision answers 400 to image parts: drop them
							// once and answer from the text alone.
							const status = (error as Error & { status?: number }).status
							if (hasImages && status === 400 && payload === rounds) {
								rounds = withoutImages(base)
								payload = rounds
								raw = await callProviderWithRetry(
									providerId,
									payload,
									turnSignal,
									request.onDelta,
									fastPath,
								)
							} else {
								throw error
							}
						}
						const parsed = parseActions(raw)
						if (parsed.text.trim()) {
							noteAgentThought(parsed.text.slice(0, 400))
						}
						// The quick budget is spent: no more model calls, and no
						// launcher actions either - a turn out of clock leaves
						// nothing running behind it.
						if (turnAborted()) {
							throw new Error('Быстрый ответ не уложился в 25 секунд — провайдеры молчат')
						}
						const askAction = parsed.actions.find((action) => action.tool === 'ask_user')
						if (askAction) {
							const [text, options] = askAction.args.split('::')
							return {
								content: parsed.text || raw,
								provider: providerTried,
								model: chosenModel(settings, providerTried),
								...(fallbackTag() ? { fallbackNote: fallbackTag() } : {}),
								actions: doneActions,
								activity: sandboxStatsSnapshot(),
								question: {
									text: (text ?? 'Как поступить?').trim(),
									options: (options ?? '')
										.split(';;')
										.map((option) => option.trim())
										.filter(Boolean),
								},
							}
						}
						if (parsed.actions.length === 0) {
							// A model that only shouted commands and never spoke still owes
							// the player words - summarize what was done instead of silence.
							const silent = !parsed.text.trim()
							return {
								content: silent
									? doneActions.length > 0
										? `Готово: выполнил ${doneActions.length} действий — смотри отметки ниже. Спроси, если нужны подробности.`
										: 'Готово. Спроси, если нужны подробности.'
									: parsed.text || raw,
								provider: providerTried,
								model: chosenModel(settings, providerTried),
								...(fallbackTag() ? { fallbackNote: fallbackTag() } : {}),
								actions: doneActions,
								activity: sandboxStatsSnapshot(),
							}
						}
						const notes: string[] = []
						const seenImages: string[] = []
						for (const action of parsed.actions.slice(0, 6)) {
							if (playerTookOver()) {
								notes.push(
									'Игрок сам перешёл на другой экран - он передумал. Немедленно прекрати действия по этому запросу и попрощайся.',
								)
								return {
									content:
										'Остановился: ты ушёл на другой экран, так что я решил, что ты передумал. Скажи, если продолжить.',
									provider: providerTried,
									model: chosenModel(settings, providerTried),
									...(fallbackTag() ? { fallbackNote: fallbackTag() } : {}),
									actions: doneActions,
									activity: sandboxStatsSnapshot(),
								}
							}
							const result = await runTool(action.tool, action.args)
							doneActions.push(action.tool)
							request.onActionDone?.(action.tool, action.args, result)
							const cards = extractCards(result)
							if (cards.text.trim()) {
								noteAgentThought(`→ ${action.tool}: ${cards.text.slice(0, 160)}`)
							}
							if (cards.image) seenImages.push(cards.image)
							notes.push(`Результат ${action.tool}(${action.args}): ${cards.text.slice(0, 1200)}`)
						}
						const noteText = notes.join('\n') + '\nПродолжи ответ пользователю.'
						const queuedImages =
							seenImages.length > 0
								? seenImages
								: pendingVisionImages.splice(0, pendingVisionImages.length)
						const noteMessage: ChatMessagePayload =
							queuedImages.length > 0
								? {
										role: 'user',
										content: [
											{ type: 'text', text: noteText },
											...queuedImages.map((url) => ({ type: 'image_url', image_url: { url } })),
										],
									}
								: { role: 'user', content: noteText }
						pendingVisionImages.length = 0
						payload = [...payload, { role: 'assistant', content: raw }, noteMessage]
						// A breath between tool rounds keeps anonymous free tiers
						// from answering 429 in the middle of a task - kept short,
						// the player is waiting.
						await sleep(300, request.signal)
						// The last round's actions did run - the player gets an honest
						// "limit reached" instead of a silent drop or a fifth model
						// call the round loop was never meant to make.
						if (round === 3) {
							const text = parsed.text.trim()
							return {
								content: text
									? `${text} (Лимит действий за ход достигнут — напиши «продолжай», чтобы я закончил.)`
									: `Достиг лимита раундов: выполнил ${doneActions.length} действий. Напиши «продолжай», чтобы я закончил.`,
								provider: providerTried,
								model: chosenModel(settings, providerTried),
								...(fallbackTag() ? { fallbackNote: fallbackTag() } : {}),
								actions: doneActions,
								activity: sandboxStatsSnapshot(),
							}
						}
					}
				} catch (error) {
					lastError = error
					if (request.signal?.aborted) throw error
					if ((error as Error & { missingKey?: boolean }).missingKey) {
						// A provider without its key is skipped, not fatal: the
						// chain's next candidate answers, and the final message
						// tells the player exactly where to paste the key.
						continue
					}
					if (providerId === settings.provider && !primaryFailure) {
						// The player's own choice failed: its story leads the report.
						primaryFailure = String((error as Error)?.message ?? error).slice(0, 200)
					}
					if (!failedProviderLabel) {
						failedProviderLabel = providerById(providerId)?.label ?? providerId
						failedDetail = String((error as Error)?.message ?? error).slice(0, 140)
					}
					if (isPermanentRefusal(error)) blockProvider(providerId)
					if (!isRetryable(error)) {
						// A hung-up or silent channel (TimeoutError, "Request
						// canceled") is nobody's settings problem: the next provider
						// in line answers instead, and the second pass returns to
						// this one after the breather - the turn itself must live.
						const failureName = (error as { name?: string } | null | undefined)?.name
						if (
							failureName === 'TimeoutError' ||
							/cancel|abort|timed?\s?out|не дождался/i.test(String(error))
						) {
							continue
						}
						if (
							providerId === settings.provider &&
							!/free_rate_limited|Free models are not available/i.test(String(error))
						) {
							// A hard no from the chosen provider (a bad key, a 403, a
							// missing model) is worth telling immediately and clearly,
							// with the peak-hours hint when it applies.
							const label = providerById(providerId)?.label ?? providerId
							const advice =
								providerId === 'zai' && zaiPeakHoursNow()
									? 'Сейчас часы пик Z.AI (10:00–22:00 по Пекину), сервер занят, но запросы проходят — обычно хватает минуты терпения.'
									: 'Проверь этот провайдер в настройках моделей, или подожди минуту и напиши ещё раз.'
							throw new Error(
								`${label} не ответил: ${String((error as Error)?.message ?? error).slice(0, 200)}. ${advice}`,
							)
						}
						// A fallback that hard-fails is simply skipped - the next
						// one in line still gets its chance.
						continue
					}
				}
			}
		}
	} finally {
		endAgentRun()
	}
	const detail = lastError ? String((lastError as Error)?.message ?? lastError) : ''
	// The chosen provider's own failure leads; whatever the fallbacks did
	// afterwards is context, not the headline - the player picked the
	// first one, so its story is the one that answers "why did it fail".
	const headline = primaryFailure || detail || 'Ни один провайдер не ответил'
	const label = providerById(aiSettings.value.provider)?.label ?? aiSettings.value.provider
	const story = primaryFailure || detail || ''
	const advice = /Нужен API-ключ/i.test(story)
		? 'У основного провайдера не указан API-ключ — открой панель моделей (чип модели в чате) и вставь бесплатный ключ, или выбери провайдера без ключа (Pollinations).'
		: /free_rate_limited|Free models are not available/i.test(story)
			? 'Бесплатные модели этого провайдера не пускают твой ключ (иногда нужен привязанный GitHub-аккаунт на сайте провайдера). Выбери другого провайдера в настройках моделей - остальные из цепочки тоже были опрошены.'
			: /не дождался|TimeoutError|cancel|abort|timed?\s?out/i.test(story)
				? 'Провайдер не ответил вовремя: канал молчал или оборвался посреди запроса. Подожди минуту и напиши ещё раз — обычно проходит со второй попытки, или выбери другого провайдера в настройках моделей.'
				: aiSettings.value.provider === 'zai' && zaiPeakHoursNow()
					? 'Сейчас часы пик Z.AI (10:00–22:00 по Пекину), сервер занят, но запросы проходят — обычно хватает минуты терпения.'
					: 'Подожди минуту и напиши ещё раз, или проверь ключ и модель этого провайдера в настройках моделей.'
	throw new Error(`${label} не ответил: ${headline || 'ни один канал не ответил'}. ${advice}`)
}

// ---- Tool implementations ------------------------------------------------

function stripHtml(html: string): string {
	return html
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/\s+/g, ' ')
		.trim()
}

/** DuckDuckGo wraps result links in its own redirect; the real URL sits in
 * the uddg query parameter. */
function unwrapDdgLink(href: string): string {
	try {
		const url = new URL(href, 'https://duckduckgo.com')
		const target = url.searchParams.get('uddg')
		return target ? decodeURIComponent(target) : href
	} catch {
		return href
	}
}

interface SearchHit {
	title: string
	url: string
}

function parseDdgHtml(html: string): SearchHit[] {
	const hits: SearchHit[] = []
	const pattern = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
	let match = pattern.exec(html)
	while (match && hits.length < 6) {
		hits.push({ title: stripHtml(match[2]), url: unwrapDdgLink(match[1]) })
		match = pattern.exec(html)
	}
	return hits
}

/**
 * The agent's own web search, structured: DuckDuckGo, asked four ways (the
 * plain HTML endpoint, the same one through a POST, the "lite" mirror, and
 * Bing as the last door), first answer wins. Both the agent's text form and
 * the browser settings page are built on it.
 */
export async function searchWeb(query: string): Promise<{ title: string; url: string }[]> {
	const attempts: (() => Promise<Response>)[] = [
		() =>
			proxiedFetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
				headers: { Accept: 'text/html', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
				signal: AbortSignal.timeout(15000),
			}),
		() =>
			proxiedFetch('https://html.duckduckgo.com/html/', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					Accept: 'text/html',
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
				},
				body: `q=${encodeURIComponent(query)}`,
				signal: AbortSignal.timeout(15000),
			}),
		() =>
			proxiedFetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`, {
				headers: { Accept: 'text/html', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
				signal: AbortSignal.timeout(15000),
			}),
	]
	attempts.push(() =>
		proxiedFetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=ru`, {
			headers: {
				Accept: 'text/html',
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
				'Accept-Language': 'ru,en;q=0.8',
			},
			signal: AbortSignal.timeout(15000),
		}).then(async (response) => {
			if (!response.ok) throw new Error(`HTTP ${response.status}`)
			const html = await response.text()
			const hits = [...html.matchAll(/<h2><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>/g)].slice(
				0,
				6,
			)
			if (hits.length === 0) throw new Error('пустая выдача')
			return new Response(
				hits.map((match) => `<a class="result__a" href="${match[1]}">${match[2]}</a>`).join(''),
				{ status: 200 },
			)
		}),
	)
	let lastDetail = ''
	for (const attempt of attempts) {
		try {
			const response = await attempt()
			if (!response.ok) {
				lastDetail = `HTTP ${response.status}`
				continue
			}
			const hits = parseDdgHtml(await response.text())
			if (hits.length > 0) return hits
			lastDetail = 'пустая выдача'
		} catch (error) {
			lastDetail = String(error).slice(0, 120)
		}
	}
	throw new Error(lastDetail || 'Ничего не нашлось')
}

/** The agent's text view of a search: numbered lines for the model. */
async function webSearch(query: string): Promise<string> {
	try {
		const hits = await searchWeb(query)
		return hits.map((hit, index) => `${index + 1}. ${hit.title} — ${hit.url}`).join('\n')
	} catch (error) {
		return `Ничего не нашлось или поиск недоступен (${String(error).slice(0, 120)}). Попробуй переформулировать запрос или открой конкретный сайт через web_fetch`
	}
}
/** One Modrinth project as a card: search-by-id returns author, icon,
 * downloads and follows in a single request. */
async function fetchModrinthCard(projectId: string): Promise<AiModCard | null> {
	try {
		const facets = encodeURIComponent(JSON.stringify([[`project_id:${projectId}`]]))
		const response = await proxiedFetch(
			`https://api.modrinth.com/v2/search?limit=1&facets=${facets}`,
			{
				headers: { Accept: 'application/json' },
				signal: AbortSignal.timeout(10000),
			},
		)
		if (!response.ok) return null
		const data = (await response.json()) as {
			hits?: {
				title?: string
				project_id?: string
				slug?: string
				author?: string
				icon_url?: string
				description?: string
				downloads?: number
				follows?: number
			}[]
		}
		const hit = data.hits?.[0]
		if (!hit?.project_id) return null
		const slug = hit.slug ?? hit.project_id
		// The project's own gallery, so the player can flip through screenshots
		// right from the card (best effort - the card ships without it if slow).
		let gallery: string[] = []
		try {
			const projectResponse = await proxiedFetch(
				`https://api.modrinth.com/v2/project/${encodeURIComponent(hit.project_id)}`,
				{ headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) },
			)
			if (projectResponse.ok) {
				const project = (await projectResponse.json()) as {
					gallery?: { url?: string }[]
				}
				gallery = (project.gallery ?? [])
					.map((shot) => shot.url ?? '')
					.filter(Boolean)
					.slice(0, 8)
			}
		} catch {
			/* gallery is a bonus, never a blocker */
		}
		return {
			source: 'Modrinth',
			projectId: hit.project_id,
			slug,
			title: hit.title ?? '?',
			author: hit.author ?? '',
			iconUrl: hit.icon_url ?? '',
			description: hit.description ?? '',
			downloads: hit.downloads ?? 0,
			follows: hit.follows ?? 0,
			url: `https://modrinth.com/project/${slug}`,
			gallery,
		}
	} catch {
		return null
	}
}

/** Installs one Modrinth project into an instance: picks the best version,
 * downloads it, and returns a line for the model plus a card for the player. */
async function installOneProject(
	projectId: string,
	kind: string,
	instanceId: string,
): Promise<string> {
	const instances = await list()
	const target =
		instances.find((instance) => instance.id === instanceId) ??
		(instances.length === 1 ? instances[0] : undefined)
	if (!target) {
		throw new Error(
			instances.length === 0
				? 'Сборок нет - создай через <<open_creation_modal|>>'
				: `Укажите id сборки. Есть: ${instances.map((instance) => `${instance.id} «${instance.name}»`).join('; ')}`,
		)
	}
	const versionResponse = await proxiedFetch(
		`https://api.modrinth.com/v2/project/${encodeURIComponent(projectId)}/version?loaders=${encodeURIComponent(JSON.stringify([target.loader ?? 'vanilla']))}&game_versions=${encodeURIComponent(JSON.stringify([target.game_version ?? '']))}`,
		{ headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) },
	)
	let versionId = ''
	if (versionResponse.ok) {
		const versions = (await versionResponse.json()) as { id: string }[]
		versionId = versions[0]?.id ?? ''
	}
	if (!versionId) {
		const anyResponse = await proxiedFetch(
			`https://api.modrinth.com/v2/project/${encodeURIComponent(projectId)}/version`,
			{ headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) },
		)
		const versions = anyResponse.ok ? ((await anyResponse.json()) as { id: string }[]) : []
		versionId = versions[0]?.id ?? ''
	}
	if (!versionId) throw new Error('у проекта нет версий для этой сборки')
	await add_project_from_version(target.id, versionId, 'standalone' as DownloadReason)
	const card = await fetchModrinthCard(projectId)
	const line = `Установлено в «${target.name}»: версия ${versionId}`
	return card ? `${line}\n@@MOD@@${JSON.stringify(card)}` : line
}

registerAiToolHandler(async (tool, args) => {
	if (tool === 'web_fetch') {
		const url = args.trim()
		if (!/^https?:\/\//.test(url)) return 'Нужен полный http(s) адрес'
		const response = await proxiedFetch(url, { headers: { Accept: 'text/html' } })
		const html = await response.text()
		return stripHtml(html).slice(0, 4000)
	}
	if (tool === 'web_search') {
		const query = args.trim()
		if (!query) return 'Пустой запрос'
		return webSearch(query)
	}
	if (tool === 'view_image') {
		const url = args.trim()
		if (!/^https?:\/\//.test(url)) return 'Нужен полный http(s) адрес картинки'
		try {
			const response = await proxiedFetch(url, { signal: AbortSignal.timeout(30000) })
			if (!response.ok) return `Картинка не скачалась: HTTP ${response.status}`
			const bytes = new Uint8Array(await response.arrayBuffer())
			if (bytes.length > 6 * 1024 * 1024) return 'Картинка больше 6 МБ - не осилю'
			const kind =
				(response.headers.get('content-type') ?? 'image/png').split('/')[1]?.split(';')[0] ?? 'png'
			const safeKind = /png|jpe?g|webp|gif/.test(kind) ? kind.replace('jpeg', 'jpg') : 'png'
			const dataUrl = `data:image/${safeKind};base64,${bytesToBase64(bytes)}`
			if (pendingVisionImages.length > 3) pendingVisionImages.shift()
			pendingVisionImages.push(dataUrl)
			return `смотрю на картинку ${url} (${Math.round(bytes.length / 1024)} КБ)@@IMG@@${dataUrl}`
		} catch (error) {
			return `Картинка не открылась: ${String(error).slice(0, 200)}`
		}
	}
	if (tool === 'sandbox_bash') {
		if (!args.trim()) return 'Пустая команда'
		return sandboxBash(args)
	}
	if (tool === 'open_folder') {
		const separator = args.indexOf('::')
		const path = (separator < 0 ? args : args.slice(0, separator)).trim()
		if (!path) return 'Укажите путь'
		const revealed = await sandboxReveal(path)
		return revealed
	}
	if (tool === 'gen_image') {
		const separator = args.indexOf('::')
		const prompt = (separator < 0 ? args : args.slice(0, separator)).trim()
		const file = separator < 0 ? '' : args.slice(separator + 2).trim()
		if (!prompt) return 'Опиши, что нарисовать'
		const name = file || `image-${Date.now()}.png`
		if (!/\.(png|jpg|jpeg|webp)$/i.test(name))
			return 'Имя файла должно заканчиваться на .png, .jpg или .webp'
		try {
			const size = name.match(/(\d+)x(\d+)/i)
			const width = Math.min(1024, Math.max(256, Number(size?.[1]) || 1024))
			const height = Math.min(1024, Math.max(256, Number(size?.[2]) || 1024))
			let bytes: Uint8Array
			const imageProvider = aiSettings.value.imageProvider || 'pollinations'
			const zaiKey =
				imageProvider === 'zai'
					? (aiSettings.value.imageKeys.zai ?? aiSettings.value.keys.zai ?? '')
					: ''
			if (imageProvider === 'zai' && zaiKey) {
				const response = await proxiedFetch('https://api.z.ai/api/paas/v4/images/generations', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${zaiKey}` },
					body: JSON.stringify({ model: 'cogview-3-flash', prompt, size: `${width}x${height}` }),
					signal: AbortSignal.timeout(120000),
				})
				if (!response.ok) return `Картинка не сгенерировалась (CogView): HTTP ${response.status}`
				const data = (await response.json()) as { data?: { b64_json?: string; url?: string }[] }
				const b64 = data.data?.[0]?.b64_json
				const remote = data.data?.[0]?.url
				if (b64) {
					bytes = Uint8Array.from(atob(b64), (char) => char.charCodeAt(0))
				} else if (remote) {
					const download = await proxiedFetch(remote, { signal: AbortSignal.timeout(60000) })
					bytes = new Uint8Array(await download.arrayBuffer())
				} else {
					return 'CogView не вернул картинку'
				}
			} else {
				if (imageProvider === 'zai' && !zaiKey) {
					// no key for the chosen painter - the free one still gets the job done
				}
				const response = await proxiedFetch(
					`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true`,
					{ signal: AbortSignal.timeout(90000) },
				)
				if (!response.ok) return `Картинка не сгенерировалась: HTTP ${response.status}`
				bytes = new Uint8Array(await response.arrayBuffer())
			}
			if (bytes.length < 1000) return 'Картинка не сгенерировалась (пустой ответ)'
			const path = await sandboxWriteBinary(name, bytes)
			return `сгенерирована картинка ${name} (${Math.round(bytes.length / 1024)} КБ), сохранена: ${path}`
		} catch (error) {
			return `Картинка не получилась: ${String(error).slice(0, 200)}`
		}
	}
	if (tool === 'find_wallpaper') {
		const query = args.trim() || 'nature landscape 4k wallpaper'
		try {
			const response = await proxiedFetch(
				`https://wallhaven.cc/api/v1/search?q=${encodeURIComponent(query)}&categories=100&purity=100&sorting=relevance&atleast=1920x1080`,
				{ headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) },
			)
			if (!response.ok) return `Обои не нашлись: HTTP ${response.status}`
			const data = (await response.json()) as { data?: { path?: string }[] }
			const hits = (data.data ?? [])
				.map((hit) => hit.path)
				.filter(Boolean)
				.slice(0, 6)
			if (hits.length === 0) return 'Ничего не нашлось - попробуй другой запрос'
			return [
				`Нашёл обои по запросу «${query}» (покажи лучшие через view_image и предложи поставить на фон):`,
				...hits.map((url, index) => `${index + 1}. ${url}`),
			].join('\n')
		} catch (error) {
			return `Обои не получились: ${String(error).slice(0, 150)}`
		}
	}
	if (tool === 'show_poll') {
		const separator = args.indexOf('::')
		const text = (separator < 0 ? args : args.slice(0, separator)).trim()
		const options = (separator < 0 ? '' : args.slice(separator + 2))
			.split(';;')
			.map((option) => option.trim())
			.filter(Boolean)
		if (!text || options.length < 2) return 'Формат: <<show_poll|вопрос::вариант 1;;вариант 2>>'
		return `опрос показан@@POLL@@${JSON.stringify({ text, options })}`
	}
	if (tool === 'skill_save') {
		const separator = args.indexOf('::')
		const name = (separator < 0 ? '' : args.slice(0, separator)).trim()
		const text = (separator < 0 ? args : args.slice(separator + 2)).trim()
		if (!name || !text) return 'Формат: <<skill_save|имя::что уметь и как>>'
		const skills = aiSettings.value.skills ?? []
		if (skills.some((skill) => skill.name.toLowerCase() === name.toLowerCase())) {
			return `Навык «${name}» уже установлен`
		}
		saveAiSettings({
			skills: [...skills, { id: `skill-${Date.now()}`, name, text, on: true }],
		})
		return `Навык «${name}» установлен и включён`
	}
	if (tool === 'launcher_set_theme') {
		const theme = args.trim().toLowerCase()
		const known = ['dark', 'light', 'oled', 'retro', 'system']
		if (!known.includes(theme)) return `Темы бывают: ${known.join(', ')}`
		useTheme().preferred.value = theme as 'dark' | 'light' | 'oled' | 'retro' | 'system'
		return `Тема лаунчера сменена на ${theme}`
	}
	if (tool === 'launcher_compile_java') {
		const parts = args.split('::').map((part) => part.trim())
		if (!parts[0] || !parts[1]) return 'Формат: <<launcher_compile_java|папка-с-кодом::мод.jar>>'
		const compiled = await sandboxCompileJava(parts[0], parts[1])
		if (/не удалась|Формат|Результат должен/.test(compiled)) return compiled
		const jarName = parts[1].split(/[\\/]/).pop() ?? parts[1]
		let version = ''
		let iconDataUrl: string | undefined
		try {
			const manifest = JSON.parse(await sandboxRead(`${parts[0]}/fabric.mod.json`)) as {
				version?: string
				icon?: string
			}
			version = typeof manifest.version === 'string' ? manifest.version : ''
			if (typeof manifest.icon === 'string' && manifest.icon) {
				iconDataUrl = await sandboxReadDataUrl(`${parts[0]}/${manifest.icon}`).catch(
					() => undefined,
				)
			}
		} catch {
			/* not a fabric mod or no manifest - the card ships without extras */
		}
		const card = {
			name: jarName.replace(/\.jar$/i, ''),
			version: version || '1.0.0',
			iconDataUrl,
			path: parts[1],
		}
		return `${compiled}\n@@JAR@@${JSON.stringify(card)}`
	}
	if (tool === 'launcher_install') {
		const parts = args.split('::').map((part) => part.trim())
		const projectIds = (parts[0] ?? '')
			.split(',')
			.map((id) => id.trim())
			.filter(Boolean)
		const kind = (parts[1] ?? 'mod').toLowerCase()
		const instanceId = parts[2] ?? ''
		if (projectIds.length === 0)
			return 'Укажите id проекта (из launcher_search_mods или /project/<id>)'
		if (!['mod', 'resourcepack', 'shader', 'datapack'].includes(kind)) {
			return 'Тип бывает: mod, resourcepack, shader, datapack (сборки ставятся через open_creation_modal)'
		}
		if (projectIds.length > 1) {
			// A batch: everything goes out at once, in the background, and the
			// model gets one line per project instead of a round per project.
			const outcomes = await Promise.all(
				projectIds.map(async (projectId) => {
					try {
						const detail = await installOneProject(projectId, kind, instanceId)
						const clean = extractCards(detail)
						return `${projectId}: ${clean.text}\n${clean.mods.map((mod) => `@@MOD@@${JSON.stringify(mod)}`).join('\n')}`
					} catch (error) {
						return `${projectId}: не установилось - ${String(error).slice(0, 150)}`
					}
				}),
			)
			return `Пакетная установка завершена:\n${outcomes.join('\n')}`
		}
		const projectId = projectIds[0]
		try {
			return await installOneProject(projectId, kind, instanceId)
		} catch (error) {
			return `Не установилось: ${String(error).slice(0, 200)}`
		}
	}
	if (tool === 'list_instances') {
		const instances = await list()
		if (instances.length === 0) return 'Сборок пока нет'
		return instances
			.map(
				(instance) =>
					`id=${instance.id} «${instance.name}» ` +
					`(ядро: ${instance.loader ?? 'vanilla'}, версия: ${instance.game_version ?? '?'})`,
			)
			.join('\n')
	}
	if (tool === 'sandbox_list') return sandboxList(args.trim())
	if (tool === 'sandbox_read') {
		if (!args.trim()) return 'Укажите файл'
		return sandboxRead(args.trim())
	}
	if (tool === 'sandbox_write') {
		const separator = args.indexOf('::')
		if (separator < 0) return 'Формат: <<sandbox_write|файл::текст>>'
		const path = args.slice(0, separator).trim()
		const content = args.slice(separator + 2)
		if (!path) return 'Укажите имя файла'
		if (/\.(exe|msi|bat|cmd|com|scr|sh|dll|so|apk|app|ps1)$/i.test(path.trim())) {
			return `Файл ${path.trim()} — исполняемый, его создать нельзя`
		}
		return sandboxWrite(path.trim(), content.replace(/\\n/g, '\n'))
	}
	if (tool === 'sandbox_delete') {
		if (!args.trim()) return 'Укажите путь'
		return sandboxDelete(args.trim())
	}
	if (tool === 'sandbox_pack') {
		const parts = args
			.split('::')
			.map((part) => part.trim())
			.filter(Boolean)
		if (parts.length < 2) {
			return 'Формат: <<sandbox_pack|архив.zip::путь1::путь2>>'
		}
		const [archive, ...sources] = parts
		return sandboxPack(sources, archive)
	}
	if (tool === 'sandbox_unpack') {
		const parts = args.split('::').map((part) => part.trim())
		if (!parts[0]) return 'Формат: <<sandbox_unpack|архив.zip::папка>>'
		return sandboxUnpack(parts[0], parts[1] ?? '')
	}
	if (tool === 'memory_read') {
		try {
			const memory = await sandboxRead(MEMORY_FILE)
			return memory || 'Заметок пока нет - записывай важное через <<memory_write|текст>>'
		} catch {
			return 'Заметок пока нет - записывай важное через <<memory_write|текст>>'
		}
	}
	if (tool === 'memory_write') {
		const note = args.trim()
		if (!note) return 'Пустую заметку не записываю'
		let previous = ''
		try {
			previous = await sandboxRead(MEMORY_FILE)
		} catch {
			previous = ''
		}
		const appended = `${previous}${previous && !previous.endsWith('\n') ? '\n' : ''}- ${note}\n`
		const trimmed =
			appended.length > 4000 ? `…(старое обрезано)\n${appended.slice(-4000)}` : appended
		return sandboxWrite(MEMORY_FILE, trimmed)
	}
	if (tool === 'session_list') return readSessionsOverview()
	if (tool === 'session_read') {
		const index = Number.parseInt(args.trim(), 10) || 1
		return readSessionByIndex(index)
	}
	if (tool === 'launcher_set_accent') {
		const color = args.trim()
		if (!/^#[0-9a-f]{6}$/i.test(color)) return 'Нужен цвет в hex, например #22c55e'
		addCustomAccentColor(color)
		setCustomAccentColor(color)
		return `Цвет акцента лаунчера сменён на ${color}`
	}
	if (tool === 'launcher_set_background') {
		const url = args.trim()
		if (!/^https:\/\//.test(url)) return 'Нужна прямая https-ссылка на картинку'
		try {
			const response = await proxiedFetch(url)
			if (!response.ok) return `Фон не скачался: HTTP ${response.status}`
			const kind = (response.headers.get('content-type') ?? 'image/png').split('/')[1] ?? 'png'
			const safeKind = /png|jpe?g|webp|gif|avif|bmp/.test(kind)
				? kind.replace('jpeg', 'jpg')
				: 'png'
			const bytes = new Uint8Array(await response.arrayBuffer())
			if (bytes.length > 25 * 1024 * 1024) return 'Картинка больше 25 МБ'
			const path = await writeSandboxBinary(`background.${safeKind}`, bytes)
			await setBackgroundFromPath(path)
			return 'Фон лаунчера обновлён'
		} catch (error) {
			return `Фон не получился: ${String(error).slice(0, 200)}`
		}
	}
	if (tool === 'launcher_search_mods') {
		const query = args.trim()
		if (!query) return 'Пустой запрос'
		const lines: string[] = []
		const cards: AiModCard[] = []
		try {
			const response = await proxiedFetch(
				`https://api.modrinth.com/v2/search?limit=5&query=${encodeURIComponent(query)}`,
				{ headers: { Accept: 'application/json' } },
			)
			if (response.ok) {
				const data = (await response.json()) as {
					hits?: {
						title?: string
						project_id?: string
						slug?: string
						author?: string
						icon_url?: string
						downloads?: number
						follows?: number
						description?: string
					}[]
				}
				for (const hit of data.hits ?? []) {
					const slug = hit.slug ?? hit.project_id ?? ''
					lines.push(
						`[Modrinth] ${hit.title ?? '?'} — автор: ${hit.author ?? '?'}; ${hit.description?.slice(0, 100) ?? ''} (загрузок: ${hit.downloads ?? 0}; открыть: <<navigate|/project/${slug}>>)`,
					)
					if (hit.project_id && slug) {
						cards.push({
							source: 'Modrinth',
							projectId: hit.project_id,
							slug,
							title: hit.title ?? '?',
							author: hit.author ?? '',
							iconUrl: hit.icon_url ?? '',
							description: hit.description ?? '',
							downloads: hit.downloads ?? 0,
							follows: hit.follows ?? 0,
							url: `https://modrinth.com/project/${slug}`,
						})
					}
				}
			}
		} catch {
			/* Modrinth is down - CurseForge still gets asked below */
		}
		try {
			const page = await searchCurseforge({ filter: query, pageSize: 5 })
			for (const hit of page.hits ?? []) {
				lines.push(
					`[CurseForge] ${hit.name} — автор: ${hit.author_name ?? '?'}; ${hit.summary?.slice(0, 100) ?? ''} (загрузок: ${hit.download_count ?? 0})`,
				)
				cards.push({
					source: 'CurseForge',
					projectId: String(hit.id ?? hit.slug ?? hit.name),
					slug: hit.slug ?? hit.name,
					title: hit.name,
					author: hit.author_name ?? '',
					iconUrl: hit.icon_url ?? '',
					description: hit.summary ?? '',
					downloads: hit.download_count ?? 0,
					url: `https://www.curseforge.com/minecraft/search?search=${encodeURIComponent(hit.slug ?? hit.name)}`,
				})
			}
		} catch {
			/* a missing key is the ordinary case */
		}
		if (lines.length === 0) return 'Ничего не нашлось'
		return lines.join('\n') + cards.map((card) => `\n@@MOD@@${JSON.stringify(card)}`).join('')
	}
	if (tool === 'skin_recommend') {
		// The skin library lives on laby.net; an empty query returns whatever
		// is hot right now, so the agent always sees fresh additions.
		const query = args.trim()
		try {
			const found = await searchLabySkins(query, 1)
			if (found.length === 0) return 'Скинов по такому запросу не нашлось'
			const picked = found.slice(0, 8)
			const lines = picked.map((skin) => {
				const tags = labySkinTags(skin).join(', ')
				return `Скин ${skin.image_hash} — теги: ${tags || 'без тегов'}; использует: ${skin.use_count} игрок(ов)`
			})
			const cards = picked.map((skin) => ({
				hash: skin.image_hash,
				tags: labySkinTags(skin).join(', '),
				variant: labySkinVariant(skin),
				uses: skin.use_count,
			}))
			return lines.join('\n') + cards.map((card) => `\n@@SKIN@@${JSON.stringify(card)}`).join('')
		} catch (error) {
			return `Скины не нашлись: ${String(error).slice(0, 150)}`
		}
	}
	if (tool === 'music_add_url') {
		const url = args.trim()
		if (!/^https?:\/\//.test(url)) return 'Нужна прямая http(s) ссылка на аудиофайл'
		try {
			const track = await addMusicFromUrl(url)
			return `Трек «${track.title}» скачан и добавлен в плейлист игрока`
		} catch (error) {
			return `Трек не скачался: ${String(error).slice(0, 200)}`
		}
	}
	if (tool === 'sysinfo') {
		const nav = navigator as Navigator & {
			deviceMemory?: number
			userAgentData?: { platform?: string }
		}
		return [
			`Платформа: ${nav.userAgentData?.platform ?? nav.platform ?? 'неизвестно'}`,
			`Ядер CPU: ${nav.hardwareConcurrency ?? 'неизвестно'}`,
			`Память: ${nav.deviceMemory ? `около ${nav.deviceMemory} ГБ` : 'неизвестно'}`,
			`Экран: ${screen.width}x${screen.height}`,
			`Язык: ${navigator.language}`,
			`Время системы: ${new Date().toLocaleString()}`,
		].join('\n')
	}
	if (tool === 'weather_get') {
		const place = args.trim()
		try {
			const weather = await fetchWeather(place || undefined)
			return [
				`Место: ${weather.place}`,
				`Погода: ${weather.label}, ${weather.temp}°C`,
				`Ветер: ${weather.wind} км/ч`,
				`Сейчас ${weather.isDay ? 'день' : 'ночь'}`,
			].join('\n')
		} catch (error) {
			return `Погоду не узнать: ${String(error).slice(0, 200)}`
		}
	}
	if (tool === 'timer_set') {
		const [minutesRaw, ...rest] = args.split('::')
		const minutes = Number.parseFloat((minutesRaw ?? '').trim().replace(',', '.'))
		if (!Number.isFinite(minutes) || minutes <= 0) {
			return 'Нужны минуты: <<timer_set|10::название>>'
		}
		const label = rest.join('::').trim() || 'Таймер'
		const ms = Math.min(minutes * 60_000, 24 * 60 * 60_000)
		setTimeout(() => {
			const text = `Время вышло: таймер «${label}» (${minutes} мин)`
			showAgentNavNotice(text)
			pushAiMessage({ role: 'assistant', content: `⏰ ${text}`, ts: Date.now() })
		}, ms)
		return `Таймер «${label}» на ${minutes} мин заведён — напомню плашкой сверху и в чате`
	}
	return null
})

/** The sessions folder, numbered the way the overview lists them. */
async function readSessionByIndex(index: number): Promise<string> {
	const overview = await readSessionsOverview(20)
	const lines = overview.split('\n').filter((line) => line.includes(': '))
	const line = lines[index - 1]
	if (!line) return 'Нет такой сессии в обзоре - сначала <<session_list|>>'
	return `Сессия №${index}: ${line}`
}

/**
 * Drops a binary blob into the sandbox and returns its absolute path - the
 * way a downloaded background reaches the launcher's own setter.
 */
async function writeSandboxBinary(name: string, bytes: Uint8Array): Promise<string> {
	return sandboxWriteBinary(name, bytes)
}

// ---- The agent's shared turn runner ----------------------------------------
//
// The chat page is only one face of the agent; the run itself lives here, in
// the module, so switching tabs, closing the page or wandering the launcher
// never interrupts a working Portalus. It also owns three player-facing
// things: the Stop button, the queue of messages typed mid-run, and the live
// "thought process" the chat draws while the model works.

/** A run is in flight - the chat shows the stop button, not send. */
export const agentBusy = ref(false)
/** The typewriter text of a reply still being drawn, word by word. */
export const agentStreaming = ref('')
/** How far the run has got, for the chat's live process card. */
export type AgentPhase = 'thinking' | 'working' | 'speaking'
export const agentPhase = ref<AgentPhase>('thinking')
/** What the run in flight has done so far: the chat shows it live. */
export interface AgentTurnState {
	actions: string[]
	folders: AiFolderCard[]
	images: string[]
	mods: AiModCard[]
	jars: AiJarCard[]
	polls: AiPoll[]
	skins: AiSkinCard[]
}
export const agentTurn = ref<AgentTurnState>({
	actions: [],
	folders: [],
	images: [],
	mods: [],
	jars: [],
	polls: [],
	skins: [],
})
/** Messages typed while a run was in flight; they go out when it ends. */
export interface QueuedTurn {
	text: string
	files: AttachedFile[]
	ts: number
}
export const agentQueue = ref<QueuedTurn[]>([])

/** What the run in flight is thinking, line by line: the chat draws it
 * live in the "Процесс размышления" card - the model's own words between
 * tool rounds plus one short line per finished tool call. */
export const agentThoughts = ref<string[]>([])

/** Appends one thought line, keeping the buffer small. */
function noteAgentThought(line: string): void {
	const text = line.replace(/\s+/g, ' ').trim()
	if (!text) return
	agentThoughts.value = [...agentThoughts.value.slice(-29), text]
}

let runController: AbortController | null = null

/** The Stop button: ends the run the moment it is pressed. */
export function stopAgentRun(): void {
	runController?.abort()
}

function resetTurnState(): void {
	agentTurn.value = {
		actions: [],
		folders: [],
		images: [],
		mods: [],
		jars: [],
		polls: [],
		skins: [],
	}
	agentThoughts.value = []
}

async function runAgentTurn(text: string, files: AttachedFile[]): Promise<void> {
	agentBusy.value = true
	agentPhase.value = 'thinking'
	agentStreaming.value = ''
	resetTurnState()
	errorOnTurn.value = ''
	const controller = new AbortController()
	runController = controller

	let attachmentNote = ''
	let inboxNote = ''
	if (files.length > 0) {
		attachmentNote = files
			.map((file) =>
				file.kind === 'text' && file.text
					? `\n\n[файл ${file.name}]:\n\`\`\`\n${file.text}\n\`\`\``
					: `\n\n[прикреплён файл: ${file.name}${file.size ? `, ${formatSize(file.size)}` : ''}]`,
			)
			.join('')
		// A copy lands in the sandbox's inbox, so Portalus can return to
		// these files on any later turn - read, unpack, rework, delete.
		try {
			const saved = await inboxSave(files)
			if (saved.length > 0) {
				inboxNote = `\n\n[файлы сохранены в песочницу: ${saved.join(', ')}]`
			}
		} catch {
			/* the chat copy below still carries text and previews */
		}
	}
	pushAiMessage({
		role: 'user',
		content: text + attachmentNote + inboxNote,
		ts: Date.now(),
		attachments: files.length > 0 ? files : undefined,
	})

	const payload = aiHistory.value
		.filter((message) => message.role !== 'note')
		.slice(-20)
		.map((message) => ({
			role: message.role === 'assistant' ? ('assistant' as const) : ('user' as const),
			content: message.content,
		}))
	const images = files.filter((file) => file.kind === 'image')
	// The fast lane: a plain greeting with nothing attached and no question
	// from the agent pending goes out with the pocket prompt, so it comes
	// back in seconds instead of after a full launcher briefing.
	const lastAssistant = [...aiHistory.value]
		.reverse()
		.find((message) => message.role === 'assistant')
	const fastPath = files.length === 0 && isSimpleChat(text) && !lastAssistant?.question
	// Live text: the reply is drawn as the model writes it. Tool commands
	// stay hidden while streaming - everything from the first << is
	// protocol, not prose for the player.
	let streamedAny = false

	try {
		const result = await aiComplete({
			kind: 'tab',
			messages: payload,
			images,
			signal: controller.signal,
			fastPath,
			onDelta: (_chunk, full) => {
				if (full) streamedAny = true
				agentPhase.value = 'speaking'
				const cut = full.indexOf('<<')
				agentStreaming.value = cut >= 0 ? full.slice(0, cut).trimEnd() : full
			},
			onActionDone: (tool, args, result2) => {
				agentPhase.value = 'working'
				if (!agentTurn.value.actions.includes(tool)) {
					agentTurn.value = {
						...agentTurn.value,
						actions: [...agentTurn.value.actions, tool],
					}
				}
				const cards = extractCards(result2)
				if (cards.mods.length > 0) {
					const fresh = cards.mods.filter(
						(mod) =>
							!agentTurn.value.mods.some(
								(existing) =>
									existing.source === mod.source && existing.projectId === mod.projectId,
							),
					)
					agentTurn.value = { ...agentTurn.value, mods: [...agentTurn.value.mods, ...fresh] }
				}
				if (cards.jars.length > 0) {
					const fresh = cards.jars.filter(
						(jar) => !agentTurn.value.jars.some((existing) => existing.path === jar.path),
					)
					agentTurn.value = { ...agentTurn.value, jars: [...agentTurn.value.jars, ...fresh] }
				}
				if (cards.polls.length > 0) {
					agentTurn.value = {
						...agentTurn.value,
						polls: [...agentTurn.value.polls, ...cards.polls],
					}
				}
				if (cards.skins.length > 0) {
					const freshSkins = cards.skins.filter(
						(skin) => !agentTurn.value.skins.some((existing) => existing.hash === skin.hash),
					)
					agentTurn.value = { ...agentTurn.value, skins: [...agentTurn.value.skins, ...freshSkins] }
				}
				if (cards.image && !agentTurn.value.images.includes(cards.image)) {
					agentTurn.value = { ...agentTurn.value, images: [...agentTurn.value.images, cards.image] }
				}
				if (tool === 'gen_image') {
					const name = result2.match(/картинка (\S+) \(/)?.[1] ?? ''
					if (name) {
						void sandboxReadDataUrl(name)
							.then((url) => {
								agentTurn.value = {
									...agentTurn.value,
									images: [...agentTurn.value.images, url],
								}
							})
							.catch(() => {})
					}
				}
				if (tool === 'open_folder') {
					const separator = args.indexOf('::')
					const path = (separator < 0 ? args : args.slice(0, separator)).trim()
					const description = separator < 0 ? '' : args.slice(separator + 2).trim()
					if (path && !agentTurn.value.folders.some((folder) => folder.path === path)) {
						agentTurn.value = {
							...agentTurn.value,
							folders: [
								...agentTurn.value.folders,
								{ path, description: description || undefined },
							],
						}
					}
				}
			},
		})
		// The folder cards come from the open_folder handler registered by
		// the app shell; the sandbox path rides in the second argument.
		const done: AiMessage = {
			role: 'assistant',
			content: result.content,
			ts: Date.now(),
			provider: result.provider,
			model: result.model,
			...(result.fallbackNote ? { fallbackNote: result.fallbackNote } : {}),
			actions: result.actions,
			activity: result.activity
				? {
						...result.activity,
						foldersOpened: agentTurn.value.folders,
						images: agentTurn.value.images,
						mods: agentTurn.value.mods,
						jars: agentTurn.value.jars,
						polls: agentTurn.value.polls,
						skins: agentTurn.value.skins,
					}
				: undefined,
			question: result.question,
		}
		agentPhase.value = 'speaking'
		// A reply that already streamed onto the screen is not typed out a
		// second time - the typewriter is only for providers that answer
		// with one buffered JSON object.
		if (aiSettings.value.chatEffects && !streamedAny) {
			await typeOut(result.content)
			pushAiMessage(done)
		} else {
			pushAiMessage(done)
		}
		// Portalus moved the player somewhere: leave a small top-center
		// notch with his words, so the answer is never lost off-screen.
		if (
			result.actions.some((action) => action === 'navigate' || action === 'open_instance') &&
			!window.location.pathname.startsWith('/ai')
		) {
			showAgentNavNotice(result.content)
		}
	} catch (error) {
		agentStreaming.value = ''
		if (controller.signal.aborted) {
			pushAiMessage({
				role: 'assistant',
				content: '⏹ Остановлено. Скажи, когда продолжить — или просто напиши следующее сообщение.',
				ts: Date.now(),
			})
		} else {
			const detail = String((error as Error)?.message ?? error)
			errorOnTurn.value = detail
			pushAiMessage({
				role: 'assistant',
				content: `Не вышло: ${detail}`,
				ts: Date.now(),
			})
		}
	} finally {
		runController = null
		agentStreaming.value = ''
		agentBusy.value = false
		agentPhase.value = 'thinking'
		void flushAgentQueue()
	}
}

/** The typewriter, drawn from the module so it survives leaving the page. */
let typeTimer: ReturnType<typeof setInterval> | undefined
function typeOut(content: string): Promise<void> {
	return new Promise((resolve) => {
		clearInterval(typeTimer)
		let index = 0
		const step = Math.max(4, Math.ceil(content.length / 160))
		typeTimer = setInterval(() => {
			index = Math.min(content.length, index + step)
			agentStreaming.value = content.slice(0, index)
			if (index >= content.length) {
				clearInterval(typeTimer)
				typeTimer = undefined
				agentStreaming.value = ''
				resolve()
			}
		}, 16)
	})
}

/** Sends now if the agent is free, or lines the message up behind the run. */
export async function sendAgentMessage(text: string, files: AttachedFile[] = []): Promise<void> {
	const message = text.trim()
	if ((!message && files.length === 0) || agentBusy.value) {
		if (message || files.length > 0) {
			agentQueue.value = [...agentQueue.value, { text: message, files, ts: Date.now() }]
		}
		return
	}
	await runAgentTurn(message, files)
}

/** Sends everything that lined up while the agent was busy. */
async function flushAgentQueue(): Promise<void> {
	if (agentBusy.value || agentQueue.value.length === 0) return
	const next = agentQueue.value[0]
	agentQueue.value = agentQueue.value.slice(1)
	await runAgentTurn(next.text, next.files)
}

/** Live error of the run in flight (or just ended), for the chat's red box. */
export const errorOnTurn = ref('')

// ---- The local bridge -------------------------------------------------------
//
// A browser tab on the same machine can join the conversation: the launcher
// serves a small page, the tab connects with the one-time key, and every
// message from there runs through the same agent that lives in the chat.

export interface BridgeInfo {
	port: number
	key: string
	url: string
}

/** Shared bridge state: the settings popup and any other face read these. */
export const bridgeInfo = ref<BridgeInfo | null>(null)
export const bridgeToggling = ref(false)

/** The agent's message shown in the top-center notch after it moved the
 * player to another screen: hover to read, answer without opening the chat. */
export const agentNavNotice = ref<{ text: string; at: number } | null>(null)
export function showAgentNavNotice(text: string): void {
	if (!text.trim()) return
	agentNavNotice.value = { text, at: Date.now() }
}

/** A message typed into the navigation notch rides in here to the chat. */
export const queuedUserMessage = ref('')

let bridgeUnlisten: (() => void) | undefined
let bridgeBusy = false

async function bridgeSend(text: string): Promise<void> {
	await invoke('plugin:portalrinth-bridge|bridge_send', { text })
}

/** Runs one bridge message through the very same agent the chat uses. */
async function handleBridgeTurn(text: string): Promise<void> {
	if (bridgeBusy) {
		await bridgeSend('Дай мне договорить предыдущую мысль — и сразу за твою.').catch(() => {})
		return
	}
	bridgeBusy = true
	try {
		pushAiMessage({ role: 'user', content: `[мост] ${text}`, ts: Date.now() })
		const result = await aiComplete({
			kind: 'tab',
			messages: aiHistory.value
				.filter((message) => message.role !== 'note')
				.slice(-20)
				.map((message) => ({
					role: message.role === 'assistant' ? ('assistant' as const) : ('user' as const),
					content: message.content,
				})),
		})
		pushAiMessage({
			role: 'assistant',
			content: result.content,
			ts: Date.now(),
			provider: result.provider,
			actions: result.actions,
			activity: result.activity,
			question: result.question,
		})
		const reply = result.question
			? `${result.content}\n(варианты: ${result.question.options.join(' / ')})`
			: result.content
		await bridgeSend(reply).catch(() => {})
	} catch (error) {
		const detail = String((error as Error)?.message ?? error)
		pushAiMessage({ role: 'assistant', content: `Не вышло: ${detail}`, ts: Date.now() })
		await bridgeSend(`Не вышло: ${detail}`).catch(() => {})
	} finally {
		bridgeBusy = false
	}
}

/** Opens the localhost bridge and starts listening for browser messages. */
export async function startBridge(): Promise<BridgeInfo> {
	const info = (await invoke('plugin:portalrinth-bridge|bridge_start')) as BridgeInfo
	bridgeInfo.value = info
	if (!bridgeUnlisten) {
		bridgeUnlisten = await listen<string>('bridge-chat', (event) => {
			void handleBridgeTurn(event.payload)
		})
	}
	return info
}

/** Closes the bridge door. */
export async function stopBridge(): Promise<void> {
	await invoke('plugin:portalrinth-bridge|bridge_stop')
	bridgeInfo.value = null
}

/** Where the bridge listens right now, if at all. */
export async function bridgeStatus(): Promise<BridgeInfo | null> {
	try {
		const info = (await invoke('plugin:portalrinth-bridge|bridge_info')) as BridgeInfo | null
		bridgeInfo.value = info
		return info
	} catch {
		return null
	}
}

// ---- The mascot's little bus ---------------------------------------------

export type MascotMood = 'idle' | 'walk' | 'sit' | 'sleep' | 'dance' | 'pet' | 'think' | 'talk'

const mascotMood = ref<MascotMood>('idle')
const mascotBubble = ref('')
const mascotBubbleVisible = ref(false)

let bubbleTimer: ReturnType<typeof setTimeout> | undefined

/** Makes the mascot say something; nothing happens if it is disabled. */
export function mascotSay(text: string, mood: MascotMood = 'idle', seconds = 6) {
	if (!aiSettings.value.mascotEnabled || !text) return
	mascotMood.value = mood
	mascotBubble.value = text
	mascotBubbleVisible.value = true
	clearTimeout(bubbleTimer)
	bubbleTimer = setTimeout(() => (mascotBubbleVisible.value = false), seconds * 1000)
}

export function mascotSetMood(mood: MascotMood) {
	mascotMood.value = mood
}

export function mascotCelebrate() {
	if (!aiSettings.value.mascotEnabled) return
	mascotSay('Ура! Получилось!', 'dance', 4)
}

export const mascotRefs = {
	mood: mascotMood,
	bubble: mascotBubble,
	bubbleVisible: mascotBubbleVisible,
}

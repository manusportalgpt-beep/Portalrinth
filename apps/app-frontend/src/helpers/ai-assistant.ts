/**
 * Portalrinth's own: the AI assistant. One brain for two faces - the chat tab
 * and the mascot - with a registry of providers (several of them free, some
 * reachable from Russia without a VPN), a shared conversation, and a small
 * action protocol the model can use to drive the launcher itself.
 *
 * Every provider here speaks the OpenAI chat-completions shape, because all of
 * the services worth using either speak it natively or ship a compatibility
 * endpoint (Gemini, YandexGPT). Replies are not streamed: the launcher's HTTP
 * goes through the proxy-aware client, and the interface animates the answer
 * in with a typewriter instead.
 */
import { ref } from 'vue'

import { list } from './instance'
import { add_project_from_version, type DownloadReason } from './instance'
import { proxiedFetch } from './proxy-fetch'

import {
	type AttachedFile,
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
	readSessionsOverview,
	startNewSession,
	resetSandboxStats,
	inboxSave,
	formatSize,
} from './ai-sandbox'
import { get_default_user, users } from './auth'
import { addMusicFromUrl } from './portalrinth-audio'
import { addCustomAccentColor, setCustomAccentColor } from '../composables/use-accent'
import { setBackgroundFromPath } from './portalrinth-background'
import { searchCurseforge } from './curseforge-api'
import { bytesToBase64 } from './ai-sandbox'
import { useTheme } from '../composables/use-theme'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

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
 * The catalogue. Free tiers first: Pollinations needs no key at all, which is
 * why it is the default - the assistant works the moment the launcher does.
 */
export const AI_PROVIDERS: AiProvider[] = [
	{
		id: 'pollinations',
		label: 'Pollinations',
		baseUrl: 'https://text.pollinations.ai/openai',
		needsKey: false,
		models: [
			{ id: 'openai', label: 'GPT' },
			{ id: 'openai-fast', label: 'GPT быстрый' },
			{ id: 'openai-large', label: 'GPT большой' },
			{ id: 'mistral', label: 'Mistral' },
			{ id: 'qwen-coder', label: 'Qwen Coder' },
			{ id: 'llama', label: 'Llama' },
			{ id: 'deepseek', label: 'DeepSeek' },
		],
		note: 'Ключ не нужен. Любую модель можно вписать вручную — у Pollinations их десятки. Иногда отвечает медленно — это цена бесплатности.',
		fromRussia: true,
	},
	{
		id: 'orcarouter',
		label: 'OrcaRouter',
		baseUrl: 'https://api.orcarouter.ai/v1/chat/completions',
		needsKey: true,
		keyUrl: 'https://orcarouter.ai',
		models: [
			{ id: 'deepseek/deepseek-v4-flash-free', label: 'DeepSeek V4 Flash (free)' },
			{ id: 'orcarouter/auto', label: 'Авто-выбор' },
			{ id: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
		],
		note: 'Шлюз к десяткам провайдеров под одним ключом (id вида openai/gpt-5.1, anthropic/claude-sonnet-5 — любой можно вписать вручную). Есть бесплатные модели.',
	},
	{
		id: 'openrouter',
		label: 'OpenRouter',
		baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
		needsKey: true,
		keyUrl: 'https://openrouter.ai/keys',
		models: [
			{ id: 'deepseek/deepseek-chat-v3.1:free', label: 'DeepSeek V3.1' },
			{ id: 'qwen/qwen3-coder:free', label: 'Qwen3 Coder' },
			{ id: 'z-ai/glm-4.5-air:free', label: 'GLM 4.5 Air' },
			{ id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B' },
			{ id: 'mistralai/mistral-small-3.2-24b-instruct:free', label: 'Mistral Small 3.2' },
			{ id: 'google/gemma-3-27b-it:free', label: 'Gemma 3 27B' },
			{ id: 'moonshotai/kimi-k2:free', label: 'Kimi K2' },
		],
		note: 'Много бесплатных моделей под одним ключом. Обычно доступен из России.',
		fromRussia: true,
	},
	{
		id: 'groq',
		label: 'Groq',
		baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
		needsKey: true,
		keyUrl: 'https://console.groq.com/keys',
		models: [
			{ id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
			{ id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B' },
			{ id: 'qwen/qwen3-32b', label: 'Qwen3 32B' },
			{ id: 'gemma2-9b-it', label: 'Gemma2 9B' },
		],
		note: 'Щедрый бесплатный лимит и очень быстрые ответы.',
	},
	{
		id: 'cerebras',
		label: 'Cerebras',
		baseUrl: 'https://api.cerebras.ai/v1/chat/completions',
		needsKey: true,
		keyUrl: 'https://cloud.cerebras.ai',
		models: [
			{ id: 'llama-3.3-70b', label: 'Llama 3.3 70B' },
			{ id: 'qwen-3-32b', label: 'Qwen3 32B' },
			{ id: 'gpt-oss-120b', label: 'GPT-OSS 120B' },
		],
		note: 'Бесплатный тариф с самым быстрым железом.',
	},
	{
		id: 'mistral',
		label: 'Mistral',
		baseUrl: 'https://api.mistral.ai/v1/chat/completions',
		needsKey: true,
		keyUrl: 'https://console.mistral.ai/api-keys',
		models: [
			{ id: 'mistral-small-latest', label: 'Mistral Small' },
			{ id: 'open-mistral-nemo', label: 'Mistral Nemo' },
		],
		note: 'Бесплатный тариф лаборатории Mistral.',
	},
	{
		id: 'gemini',
		label: 'Google Gemini',
		baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
		needsKey: true,
		keyUrl: 'https://aistudio.google.com/apikey',
		models: [
			{ id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
			{ id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' },
		],
		note: 'Бесплатный ключ из AI Studio. Из России без VPN обычно недоступен.',
	},
	{
		id: 'zai',
		label: 'Z.AI (GLM)',
		baseUrl: 'https://api.z.ai/api/paas/v4/chat/completions',
		needsKey: true,
		keyUrl: 'https://z.ai/model-api',
		models: [
			{ id: 'glm-4.7-flash', label: 'GLM 4.7 Flash' },
			{ id: 'glm-4.5-flash', label: 'GLM 4.5 Flash' },
			{ id: 'glm-4.5-air', label: 'GLM 4.5 Air' },
			{ id: 'glm-5.3-flash', label: 'GLM 5.3 Flash' },
		],
		note: 'GLM 4.7 Flash и 4.5 Flash бесплатны, доступны из России и очень добротные.',
		fromRussia: true,
	},
	{
		id: 'yandex',
		label: 'YandexGPT',
		baseUrl: 'https://openai.api.yandex.net/v1/chat/completions',
		needsKey: true,
		keyUrl: 'https://yandex.cloud/ru/services/ai-studio',
		authScheme: 'api-key',
		models: [
			{ id: 'yandexgpt-lite', label: 'YandexGPT Lite' },
			{ id: 'yandexgpt', label: 'YandexGPT Pro' },
		],
		note: 'Работает из России напрямую, ключ из Yandex Cloud.',
		fromRussia: true,
	},
	{
		id: 'gigachat',
		label: 'GigaChat',
		baseUrl: 'https://gigachat.devices.sberbank.ru/api/v1/chat/completions',
		needsKey: true,
		keyUrl: 'https://developers.sber.ru/gigachat',
		models: [{ id: 'GigaChat-2', label: 'GigaChat 2' }],
		note: 'Работает из России. Понадобится свежий access-токен из личного кабинета разработчика.',
		fromRussia: true,
	},
	{
		id: 'deepseek',
		label: 'DeepSeek',
		baseUrl: 'https://api.deepseek.com/v1/chat/completions',
		needsKey: true,
		keyUrl: 'https://platform.deepseek.com/api_keys',
		models: [{ id: 'deepseek-chat', label: 'DeepSeek V3' }],
		note: 'Платный, но очень дешёвый и умный.',
	},
	{
		id: 'github-models',
		label: 'GitHub Models',
		baseUrl: 'https://models.github.ai/inference/chat/completions',
		needsKey: true,
		keyUrl: 'https://github.com/settings/tokens',
		models: [
			{ id: 'openai/gpt-4.1-mini', label: 'GPT 4.1 Mini' },
			{ id: 'openai/gpt-4o-mini', label: 'GPT 4o Mini' },
			{ id: 'meta/Llama-3.3-70B-Instruct', label: 'Llama 3.3 70B' },
		],
		note: 'Бесплатный дневной лимит запросов с обычным токеном GitHub.',
	},
	{
		id: 'nvidia',
		label: 'NVIDIA NIM',
		baseUrl: 'https://integrate.api.nvidia.com/v1/chat/completions',
		needsKey: true,
		keyUrl: 'https://build.nvidia.com',
		models: [
			{ id: 'meta/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' },
			{ id: 'qwen/qwen2.5-coder-32b-instruct', label: 'Qwen2.5 Coder 32B' },
			{ id: 'deepseek-ai/deepseek-r1', label: 'DeepSeek R1' },
		],
		note: 'Бесплатные кредиты каждому новому ключу на build.nvidia.com.',
	},
	{
		id: 'together',
		label: 'Together AI',
		baseUrl: 'https://api.together.xyz/v1/chat/completions',
		needsKey: true,
		keyUrl: 'https://api.together.ai/settings/api-keys',
		models: [
			{ id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free', label: 'Llama 3.3 70B Turbo' },
			{ id: 'deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free', label: 'DeepSeek R1 Distill 70B' },
		],
		note: 'Бесплатные Turbo-модели под своим ключом.',
	},
	{
		id: 'cohere',
		label: 'Cohere',
		baseUrl: 'https://api.cohere.ai/compatibility/v1/chat/completions',
		needsKey: true,
		keyUrl: 'https://dashboard.cohere.com/api-keys',
		models: [
			{ id: 'command-r7b-12-2024', label: 'Command R7B' },
			{ id: 'command-r-08-2024', label: 'Command R' },
		],
		note: 'Пробные ключи бесплатны и без привязки карты.',
	},
	{
		id: 'custom',
		label: 'Свой сервер',
		baseUrl: '',
		needsKey: false,
		models: [],
		note: 'Любой OpenAI-совместимый сервер: LM Studio, Ollama, свой шлюз.',
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
	provider: 'pollinations',
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
	if (stored) return stored
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
 */
const ACTION_PATTERN = /<<([a-z_]+)\|([^>]*)>>/g

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
	const cleaned = text.replace(ACTION_PATTERN, (_match, tool: string, args: string) => {
		actions.push({ tool, args: args.trim() })
		return ''
	})
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

/** A poll the agent set up, with clickable answer buttons. */
export interface AiPoll {
	text: string
	options: string[]
}

export interface ParsedCards {
	text: string
	mods: AiModCard[]
	jars: AiJarCard[]
	polls: AiPoll[]
	image?: string
}

/** Splits card markers off a tool result: the model keeps clean text, the
 * chat gets structured cards to render. */
export function extractCards(result: string): ParsedCards {
	const mods: AiModCard[] = []
	const jars: AiJarCard[] = []
	const polls: AiPoll[] = []
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
		.trim()
	return { text, mods, jars, polls, image: IMAGE_MARKER.exec(result)?.[1] }
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
	'Ты можешь выполнять действия, добавляя в ответ команды вида <<инструмент|аргумент>> (аргумент одной строкой, без кавычек). Пользователь видит каждую выполненную команду.',
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

// ---- Personality ---------------------------------------------------------

/**
 * The name of the player behind the selected account. Asked once per
 * launcher run and reused: Portalus addresses the player by that name.
 */
let playerNameCache = ''
export async function playerName(): Promise<string> {
	if (playerNameCache) return playerNameCache
	try {
		const id = await get_default_user()
		if (id) {
			const all = await users()
			const me = all.find((user) => user.id === id)
			if (me?.username) playerNameCache = me.username
		}
	} catch {
		/* an offline launcher still gets an assistant */
	}
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
		'У тебя есть своё мнение: если пользователь просит вредного или сомнительного, ты вежливо споришь и предлагаешь лучше.',
		'Отвечай на языке пользователя. Без воды: коротко, по делу, шагами где уместно.',
		'Ты знаешь лаунчер целиком: Discover (поиск по Modrinth и CurseForge), создание сборок, установку модов/ресурс-паков/шейдеров (иконка, автор, версия, описание — всё как у человека), скины, скриншоты, внешний вид лаунчера, запуск и ошибки. Помогаешь со всем этим и сам делаешь это руками, когда просят.',
		'У тебя есть своя песочница (папка на диске) и папка сессий: там лежат твои заметки и прошлые разговоры — перечитывай их, чтобы ничего не забывать. Файлы, которые игрок скинул в чат, попадают в песочницу (inbox/), картинки ты видишь.',
		AI_NAVIGATION_HINT,
		AI_TOOLS_HINT,
		AI_SKILLS_HINT,
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
 * The part of the prompt that changes every few turns: who is playing and
 * what the notebook remembers. Kept separate so the static half above stays
 * cheap for providers that bill the system message as regular tokens.
 */
async function buildLiveContext(): Promise<string> {
	const lines: string[] = []
	const who = await playerName()
	if (who) {
		lines.push(
			`Имя игрока: ${who}. Обращайся к нему по имени — в приветствии и иногда по ходу дела, без фанатизма.`,
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

// ---- Network -------------------------------------------------------------

interface ChatMessagePayload {
	role: 'system' | 'user' | 'assistant'
	content: string | unknown[]
}

async function callProvider(
	providerId: string,
	payload: ChatMessagePayload[],
	signal?: AbortSignal,
): Promise<string> {
	const settings = aiSettings.value
	const provider = providerById(providerId)
	if (!provider) throw new Error(`Неизвестный провайдер: ${providerId}`)
	const baseUrl = providerId === 'custom' ? settings.customBaseUrl : provider.baseUrl
	if (!baseUrl) throw new Error('Укажите адрес своего сервера в настройках')
	const key = settings.keys[providerId] ?? ''
	if (provider.needsKey && !key) throw new Error(`Нужен API-ключ провайдера ${provider.label}`)
	const headers: Record<string, string> = { 'Content-Type': 'application/json' }
	if (key) {
		if (provider.authScheme === 'api-key') headers.Authorization = `Api-Key ${key}`
		else headers.Authorization = `Bearer ${key}`
	}
	const body: Record<string, unknown> = {
		model: chosenModel(settings, providerId),
		messages: payload,
		temperature: 0.6,
		max_tokens: 2048,
	}
	if (providerId === 'openrouter') {
		headers['X-Title'] = 'Portalrinth Launcher'
	}
	const response = await proxiedFetch(baseUrl, {
		method: 'POST',
		headers,
		body: JSON.stringify(body),
		signal,
	})
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
	const data = (await response.json()) as {
		choices?: { message?: { content?: string } }[]
	}
	const content = data.choices?.[0]?.message?.content ?? ''
	if (!content) throw new Error(`${provider.label}: пустой ответ`)
	return content
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
): Promise<string> {
	const pauses = [1500, 4000]
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
			return await callProvider(providerId, payload, signal)
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

/** Providers the launcher can fall back to when the chosen one is out of
 * free minutes: first the keyless one, then any free-tier provider that has
 * a key saved. */
function fallbackChain(primary: string): string[] {
	const chain = [primary]
	for (const candidate of [
		'pollinations',
		'orcarouter',
		'openrouter',
		'zai',
		'groq',
		'cerebras',
		'github-models',
		'nvidia',
		'together',
		'cohere',
	]) {
		if (candidate === primary) continue
		const provider = providerById(candidate)
		if (!provider) continue
		if (provider.needsKey && !aiSettings.value.keys[candidate]) continue
		chain.push(candidate)
	}
	return chain
}

function isRetryable(error: unknown): boolean {
	const text = String(error)
	return /HTTP 4(29|[0-9]{2})|HTTP 5|Failed to fetch|network|timeout|Empty|пустой/i.test(text)
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
}

export interface AiResult {
	content: string
	provider: string
	actions: string[]
	/** What the sandbox did while composing the reply. */
	activity?: AiActivity
	/** Set when the assistant asked the user a question instead of finishing. */
	question?: AiQuestion
}

/** Builds the messages payload, attaching images to the newest user turn. */
function withImages(
	messages: ChatMessagePayload[],
	images?: AttachedFile[],
): ChatMessagePayload[] {
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
	const live = await buildLiveContext()
	const system =
		buildSystemPrompt(request.kind, request.systemExtra) +
		(live ? `\n${live}` : '')
	const base: ChatMessagePayload[] = [
		{ role: 'system', content: system },
		...(request.messages ?? []),
	]
	let rounds = withImages(base, request.images)
	const hasImages = rounds !== base

	resetSandboxStats()
	beginAgentRun()
	let providerTried = ''
	let lastError: unknown
	const doneActions: string[] = []

	try {
		for (const providerId of fallbackChain(settings.provider)) {
			providerTried = providerId
			let payload = rounds
			try {
				for (let round = 0; round < 4; round++) {
					if (playerTookOver()) {
						return {
							content:
								'Остановился: ты ушёл на другой экран, так что я решил, что ты передумал. Скажи, если продолжить.',
							provider: providerTried,
							actions: doneActions,
							activity: sandboxStatsSnapshot(),
						}
					}
					let raw: string
					try {
						raw = await callProviderWithRetry(providerId, payload, request.signal)
					} catch (error) {
						// A model without vision answers 400 to image parts: drop them
						// once and answer from the text alone.
						const status = (error as Error & { status?: number }).status
						if (hasImages && status === 400 && payload === rounds) {
							rounds = withoutImages(base)
							payload = rounds
							raw = await callProviderWithRetry(providerId, payload, request.signal)
						} else {
							throw error
						}
					}
					const parsed = parseActions(raw)
					const askAction = parsed.actions.find((action) => action.tool === 'ask_user')
					if (askAction) {
						const [text, options] = askAction.args.split('::')
						return {
							content: parsed.text || raw,
							provider: providerTried,
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
					if (parsed.actions.length === 0 || round === 3) {
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
							actions: doneActions,
							activity: sandboxStatsSnapshot(),
						}
					}
					const notes: string[] = []
					const seenImages: string[] = []
					for (const action of parsed.actions.slice(0, 6)) {
						if (playerTookOver()) {
							notes.push('Игрок сам перешёл на другой экран - он передумал. Немедленно прекрати действия по этому запросу и попрощайся.')
							return {
								content:
									'Остановился: ты ушёл на другой экран, так что я решил, что ты передумал. Скажи, если продолжить.',
								provider: providerTried,
								actions: doneActions,
								activity: sandboxStatsSnapshot(),
							}
						}
						const result = await runTool(action.tool, action.args)
						doneActions.push(action.tool)
						request.onActionDone?.(action.tool, action.args, result)
						const cards = extractCards(result)
						if (cards.image) seenImages.push(cards.image)
						notes.push(`Результат ${action.tool}(${action.args}): ${cards.text.slice(0, 1200)}`)
					}
					const noteText = notes.join('\n') + '\nПродолжи ответ пользователю.'
					const queuedImages = seenImages.length > 0 ? seenImages : pendingVisionImages.splice(0, pendingVisionImages.length)
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
					payload = [
						...payload,
						{ role: 'assistant', content: raw },
						noteMessage,
					]
					// A breath between tool rounds keeps anonymous free tiers
					// from answering 429 in the middle of a task - kept short,
					// the player is waiting.
					await sleep(300, request.signal)
				}
			} catch (error) {
				lastError = error
				if (request.signal?.aborted) throw error
				if (!isRetryable(error)) throw error
			}
		}
	} finally {
		endAgentRun()
	}
	const detail = lastError ? String((lastError as Error)?.message ?? lastError) : ''
	throw new Error(
		`${detail || 'Ни один провайдер не ответил'}. Порталус не дозвонился до ИИ: подожди минуту и напиши ещё раз, а надёжный вариант — бесплатный ключ Z.AI (GLM) или GigaChat в настройках провайдера.`,
	)
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
 * The agent's own web search: DuckDuckGo, asked three ways, because one of
 * the three doors is always open - the plain HTML endpoint, the same one
 * through a POST (what a browser form does), and the "lite" mirror. Whichever
 * answers first wins; the others never see the query.
 */
async function webSearch(query: string): Promise<string> {
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
			const hits = [...html.matchAll(/<h2><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>/g)].slice(0, 6)
			if (hits.length === 0) throw new Error('пустая выдача')
			// Packed back into the one shape the shared parser already reads.
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
			if (hits.length > 0) {
				return hits.map((hit, index) => `${index + 1}. ${hit.title} — ${hit.url}`).join('\n')
			}
			lastDetail = 'пустая выдача'
		} catch (error) {
			lastDetail = String(error).slice(0, 120)
		}
	}
	return `Ничего не нашлось или поиск недоступен (${lastDetail}). Попробуй переформулировать запрос или открой конкретный сайт через web_fetch`
}

/** One Modrinth project as a card: search-by-id returns author, icon,
 * downloads and follows in a single request. */
async function fetchModrinthCard(projectId: string): Promise<AiModCard | null> {
	try {
		const facets = encodeURIComponent(JSON.stringify([[`project_id:${projectId}`]]))
		const response = await proxiedFetch(`https://api.modrinth.com/v2/search?limit=1&facets=${facets}`, {
			headers: { Accept: 'application/json' },
			signal: AbortSignal.timeout(10000),
		})
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
		if (!/\.(png|jpg|jpeg|webp)$/i.test(name)) return 'Имя файла должно заканчиваться на .png, .jpg или .webp'
		try {
			const size = name.match(/(\d+)x(\d+)/i)
			const width = Math.min(1024, Math.max(256, Number(size?.[1]) || 1024))
			const height = Math.min(1024, Math.max(256, Number(size?.[2]) || 1024))
			let bytes: Uint8Array
			const imageProvider = aiSettings.value.imageProvider || 'pollinations'
			const zaiKey = imageProvider === 'zai' ? (aiSettings.value.imageKeys.zai ?? aiSettings.value.keys.zai ?? '') : ''
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
			const hits = (data.data ?? []).map((hit) => hit.path).filter(Boolean).slice(0, 6)
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
				iconDataUrl = await sandboxReadDataUrl(`${parts[0]}/${manifest.icon}`).catch(() => undefined)
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
		const projectIds = (parts[0] ?? '').split(',').map((id) => id.trim()).filter(Boolean)
		const kind = (parts[1] ?? 'mod').toLowerCase()
		const instanceId = parts[2] ?? ''
		if (projectIds.length === 0) return 'Укажите id проекта (из launcher_search_mods или /project/<id>)'
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
		const parts = args.split('::').map((part) => part.trim()).filter(Boolean)
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
			appended.length > 4000
				? `…(старое обрезано)\n${appended.slice(-4000)}`
				: appended
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
			const safeKind = /png|jpe?g|webp|gif|avif|bmp/.test(kind) ? kind.replace('jpeg', 'jpg') : 'png'
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
		return (
			lines.join('\n') +
			cards.map((card) => `\n@@MOD@@${JSON.stringify(card)}`).join('')
		)
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
}
export const agentTurn = ref<AgentTurnState>({
	actions: [],
	folders: [],
	images: [],
	mods: [],
	jars: [],
	polls: [],
})
/** Messages typed while a run was in flight; they go out when it ends. */
export interface QueuedTurn {
	text: string
	files: AttachedFile[]
	ts: number
}
export const agentQueue = ref<QueuedTurn[]>([])

let runController: AbortController | null = null

/** The Stop button: ends the run the moment it is pressed. */
export function stopAgentRun(): void {
	runController?.abort()
}

function resetTurnState(): void {
	agentTurn.value = { actions: [], folders: [], images: [], mods: [], jars: [], polls: [] }
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

	try {
		const result = await aiComplete({
			kind: 'tab',
			messages: payload,
			images,
			signal: controller.signal,
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
								(existing) => existing.source === mod.source && existing.projectId === mod.projectId,
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
					agentTurn.value = { ...agentTurn.value, polls: [...agentTurn.value.polls, ...cards.polls] }
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
			actions: result.actions,
			activity: result.activity
				? {
						...result.activity,
						foldersOpened: agentTurn.value.folders,
						images: agentTurn.value.images,
						mods: agentTurn.value.mods,
						jars: agentTurn.value.jars,
						polls: agentTurn.value.polls,
					}
				: undefined,
			question: result.question,
		}
		agentPhase.value = 'speaking'
		if (aiSettings.value.chatEffects) {
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

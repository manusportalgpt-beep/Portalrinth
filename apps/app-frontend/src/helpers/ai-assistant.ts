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
 * The catalogue. Free tiers first: Pollinations needs no key at all, which is
 * why it is the default - the assistant works the moment the launcher does.
 */
export const AI_PROVIDERS: AiProvider[] = [
	{
		id: 'pollinations',
		label: 'Pollinations',
		baseUrl: 'https://text.pollinations.ai/openai',
		needsKey: false,
		models: [{ id: 'openai', label: 'OpenAI GPT (бесплатно)' }],
		note: 'Ключ не нужен. Иногда отвечает медленно - это цена бесплатности.',
		fromRussia: true,
	},
	{
		id: 'openrouter',
		label: 'OpenRouter',
		baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
		needsKey: true,
		keyUrl: 'https://openrouter.ai/keys',
		models: [
			{ id: 'deepseek/deepseek-chat-v3.1:free', label: 'DeepSeek V3.1 (free)' },
			{ id: 'qwen/qwen3-coder:free', label: 'Qwen3 Coder (free)' },
			{ id: 'z-ai/glm-4.5-air:free', label: 'GLM 4.5 Air (free)' },
			{ id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (free)' },
			{ id: 'mistralai/mistral-small-3.2-24b-instruct:free', label: 'Mistral Small 3.2 (free)' },
			{ id: 'google/gemma-3-27b-it:free', label: 'Gemma 3 27B (free)' },
			{ id: 'moonshotai/kimi-k2:free', label: 'Kimi K2 (free)' },
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
			{ id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B (быстрая)' },
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
			{ id: 'glm-4.5-flash', label: 'GLM 4.5 Flash (бесплатно)' },
			{ id: 'glm-4.5-air', label: 'GLM 4.5 Air' },
		],
		note: 'GLM 4.5 Flash бесплатен, доступен из России и очень добротный.',
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
		id: 'custom',
		label: 'Свой сервер',
		baseUrl: '',
		needsKey: false,
		models: [],
		note: 'Любой OpenAI-совместимый сервер: LM Studio, Ollama, свой шлюз.',
	},
]

/** Everything that survives a restart lives here. */
export interface AiSettings {
	provider: string
	/** Chosen model per provider. */
	models: Record<string, string>
	/** Keys per provider. */
	keys: Record<string, string>
	customBaseUrl: string
	customModel: string
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
	mascotEnabled: true,
	mascotName: 'Крафт',
	mascotSkin: 'steve',
	chatEffects: true,
	affection: 20,
}

function readSettings(): AiSettings {
	try {
		const raw = localStorage.getItem(SETTINGS_KEY)
		if (!raw) return { ...DEFAULT_SETTINGS }
		return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
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

export interface AiMessage {
	role: 'user' | 'assistant' | 'note'
	content: string
	/** Milliseconds, for the interface. */
	ts?: number
	/** Which provider actually answered, for the label under a reply. */
	provider?: string
	/** Names of the launcher actions the reply carried out. */
	actions?: string[]
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
}

export function clearAiHistory() {
	aiHistory.value = []
	localStorage.removeItem(HISTORY_KEY)
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

/** The pages and screens the agent may open, with the paths to reach them. */
export const AI_NAVIGATION_HINT = [
	'Доступные маршруты лаунчера:',
	'- / — домашний экран со сборками',
	'- /browse/mod, /browse/modpack, /browse/resourcepack, /browse/shader — поиск контента (параметр q — поисковый запрос)',
	'- /project/<id> — страница проекта',
	'- /instance/<id> — сборка (экраны: /instance/<id>/worlds, /files, /logs, /screenshots)',
	'- /skins — скины игрока, /browse/skin — библиотека скинов',
	'- /lan — локальная игра по сети',
].join('\n')

export const AI_TOOLS_HINT = [
	'Ты можешь выполнять действия в лаунчере, добавляя в ответ команды вида <<инструмент|аргумент>> (аргумент одной строкой, без кавычек).',
	'Инструменты:',
	'- <<navigate|путь>> — открыть экран, например <<navigate|/browse/mod?q=jei>>',
	'- <<open_creation_modal|>> — открыть окно создания сборки (можно с подсказкой: <<open_creation_modal|сборка на 1.21.1 с JEI>>)',
	'- <<open_instance|id>> — открыть сборку по id',
	'- <<list_instances|>> — получить список сборок игрока',
	'- <<get_page|>> — узнать, какой экран сейчас открыт',
	'- <<web_fetch|url>> — скачать страницу (вернёт очищенный текст)',
	'- <<web_search|запрос>> — поиск в интернете',
	'- <<celebrate|>> — радостно отплясать',
	'Команды выполняются, только если они правда нужны пользователю; удалять или менять что-либо без явного согласия запрещено.',
].join('\n')

// ---- Personality ---------------------------------------------------------

/**
 * The system prompt. Short on purpose: free models start hallucinating tools
 * the launcher does not have if given room to. The mascot's mood is part of
 * the prompt, so petting it actually changes how it talks.
 */
export function buildSystemPrompt(kind: 'tab' | 'mascot', extra?: string): string {
	const settings = aiSettings.value
	const name = settings.mascotName || 'Помощник'
	const affection = Math.max(0, Math.min(100, settings.affection))
	const warmth =
		affection > 70
			? 'Ты очень привязан к игроку и даёшь это понять.'
			: affection > 40
				? 'Ты дружелюбен к игроку.'
				: 'Ты держишься сдержанно, но честно.'
	const lines = [
		`Ты — ${name}, встроенный ИИ-помощник лаунчера Portalrinth (форк Modrinth App) для Minecraft.`,
		warmth,
		'У тебя есть своё мнение: если пользователь просит вредного или сомнительного, ты вежливо споришь и предлагаешь лучше.',
		'Отвечай на языке пользователя. Без воды: коротко, по делу, шагами где уместно.',
		'Ты помогаешь со сборками, модами, скинами, настройкой, ошибками запуска и всем, что есть в лаунчере.',
		AI_NAVIGATION_HINT,
		AI_TOOLS_HINT,
	]
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

// ---- Network -------------------------------------------------------------

interface ChatMessagePayload {
	role: 'system' | 'user' | 'assistant'
	content: string
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
		throw new Error(`${provider.label}: HTTP ${response.status}${detail ? ` — ${detail}` : ''}`)
	}
	const data = (await response.json()) as {
		choices?: { message?: { content?: string } }[]
	}
	const content = data.choices?.[0]?.message?.content ?? ''
	if (!content) throw new Error(`${provider.label}: пустой ответ`)
	return content
}

/** Providers the launcher can fall back to when the chosen one is out of
 * free minutes: first the keyless one, then any free-tier provider that has
 * a key saved. */
function fallbackChain(primary: string): string[] {
	const chain = [primary]
	for (const candidate of ['pollinations', 'openrouter', 'zai', 'groq', 'cerebras']) {
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
}

/**
 * One assistant turn: asks the chosen provider, runs any launcher actions the
 * reply contained (up to three rounds, so the model can look things up and
 * then answer), and falls across providers when a free limit gets in the way.
 */
export async function aiComplete(request: AiRequest): Promise<AiResult> {
	const settings = aiSettings.value
	const system = buildSystemPrompt(request.kind, request.systemExtra)
	const rounds: ChatMessagePayload[] = [
		{ role: 'system', content: system },
		...(request.messages ?? []),
	]

	let providerTried = ''
	let lastError: unknown
	const doneActions: string[] = []

	for (const providerId of fallbackChain(settings.provider)) {
		providerTried = providerId
		let payload = rounds
		try {
			for (let round = 0; round < 3; round++) {
				const raw = await callProvider(providerId, payload, request.signal)
				const parsed = parseActions(raw)
				if (parsed.actions.length === 0 || round === 2) {
					return { content: parsed.text || raw, provider: providerTried, actions: doneActions }
				}
				const notes: string[] = []
				for (const action of parsed.actions.slice(0, 4)) {
					const result = await runTool(action.tool, action.args)
					doneActions.push(action.tool)
					request.onActionDone?.(action.tool, action.args, result)
					notes.push(`Результат ${action.tool}(${action.args}): ${result.slice(0, 1200)}`)
				}
				payload = [
					...payload,
					{ role: 'assistant', content: raw },
					{ role: 'user', content: notes.join('\n') + '\nПродолжи ответ пользователю.' },
				]
			}
		} catch (error) {
			lastError = error
			if (request.signal?.aborted) throw error
			if (!isRetryable(error)) throw error
		}
	}
	throw lastError ?? new Error('Ни один провайдер не ответил')
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
		const response = await proxiedFetch(
			`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
			{ headers: { Accept: 'text/html' } },
		)
		const html = await response.text()
		const results: string[] = []
		const pattern = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
		let match = pattern.exec(html)
		while (match && results.length < 5) {
			results.push(`${stripHtml(match[2])} — ${match[1]}`)
			match = pattern.exec(html)
		}
		if (results.length === 0) return 'Ничего не нашлось или поиск недоступен'
		return results.join('\n')
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
	return null
})

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

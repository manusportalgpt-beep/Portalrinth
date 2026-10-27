<script setup lang="ts">
import {
	ArrowUpIcon,
	BrainCogIcon,
	ClipboardCopyIcon,
	ChevronDownIcon,
	ExternalIcon,
	FileIcon,
	FolderOpenIcon,
	EditIcon,
	HistoryIcon,
	PlusIcon,
	StopCircleIcon,
	TrashIcon,
	XIcon,
	RefreshCwIcon,
} from '@modrinth/assets'
import { Button, IconButton, Input, useVIntl } from '@modrinth/ui'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useRouter } from 'vue-router'

import AiProviderSettings from '@/components/ui/ai/AiProviderSettings.vue'
import {
	type AiFolderCard,
	type AiJarCard,
	type AiMessage,
	type AiModCard,
	type AiSkinCard,
	agentBusy,
	agentPhase,
	agentQueue,
	agentStreaming,
	agentThoughts,
	agentTurn,
	aiHistory,
	aiSettings,
	clearAiHistory,
	errorOnTurn,
	providerById,
	noteAgentNavigation,
	queuedUserMessage,
	readSelectedBuild,
	sendAgentMessage,
	setSelectedBuild,
	stopAgentRun,
	zaiPeakHoursLabel,
} from '@/helpers/ai-assistant'
import { add_and_equip_custom_skin } from '@/helpers/skins'
import { labySkinPreview, labySkinTexture } from '@/helpers/laby-skins'
import { skinRenderUrl } from '@/helpers/skin-render-service'
import { getInstanceIconUrl, list as listInstances } from '@/helpers/instance'
import {
	attachFromPaths,
	type AttachedFile,
	currentSessionId,
	deleteSessionForever,
	formatSize,
	listSessions,
	listTrashedSessions,
	type SessionMeta,
	readLatestSession,
	readSession,
	restoreSession,
	sandboxAbsolutePath,
	sandboxReveal,
	trashSession,
} from '@/helpers/ai-sandbox'

const { formatMessage } = useVIntl()

const messages = {
	heading: { id: 'app.ai.heading', defaultMessage: 'ИИ-Помощник' },
	description: {
		id: 'app.ai.description',
		defaultMessage:
			'Portalus — агент лаунчера: создаёт моды, шейдеры и ресурс-паки, ищет в интернете, собирает сборки, разбирает ваши файлы и помнит прошлые разговоры.',
	},
	placeholder: {
		id: 'app.ai.input.placeholder',
		defaultMessage: 'Спросите что-нибудь… например, «собери сборку на 1.21 с JEI»',
	},
	send: { id: 'app.ai.send', defaultMessage: 'Отправить' },
	clear: { id: 'app.ai.clear', defaultMessage: 'Очистить историю' },
	emptyTitle: { id: 'app.ai.empty.title', defaultMessage: 'Чем помочь?' },
	emptyHint: {
		id: 'app.ai.empty.hint',
		defaultMessage:
			'Спросите про моды, сборки, скины или ошибки — ответы приходят от выбранной модели, а действия агент выполняет прямо в лаунчере.',
	},
	suggestionBuild: {
		id: 'app.ai.suggestion.build',
		defaultMessage: 'Собери сборку на 1.21.1 с оптимизацией',
	},
	suggestionMods: {
		id: 'app.ai.suggestion.mods',
		defaultMessage: 'Найди мод на карты для Forge 1.20.1',
	},
	suggestionCrash: {
		id: 'app.ai.suggestion.crash',
		defaultMessage: 'Почему сборка не запускается? Что посмотреть в логах?',
	},
	suggestionSkins: {
		id: 'app.ai.suggestion.skins',
		defaultMessage: 'Как поменять скин игрока в лаунчере?',
	},
	thinking: { id: 'app.ai.thinking', defaultMessage: 'Думает…' },
	plus: { id: 'app.ai.plus', defaultMessage: 'Меню чата' },
	plusNewChat: { id: 'app.ai.plus.new-chat', defaultMessage: 'Новый чат' },
	plusPaste: { id: 'app.ai.plus.paste', defaultMessage: 'Вставить из буфера' },
	plusPasteEmpty: {
		id: 'app.ai.plus.paste-empty',
		defaultMessage: 'В буфере обмена нет текста.',
	},
	plusAttach: { id: 'app.ai.plus.attach', defaultMessage: 'Прикрепить файл' },
	attach: { id: 'app.ai.attach', defaultMessage: 'Прикрепить файлы' },
	attachEmpty: {
		id: 'app.ai.attach-empty',
		defaultMessage: 'Файл не выбран',
	},
	models: { id: 'app.ai.models', defaultMessage: 'Модель и ключ' },
	commands: { id: 'app.ai.activity.commands', defaultMessage: 'команд' },
	filesCreated: { id: 'app.ai.activity.created', defaultMessage: 'сгенерирован файл' },
	filesChanged: { id: 'app.ai.activity.changed', defaultMessage: 'изменён файл' },
	openFolderCard: {
		id: 'app.ai.activity.open-folder',
		defaultMessage: 'Открыть папку в проводнике',
	},
	questionTitle: {
		id: 'app.ai.question.title',
		defaultMessage: 'Помощник ждёт вашего решения',
	},
	questionOwn: { id: 'app.ai.question.own', defaultMessage: 'Свой ответ…' },
	questionSend: { id: 'app.ai.question.send', defaultMessage: 'Ответить' },
	noVision: {
		id: 'app.ai.no-vision',
		defaultMessage: 'Эта модель не видит изображения.',
	},
	modsTitle: { id: 'app.ai.cards.mods', defaultMessage: 'Моды' },
	skinsTitle: { id: 'app.ai.cards.skins', defaultMessage: 'Скины' },
	skinInstall: { id: 'app.ai.cards.skin-install', defaultMessage: 'Поставить' },
	skinInstalled: { id: 'app.ai.cards.skin-installed', defaultMessage: 'Надет' },
	jarsTitle: { id: 'app.ai.cards.jars', defaultMessage: 'Файлы' },
	open: { id: 'app.ai.cards.open', defaultMessage: 'Открыть' },
	install: { id: 'app.ai.cards.install', defaultMessage: 'В сборку' },
	installed: { id: 'app.ai.cards.installed', defaultMessage: 'Установлено' },
	installFail: { id: 'app.ai.cards.install-fail', defaultMessage: 'Не установилось' },
	noInstances: {
		id: 'app.ai.cards.no-instances',
		defaultMessage: 'Сначала создай сборку — куда ставить .jar?',
	},
	historyTitle: { id: 'app.ai.history', defaultMessage: 'История чатов' },
	historyEmpty: {
		id: 'app.ai.history.empty',
		defaultMessage: 'Пока пусто — начните первый разговор',
	},
	historyNewChat: { id: 'app.ai.history.new-chat', defaultMessage: 'Новый чат' },
	historyMessages: { id: 'app.ai.history.messages', defaultMessage: 'сообщ.' },
	trashTitle: { id: 'app.ai.trash.title', defaultMessage: 'Корзина чатов' },
	trashEmpty: { id: 'app.ai.trash.empty', defaultMessage: 'Корзина пуста' },
	trashMove: { id: 'app.ai.trash.move', defaultMessage: 'В корзину' },
	trashRestore: { id: 'app.ai.trash.restore', defaultMessage: 'Восстановить' },
	trashDeleteForever: {
		id: 'app.ai.trash.delete-forever',
		defaultMessage: 'Удалить навсегда',
	},
	builds: { id: 'app.ai.builds', defaultMessage: 'Сборка для работы' },
	buildNone: { id: 'app.ai.builds.none', defaultMessage: 'Без сборки' },
	buildNoneHint: {
		id: 'app.ai.builds.none-hint',
		defaultMessage: 'Как со сборкой, но не только с ней — агент сам уточняет, куда ставить',
	},
	stop: { id: 'app.ai.stop', defaultMessage: 'Остановить' },
	processTitle: {
		id: 'app.ai.process.title',
		defaultMessage: 'Процесс размышления',
	},
	phaseThinking: { id: 'app.ai.phase.thinking', defaultMessage: 'Думаю…' },
	phaseWorking: { id: 'app.ai.phase.working', defaultMessage: 'Работаю…' },
	phaseSpeaking: { id: 'app.ai.phase.speaking', defaultMessage: 'Отвечаю…' },
	queuedBadge: { id: 'app.ai.queued', defaultMessage: 'в очереди' },
}

const suggestions = computed(() => [
	formatMessage(messages.suggestionBuild),
	formatMessage(messages.suggestionMods),
	formatMessage(messages.suggestionCrash),
	formatMessage(messages.suggestionSkins),
])

const input = ref('')
/** Shared with the module: a run survives leaving the page, so its state is
 * not the page's own. */
const sending = agentBusy
const streaming = agentStreaming
const errorText = ref('')
const processOpen = ref(true)
const plusOpen = ref(false)
const modelsOpen = ref(false)
const scrollBox = ref<HTMLElement | null>(null)
const attachments = ref<AttachedFile[]>([])
const questionDraft = ref('')
	const galleryOpen = ref<Record<string, boolean>>({})
	const zoomedImage = ref('')
const collapsedCards = ref<Record<string, boolean>>({})
const jarInstalled = ref<Record<string, boolean>>({})
const instances = ref<Awaited<ReturnType<typeof listInstances>>>([])
const chosenInstance = ref('')
const buildsOpen = ref(false)
const historyOpen = ref(false)
const sessionsList = ref<SessionMeta[]>([])
const trashedList = ref<SessionMeta[]>([])
const trashOpen = ref(false)
const historyLoading = ref(false)
const router = useRouter()

const visibleHistory = computed(() => aiHistory.value.filter((m) => m.role !== 'note'))

const modelChipLabel = computed(() => {
	const provider = providerById(aiSettings.value.provider)
	if (provider?.id === 'custom') {
		return aiSettings.value.customModel || 'Своя модель'
	}
	const stored = aiSettings.value.models[provider?.id ?? ''] ?? provider?.models[0]?.id ?? ''
	return provider?.models.find((m) => m.id === stored)?.label ?? stored
})

const lastQuestion = computed(() => {
	for (let i = visibleHistory.value.length - 1; i >= 0; i--) {
		const message = visibleHistory.value[i] as AiMessage
		if (message.role === 'user') return null
		if (message.role === 'assistant' && message.question) return message.question
	}
	return null
})

/** The thinking box shows roughly eight lines, then scrolls - and it is
 * transparent on purpose: thoughts float in the bubble, not in a panel. */
const thoughtBox = ref<HTMLElement | null>(null)

watch(
	() => agentThoughts.value.length,
	async () => {
		await nextTick()
		const box = thoughtBox.value
		if (box) box.scrollTop = box.scrollHeight
	},
)

function stopTyping() {
	streaming.value = ''
}

/** What the run in flight says it is doing right now. */
const phaseLabel = computed(() =>
	agentPhase.value === 'working'
		? formatMessage(messages.phaseWorking)
		: agentPhase.value === 'speaking'
			? formatMessage(messages.phaseSpeaking)
			: formatMessage(messages.phaseThinking),
)

function removeQueued(index: number) {
	agentQueue.value = agentQueue.value.filter((_, i) => i !== index)
}

function scrollToBottom() {
	void nextTick(() => {
		const box = scrollBox.value
		if (box) box.scrollTop = box.scrollHeight
	})
}

watch(visibleHistory, scrollToBottom, { deep: false })
watch(streaming, scrollToBottom)

function actionName(tool: string) {
	const map: Record<string, string> = {
		navigate: 'открыл экран',
		open_creation_modal: 'открыл создание сборки',
		open_instance: 'открыл сборку',
		list_instances: 'посмотрел список сборок',
		get_page: 'посмотрел, где вы находитесь',
		web_fetch: 'открыл страницу',
		web_search: 'поискал в интернете',
		launcher_set_accent: 'сменил цвет акцента',
		launcher_set_background: 'поставил фон',
		launcher_search_mods: 'поискал моды в CF и MR',
		sandbox_list: 'посмотрел файлы песочницы',
		sandbox_read: 'прочитал файл',
		sandbox_write: 'записал файл',
		sandbox_delete: 'удалил файл',
		sandbox_pack: 'упаковал архив',
		sandbox_unpack: 'распаковал архив',
		memory_read: 'перечитал заметки',
		memory_write: 'записал заметку',
		session_list: 'перечитал прошлые сессии',
		session_read: 'перечитал сессию',
		ask_user: 'спросил вас',
		celebrate: 'отплясывает',
		sandbox_bash: 'выполнил команду',
		open_folder: 'открыл папку',
		gen_image: 'сгенерировал картинку',
		launcher_set_theme: 'сменил тему',
		launcher_compile_java: 'скомпилировал мод в .jar',
		launcher_install: 'установил контент в сборку',
		music_add_url: 'скачал трек в плейлист',
		find_wallpaper: 'искал обои',
		view_image: 'посмотрел картинку',
		skill_save: 'сохранил навык',
		show_poll: 'устроил опрос',
	}
	return map[tool] ?? tool
}

function openSandboxFolder(path: string) {
	void sandboxReveal(path)
}

// ---- Card helpers ----------------------------------------------------------

function folderCardsOf(message: AiMessage): AiFolderCard[] {
	const raw = message.activity?.foldersOpened ?? []
	return raw.map((folder) => (typeof folder === 'string' ? { path: folder } : folder))
}

function folderName(path: string): string {
	const parts = path.split(/[\\/]/).filter(Boolean)
	return parts[parts.length - 1] ?? path
}

function compactCount(value: number | undefined): string {
	if (!value) return '0'
	try {
		return new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
	} catch {
		return String(value)
	}
}

function toggleCardGroup(key: string) {
	collapsedCards.value = { ...collapsedCards.value, [key]: !collapsedCards.value[key] }
}

const skinPreviews = ref<Record<string, string>>({})
const skinPreviewTried = new Set<string>()
const skinInstalling = ref<string[]>([])
const skinInstalledSkins = ref<string[]>([])

/**
 * The preview of a recommended skin: drawn from its texture (the same
 * canvas the Discover grid uses); the chosen 3D service stands in when
 * the texture route is dead.
 */
function skinPreviewSrc(hash: string): string {
	if (skinPreviews.value[hash]) return skinPreviews.value[hash]
	if (!skinPreviewTried.has(hash)) {
		skinPreviewTried.add(hash)
		labySkinPreview(hash)
			.then((url) => {
				skinPreviews.value = { ...skinPreviews.value, [hash]: url }
			})
			.catch(() => {
				const remote = skinRenderUrl(hash, 360, 684)
				if (remote) skinPreviews.value = { ...skinPreviews.value, [hash]: remote }
			})
	}
	return skinPreviews.value[hash] ?? ''
}

/** Puts a recommended skin on the account right from the chat card. */
async function installSkin(skin: AiSkinCard) {
	if (skinInstalling.value.includes(skin.hash)) return
	skinInstalling.value = [...skinInstalling.value, skin.hash]
	try {
		const texture = await labySkinTexture(skin.hash)
		await add_and_equip_custom_skin(texture, skin.variant)
		skinInstalledSkins.value = [...skinInstalledSkins.value, skin.hash]
	} catch {
		/* the card stays installable - a failed try is not a verdict */
	} finally {
		skinInstalling.value = skinInstalling.value.filter((hash) => hash !== skin.hash)
	}
}

async function openMod(mod: AiModCard) {
	if (mod.source === 'Modrinth') {
		noteAgentNavigation()
		void router.push(`/project/${mod.slug}`)
		return
	}
	try {
		const { openUrl } = await import('@tauri-apps/plugin-opener')
		await openUrl(mod.url)
	} catch {
		/* the card simply did not open - nothing sensible to do */
	}
}

async function installJar(jar: AiJarCard) {
	if (jarInstalled.value[jar.path]) return
	const instanceId = chosenInstance.value || instances.value[0]?.id
	if (!instanceId) {
		errorText.value = formatMessage(messages.noInstances)
		return
	}
	try {
		const absolute = await sandboxAbsolutePath(jar.path)
		await add_project_from_path(instanceId, absolute, 'mod')
		jarInstalled.value = { ...jarInstalled.value, [jar.path]: true }
	} catch (error) {
		errorText.value = `${formatMessage(messages.installFail)}: ${String(error).slice(0, 200)}`
	}
}

// ---- Chat history (saved sessions) -----------------------------------------

async function toggleHistory() {
	historyOpen.value = !historyOpen.value
	if (historyOpen.value) {
		historyLoading.value = true
		try {
			sessionsList.value = await listSessions(30)
			trashedList.value = await listTrashedSessions(30)
		} catch {
			sessionsList.value = []
			trashedList.value = []
		} finally {
			historyLoading.value = false
		}
	}
}

async function refreshSessionLists() {
	try {
		sessionsList.value = await listSessions(30)
		trashedList.value = await listTrashedSessions(30)
	} catch {
		/* the list simply stays as it was */
	}
}

function toggleTrash() {
	trashOpen.value = !trashOpen.value
	if (trashOpen.value) void refreshSessionLists()
}

/** A chat in the trash is not gone: Portalus can still read it - he just
 * does not bring it up on his own anymore. */
async function moveToTrash(meta: SessionMeta) {
	await trashSession(meta.id)
	if (currentSessionId.value === meta.id) {
		startFreshChat()
		return
	}
	await refreshSessionLists()
}

async function restoreTrashed(meta: SessionMeta) {
	await restoreSession(meta.id)
	await refreshSessionLists()
}

async function purgeTrashed(meta: SessionMeta) {
	await deleteSessionForever(meta.id)
	await refreshSessionLists()
}

function sessionLabel(meta: SessionMeta): string {
	const date = new Date(meta.updated || Date.now())
	const stamp = Number.isNaN(date.getTime())
		? ''
		: date.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
	return `${stamp} · ${meta.count} ${formatMessage(messages.historyMessages)}`
}

async function openSession(meta: SessionMeta) {
	if (sending.value) return
	historyOpen.value = false
	const session = await readSession(meta.id)
	if (session?.messages?.length) {
		stopTyping()
		errorText.value = ''
		currentSessionId.value = session.id
		aiHistory.value = session.messages as AiMessage[]
	}
}

/** The header's "new chat" button: wipes the conversation and starts a
 * fresh session file. The dead `plusNewChat()` call (a messages key, not
 * a function) made the button silently do nothing; a running agent is
 * stopped first, so the button answers every time. */
async function startFreshChat() {
	historyOpen.value = false
	if (sending.value) stopAgentRun()
	stopTyping()
	errorText.value = ''
	clearAiHistory()
	historyLoading.value = true
	try {
		sessionsList.value = await listSessions(30)
	} catch {
		sessionsList.value = []
	} finally {
		historyLoading.value = false
	}
}

/** The chat never blocks: while Portalus works, a new message quietly lines
 * up "в очереди" and goes out the moment the run ends or is stopped. */
async function send(text?: string) {
	const message = (text ?? input.value).trim()
	if (!message && attachments.value.length === 0) return
	errorText.value = ''
	errorOnTurn.value = ''
	input.value = ''
	const files = attachments.value
	attachments.value = []
	await sendAgentMessage(message, files)
}

/** Error boxes speak for 10 seconds, then step aside - or leave earlier
	 * through the cross, and never leave without a way to be copied. */
	let errorTimer: ReturnType<typeof setTimeout> | undefined
	watch(errorText, (value) => {
		clearTimeout(errorTimer)
		if (value) errorTimer = setTimeout(() => (errorText.value = ''), 10000)
	})

	// A failed run reports through the module; the page shows it the same way.
	watch(errorOnTurn, (value) => {
		if (value) errorText.value = value
	})

	function dismissError() {
		errorText.value = ''
	}

	async function copyError() {
		try {
			await navigator.clipboard.writeText(errorText.value)
		} catch {
			/* the box just stays */
		}
	}

function togglePlus() {
	plusOpen.value = !plusOpen.value
}

async function plusAttach() {
	plusOpen.value = false
	try {
		const { open } = await import('@tauri-apps/plugin-dialog')
		const paths = await open({ multiple: true })
		if (!paths) return
		const list = typeof paths === 'string' ? [paths] : paths
		const files = await attachFromPaths(list)
		if (files.length === 0) {
			errorText.value = formatMessage(messages.attachEmpty)
			return
		}
		attachments.value = [...attachments.value, ...files]
	} catch {
		errorText.value = formatMessage(messages.attachEmpty)
	}
}

function removeAttachment(index: number) {
	attachments.value = attachments.value.filter((_, i) => i !== index)
}

// ---- Message rendering: links out, code in -----------------------------

interface AiSegmentPart {
	kind: 'text' | 'link'
	text: string
	url?: string
}
type AiSegment =
	| { kind: 'code'; lang: string; lines: string[] }
	| { kind: 'text'; parts: AiSegmentPart[] }

const LINK_RE = /(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<>"')\]]+)/g

function splitLinks(text: string): AiSegmentPart[] {
	const parts: AiSegmentPart[] = []
	let cursor = 0
	let match = LINK_RE.exec(text)
	while (match) {
		if (match.index > cursor) parts.push({ kind: 'text', text: text.slice(cursor, match.index) })
		const token = match[0]
		const markdown = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(token)
		if (markdown) parts.push({ kind: 'link', text: markdown[1], url: markdown[2] })
		else parts.push({ kind: 'link', text: token, url: token })
		cursor = match.index + token.length
		match = LINK_RE.exec(text)
	}
	if (cursor < text.length) parts.push({ kind: 'text', text: text.slice(cursor) })
	return parts
}

/** Fenced code becomes its own segment; prose is scanned for links. */
function parseSegments(content: string): AiSegment[] {
	const segments: AiSegment[] = []
	const blocks = content.split('```')
	for (let i = 0; i < blocks.length; i++) {
		const block = blocks[i]
		if (i % 2 === 1) {
			const newline = block.indexOf('\n')
			const lang = newline >= 0 ? block.slice(0, newline).trim() : ''
			const code = newline >= 0 ? block.slice(newline + 1) : block
			segments.push({ kind: 'code', lang, lines: code.replace(/\n+$/, '').split('\n') })
		} else if (block.trim()) {
			segments.push({ kind: 'text', parts: splitLinks(block) })
		}
	}
	return segments
}

const MODRINTH_LINK = /^https?:\/\/(?:[a-z-]+\.)?modrinth\.com(?:\/|$)/i

/**
 * A link Portalus gave is a door, not a detour: Modrinth pages open right
 * here in the launcher, and everything else follows the toggle - the system
 * browser by default, or the launcher's own browser window when the player
 * turned that on in Settings → Функции.
 */
async function openLink(url: string) {
	try {
		if (MODRINTH_LINK.test(url)) {
			const path = url.replace(/^https?:\/\/(?:[a-z-]+\.)?modrinth\.com/i, '')
			await router.push(path || '/')
			return
		}
		const { portalrinthFeatures } = await import('@/helpers/portalrinth-features')
		if (portalrinthFeatures.value.aiLinksWindow) {
			await invoke('open_web_window', {
				label: 'portalrinth-ai-link',
				url,
				title: 'Браузер — Portalrinth',
			})
			return
		}
		const { openUrl } = await import('@tauri-apps/plugin-opener')
		await openUrl(url)
	} catch {
		/* the link simply did not open */
	}
}

function answerPoll(option: string) {
	if (sending.value) return
	void send(option)
}

function toggleGallery(key: string) {
	galleryOpen.value = { ...galleryOpen.value, [key]: !galleryOpen.value[key] }
}

/** The chat box itself: grows line by line up to eight, then scrolls. */
const inputEl = ref<HTMLTextAreaElement | null>(null)
const CHAT_MAX_HEIGHT = 264

function autoGrow() {
	const el = inputEl.value
	if (!el) return
	el.style.height = 'auto'
	el.style.height = `${Math.min(el.scrollHeight, CHAT_MAX_HEIGHT)}px`
	el.classList.toggle('ai-input-full', el.scrollHeight > CHAT_MAX_HEIGHT)
}

watch(input, autoGrow)

/** Paste goes straight in: pictures become previews, files become chips,
 * text lands where the caret is - no menu detour, no length cuts. */
function onPaste(event: ClipboardEvent) {
	const items = event.clipboardData?.items
	if (!items) return
	const files: File[] = []
	for (const item of items) {
		if (item.kind === 'file') {
			const file = item.getAsFile()
			if (file) files.push(file)
		}
	}
	if (files.length === 0) return
	event.preventDefault()
	void (async () => {
		const attached: AttachedFile[] = []
		for (const file of files) {
			try {
				if (file.type.startsWith('image/')) {
					const dataUrl = await new Promise<string>((resolve, reject) => {
						const reader = new FileReader()
						reader.onload = () => resolve(String(reader.result))
						reader.onerror = () => reject(reader.error)
						reader.readAsDataURL(file)
					})
					attached.push({ name: file.name || 'картинка.png', size: file.size, kind: 'image', dataUrl })
				} else if (file.size < 2000000) {
					attached.push({ name: file.name || 'файл', size: file.size, kind: 'text', text: await file.text() })
				} else {
					attached.push({ name: file.name || 'файл', size: file.size, kind: 'file' })
				}
			} catch {
				attached.push({ name: file.name || 'файл', size: file.size, kind: 'file' })
			}
		}
		if (attached.length > 0) attachments.value = [...attachments.value, ...attached]
	})()
}

function answerQuestion(answer: string) {
	if (sending.value) return
	const trimmed = answer.trim()
	if (!trimmed) return
	questionDraft.value = ''
	void send(trimmed)
}

function toggleModels() {
	modelsOpen.value = !modelsOpen.value
}

function toggleBuilds() {
	buildsOpen.value = !buildsOpen.value
	if (buildsOpen.value) {
		listInstances()
			.then((all) => (instances.value = all))
			.catch(() => {})
	}
}

const chosenBuildLabel = computed(() => {
	const found = instances.value.find((instance) => instance.id === chosenInstance.value)
	return found?.name ?? formatMessage(messages.buildNone)
})

/** The chosen build's own icon, right in the input chip, so the player
 * always sees which build the agent will work with. */
const chosenBuildIcon = computed(() => {
	const found = instances.value.find((instance) => instance.id === chosenInstance.value)
	return found ? instanceIcon(found.icon_path) : null
})

/** Picking a build tells the agent where things go; "Без сборки" unbinds. */
function selectBuild(id: string) {
	chosenInstance.value = id
	const found = instances.value.find((instance) => instance.id === id)
	setSelectedBuild(id && found ? { id, name: found.name } : null)
	buildsOpen.value = false
}

function instanceIcon(iconPath: string | undefined): string | null {
	return getInstanceIconUrl(iconPath ?? null)
}

onMounted(async () => {
	scrollToBottom()
	// The chat itself lives in localStorage; the sessions folder is the
	// long-term memory. If the local copy is gone, the last session restores.
	if (aiHistory.value.length === 0) {
		const session = await readLatestSession()
		if (session?.messages?.length) {
			aiHistory.value = session.messages as AiMessage[]
		}
	}
	listInstances()
		.then((all) => {
			instances.value = all
			const stored = readSelectedBuild()
			chosenInstance.value =
				stored && all.some((instance) => instance.id === stored.id)
					? stored.id
					: ''
		})
		.catch(() => {})
	watch(
		queuedUserMessage,
		(message) => {
			if (message) {
				queuedUserMessage.value = ''
				void send(message)
			}
		},
		{ immediate: true },
	)
})

onBeforeUnmount(stopTyping)

defineExpose({ send })
</script>

<template>
	<div class="ai-page flex h-full min-h-0 flex-col">
		<div class="flex items-start justify-between gap-3 px-6 pt-6">
			<div class="flex flex-col gap-1">
				<h1 class="m-0 text-2xl font-bold text-primary">{{ formatMessage(messages.heading) }}</h1>
			</div>
			<div class="relative flex shrink-0 items-center gap-1">
				<IconButton
					v-tooltip="formatMessage(messages.historyNewChat)"
					type="quiet"
					:label="formatMessage(messages.historyNewChat)"
					@click="startFreshChat"
				>
					<EditIcon />
				</IconButton>
				<IconButton
					v-tooltip="formatMessage(messages.historyTitle)"
					type="quiet"
					:label="formatMessage(messages.historyTitle)"
					@click="toggleHistory"
				>
					<HistoryIcon />
				</IconButton>
				<div v-if="historyOpen" class="fixed inset-0 z-10 cursor-default" @click="historyOpen = false" />
				<div
					v-if="historyOpen"
					class="ai-menu absolute right-0 top-full z-20 mt-2 flex max-h-[30rem] w-[24rem] flex-col rounded-2xl border border-solid border-surface-5 bg-surface-2 p-2"
				>
					<div class="mb-1 flex items-center justify-between gap-2 px-2">
						<p class="m-0 text-sm font-semibold text-primary">
							{{ formatMessage(trashOpen ? messages.trashTitle : messages.historyTitle) }}
						</p>
						<div class="flex items-center gap-1">
							<IconButton
								v-tooltip="formatMessage(messages.trashTitle)"
								type="quiet"
								:label="formatMessage(messages.trashTitle)"
								@click="toggleTrash"
							>
								<TrashIcon />
							</IconButton>
							<Button size="sm" @click="startFreshChat">
								{{ formatMessage(messages.historyNewChat) }}
							</Button>
						</div>
					</div>
					<div class="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
						<p
							v-if="historyLoading"
							class="m-0 px-2 py-3 text-sm text-secondary"
						>…</p>
						<p
							v-else-if="(trashOpen ? trashedList : sessionsList).length === 0"
							class="m-0 px-2 py-3 text-sm text-secondary"
						>
							{{ formatMessage(trashOpen ? messages.trashEmpty : messages.historyEmpty) }}
						</p>
						<div
							v-for="meta in trashOpen ? trashedList : sessionsList"
							:key="meta.id"
							class="flex items-center gap-0.5"
						>
							<button class="ai-history-item grow" @click="() => openSession(meta)">
								<span class="ai-history-meta">{{ sessionLabel(meta) }}</span>
								<span class="ai-history-preview">{{ meta.preview || meta.id }}</span>
							</button>
							<template v-if="trashOpen">
								<IconButton
									v-tooltip="formatMessage(messages.trashRestore)"
									type="quiet"
									:label="formatMessage(messages.trashRestore)"
									@click="() => restoreTrashed(meta)"
								>
									<RefreshCwIcon />
								</IconButton>
								<IconButton
									v-tooltip="formatMessage(messages.trashDeleteForever)"
									type="quiet"
									:label="formatMessage(messages.trashDeleteForever)"
									@click="() => purgeTrashed(meta)"
								>
									<XIcon />
								</IconButton>
							</template>
							<IconButton
								v-else
								v-tooltip="formatMessage(messages.trashMove)"
								type="quiet"
								:label="formatMessage(messages.trashMove)"
								@click="() => moveToTrash(meta)"
							>
								<TrashIcon />
							</IconButton>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div ref="scrollBox" class="min-h-0 grow overflow-y-auto px-6 py-4">
			<div
				v-if="visibleHistory.length === 0"
				class="flex h-full flex-col items-center justify-center gap-2 text-center"
			>
				<p class="m-0 text-lg font-semibold text-primary">
					{{ formatMessage(messages.emptyTitle) }}
				</p>
				<p class="m-0 max-w-xl text-sm text-secondary">
					{{ formatMessage(messages.emptyHint) }}
				</p>
				<div class="mt-2 flex max-w-xl flex-wrap justify-center gap-2">
					<Button
						v-for="suggestion in suggestions"
						:key="suggestion"
						size="sm"
						@click="() => send(suggestion)"
					>
						{{ suggestion }}
					</Button>
				</div>
			</div>

			<template v-else>
				<div
					v-for="(message, index) in visibleHistory"
					:key="index"
					class="mb-3 flex"
					:class="message.role === 'user' ? 'justify-end' : 'justify-start'"
				>
					<div
						class="ai-bubble max-w-[85%] rounded-2xl px-4 py-2.5"
						:class="message.role === 'user' ? 'ai-bubble-user' : 'ai-bubble-assistant'"
					>
						<div v-if="message.attachments?.length" class="mb-2 flex flex-wrap gap-2">
							<template v-for="(file, fileIndex) in message.attachments" :key="fileIndex">
								<img
									v-if="file.kind === 'image' && file.dataUrl"
									:src="file.dataUrl"
									:alt="file.name"
									class="ai-attach-image"
								/>
								<span v-else class="ai-attach-chip">
									<FileIcon class="size-3.5 shrink-0" />
									{{ file.name }}
									<span v-if="file.size" class="text-secondary">{{ formatSize(file.size) }}</span>
								</span>
							</template>
						</div>
						<template v-if="parseSegments(message.content).length > 0">
							<template v-for="(segment, segmentIndex) in parseSegments(message.content)" :key="`seg-${segmentIndex}`">
								<div v-if="segment.kind === 'code'" class="ai-code-block">
									<p class="ai-code-head m-0">{{ segment.lang || 'код' }}</p>
									<pre class="ai-code-pre m-0"><code><span
										v-for="(line, lineIndex) in segment.lines"
										:key="lineIndex"
										class="ai-code-line"
										:class="{ 'ai-code-animated': aiSettings.chatEffects }"
										:style="{ animationDelay: `${Math.min(lineIndex * 70, 2800)}ms` }"
									>{{ line }}</span></code></pre>
								</div>
								<p v-else class="m-0 whitespace-pre-wrap break-words text-sm leading-relaxed"><template
									v-for="(part, partIndex) in segment.parts"
									:key="partIndex"
								><span v-if="part.kind === 'text'">{{ part.text }}</span><a
									v-else
									class="ai-link"
									:href="part.url"
									@click.prevent="() => openLink(part.url!)"
								>{{ part.text }}<ExternalIcon class="ai-link-icon" /></a></template></p>
							</template>
						</template>
						<p v-else class="m-0 whitespace-pre-wrap break-words text-sm leading-relaxed">
							{{ message.content }}
						</p>

						<div v-if="message.activity" class="ai-activity">
							<span v-if="message.activity.commands > 0" class="ai-activity-chip">
								⚙ {{ message.activity.commands }} {{ formatMessage(messages.commands) }}
							</span>
							<span
								v-for="file in message.activity.filesCreated"
								:key="`c-${file}`"
								class="ai-activity-chip ai-activity-created"
							>
								＋ {{ formatMessage(messages.filesCreated) }}: {{ file }}
							</span>
							<span
								v-for="change in message.activity.filesChanged"
								:key="`m-${change.path}`"
								class="ai-activity-chip ai-activity-changed"
							>
								{{ formatMessage(messages.filesChanged) }}: {{ change.path }}
								<span class="text-green">+{{ change.added }}</span>/<span class="text-red">
									−{{ change.removed }}</span
								>
							</span>
							<span
								v-for="(image, imageIndex) in message.activity.images ?? []"
								:key="`img-${imageIndex}`"
								class="ai-activity-image-wrap"
							>
								<img :src="image" class="ai-activity-image" alt="" />
							</span>
						</div>

						<div v-if="folderCardsOf(message).length" class="ai-cards">
							<div v-for="folder in folderCardsOf(message)" :key="`fc-${folder.path}`" class="ai-folder-card">
								<span class="ai-card-glyph"><FolderOpenIcon class="size-5" /></span>
								<div class="min-w-0 grow">
									<p class="ai-card-title">{{ folderName(folder.path) }}</p>
									<p v-if="folder.description" class="ai-card-desc">{{ folder.description }}</p>
								</div>
								<Button size="sm" class="shrink-0" @click="() => openSandboxFolder(folder.path)">
									{{ formatMessage(messages.open) }}
								</Button>
							</div>
						</div>

						<div v-if="message.activity?.mods?.length" class="ai-cards">
							<button class="ai-cards-toggle" @click="() => toggleCardGroup(`m-${index}`)">
								<span>{{ formatMessage(messages.modsTitle) }} · {{ message.activity.mods.length }}</span>
								<ChevronDownIcon class="size-3.5 transition-transform" :class="{ '-rotate-90': collapsedCards[`m-${index}`] }" />
							</button>
							<div v-if="!collapsedCards[`m-${index}`]" class="flex flex-col gap-1.5">
								<button
									v-for="mod in message.activity.mods"
									:key="`${mod.source}-${mod.projectId}`"
									class="ai-mod-card"
									@click="() => openMod(mod)"
								>
									<img v-if="mod.iconUrl" :src="mod.iconUrl" class="ai-mod-icon" alt="" loading="lazy" />
									<FileIcon v-else class="ai-mod-icon ai-mod-icon-fallback" />
									<div class="min-w-0 grow text-left">
										<p class="ai-card-title">{{ mod.title }}</p>
										<p class="ai-card-meta">
											{{ mod.source }}<template v-if="mod.author"> · {{ mod.author }}</template>
										</p>
										<p v-if="mod.description" class="ai-card-desc">{{ mod.description }}</p>
										<p class="ai-card-meta">
											{{ compactCount(mod.downloads) }} ↓
											<template v-if="mod.source === 'Modrinth' && mod.follows">
												· {{ compactCount(mod.follows) }} ♥
											</template>
										</p>
										<span
											v-if="mod.gallery?.length"
											class="ai-gallery-open"
											@click.stop="() => toggleGallery(`${index}-${mod.projectId}`)"
										>
											Галерея · {{ mod.gallery.length }}
										</span>
										<div v-if="galleryOpen[`${index}-${mod.projectId}`] && mod.gallery?.length" class="ai-gallery">
											<img
												v-for="(shot, shotIndex) in mod.gallery"
												:key="shotIndex"
												:src="shot"
												class="ai-gallery-thumb"
												loading="lazy"
												alt=""
												@click.stop="() => (zoomedImage = shot)"
											/>
										</div>
									</div>
								</button>
							</div>
						</div>

												<div v-if="message.activity?.skins?.length" class="ai-cards">
							<button class="ai-cards-toggle" @click="() => toggleCardGroup(`s-${index}`)">
								<span>{{ formatMessage(messages.skinsTitle) }} · {{ message.activity.skins.length }}</span>
								<ChevronDownIcon class="size-3.5 transition-transform" :class="{ '-rotate-90': collapsedCards[`s-${index}`] }" />
							</button>
							<div v-if="!collapsedCards[`s-${index}`]" class="ai-skin-grid">
								<div v-for="skin in message.activity.skins" :key="skin.hash" class="ai-skin-card">
									<img
										v-if="skinPreviewSrc(skin.hash)"
										:src="skinPreviewSrc(skin.hash)"
										class="ai-skin-img"
										alt=""
										loading="lazy"
									/>
									<div v-else class="ai-skin-img ai-skin-skeleton" />
									<p class="ai-card-title">{{ skin.tags || formatMessage(messages.skinsTitle) }}</p>
									<p class="ai-card-meta">{{ skin.uses ?? 0 }} игр. · {{ skin.variant === 'SLIM' ? 'Slim' : 'Classic' }}</p>
									<Button
										size="sm"
										class="w-full"
										:disabled="skinInstalling.includes(skin.hash) || skinInstalledSkins.includes(skin.hash)"
										@click="() => installSkin(skin)"
									>
										{{ skinInstalledSkins.includes(skin.hash) ? formatMessage(messages.skinInstalled) : formatMessage(messages.skinInstall) }}
									</Button>
								</div>
							</div>
						</div>

<div v-if="message.activity?.jars?.length" class="ai-cards">
							<button class="ai-cards-toggle" @click="() => toggleCardGroup(`j-${index}`)">
								<span>{{ formatMessage(messages.jarsTitle) }} · {{ message.activity.jars.length }}</span>
								<ChevronDownIcon class="size-3.5 transition-transform" :class="{ '-rotate-90': collapsedCards[`j-${index}`] }" />
							</button>
							<div v-if="!collapsedCards[`j-${index}`]" class="flex flex-col gap-1.5">
								<div v-for="jar in message.activity.jars" :key="jar.path" class="ai-jar-card">
									<img v-if="jar.iconDataUrl" :src="jar.iconDataUrl" class="ai-mod-icon" alt="" />
									<FileIcon v-else class="ai-mod-icon ai-mod-icon-fallback" />
									<div class="min-w-0 grow">
										<p class="ai-card-title">{{ jar.name }}</p>
										<p class="ai-card-meta">{{ jar.version }} · .jar</p>
									</div>
									<div class="flex shrink-0 items-center gap-1.5">
										<select v-if="instances.length > 1" v-model="chosenInstance" class="ai-jar-select">
											<option v-for="instance in instances" :key="instance.id" :value="instance.id">
												{{ instance.name }}
											</option>
										</select>
										<Button size="sm" color="brand" :disabled="jarInstalled[jar.path]" @click="() => installJar(jar)">
											{{ jarInstalled[jar.path] ? formatMessage(messages.installed) : formatMessage(messages.install) }}
										</Button>
										<IconButton
											v-tooltip="formatMessage(messages.openFolderCard)"
											:label="formatMessage(messages.openFolderCard)"
											@click="() => openSandboxFolder(jar.path)"
										>
											<FolderOpenIcon class="size-4" />
										</IconButton>
									</div>
								</div>
							</div>
						</div>

						<div v-if="message.activity?.polls?.length" class="ai-cards">
							<div v-for="(poll, pollIndex) in message.activity.polls" :key="`poll-${pollIndex}`" class="ai-poll-card">
								<p class="ai-card-title m-0">{{ poll.text }}</p>
								<div class="mt-1 flex flex-wrap gap-2">
									<Button v-for="option in poll.options" :key="option" size="sm" :disabled="sending" @click="() => answerPoll(option)">
										{{ option }}
									</Button>
								</div>
							</div>
						</div>
						<div v-if="message.actions?.length" class="mt-1.5 flex flex-wrap gap-1">
							<span v-for="action in message.actions" :key="action" class="ai-action-chip">
								{{ actionName(action) }}
							</span>
						</div>
					</div>
				</div>

				<div v-if="lastQuestion" class="mb-3 flex justify-start">
					<div class="ai-question-card rounded-2xl p-4">
						<p class="m-0 mb-2 text-sm font-semibold text-primary">
							{{ lastQuestion.text }}
						</p>
						<div class="flex flex-wrap gap-2">
							<Button
								v-for="option in lastQuestion.options"
								:key="option"
								size="sm"
								:disabled="sending"
								@click="() => answerQuestion(option)"
							>
								{{ option }}
							</Button>
						</div>
						<div class="mt-2 flex items-center gap-2">
							<Input
								v-model="questionDraft"
								:disabled="sending"
								:placeholder="formatMessage(messages.questionOwn)"
								class="max-w-xs grow"
								@keydown.enter.prevent="() => answerQuestion(questionDraft)"
							/>
							<Button
								color="brand"
								size="sm"
								:disabled="sending || !questionDraft.trim()"
								@click="() => answerQuestion(questionDraft)"
							>
								{{ formatMessage(messages.questionSend) }}
							</Button>
						</div>
					</div>
				</div>
			</template>

			<div v-if="zoomedImage" class="ai-zoom" @click="() => (zoomedImage = '')">
				<img :src="zoomedImage" class="ai-zoom-image" alt="" />
			</div>

			<div v-if="sending" class="mb-3 flex justify-start">
				<div class="ai-bubble ai-bubble-assistant ai-process rounded-2xl px-4 py-2.5">
					<button
						class="ai-process-toggle"
						:aria-expanded="processOpen"
						@click="processOpen = !processOpen"
					>
						<BrainCogIcon class="size-4 shrink-0 text-brand" />
						<span class="grow text-left">{{ formatMessage(messages.processTitle) }}</span>
						<span class="ai-process-phase">{{ phaseLabel }}</span>
						<ChevronDownIcon
							class="size-3.5 opacity-70 transition-transform"
							:class="{ '-rotate-90': !processOpen }"
						/>
					</button>
					<div v-if="processOpen" class="ai-process-body">
						<div ref="thoughtBox" class="ai-thoughts">
							<p
								v-for="(thought, thoughtIndex) in agentThoughts"
								:key="thoughtIndex"
								class="ai-thought"
							>
								{{ thought }}
							</p>
							<span v-if="agentThoughts.length === 0" class="ai-typing">
								<span /><span /><span />
								{{ phaseLabel }}
							</span>
						</div>
						<div v-if="agentTurn.actions.length > 0" class="mt-1 flex flex-wrap gap-1">
							<span
								v-for="action in agentTurn.actions"
								:key="action"
								class="ai-action-chip ai-action-chip-live"
							>
								{{ actionName(action) }}
							</span>
						</div>
					</div>
				</div>
			</div>
			<div v-else-if="streaming" class="mb-3 flex justify-start">
				<div class="ai-bubble ai-bubble-assistant rounded-2xl px-4 py-2.5">
					<p class="m-0 whitespace-pre-wrap break-words text-sm leading-relaxed">
						{{ streaming }}
					</p>
				</div>
			</div>
		</div>

		<div class="shrink-0 px-6 pb-6">
			<div v-if="agentQueue.length > 0" class="mb-2 flex flex-col gap-1">
				<div v-for="(queued, queueIndex) in agentQueue" :key="queued.ts" class="ai-queued">
					<span class="ai-queued-badge">{{ formatMessage(messages.queuedBadge) }}</span>
					<span class="min-w-0 grow truncate">{{ queued.text }}</span>
					<button
						v-tooltip="'Убрать из очереди'"
						class="ai-queued-remove"
						aria-label="Убрать из очереди"
						@click="() => removeQueued(queueIndex)"
					>
						<XIcon class="size-3.5" />
					</button>
				</div>
			</div>

			<div v-if="errorText" class="ai-error m-0 mb-2 flex items-start gap-2 rounded-xl px-3 py-2 text-sm">
				<span class="min-w-0 grow break-words">{{ errorText }}</span>
				<button v-tooltip="'Скопировать'" class="ai-error-btn" aria-label="Скопировать" @click="copyError">
					<ClipboardCopyIcon class="size-3.5" />
				</button>
				<button v-tooltip="'Закрыть'" class="ai-error-btn" aria-label="Закрыть" @click="dismissError">
					<XIcon class="size-3.5" />
				</button>
			</div>

			<div v-if="attachments.length > 0" class="mb-2 flex flex-wrap gap-2">
				<span v-for="(file, index) in attachments" :key="`${file.name}-${index}`" class="ai-attach-chip">
					<img
						v-if="file.kind === 'image' && file.dataUrl"
						:src="file.dataUrl"
						:alt="file.name"
						class="size-6 rounded object-cover"
					/>
					<FileIcon v-else class="size-3.5 shrink-0" />
					{{ file.name }}
					<span v-if="file.size" class="text-secondary">{{ formatSize(file.size) }}</span>
					<button
						class="ml-1 cursor-pointer border-none bg-transparent p-0 text-secondary hover:text-primary"
						@click="removeAttachment(index)"
					>
						<XIcon class="size-3.5" />
					</button>
				</span>
			</div>

			<div
				class="ai-input-row flex items-center gap-2 rounded-3xl bg-surface-2 p-2"
			>
				<div class="relative shrink-0">
					<IconButton
						v-tooltip="formatMessage(messages.plus)"
						:label="formatMessage(messages.plus)"
						@click="togglePlus"
					>
						<PlusIcon />
					</IconButton>
					<div
						v-if="plusOpen"
						class="fixed inset-0 z-10 cursor-default"
						@click="plusOpen = false"
					/>
					<div
						v-if="plusOpen"
						class="ai-menu absolute bottom-full left-0 z-20 mb-2 flex min-w-56 flex-col gap-1 rounded-xl border border-solid border-surface-5 bg-surface-2 p-1"
					>
						<button class="ai-menu-item" @click="plusAttach">
							<FileIcon class="size-4" />
							{{ formatMessage(messages.plusAttach) }}
						</button>
					</div>
				</div>
				<textarea
					ref="inputEl"
					v-model="input"
					class="ai-input grow"
					rows="1"
					:placeholder="formatMessage(messages.placeholder)"
					@keydown.enter.exact.prevent="() => send()"
					@paste="onPaste"
				/>
				<div class="relative shrink-0">
					<button class="ai-model-chip" @click="toggleBuilds">
						<img
							v-if="chosenBuildIcon"
							:src="chosenBuildIcon"
							alt=""
							class="size-4 shrink-0 rounded object-cover"
						/>
						{{ chosenBuildLabel }}
						<ChevronDownIcon class="size-3.5 opacity-70" />
					</button>
					<div
						v-if="buildsOpen"
						class="fixed inset-0 z-10 cursor-default"
						@click="buildsOpen = false"
					/>
					<div
						v-if="buildsOpen"
						class="ai-menu absolute bottom-full left-0 z-20 mb-2 flex max-h-[26rem] w-[22rem] flex-col overflow-y-auto rounded-2xl border border-solid border-surface-5 bg-surface-2 p-2"
					>
						<p class="m-0 mb-2 px-1 text-sm font-semibold text-primary">
							{{ formatMessage(messages.builds) }}
						</p>
						<button class="ai-build-item" @click="() => selectBuild('')">
							<span class="ai-build-glyph"><PlusIcon class="size-4" /></span>
							<span class="min-w-0 grow text-left">
								<span class="ai-build-name">{{ formatMessage(messages.buildNone) }}</span>
								<span class="ai-build-meta">{{ formatMessage(messages.buildNoneHint) }}</span>
							</span>
						</button>
						<button
							v-for="instance in instances"
							:key="instance.id"
							class="ai-build-item"
							@click="() => selectBuild(instance.id)"
						>
							<img
								v-if="instanceIcon(instance.icon_path)"
								:src="instanceIcon(instance.icon_path) ?? ''"
								class="ai-build-icon"
								alt=""
								loading="lazy"
							/>
							<span v-else class="ai-build-glyph"><FileIcon class="size-4" /></span>
							<span class="min-w-0 grow text-left">
								<span class="ai-build-name">{{ instance.name }}</span>
								<span class="ai-build-meta">
									{{ instance.loader ?? 'vanilla' }} · {{ instance.game_version }}
								</span>
							</span>
							<span v-if="chosenInstance === instance.id" class="ai-build-check">✓</span>
						</button>
					</div>
				</div>
				<div class="relative shrink-0">
					<button class="ai-model-chip" @click="toggleModels">
						{{ modelChipLabel }}
						<ChevronDownIcon class="size-3.5 opacity-70" />
					</button>
					<div
						v-if="modelsOpen"
						class="fixed inset-0 z-10 cursor-default"
						@click="modelsOpen = false"
					/>
					<div
						v-if="modelsOpen"
						class="ai-menu absolute bottom-full right-0 z-20 mb-2 w-[34rem] rounded-2xl border border-solid border-surface-5 bg-surface-2 p-4"
					>
						<p class="m-0 mb-3 text-sm font-semibold text-primary">
							{{ formatMessage(messages.models) }}
						</p>
						<p class="ai-peak-note m-0 mb-3 text-xs">
							{{ zaiPeakHoursLabel() }}
						</p>
						<AiProviderSettings compact />
					</div>
				</div>
				<Button
					v-if="sending"
					v-tooltip="formatMessage(messages.stop)"
					class="ai-send !rounded-full"
					:label="formatMessage(messages.stop)"
					@click="stopAgentRun"
				>
					<StopCircleIcon />
				</Button>
				<Button
					v-else
					color="brand"
					class="ai-send !rounded-full"
					:disabled="!input.trim() && attachments.length === 0"
					@click="() => send()"
				>
					<ArrowUpIcon />
				</Button>
			</div>
		</div>
	</div>
</template>

<style scoped>
.ai-bubble-user {
	background: color-mix(in srgb, var(--color-brand) 18%, var(--color-button-bg));
	border: 1px solid color-mix(in srgb, var(--color-brand) 30%, transparent);
	border-bottom-right-radius: 0.5rem;
}

.ai-bubble-assistant {
	background: var(--color-button-bg);
	border: 1px solid var(--surface-5);
	border-bottom-left-radius: 0.5rem;
}

.ai-action-chip {
	display: inline-flex;
	align-items: center;
	gap: 0.25rem;
	border-radius: 999px;
	background: color-mix(in srgb, var(--color-brand) 14%, transparent);
	color: var(--color-brand);
	font-size: 0.6875rem;
	padding: 0.1rem 0.5rem;
}

.ai-process-body {
	display: flex;
	flex-direction: column;
	gap: 0.35rem;
}

/* Eight lines of thoughts, then it scrolls - transparent on purpose. */
.ai-thoughts {
	display: flex;
	flex-direction: column;
	gap: 0.15rem;
	max-height: 9rem;
	overflow-y: auto;
	background: transparent;
}

.ai-thought {
	margin: 0;
	font-size: 0.75rem;
	line-height: 1.3;
	color: var(--color-secondary);
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.ai-peak-note {
	color: var(--color-secondary);
}

.ai-build-item {
	display: flex;
	align-items: center;
	gap: 0.6rem;
	border: none;
	border-radius: 0.6rem;
	background: transparent;
	padding: 0.45rem 0.6rem;
	cursor: pointer;
	font: inherit;
}

.ai-build-item:hover {
	background: var(--color-button-bg);
}

.ai-build-icon {
	height: 2.25rem;
	width: 2.25rem;
	border-radius: 0.45rem;
	object-fit: cover;
	flex-shrink: 0;
}

.ai-build-glyph {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	height: 2.25rem;
	width: 2.25rem;
	border-radius: 0.45rem;
	background: var(--color-button-bg);
	color: var(--color-secondary);
	flex-shrink: 0;
}

.ai-build-name {
	display: block;
	font-size: 0.8125rem;
	font-weight: 600;
	color: var(--color-primary);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.ai-build-meta {
	display: block;
	font-size: 0.6875rem;
	color: var(--color-secondary);
}

.ai-build-check {
	color: var(--color-brand);
	font-weight: 700;
}

.ai-error {
	border: 1px solid color-mix(in srgb, var(--color-red) 40%, transparent);
	background: color-mix(in srgb, var(--color-red) 12%, transparent);
	color: var(--color-red);
}

.ai-input-row {
	box-shadow: 0 8px 24px rgb(0 0 0 / 18%);
}

.ai-menu {
	box-shadow: 0 8px 24px rgb(0 0 0 / 18%);
}

.ai-menu-item {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	border-radius: 0.5rem;
	padding: 0.45rem 0.75rem;
	font-size: 0.8125rem;
	color: var(--color-primary);
	text-align: left;
	cursor: pointer;
	background: transparent;
	border: none;
}

.ai-menu-item:hover {
	background: var(--color-button-bg);
}

.ai-model-chip {
	display: inline-flex;
	align-items: center;
	gap: 0.375rem;
	max-width: 16rem;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	border: 1px solid var(--surface-5);
	background: var(--color-button-bg);
	border-radius: 999px;
	padding: 0.45rem 0.8rem;
	font-size: 0.8125rem;
	color: var(--color-primary);
	cursor: pointer;
}

.ai-model-chip:hover {
	border-color: var(--color-brand);
}

.ai-model-chip:disabled {
	opacity: 0.6;
	cursor: default;
}

.ai-send {
	width: 2.75rem;
	height: 2.75rem;
	min-width: 2.75rem;
	padding: 0;
}

.ai-attach-image {
	max-height: 10rem;
	max-width: 16rem;
	border-radius: 0.75rem;
	border: 1px solid var(--surface-5);
	object-fit: cover;
}

.ai-attach-chip {
	display: inline-flex;
	align-items: center;
	gap: 0.375rem;
	border-radius: 0.625rem;
	border: 1px solid var(--surface-5);
	background: var(--color-button-bg);
	padding: 0.3rem 0.6rem;
	font-size: 0.75rem;
	color: var(--color-primary);
}

.ai-activity {
	display: flex;
	flex-wrap: wrap;
	gap: 0.375rem;
	margin-top: 0.5rem;
}

.ai-activity-chip {
	display: inline-flex;
	align-items: center;
	gap: 0.25rem;
	border-radius: 0.5rem;
	background: color-mix(in srgb, var(--color-secondary) 12%, transparent);
	color: var(--color-secondary);
	font-size: 0.6875rem;
	padding: 0.1rem 0.45rem;
}

.ai-activity-created {
	background: color-mix(in srgb, var(--color-green) 16%, transparent);
	color: var(--color-green);
}

.ai-activity-changed {
	background: color-mix(in srgb, var(--color-orange) 16%, transparent);
	color: var(--color-orange);
}

.ai-activity-folder {
	display: inline-flex;
	align-items: center;
	gap: 0.375rem;
	cursor: pointer;
	border: 1px solid color-mix(in srgb, var(--color-brand) 35%, transparent);
	background: color-mix(in srgb, var(--color-brand) 12%, transparent);
	color: var(--color-brand);
	font: inherit;
	font-size: 0.75rem;
	padding: 0.25rem 0.5rem;
	border-radius: 9999px;
}

.ai-activity-folder:hover {
	background: color-mix(in srgb, var(--color-brand) 22%, transparent);
}

.ai-activity-image-wrap {
	display: inline-flex;
	max-width: 100%;
}

.ai-activity-image {
	max-width: 200px;
	max-height: 150px;
	border-radius: 0.75rem;
	border: 1px solid var(--color-surface-5);
	object-fit: cover;
}

.ai-question-card {
	background: color-mix(in srgb, var(--color-brand) 10%, var(--color-button-bg));
	border: 1px solid color-mix(in srgb, var(--color-brand) 35%, transparent);
	max-width: 85%;
}

.ai-typing {
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
	color: var(--color-secondary);
	font-size: 0.8125rem;
}

.ai-typing span {
	width: 0.35rem;
	height: 0.35rem;
	border-radius: 999px;
	background: var(--color-brand);
	animation: ai-dot 1.2s infinite ease-in-out;
}

.ai-typing span:nth-child(2) {
	animation-delay: 0.15s;
}

.ai-typing span:nth-child(3) {
	animation-delay: 0.3s;
}

@keyframes ai-dot {
	0%,
	80%,
	100% {
		transform: translateY(0);
		opacity: 0.4;
	}
	40% {
		transform: translateY(-0.25rem);
		opacity: 1;
	}
}

@media (prefers-reduced-motion: reduce) {
	.ai-typing span {
		animation: none;
	}
}

.ai-cards {
	margin-top: 0.5rem;
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.ai-cards-toggle {
	display: inline-flex;
	align-items: center;
	gap: 0.375rem;
	align-self: flex-start;
	border: 1px solid var(--surface-5);
	border-radius: 999px;
	background: color-mix(in srgb, var(--color-brand) 10%, var(--color-button-bg));
	color: var(--color-primary);
	font: inherit;
	font-size: 0.75rem;
	font-weight: 600;
	padding: 0.2rem 0.65rem;
	cursor: pointer;
}

.ai-cards-toggle:hover {
	border-color: color-mix(in srgb, var(--color-brand) 45%, transparent);
}

.ai-folder-card,
.ai-jar-card {
	display: flex;
	align-items: center;
	gap: 0.65rem;
	border: 1px solid var(--surface-5);
	border-radius: 0.875rem;
	background: var(--color-button-bg);
	padding: 0.55rem 0.7rem;
}

.ai-folder-card {
	border-color: color-mix(in srgb, var(--color-brand) 30%, transparent);
}

.ai-card-glyph {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 2.25rem;
	height: 2.25rem;
	flex-shrink: 0;
	border-radius: 0.65rem;
	background: color-mix(in srgb, var(--color-brand) 14%, transparent);
	color: var(--color-brand);
}

.ai-skin-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr));
	gap: 0.5rem;
}

.ai-skin-card {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
	padding: 0.5rem;
	border-radius: 0.75rem;
	background: var(--color-surface-3);
}

.ai-skin-img {
	width: 100%;
	aspect-ratio: 5 / 8;
	object-fit: contain;
}

.ai-skin-skeleton {
	background: var(--color-surface-5);
	border-radius: 0.5rem;
	animation: ai-skin-pulse 1.6s ease-in-out infinite;
}

@keyframes ai-skin-pulse {
	0%,
	100% {
		opacity: 1;
	}
	50% {
		opacity: 0.55;
	}
}

.ai-mod-card {
	display: flex;
	align-items: center;
	gap: 0.65rem;
	width: 100%;
	border: 1px solid var(--surface-5);
	border-radius: 0.875rem;
	background: var(--color-button-bg);
	padding: 0.55rem 0.7rem;
	font: inherit;
	color: var(--color-primary);
	cursor: pointer;
	text-align: left;
	transition: border-color 0.15s ease, transform 0.15s ease;
}

.ai-mod-card:hover {
	border-color: color-mix(in srgb, var(--color-brand) 50%, transparent);
	transform: translateY(-1px);
}

.ai-mod-icon {
	width: 2.75rem;
	height: 2.75rem;
	flex-shrink: 0;
	border-radius: 0.6rem;
	border: 1px solid var(--surface-5);
	object-fit: cover;
}

.ai-mod-icon-fallback {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	background: color-mix(in srgb, var(--color-secondary) 12%, transparent);
	color: var(--color-secondary);
}

.ai-card-title {
	margin: 0;
	font-size: 0.8125rem;
	font-weight: 600;
	color: var(--color-primary);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.ai-card-meta {
	margin: 0;
	font-size: 0.6875rem;
	color: var(--color-secondary);
}

.ai-card-desc {
	margin: 0.1rem 0 0;
	font-size: 0.75rem;
	color: var(--color-secondary);
	display: -webkit-box;
	-webkit-line-clamp: 2;
	line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.ai-jar-select {
	max-width: 10rem;
	border: 1px solid var(--surface-5);
	border-radius: 0.5rem;
	background: var(--color-button-bg);
	color: var(--color-primary);
	font: inherit;
	font-size: 0.75rem;
	padding: 0.25rem 0.4rem;
}

.ai-history-item {
	display: flex;
	flex-direction: column;
	gap: 0.1rem;
	border: none;
	border-radius: 0.6rem;
	background: transparent;
	padding: 0.45rem 0.6rem;
	text-align: left;
	cursor: pointer;
	font: inherit;
}

.ai-history-item:hover {
	background: var(--color-button-bg);
}

.ai-history-meta {
	font-size: 0.6875rem;
	color: var(--color-secondary);
}

.ai-history-preview {
	font-size: 0.8125rem;
	color: var(--color-primary);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.ai-input {
	resize: none;
	border: none;
	background: transparent;
	color: var(--color-primary);
	font: inherit;
	font-size: 0.875rem;
	line-height: 1.5;
	padding: 0.5rem 0.25rem;
	outline: none;
	min-width: 0;
}

.ai-input-full {
	overflow-y: auto;
}

.ai-link {
	color: var(--color-brand);
	text-decoration: underline;
	text-underline-offset: 2px;
	cursor: pointer;
}

.ai-link-icon {
	display: inline;
	width: 0.75rem;
	height: 0.75rem;
	margin-left: 0.125rem;
	vertical-align: baseline;
	opacity: 0.7;
}

.ai-code-block {
	margin: 0.375rem 0;
	border: 1px solid var(--surface-5);
	border-radius: 0.625rem;
	background: var(--color-bg);
	overflow: hidden;
}

.ai-code-head {
	padding: 0.25rem 0.625rem;
	font-size: 0.6875rem;
	color: var(--color-secondary);
	border-bottom: 1px solid var(--surface-5);
}

.ai-code-pre {
	padding: 0.5rem 0.625rem;
	overflow-x: auto;
	font-family: var(--monospace, monospace);
	font-size: 0.75rem;
	line-height: 1.45;
}

.ai-code-line {
	display: block;
	white-space: pre;
}

.ai-code-animated {
	opacity: 0;
	animation: ai-code-in 0.18s ease forwards;
}

@keyframes ai-code-in {
	from {
		opacity: 0;
		transform: translateY(2px);
	}
	to {
		opacity: 1;
		transform: none;
	}
}

.ai-poll-card {
	border: 1px solid color-mix(in srgb, var(--color-brand) 30%, transparent);
	background: color-mix(in srgb, var(--color-brand) 8%, transparent);
	border-radius: 0.75rem;
	padding: 0.625rem 0.75rem;
}

.ai-gallery-open {
	display: inline-flex;
	align-items: center;
	gap: 0.25rem;
	margin-top: 0.25rem;
	border: 1px solid var(--surface-5);
	border-radius: 999px;
	background: transparent;
	color: var(--color-secondary);
	font-size: 0.6875rem;
	padding: 0.1rem 0.5rem;
	cursor: pointer;
}

.ai-gallery-open:hover {
	color: var(--color-primary);
	border-color: var(--color-brand);
}

.ai-gallery {
	display: flex;
	flex-wrap: wrap;
	gap: 0.375rem;
	margin-top: 0.375rem;
}

.ai-gallery-thumb {
	height: 4rem;
	width: 6.5rem;
	object-fit: cover;
	border-radius: 0.5rem;
	border: 1px solid var(--surface-5);
	cursor: zoom-in;
}

.ai-zoom {
	position: fixed;
	inset: 0;
	z-index: 50;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgb(0 0 0 / 70%);
	cursor: zoom-out;
}

.ai-zoom-image {
	max-width: min(60rem, 92vw);
	max-height: 86vh;
	border-radius: 0.75rem;
}

.ai-error-btn {
	border: none;
	background: transparent;
	color: inherit;
	opacity: 0.75;
	cursor: pointer;
	padding: 0.1rem;
	border-radius: 0.375rem;
}

.ai-error-btn:hover {
	opacity: 1;
}

/* The live "thought process" card: what Portalus is doing right now,
   foldable like a notebook, with a Stop button an arm's length away. */
.ai-process {
	min-width: 17rem;
	max-width: min(85%, 34rem);
}

.ai-process-toggle {
	display: flex;
	width: 100%;
	align-items: center;
	gap: 0.5rem;
	border: none;
	background: transparent;
	color: var(--color-primary);
	font-size: 0.8125rem;
	font-weight: 600;
	cursor: pointer;
	padding: 0;
	text-align: left;
}

.ai-process-phase {
	font-size: 0.6875rem;
	font-weight: 400;
	color: var(--color-secondary);
	white-space: nowrap;
}

.ai-process-body {
	margin-top: 0.5rem;
	display: flex;
	flex-wrap: wrap;
	gap: 0.375rem;
	border-top: 1px solid var(--surface-5);
	padding-top: 0.5rem;
	max-height: 9rem;
	overflow-y: auto;
}

.ai-action-chip-live {
	animation: ai-chip-in 0.25s ease;
}

@keyframes ai-chip-in {
	from {
		opacity: 0;
		transform: translateY(2px);
	}
	to {
		opacity: 1;
		transform: none;
	}
}

/* A message waiting behind the running one: quiet, removable, labelled. */
.ai-queued {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	border: 1px dashed var(--surface-5);
	border-radius: 0.75rem;
	background: color-mix(in srgb, var(--color-button-bg) 60%, transparent);
	padding: 0.3rem 0.6rem;
	font-size: 0.8125rem;
	color: var(--color-secondary);
}

.ai-queued-badge {
	flex-shrink: 0;
	border-radius: 999px;
	background: color-mix(in srgb, var(--color-brand) 18%, transparent);
	color: var(--color-brand);
	font-size: 0.625rem;
	font-weight: 700;
	padding: 0.05rem 0.45rem;
	white-space: nowrap;
}

.ai-queued-remove {
	flex-shrink: 0;
	border: none;
	background: transparent;
	color: var(--color-secondary);
	cursor: pointer;
	padding: 0.1rem;
	border-radius: 0.375rem;
}

.ai-queued-remove:hover {
	color: var(--color-red);
}
</style>

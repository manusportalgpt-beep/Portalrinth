<script setup lang="ts">
import {
	ArrowUpIcon,
	BookOpenIcon,
	BrainCogIcon,
	CheckIcon,
	ChevronDownIcon,
	ClipboardCopyIcon,
	CodeIcon,
	CompassIcon,
	CopyIcon,
	DownloadIcon,
	EditIcon,
	FileCodeIcon,
	FileIcon,
	FilePlusIcon,
	GlobeIcon,
	HistoryIcon,
	HistoryIcon as MemoryIcon,
	ImageIcon,
	MonitorIcon,
	PackageIcon,
	PlayIcon,
	PlusIcon,
	RefreshCwIcon,
	SearchIcon,
	ServerIcon,
	SparklesIcon,
	StopCircleIcon,
	TerminalSquareIcon,
	TrashIcon,
	XIcon,
} from '@modrinth/assets'
import { Button, IconButton, Input, useVIntl } from '@modrinth/ui'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import AiProviderSettings from '@/components/ui/ai/AiProviderSettings.vue'
import AiRichText from '@/components/ui/ai/AiRichText.vue'
import AiSteps from '@/components/ui/ai/AiSteps.vue'
import AiTaskCard from '@/components/ui/ai/AiTaskCard.vue'
import {
	agentBusy,
	agentPhase,
	agentQueue,
	agentStreaming,
	agentTurn,
	aiHistory,
	type AiJarCard,
	type AiMessage,
	type AiModCard,
	aiSettings,
	type AiSkinCard,
	type AiWikiCard,
	chosenModel,
	clearAiHistory,
	errorOnTurn,
	noteAgentNavigation,
	providerById,
	queuedUserMessage,
	readSelectedBuild,
	saveAiSettings,
	sendAgentMessage,
	setSelectedBuild,
	stopAgentRun,
	stripLooseCommands,
	zaiPeakHoursLabel,
} from '@/helpers/ai-assistant'
import { buildSitePreview } from '@/helpers/ai-launcher-tools'
import { openImageViewer } from '@/helpers/ai-reader'
import {
	type AttachedFile,
	attachFromPaths,
	currentSessionId,
	deleteSessionForever,
	formatSize,
	listSessions,
	listTrashedSessions,
	readLatestSession,
	readSession,
	restoreSession,
	sandboxAbsolutePath,
	type SessionMeta,
	trashSession,
} from '@/helpers/ai-sandbox'
import { getInstanceIconUrl, list as listInstances } from '@/helpers/instance'
import { labySkinPreview, labySkinTexture } from '@/helpers/laby-skins'
import { skinRenderUrl } from '@/helpers/skin-render-service'
import { add_and_equip_custom_skin } from '@/helpers/skins'

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
	aiName: { id: 'app.ai.name', defaultMessage: 'Порталус' },
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
const plusOpen = ref(false)
const modelsOpen = ref(false)
const scrollBox = ref<HTMLElement | null>(null)
const attachments = ref<AttachedFile[]>([])
const questionDraft = ref('')
const galleryOpen = ref<Record<string, boolean>>({})
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
	// The chip shows what actually goes on the wire: a stored id that left
	// the catalogue is silently replaced by chosenModel(), and the label
	// must not claim the retired model while another one answers.
	const stored = chosenModel(aiSettings.value, provider?.id ?? '')
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

/** Long code in a reply starts folded to its first lines; the fold is
 * remembered per block while the page is open. */
const CODE_FOLD_LINES = 16
const codeOpen = ref<Record<string, boolean>>({})
const copiedCode = ref('')

function codeFolded(key: string, lines: number) {
	return lines > CODE_FOLD_LINES && !codeOpen.value[key]
}

function toggleCode(key: string, lines: number) {
	codeOpen.value = { ...codeOpen.value, [key]: codeFolded(key, lines) }
}

function linesWord(count: number) {
	const mod10 = count % 10
	const mod100 = count % 100
	if (mod10 === 1 && mod100 !== 11) return 'строка'
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'строки'
	return 'строк'
}

async function copyCode(key: string, code: string) {
	try {
		await navigator.clipboard.writeText(code)
		copiedCode.value = key
		setTimeout(() => {
			if (copiedCode.value === key) copiedCode.value = ''
		}, 1400)
	} catch {
		/* the clipboard can be refused */
	}
}

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
		open_page: 'открыл статью в лаунчере',
		sandbox_download: 'скачал файл',
		sandbox_show: 'показал картинку',
		instance_search: 'искал сборки',
		instance_logs: 'читал логи',
		instance_files: 'смотрел файлы сборки',
		instance_read: 'читал файл сборки',
		instance_worlds: 'смотрел миры',
		build_modpack: 'собрал сборку',
		scaffold: 'создал проект',
		install_to_instance: 'поставил файл в сборку',
		launcher_set_gradient: 'сменил градиент',
		launcher_gradient_animation: 'настроил анимацию градиента',
		launcher_accent_tint: 'настроил подкраску фона',
		launcher_appearance: 'посмотрел оформление',
		launcher_apply_theme: 'применил тему',
		launcher_save_theme: 'сохранил тему',
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
		gen_image: 'сгенерировал картинку',
		launcher_set_theme: 'сменил тему',
		launcher_compile_java: 'скомпилировал мод в .jar',
		launcher_install: 'установил контент в сборку',
		music_add_url: 'скачал трек в плейлист',
		find_wallpaper: 'искал обои',
		view_image: 'посмотрел картинку',
		skill_save: 'сохранил навык',
		show_poll: 'устроил опрос',
		task_start: 'объявил задачу',
	}
	return map[tool] ?? tool
}

// ---- Card helpers ----------------------------------------------------------

function compactCount(value: number | undefined): string {
	if (!value) return '0'
	try {
		return new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 }).format(
			value,
		)
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
		: date.toLocaleString('ru-RU', {
				day: 'numeric',
				month: 'short',
				hour: '2-digit',
				minute: '2-digit',
			})
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

// ---- Modes: web search and deep thinking ---------------------------------

function toggleWebSearch() {
	saveAiSettings({ webSearch: !aiSettings.value.webSearch })
}

function toggleDeepThink() {
	saveAiSettings({ deepThink: !aiSettings.value.deepThink })
}

// ---- Slash commands ----------------------------------------------------------
//
// "/" at the start of the input opens the command list: ready-made tasks and
// the player's installed skills. A command either fills the input with a
// prompt to finish ("/сайт " → "Сделай сайт: ") or, when it is a whole task
// on its own, sends right away.

interface SlashCommand {
	id: string
	label: string
	hint: string
	icon: unknown
	text: string
	/** Sends at once - the command is a complete request by itself. */
	send?: boolean
	action?: () => void
}

const builtInCommands = computed<SlashCommand[]>(() => [
	{
		id: 'мод',
		label: 'мод',
		hint: 'найти и поставить мод в сборку',
		icon: DownloadIcon,
		text: 'Найди и поставь в мою сборку мод: ',
	},
	{
		id: 'сборка',
		label: 'сборка',
		hint: 'всё о выбранной сборке',
		icon: PackageIcon,
		text: 'Расскажи всё о моей сборке: версия, ядро и его версия, моды, источники, обновления, проблемы.',
		send: true,
	},
	{
		id: 'оптимизация',
		label: 'оптимизация',
		hint: 'поднять FPS под эту сборку',
		icon: SparklesIcon,
		text: 'Подбери и поставь оптимизацию под мою сборку — проверь совместимость с тем, что уже стоит.',
		send: true,
	},
	{
		id: 'шейдеры',
		label: 'шейдеры',
		hint: 'шейдеры под сборку и ПК',
		icon: MonitorIcon,
		text: 'Подбери шейдеры под мою сборку и мой ПК и поставь их.',
		send: true,
	},
	{
		id: 'обнови',
		label: 'обнови',
		hint: 'обновить все моды',
		icon: RefreshCwIcon,
		text: 'Обнови все моды в моей сборке.',
		send: true,
	},
	{
		id: 'играть',
		label: 'играть',
		hint: 'запустить сборку',
		icon: PlayIcon,
		text: 'Запусти мою сборку.',
		send: true,
	},
	{
		id: 'лан',
		label: 'лан',
		hint: 'сервер для друзей (LAN)',
		icon: ServerIcon,
		text: 'Запусти мою сборку и открой мир для друзей (LAN).',
		send: true,
	},
	{
		id: 'вики',
		label: 'вики',
		hint: 'гайд с Fandom / Minecraft Wiki',
		icon: BookOpenIcon,
		text: 'Найди гайд на вики: ',
	},
	{
		id: 'поиск',
		label: 'поиск',
		hint: 'найти в интернете',
		icon: SearchIcon,
		text: 'Найди в интернете: ',
	},
	{
		id: 'сайт',
		label: 'сайт',
		hint: 'сделать сайт с предпросмотром',
		icon: CompassIcon,
		text: 'Сделай сайт: ',
	},
	{
		id: 'код',
		label: 'код',
		hint: 'написать код в песочнице',
		icon: CodeIcon,
		text: 'Напиши код: ',
	},
	{
		id: 'картинка',
		label: 'картинка',
		hint: 'нарисовать изображение',
		icon: ImageIcon,
		text: 'Нарисуй: ',
	},
	{
		id: 'память',
		label: 'память',
		hint: 'что я о тебе помню',
		icon: MemoryIcon,
		text: 'Что ты обо мне помнишь? Перечитай заметки.',
		send: true,
	},
	{
		id: 'новый',
		label: 'новый',
		hint: 'начать новый чат',
		icon: PlusIcon,
		text: '',
		action: () => void startFreshChat(),
	},
])

const skillCommands = computed<SlashCommand[]>(() =>
	(aiSettings.value.skills ?? [])
		.filter((skill) => skill.on && skill.name.trim())
		.map((skill) => ({
			id: `skill-${skill.name}`,
			label: skill.name.trim().toLowerCase().replace(/\s+/g, '-'),
			hint: `навык: ${skill.text.slice(0, 60)}`,
			icon: SparklesIcon,
			text: `Используй навык «${skill.name}»: `,
		})),
)

const slashQuery = computed(() => {
	const match = /^\/([^\s]*)$/.exec(input.value)
	return match ? match[1].toLowerCase() : null
})
const slashIndex = ref(0)
const slashDismissed = ref(false)
const slashOptions = computed(() => {
	const query = slashQuery.value
	if (query === null) return []
	return [...builtInCommands.value, ...skillCommands.value].filter(
		(command) => command.label.startsWith(query) || command.hint.toLowerCase().includes(query),
	)
})
const slashOpen = computed(() => !slashDismissed.value && slashOptions.value.length > 0)
watch(slashQuery, () => {
	slashIndex.value = 0
	slashDismissed.value = false
})

function pickSlash(command: SlashCommand) {
	if (command.action) {
		input.value = ''
		command.action()
		return
	}
	if (command.send) {
		input.value = ''
		void send(command.text)
		return
	}
	input.value = command.text
	void nextTick(() => {
		const el = inputEl.value as HTMLTextAreaElement | null
		el?.focus()
		el?.setSelectionRange(command.text.length, command.text.length)
	})
}

function onInputKeydown(event: KeyboardEvent) {
	if (!slashOpen.value) return
	const count = slashOptions.value.length
	if (event.key === 'ArrowDown') {
		event.preventDefault()
		slashIndex.value = (slashIndex.value + 1) % count
	} else if (event.key === 'ArrowUp') {
		event.preventDefault()
		slashIndex.value = (slashIndex.value - 1 + count) % count
	} else if (event.key === 'Tab') {
		event.preventDefault()
		pickSlash(slashOptions.value[slashIndex.value])
	} else if (event.key === 'Escape') {
		event.preventDefault()
		slashDismissed.value = true
	}
}

function openSlashFromMenu() {
	plusOpen.value = false
	input.value = '/'
	void nextTick(() => (inputEl.value as HTMLTextAreaElement | null)?.focus())
}

function onEnter() {
	if (slashOpen.value) {
		pickSlash(slashOptions.value[slashIndex.value])
		return
	}
	void send()
}

// ---- Site preview ------------------------------------------------------------

const sitePreview = ref<{ title: string; html: string } | null>(null)
async function openSite(path: string, title: string) {
	try {
		sitePreview.value = { title, html: await buildSitePreview(path) }
	} catch {
		errorText.value = `Не открылся ${path}`
	}
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
	| { kind: 'text'; text: string; parts: AiSegmentPart[] }

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
		} else {
			const prose = stripLooseCommands(block).replace(/\n{3,}/g, '\n\n')
			if (prose.trim())
				segments.push({ kind: 'text', text: prose.trim(), parts: splitLinks(prose) })
		}
	}
	return segments
}

const MODRINTH_LINK = /^https?:\/\/(?:[a-z-]+\.)?modrinth\.com(?:\/|$)/i
const CURSEFORGE_LINK =
	/^https?:\/\/(?:www\.)?curseforge\.com\/minecraft\/(mc-mods|mc-modpacks|texture-packs|mc-shaders|mc-addons)\/([^/?#]+)/i

const CURSEFORGE_TYPES: Record<string, string> = {
	'mc-addons': 'datapack',
	'mc-mods': 'mod',
	'mc-modpacks': 'modpack',
	'mc-shaders': 'shader',
	'texture-packs': 'resourcepack',
}

/** A CurseForge page's slug says nothing about the numeric id the launcher's
 * page needs: the search answers, and the hit with the same slug carries it.
 * No match - the link falls through to the system browser. */
async function resolveCurseforgeProject(slug: string, projectType: string): Promise<string | null> {
	try {
		const [{ curseforgeSearch }, { curseforgeSettings }] = await Promise.all([
			import('@/helpers/curseforge'),
			import('@/helpers/curseforge-settings'),
		])
		if (!curseforgeSettings.value.enabled) return null
		const results = await curseforgeSearch({
			query: slug,
			project_type: projectType,
			game_versions: [],
			loaders: [],
			category_ids: [],
			sort: 'relevance',
			offset: 0,
			limit: 10,
		})
		const wanted = slug.toLowerCase()
		const hit = results.hits.find((hit) => (hit.slug ?? '').toLowerCase() === wanted)
		return hit ? hit.project_id : null
	} catch {
		return null
	}
}

/**
 * A link Portalus gave is a door, not a detour: Modrinth and CurseForge mod
 * pages open right here in the launcher, and everything else opens in the
 * browser on the PC - the launcher does not show other pages itself.
 */
async function openLink(url: string) {
	try {
		// Launcher paths ([Сборка](/instance/…), [LAN](/lan)) open right here.
		if (url.startsWith('/')) {
			await router.push(url)
			return
		}
		if (MODRINTH_LINK.test(url)) {
			const path = url.replace(/^https?:\/\/(?:[a-z-]+\.)?modrinth\.com/i, '')
			await router.push(path || '/')
			return
		}
		const forge = CURSEFORGE_LINK.exec(url)
		if (forge) {
			const id = await resolveCurseforgeProject(
				decodeURIComponent(forge[2]),
				CURSEFORGE_TYPES[forge[1]] ?? 'mod',
			)
			if (id) {
				await router.push(`/curseforge/${id}`)
				return
			}
		}
		// Everything else opens in the browser on the PC.
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

watch(input, autoGrow, { flush: 'post' })

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
					attached.push({
						name: file.name || 'картинка.png',
						size: file.size,
						kind: 'image',
						dataUrl,
					})
				} else if (file.size < 2000000) {
					attached.push({
						name: file.name || 'файл',
						size: file.size,
						kind: 'text',
						text: await file.text(),
					})
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
				stored && all.some((instance) => instance.id === stored.id) ? stored.id : ''
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
		<div class="flex items-start justify-end gap-3 px-6 pt-6">
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
				<div
					v-if="historyOpen"
					class="fixed inset-0 z-10 cursor-default"
					@click="historyOpen = false"
				/>
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
						<p v-if="historyLoading" class="m-0 px-2 py-3 text-sm text-secondary">…</p>
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
				<p class="m-0 text-2xl font-bold text-primary">{{ formatMessage(messages.aiName) }}</p>
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
						<AiTaskCard v-if="message.task" :task="message.task" class="mb-2" />
						<AiSteps
							v-if="message.role === 'assistant' && message.steps?.length"
							:steps="message.steps"
							@open-link="openLink"
							@zoom="(src) => openImageViewer(src)"
						/>
						<div v-if="message.attachments?.length" class="mb-2 flex flex-wrap gap-2">
							<template v-for="(file, fileIndex) in message.attachments" :key="fileIndex">
								<img
									v-if="file.kind === 'image' && file.dataUrl"
									:src="file.dataUrl"
									:alt="file.name"
									class="ai-attach-image cursor-zoom-in"
									@click="() => openImageViewer(file.dataUrl!, file.name)"
								/>
								<span v-else class="ai-attach-chip">
									<FileIcon class="size-3.5 shrink-0" />
									{{ file.name }}
									<span v-if="file.size" class="text-secondary">{{ formatSize(file.size) }}</span>
								</span>
							</template>
						</div>
						<template v-if="parseSegments(message.content).length > 0">
							<template
								v-for="(segment, segmentIndex) in parseSegments(message.content)"
								:key="`seg-${segmentIndex}`"
							>
								<div
									v-if="segment.kind === 'code'"
									class="ai-code-block"
									:class="{
										'ai-code-block--folded': codeFolded(
											`${index}-${segmentIndex}`,
											segment.lines.length,
										),
									}"
								>
									<div class="ai-code-head">
										<FileCodeIcon class="size-3.5 shrink-0" />
										<span class="grow truncate">{{ segment.lang || 'код' }}</span>
										<span class="ai-code-count"
											>{{ segment.lines.length }} {{ linesWord(segment.lines.length) }}</span
										>
										<button
											v-tooltip="'Скопировать'"
											type="button"
											class="ai-code-btn"
											aria-label="Скопировать"
											@click="() => copyCode(`${index}-${segmentIndex}`, segment.lines.join('\n'))"
										>
											<CheckIcon
												v-if="copiedCode === `${index}-${segmentIndex}`"
												class="size-3.5 text-green"
											/>
											<CopyIcon v-else class="size-3.5" />
										</button>
										<button
											v-if="segment.lines.length > CODE_FOLD_LINES"
											v-tooltip="
												codeFolded(`${index}-${segmentIndex}`, segment.lines.length)
													? 'Развернуть'
													: 'Свернуть'
											"
											type="button"
											class="ai-code-btn"
											:aria-label="
												codeFolded(`${index}-${segmentIndex}`, segment.lines.length)
													? 'Развернуть'
													: 'Свернуть'
											"
											@click="() => toggleCode(`${index}-${segmentIndex}`, segment.lines.length)"
										>
											<ChevronDownIcon
												class="size-3.5 transition-transform duration-300"
												:class="{
													'rotate-180': !codeFolded(
														`${index}-${segmentIndex}`,
														segment.lines.length,
													),
												}"
											/>
										</button>
									</div>
									<pre class="ai-code-pre m-0"><code><span
										v-for="(line, lineIndex) in segment.lines"
										:key="lineIndex"
										class="ai-code-line"
										:class="{ 'ai-code-animated': aiSettings.chatEffects }"
										:style="{ animationDelay: `${Math.min(lineIndex * 70, 2800)}ms` }"
									>{{ line }}</span></code></pre>
									<button
										v-if="codeFolded(`${index}-${segmentIndex}`, segment.lines.length)"
										type="button"
										class="ai-code-more"
										@click="() => toggleCode(`${index}-${segmentIndex}`, segment.lines.length)"
									>
										Показать всё · {{ segment.lines.length }} {{ linesWord(segment.lines.length) }}
										<ChevronDownIcon class="size-3.5" />
									</button>
								</div>
								<AiRichText v-else :text="segment.text" @open="openLink" />
							</template>
						</template>
						<p v-else class="m-0 whitespace-pre-wrap break-words text-sm leading-relaxed">
							{{ message.content }}
						</p>

						<div v-if="message.activity" class="ai-activity">
							<span v-if="message.activity.commands > 0" class="ai-activity-chip">
								<TerminalSquareIcon class="size-3.5" />
								{{ message.activity.commands }} {{ formatMessage(messages.commands) }}
							</span>
							<span
								v-for="file in message.activity.filesCreated"
								:key="`c-${file}`"
								class="ai-activity-chip ai-activity-created"
							>
								<FilePlusIcon class="size-3.5" />
								{{ formatMessage(messages.filesCreated) }}: {{ file }}
							</span>
							<span
								v-for="change in message.activity.filesChanged"
								:key="`m-${change.path}`"
								class="ai-activity-chip ai-activity-changed"
							>
								<EditIcon class="size-3.5" />
								{{ formatMessage(messages.filesChanged) }}: {{ change.path }}
								<span class="text-green">+{{ change.added }}</span
								>/<span class="text-red"> −{{ change.removed }}</span>
							</span>
							<span
								v-for="(image, imageIndex) in message.activity.images ?? []"
								:key="`img-${imageIndex}`"
								class="ai-activity-image-wrap"
							>
								<img
									:src="image"
									class="ai-activity-image cursor-zoom-in"
									alt=""
									@click="() => openImageViewer(image)"
								/>
							</span>
						</div>

						<div v-if="message.activity?.mods?.length" class="ai-cards">
							<button class="ai-cards-toggle" @click="() => toggleCardGroup(`m-${index}`)">
								<span
									>{{ formatMessage(messages.modsTitle) }} ·
									{{ message.activity.mods.length }}</span
								>
								<ChevronDownIcon
									class="size-3.5 transition-transform"
									:class="{ '-rotate-90': collapsedCards[`m-${index}`] }"
								/>
							</button>
							<div v-if="!collapsedCards[`m-${index}`]" class="flex flex-col gap-1.5">
								<button
									v-for="mod in message.activity.mods"
									:key="`${mod.source}-${mod.projectId}`"
									class="ai-mod-card"
									@click="() => openMod(mod)"
								>
									<img
										v-if="mod.iconUrl"
										:src="mod.iconUrl"
										class="ai-mod-icon"
										alt=""
										loading="lazy"
									/>
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
										<div
											v-if="galleryOpen[`${index}-${mod.projectId}`] && mod.gallery?.length"
											class="ai-gallery"
										>
											<img
												v-for="(shot, shotIndex) in mod.gallery"
												:key="shotIndex"
												:src="shot"
												class="ai-gallery-thumb"
												loading="lazy"
												alt=""
												@click.stop="() => openImageViewer(shot)"
											/>
										</div>
									</div>
								</button>
							</div>
						</div>

						<div v-if="message.activity?.wikis?.length" class="ai-cards">
							<button class="ai-cards-toggle" @click="() => toggleCardGroup(`w-${index}`)">
								<span>Вики · {{ message.activity.wikis.length }}</span>
								<ChevronDownIcon
									class="size-3.5 transition-transform"
									:class="{ '-rotate-90': collapsedCards[`w-${index}`] }"
								/>
							</button>
							<div v-if="!collapsedCards[`w-${index}`]" class="flex flex-col gap-1.5">
								<button
									v-for="wiki in message.activity.wikis as AiWikiCard[]"
									:key="wiki.url"
									class="ai-mod-card ai-wiki-card"
									title="Открыть в браузере"
									@click="() => openLink(wiki.url)"
								>
									<img
										v-if="wiki.image"
										:src="wiki.image"
										class="ai-wiki-image"
										alt=""
										loading="lazy"
									/>
									<span v-else class="ai-mod-icon ai-mod-icon-fallback"
										><BookOpenIcon class="size-5"
									/></span>
									<div class="min-w-0 grow text-left">
										<p class="ai-card-title">{{ wiki.title }}</p>
										<p class="ai-card-meta">{{ wiki.wiki }}</p>
										<p v-if="wiki.excerpt" class="ai-card-desc">{{ wiki.excerpt }}</p>
									</div>
									<BookOpenIcon class="size-4 shrink-0 opacity-60" />
								</button>
							</div>
						</div>

						<div v-if="message.activity?.sites?.length" class="flex flex-col gap-1.5">
							<button
								v-for="site in message.activity.sites"
								:key="site.path"
								class="ai-mod-card ai-site-card"
								@click="() => openSite(site.path, site.title)"
							>
								<span class="ai-mod-icon ai-mod-icon-fallback ai-site-glyph"
									><CompassIcon class="size-5"
								/></span>
								<div class="min-w-0 grow text-left">
									<p class="ai-card-title">{{ site.title || 'Сайт' }}</p>
									<p class="ai-card-meta">Предпросмотр сайта · {{ site.path }}</p>
								</div>
								<PlayIcon class="size-4 shrink-0 opacity-70" />
							</button>
						</div>

						<div v-if="message.activity?.skins?.length" class="ai-cards">
							<button class="ai-cards-toggle" @click="() => toggleCardGroup(`s-${index}`)">
								<span
									>{{ formatMessage(messages.skinsTitle) }} ·
									{{ message.activity.skins.length }}</span
								>
								<ChevronDownIcon
									class="size-3.5 transition-transform"
									:class="{ '-rotate-90': collapsedCards[`s-${index}`] }"
								/>
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
									<p class="ai-card-meta">
										{{ skin.uses ?? 0 }} игр. · {{ skin.variant === 'SLIM' ? 'Slim' : 'Classic' }}
									</p>
									<Button
										size="sm"
										class="w-full"
										:disabled="
											skinInstalling.includes(skin.hash) || skinInstalledSkins.includes(skin.hash)
										"
										@click="() => installSkin(skin)"
									>
										{{
											skinInstalledSkins.includes(skin.hash)
												? formatMessage(messages.skinInstalled)
												: formatMessage(messages.skinInstall)
										}}
									</Button>
								</div>
							</div>
						</div>

						<div v-if="message.activity?.jars?.length" class="ai-cards">
							<button class="ai-cards-toggle" @click="() => toggleCardGroup(`j-${index}`)">
								<span
									>{{ formatMessage(messages.jarsTitle) }} ·
									{{ message.activity.jars.length }}</span
								>
								<ChevronDownIcon
									class="size-3.5 transition-transform"
									:class="{ '-rotate-90': collapsedCards[`j-${index}`] }"
								/>
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
										<select
											v-if="instances.length > 1"
											v-model="chosenInstance"
											class="ai-jar-select"
										>
											<option v-for="instance in instances" :key="instance.id" :value="instance.id">
												{{ instance.name }}
											</option>
										</select>
										<Button
											size="sm"
											color="brand"
											:disabled="jarInstalled[jar.path]"
											@click="() => installJar(jar)"
										>
											{{
												jarInstalled[jar.path]
													? formatMessage(messages.installed)
													: formatMessage(messages.install)
											}}
										</Button>
									</div>
								</div>
							</div>
						</div>

						<div v-if="message.activity?.polls?.length" class="ai-cards">
							<div
								v-for="(poll, pollIndex) in message.activity.polls"
								:key="`poll-${pollIndex}`"
								class="ai-poll-card"
							>
								<p class="ai-card-title m-0">{{ poll.text }}</p>
								<div class="mt-1 flex flex-wrap gap-2">
									<Button
										v-for="option in poll.options"
										:key="option"
										size="sm"
										:disabled="sending"
										@click="() => answerPoll(option)"
									>
										{{ option }}
									</Button>
								</div>
							</div>
						</div>
						<div
							v-if="message.actions?.length && !message.steps?.length"
							class="mt-1.5 flex flex-wrap gap-1"
						>
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

			<Transition name="ai-site">
				<div v-if="sitePreview" class="ai-site-overlay" @click.self="sitePreview = null">
					<div class="ai-site-window">
						<div class="ai-site-bar">
							<CompassIcon class="size-4 shrink-0" />
							<span class="min-w-0 grow truncate font-semibold">{{ sitePreview.title }}</span>
							<button class="ai-error-btn" aria-label="Закрыть" @click="sitePreview = null">
								<XIcon class="size-4" />
							</button>
						</div>
						<iframe
							class="ai-site-frame"
							sandbox="allow-scripts"
							:srcdoc="sitePreview.html"
							title="Предпросмотр сайта"
						/>
					</div>
				</div>
			</Transition>

			<div v-if="sending" class="mb-3 flex justify-start">
				<div
					class="ai-bubble ai-bubble-assistant ai-process ai-live-bubble rounded-2xl px-3 py-2.5"
				>
					<AiTaskCard v-if="agentTurn.task" :task="agentTurn.task" live class="mb-2" />
					<AiSteps
						:steps="agentTurn.steps"
						live
						:phase="phaseLabel"
						default-open
						@open-link="openLink"
						@zoom="(src) => openImageViewer(src)"
					/>
					<div v-if="streaming" class="ai-live-text px-1">
						<AiRichText :text="streaming" @open="openLink" />
					</div>
				</div>
			</div>
			<div v-else-if="streaming" class="mb-3 flex justify-start">
				<div class="ai-bubble ai-bubble-assistant rounded-2xl px-4 py-2.5">
					<AiRichText :text="streaming" @open="openLink" />
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

			<div
				v-if="errorText"
				class="ai-error m-0 mb-2 flex items-start gap-2 rounded-xl px-3 py-2 text-sm"
			>
				<span class="min-w-0 grow break-words">{{ errorText }}</span>
				<button
					v-tooltip="'Скопировать'"
					class="ai-error-btn"
					aria-label="Скопировать"
					@click="copyError"
				>
					<ClipboardCopyIcon class="size-3.5" />
				</button>
				<button
					v-tooltip="'Закрыть'"
					class="ai-error-btn"
					aria-label="Закрыть"
					@click="dismissError"
				>
					<XIcon class="size-3.5" />
				</button>
			</div>

			<div v-if="attachments.length > 0" class="mb-2 flex flex-wrap gap-2">
				<span
					v-for="(file, index) in attachments"
					:key="`${file.name}-${index}`"
					class="ai-attach-chip"
				>
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

			<Transition name="ai-slash">
				<div v-if="slashOpen" class="ai-slash" role="listbox" aria-label="Команды">
					<p class="ai-slash-title">Команды и навыки</p>
					<button
						v-for="(command, commandIndex) in slashOptions"
						:key="command.id"
						type="button"
						role="option"
						class="ai-slash-item"
						:class="{ 'ai-slash-item--active': commandIndex === slashIndex }"
						:aria-selected="commandIndex === slashIndex"
						@mouseenter="slashIndex = commandIndex"
						@mousedown.prevent="() => pickSlash(command)"
					>
						<span class="ai-slash-icon"><component :is="command.icon" class="size-4" /></span>
						<span class="ai-slash-name">/{{ command.label }}</span>
						<span class="ai-slash-hint">{{ command.hint }}</span>
						<span v-if="command.send" class="ai-slash-tag">сразу</span>
					</button>
					<p class="ai-slash-foot">↑↓ — выбор · Enter/Tab — выбрать · Esc — закрыть</p>
				</div>
			</Transition>
			<div class="ai-input-row flex items-center gap-2 rounded-3xl bg-surface-2 p-2">
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
						<div class="ai-menu-sep" />
						<button
							class="ai-menu-item"
							role="switch"
							:aria-checked="aiSettings.webSearch"
							@click="toggleWebSearch"
						>
							<GlobeIcon class="size-4" />
							<span class="grow text-left">Веб-поиск</span>
							<span class="ai-switch" :class="{ 'ai-switch--on': aiSettings.webSearch }" />
						</button>
						<button
							class="ai-menu-item"
							role="switch"
							:aria-checked="aiSettings.deepThink"
							@click="toggleDeepThink"
						>
							<BrainCogIcon class="size-4" />
							<span class="grow text-left">Глубокое мышление</span>
							<span class="ai-switch" :class="{ 'ai-switch--on': aiSettings.deepThink }" />
						</button>
						<div class="ai-menu-sep" />
						<button class="ai-menu-item" @click="openSlashFromMenu">
							<TerminalSquareIcon class="size-4" />
							<span class="grow text-left">Команды и навыки</span>
							<kbd class="ai-kbd">/</kbd>
						</button>
					</div>
				</div>
				<div
					v-if="aiSettings.webSearch || aiSettings.deepThink"
					class="flex shrink-0 items-center gap-1"
				>
					<button
						v-if="aiSettings.webSearch"
						v-tooltip="'Веб-поиск включён — нажми, чтобы выключить'"
						class="ai-mode-chip"
						@click="toggleWebSearch"
					>
						<GlobeIcon class="size-3.5" />
						<span class="ai-mode-label">Поиск</span>
					</button>
					<button
						v-if="aiSettings.deepThink"
						v-tooltip="'Глубокое мышление: умнее и внимательнее, но дольше'"
						class="ai-mode-chip ai-mode-chip--deep"
						@click="toggleDeepThink"
					>
						<BrainCogIcon class="size-3.5" />
						<span class="ai-mode-label">Глубоко</span>
					</button>
				</div>
				<textarea
					ref="inputEl"
					v-model="input"
					class="ai-input grow"
					rows="1"
					:placeholder="formatMessage(messages.placeholder)"
					@keydown="onInputKeydown"
					@keydown.enter.exact.prevent="onEnter"
					@paste="onPaste"
				/>
				<div class="relative shrink-0">
					<button v-tooltip="chosenBuildLabel" class="ai-model-chip" @click="toggleBuilds">
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
									{{ instance.loader ?? 'vanilla'
									}}{{ instance.loader_version ? ` ${instance.loader_version}` : '' }} · Minecraft
									{{ instance.game_version }}
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
	overflow-wrap: anywhere;
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
	max-width: 20rem;
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
	max-width: 20rem;
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
	transition:
		border-color 0.15s ease,
		transform 0.15s ease;
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

.ai-code-block {
	position: relative;
}

.ai-code-head {
	display: flex;
	align-items: center;
	gap: 0.4rem;
	padding: 0.25rem 0.35rem 0.25rem 0.625rem;
	font-size: 0.6875rem;
	color: var(--color-secondary);
	border-bottom: 1px solid var(--surface-5);
}

.ai-code-count {
	flex-shrink: 0;
	font-variant-numeric: tabular-nums;
	opacity: 0.8;
}

.ai-code-btn {
	display: grid;
	place-items: center;
	width: 1.5rem;
	height: 1.5rem;
	flex-shrink: 0;
	padding: 0;
	border: none;
	border-radius: 0.4rem;
	background: transparent;
	color: var(--color-secondary);
	cursor: pointer;
	transition:
		background-color 0.18s ease,
		color 0.18s ease;
}

.ai-code-btn:hover {
	background: color-mix(in srgb, var(--color-contrast) 8%, transparent);
	color: var(--color-contrast);
}

.ai-code-pre {
	padding: 0.5rem 0.625rem;
	overflow-x: auto;
	font-family: var(--monospace, monospace);
	font-size: 0.75rem;
	line-height: 1.45;
	max-height: 60rem;
	transition: max-height 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
}

/* Folded: the first lines, fading out under a button for the rest. */
.ai-code-block--folded .ai-code-pre {
	max-height: 15rem;
	overflow: hidden;
	mask-image: linear-gradient(to bottom, #000 55%, transparent);
}

.ai-code-more {
	position: absolute;
	left: 50%;
	bottom: 0.5rem;
	display: inline-flex;
	align-items: center;
	gap: 0.3rem;
	padding: 0.3rem 0.75rem;
	border: 1px solid var(--surface-5);
	border-radius: 999px;
	background: color-mix(in srgb, var(--color-button-bg) 80%, transparent);
	backdrop-filter: blur(10px);
	color: var(--color-contrast);
	font: inherit;
	font-size: 0.6875rem;
	font-weight: 600;
	cursor: pointer;
	transform: translateX(-50%);
	transition:
		background-color 0.18s ease,
		transform 0.18s ease;
}

.ai-code-more:hover {
	background: var(--color-button-bg-hover, var(--color-button-bg));
	transform: translateX(-50%) translateY(-1px);
}

.ai-live-bubble {
	min-width: min(34rem, 100%);
}

.ai-live-text {
	margin-top: 0.15rem;
}

.ai-caret {
	display: inline-block;
	width: 2px;
	height: 1em;
	margin-left: 2px;
	vertical-align: text-bottom;
	background: var(--color-brand);
	animation: ai-caret-blink 1s steps(2) infinite;
}

@keyframes ai-caret-blink {
	50% {
		opacity: 0;
	}
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

.ai-wiki-image {
	width: 3.5rem;
	height: 3.5rem;
	flex-shrink: 0;
	border-radius: 0.6rem;
	border: 1px solid var(--surface-5);
	object-fit: cover;
	background: var(--color-surface-3);
}

.ai-site-glyph {
	color: var(--color-brand);
	background: color-mix(in srgb, var(--color-brand) 14%, transparent);
}

.ai-site-overlay {
	position: fixed;
	inset: 0;
	z-index: 60;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 2rem;
	background: rgba(0, 0, 0, 0.45);
	backdrop-filter: blur(10px);
}

.ai-site-window {
	display: flex;
	flex-direction: column;
	width: min(70rem, 100%);
	height: min(44rem, 100%);
	overflow: hidden;
	border: 1px solid var(--surface-5);
	border-radius: 1.25rem;
	background: color-mix(in srgb, var(--color-raised-bg) 78%, transparent);
	backdrop-filter: blur(22px);
	box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
}

.ai-site-bar {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.6rem 0.8rem;
	color: var(--color-primary);
	border-bottom: 1px solid var(--surface-5);
}

.ai-site-frame {
	flex: 1;
	width: 100%;
	border: none;
	background: #fff;
}

.ai-site-enter-active,
.ai-site-leave-active {
	transition: opacity 0.22s ease;
}

.ai-site-enter-active .ai-site-window,
.ai-site-leave-active .ai-site-window {
	transition: transform 0.26s cubic-bezier(0.2, 0.9, 0.3, 1.2);
}

.ai-site-enter-from,
.ai-site-leave-to {
	opacity: 0;
}

.ai-site-enter-from .ai-site-window,
.ai-site-leave-to .ai-site-window {
	transform: scale(0.95) translateY(10px);
}

.ai-slash {
	margin-bottom: 0.5rem;
	display: flex;
	flex-direction: column;
	gap: 0.125rem;
	max-height: 20rem;
	overflow-y: auto;
	padding: 0.4rem;
	border: 1px solid var(--surface-5);
	border-radius: 1.1rem;
	background: color-mix(in srgb, var(--color-raised-bg) 72%, transparent);
	backdrop-filter: blur(20px);
	box-shadow: 0 14px 36px rgba(0, 0, 0, 0.3);
}

.ai-slash-title,
.ai-slash-foot {
	margin: 0;
	padding: 0.25rem 0.55rem;
	font-size: 0.6875rem;
	color: var(--color-secondary);
}

.ai-slash-title {
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.04em;
}

.ai-slash-item {
	display: flex;
	align-items: center;
	gap: 0.6rem;
	width: 100%;
	padding: 0.4rem 0.55rem;
	border: none;
	border-radius: 0.7rem;
	background: transparent;
	font: inherit;
	color: var(--color-primary);
	cursor: pointer;
	text-align: left;
	transition: background-color 0.14s ease;
}

.ai-slash-item--active {
	background: color-mix(in srgb, var(--color-brand) 16%, transparent);
}

.ai-slash-icon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 1.75rem;
	height: 1.75rem;
	flex-shrink: 0;
	border-radius: 0.5rem;
	background: var(--color-button-bg);
	color: var(--color-brand);
}

.ai-slash-name {
	font-weight: 600;
	font-size: 0.8125rem;
}

.ai-slash-hint {
	min-width: 0;
	flex: 1;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 0.75rem;
	color: var(--color-secondary);
}

.ai-slash-tag {
	flex-shrink: 0;
	padding: 0.05rem 0.4rem;
	border-radius: 999px;
	font-size: 0.625rem;
	color: var(--color-brand);
	background: color-mix(in srgb, var(--color-brand) 12%, transparent);
}

.ai-slash-enter-active,
.ai-slash-leave-active {
	transition:
		opacity 0.16s ease,
		transform 0.18s ease;
}

.ai-slash-enter-from,
.ai-slash-leave-to {
	opacity: 0;
	transform: translateY(6px);
}

.ai-mode-chip {
	display: inline-flex;
	align-items: center;
	gap: 0.25rem;
	height: 1.75rem;
	padding: 0 0.55rem;
	border: 1px solid color-mix(in srgb, var(--color-brand) 35%, transparent);
	border-radius: 999px;
	background: color-mix(in srgb, var(--color-brand) 12%, transparent);
	color: var(--color-brand);
	font: inherit;
	font-size: 0.75rem;
	font-weight: 600;
	cursor: pointer;
	transition:
		background-color 0.15s ease,
		transform 0.15s ease;
}

.ai-mode-chip:hover {
	background: color-mix(in srgb, var(--color-brand) 20%, transparent);
	transform: translateY(-1px);
}

.ai-mode-chip--deep {
	border-color: color-mix(in srgb, var(--color-purple, #a78bfa) 40%, transparent);
	background: color-mix(in srgb, var(--color-purple, #a78bfa) 14%, transparent);
	color: var(--color-purple, #a78bfa);
}

.ai-menu-sep {
	height: 1px;
	margin: 0.15rem 0.25rem;
	background: var(--surface-5);
}

.ai-switch {
	position: relative;
	width: 1.9rem;
	height: 1.1rem;
	flex-shrink: 0;
	border-radius: 999px;
	background: var(--surface-5);
	transition: background-color 0.18s ease;
}

.ai-switch::after {
	content: '';
	position: absolute;
	top: 0.15rem;
	left: 0.15rem;
	width: 0.8rem;
	height: 0.8rem;
	border-radius: 50%;
	background: #fff;
	transition: transform 0.2s cubic-bezier(0.3, 0.9, 0.4, 1.2);
}

.ai-switch--on {
	background: var(--color-brand);
}

.ai-switch--on::after {
	transform: translateX(0.8rem);
}

.ai-kbd {
	padding: 0 0.35rem;
	border: 1px solid var(--surface-5);
	border-radius: 0.3rem;
	font-size: 0.6875rem;
	color: var(--color-secondary);
}
</style>

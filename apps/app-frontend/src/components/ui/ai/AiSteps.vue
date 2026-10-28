<script setup lang="ts">
/**
 * Portalrinth's own: how a reply came about, step by step. A header that
 * folds the whole run (with what it amounted to - pages read, searches,
 * commands, files, pictures, time), and under it one row per thought or tool
 * call, each with its own icon, and unfolding to what went in and what came
 * out: the command and its output, the file that was written, the pages a
 * search found, the page that was read, the picture being drawn.
 */
import {
	BookOpenIcon,
	BoxIcon,
	BoxPlusIcon,
	BrainCircuitIcon,
	CheckIcon,
	ChevronDownIcon,
	ClockIcon,
	CloudIcon,
	CodeIcon,
	CompassIcon,
	CopyIcon,
	CpuIcon,
	DownloadIcon,
	ExternalIcon,
	FileArchiveIcon,
	FileCodeIcon,
	FilePlusIcon,
	FileTextIcon,
	FolderOpenIcon,
	FolderSearchIcon,
	GlobeIcon,
	HammerIcon,
	HistoryIcon,
	ImageIcon,
	ImagesIcon,
	LightBulbIcon,
	ListBulletedIcon,
	ListIcon,
	MessageIcon,
	MonitorIcon,
	MoonIcon,
	MusicIcon,
	NotepadTextIcon,
	PackageIcon,
	PackageOpenIcon,
	PackageSearchIcon,
	PaintbrushIcon,
	PaletteIcon,
	ScanEyeIcon,
	SearchIcon,
	ShirtIcon,
	SparklesIcon,
	TerminalSquareIcon,
	TimerIcon,
	TrashIcon,
	WrenchIcon,
	XIcon,
} from '@modrinth/assets'
import { type Component, computed, onBeforeUnmount, ref, watch } from 'vue'

import type { AiStep } from '@/helpers/ai-assistant'

const props = withDefaults(
	defineProps<{
		steps: AiStep[]
		/** The run is still going: the header says what it is doing now. */
		live?: boolean
		phase?: string
		/** Whether the list starts unfolded. */
		defaultOpen?: boolean
	}>(),
	{ live: false, phase: '', defaultOpen: false },
)

const emit = defineEmits<{
	'open-link': [url: string]
	zoom: [src: string]
}>()

const open = ref(props.defaultOpen || props.live)
const expanded = ref<Record<string, boolean>>({})
const copied = ref('')

// ---- What each tool is called and drawn with --------------------------------

interface ToolMeta {
	title: string
	icon: Component
}

const TOOLS: Record<string, ToolMeta> = {
	web_search: { title: 'Поиск в интернете', icon: SearchIcon },
	web_fetch: { title: 'Чтение страницы', icon: GlobeIcon },
	open_page: { title: 'Статья в лаунчере', icon: BookOpenIcon },
	sandbox_download: { title: 'Скачивание файла', icon: DownloadIcon },
	sandbox_show: { title: 'Показ картинки', icon: ImageIcon },
	instance_search: { title: 'Поиск сборок', icon: SearchIcon },
	instance_logs: { title: 'Логи сборки', icon: FileTextIcon },
	instance_files: { title: 'Файлы сборки', icon: FolderSearchIcon },
	instance_read: { title: 'Чтение файла сборки', icon: FileCodeIcon },
	instance_worlds: { title: 'Миры сборки', icon: GlobeIcon },
	build_modpack: { title: 'Сборка модпака', icon: PackageIcon },
	scaffold: { title: 'Новый проект', icon: CodeIcon },
	install_to_instance: { title: 'Установка в сборку', icon: DownloadIcon },
	launcher_set_gradient: { title: 'Градиент акцента', icon: PaintbrushIcon },
	launcher_gradient_animation: { title: 'Анимация градиента', icon: PaintbrushIcon },
	launcher_accent_tint: { title: 'Подкраска фона', icon: PaletteIcon },
	launcher_appearance: { title: 'Оформление', icon: PaletteIcon },
	launcher_apply_theme: { title: 'Применение темы', icon: PaletteIcon },
	launcher_save_theme: { title: 'Сохранение темы', icon: PaletteIcon },
	view_image: { title: 'Просмотр картинки', icon: ScanEyeIcon },
	gen_image: { title: 'Генерация изображения', icon: SparklesIcon },
	sandbox_bash: { title: 'Терминал', icon: TerminalSquareIcon },
	sandbox_write: { title: 'Запись файла', icon: FilePlusIcon },
	sandbox_read: { title: 'Чтение файла', icon: FileTextIcon },
	sandbox_list: { title: 'Файлы песочницы', icon: FolderSearchIcon },
	sandbox_delete: { title: 'Удаление', icon: TrashIcon },
	sandbox_pack: { title: 'Упаковка архива', icon: FileArchiveIcon },
	sandbox_unpack: { title: 'Распаковка архива', icon: PackageOpenIcon },
	launcher_compile_java: { title: 'Сборка .jar', icon: HammerIcon },
	launcher_search_mods: { title: 'Поиск модов', icon: PackageSearchIcon },
	launcher_install: { title: 'Установка в сборку', icon: DownloadIcon },
	navigate: { title: 'Переход', icon: CompassIcon },
	open_instance: { title: 'Открыл сборку', icon: BoxIcon },
	open_creation_modal: { title: 'Создание сборки', icon: BoxPlusIcon },
	list_instances: { title: 'Список сборок', icon: ListIcon },
	get_page: { title: 'Текущий экран', icon: MonitorIcon },
	launcher_set_accent: { title: 'Цвет акцента', icon: PaletteIcon },
	launcher_set_background: { title: 'Фон лаунчера', icon: ImageIcon },
	launcher_set_theme: { title: 'Тема', icon: MoonIcon },
	memory_read: { title: 'Чтение заметок', icon: BookOpenIcon },
	memory_write: { title: 'Новая заметка', icon: NotepadTextIcon },
	session_list: { title: 'Прошлые сессии', icon: HistoryIcon },
	session_read: { title: 'Прошлая сессия', icon: HistoryIcon },
	skill_save: { title: 'Новый навык', icon: LightBulbIcon },
	show_poll: { title: 'Опрос', icon: ListBulletedIcon },
	task_start: { title: 'Новая задача', icon: BoxPlusIcon },
	ask_user: { title: 'Вопрос', icon: MessageIcon },
	open_folder: { title: 'Папка', icon: FolderOpenIcon },
	music_add_url: { title: 'Трек в плейлист', icon: MusicIcon },
	find_wallpaper: { title: 'Поиск обоев', icon: ImagesIcon },
	sysinfo: { title: 'Система', icon: CpuIcon },
	weather_get: { title: 'Погода', icon: CloudIcon },
	skin_recommend: { title: 'Подбор скинов', icon: ShirtIcon },
	timer_set: { title: 'Таймер', icon: TimerIcon },
	celebrate: { title: 'Праздник', icon: SparklesIcon },
}

function metaOf(step: AiStep): ToolMeta {
	if (step.kind === 'thought') return { title: 'Размышление', icon: BrainCircuitIcon }
	return TOOLS[step.tool ?? ''] ?? { title: step.tool ?? 'Действие', icon: WrenchIcon }
}

const LANGS: Record<string, string> = {
	js: 'javascript',
	ts: 'typescript',
	py: 'python',
	java: 'java',
	json: 'json',
	mcmeta: 'json',
	html: 'html',
	css: 'css',
	md: 'markdown',
	sh: 'bash',
	lua: 'lua',
	cs: 'c#',
	toml: 'toml',
	yml: 'yaml',
	yaml: 'yaml',
	txt: 'текст',
}

/** The first argument, before `::`. */
function head(args = '') {
	const at = args.indexOf('::')
	return (at < 0 ? args : args.slice(0, at)).trim()
}

function rest(args = '') {
	const at = args.indexOf('::')
	return at < 0 ? '' : args.slice(at + 2)
}

function hostOf(url: string) {
	try {
		return new URL(url).hostname.replace(/^www\./, '')
	} catch {
		return url
	}
}

function pathOf(url: string) {
	try {
		const parsed = new URL(url)
		const path = decodeURIComponent(parsed.pathname + parsed.search)
		return path === '/' ? '' : path
	} catch {
		return ''
	}
}

function favicon(url: string) {
	return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostOf(url))}&sz=64`
}

/** The one line under a step's title. */
function subtitleOf(step: AiStep): string {
	if (step.kind === 'thought') return (step.text ?? '').replace(/\s+/g, ' ')
	const args = step.args ?? ''
	switch (step.tool) {
		case 'web_fetch':
		case 'view_image':
			return hostOf(args.trim()) + pathOf(args.trim())
		case 'gen_image':
			return head(args)
		case 'sandbox_write':
		case 'sandbox_pack':
		case 'sandbox_unpack':
		case 'open_folder':
			return head(args)
		default:
			return args.replace(/\s+/g, ' ').trim()
	}
}

type Detail =
	| { kind: 'code'; label: string; lang: string; code: string; output?: string }
	| { kind: 'sources'; sources: { title: string; url: string }[] }
	| { kind: 'page'; url: string; excerpt: string }
	| { kind: 'image' }
	| { kind: 'text'; text: string }
	| { kind: 'none' }

function detailOf(step: AiStep): Detail {
	if (step.kind === 'thought') return { kind: 'text', text: step.text ?? '' }
	const args = step.args ?? ''
	const output = step.output?.trim() ?? ''
	switch (step.tool) {
		case 'gen_image':
			return { kind: 'image' }
		case 'web_search':
			return step.sources?.length
				? { kind: 'sources', sources: step.sources }
				: output
					? { kind: 'text', text: output }
					: { kind: 'none' }
		case 'web_fetch':
			return { kind: 'page', url: args.trim(), excerpt: output.slice(0, 600) }
		case 'sandbox_bash':
			return { kind: 'code', label: 'bash', lang: 'bash', code: args, output }
		case 'launcher_compile_java':
			return { kind: 'code', label: 'javac', lang: 'bash', code: args, output }
		case 'sandbox_write': {
			const file = head(args)
			const ext = file.split('.').pop()?.toLowerCase() ?? ''
			return {
				kind: 'code',
				label: file || 'файл',
				lang: LANGS[ext] ?? ext,
				code: rest(args).replace(/^\n/, ''),
				output,
			}
		}
		case 'sandbox_read': {
			const ext = head(args).split('.').pop()?.toLowerCase() ?? ''
			return output
				? { kind: 'code', label: head(args) || 'файл', lang: LANGS[ext] ?? ext, code: output }
				: { kind: 'none' }
		}
		default:
			return output ? { kind: 'text', text: output } : { kind: 'none' }
	}
}

const details = computed(() => new Map(props.steps.map((step) => [step.id, detailOf(step)])))

/** The detail of a step narrowed to one kind (the template checks the kind first). */
function detailAs<K extends Detail['kind']>(id: string, kind: K) {
	const detail = details.value.get(id)
	return (detail?.kind === kind ? detail : undefined) as Extract<Detail, { kind: K }>
}

function hasDetails(step: AiStep) {
	const detail = details.value.get(step.id)
	return !!detail && detail.kind !== 'none' && detail.kind !== 'image'
}

function toggleStep(step: AiStep) {
	if (!hasDetails(step)) return
	expanded.value = { ...expanded.value, [step.id]: !expanded.value[step.id] }
}

// ---- Time ------------------------------------------------------------------

const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | undefined
const anyRunning = computed(
	() => props.live || props.steps.some((step) => step.status === 'running'),
)
watch(
	anyRunning,
	(running) => {
		clearInterval(ticker)
		ticker = running ? setInterval(() => (now.value = Date.now()), 250) : undefined
	},
	{ immediate: true },
)
onBeforeUnmount(() => clearInterval(ticker))

function seconds(ms: number) {
	const total = Math.max(0, ms) / 1000
	if (total < 10) return `${total.toFixed(1).replace('.', ',')} с`
	if (total < 60) return `${Math.round(total)} с`
	return `${Math.floor(total / 60)} мин ${Math.round(total % 60)} с`
}

function durationOf(step: AiStep) {
	if (step.kind === 'thought') return ''
	return seconds((step.endedAt ?? now.value) - step.startedAt)
}

// ---- What the run amounted to ------------------------------------------------

function plural(count: number, one: string, few: string, many: string) {
	const mod10 = count % 10
	const mod100 = count % 100
	if (mod10 === 1 && mod100 !== 11) return one
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
	return many
}

const toolSteps = computed(() => props.steps.filter((step) => step.kind === 'tool'))

const stats = computed(() => {
	const of = (...tools: string[]) =>
		toolSteps.value.filter((step) => tools.includes(step.tool ?? ''))
	const pages = of('web_fetch').length
	const searches = of('web_search')
	const found = searches.reduce((sum, step) => sum + (step.sources?.length ?? 0), 0)
	const commands = of('sandbox_bash', 'launcher_compile_java').length
	const files = of('sandbox_write').length
	const images = of('gen_image').length
	const list: { key: string; icon: Component; text: string }[] = []
	if (pages)
		list.push({
			key: 'p',
			icon: GlobeIcon,
			text: `${pages} ${plural(pages, 'страница', 'страницы', 'страниц')}`,
		})
	if (searches.length)
		list.push({
			key: 's',
			icon: SearchIcon,
			text: found
				? `${found} ${plural(found, 'источник', 'источника', 'источников')}`
				: `${searches.length} ${plural(searches.length, 'поиск', 'поиска', 'поисков')}`,
		})
	if (commands)
		list.push({
			key: 'c',
			icon: TerminalSquareIcon,
			text: `${commands} ${plural(commands, 'команда', 'команды', 'команд')}`,
		})
	if (files)
		list.push({
			key: 'f',
			icon: FileCodeIcon,
			text: `${files} ${plural(files, 'файл', 'файла', 'файлов')}`,
		})
	if (images)
		list.push({
			key: 'i',
			icon: SparklesIcon,
			text: `${images} ${plural(images, 'изображение', 'изображения', 'изображений')}`,
		})
	return list
})

const totalTime = computed(() => {
	if (props.steps.length === 0) return ''
	const first = Math.min(...props.steps.map((step) => step.startedAt))
	const last = props.live
		? now.value
		: Math.max(...props.steps.map((step) => step.endedAt ?? step.startedAt))
	return seconds(last - first)
})

const headline = computed(() => {
	if (props.live) return props.phase || 'Работаю'
	const count = toolSteps.value.length
	return count > 0
		? `Выполнено ${count} ${plural(count, 'шаг', 'шага', 'шагов')}`
		: 'Ход размышлений'
})

const failedCount = computed(() => toolSteps.value.filter((step) => step.status === 'error').length)

async function copy(key: string, text: string) {
	try {
		await navigator.clipboard.writeText(text)
		copied.value = key
		setTimeout(() => {
			if (copied.value === key) copied.value = ''
		}, 1400)
	} catch {
		/* the clipboard can be refused; nothing to tell */
	}
}
</script>

<template>
	<div class="ai-steps" :class="{ 'ai-steps--live': live }">
		<button type="button" class="ai-steps-head" :aria-expanded="open" @click="open = !open">
			<span class="ai-steps-badge" :class="{ 'ai-steps-badge--live': live }">
				<BrainCircuitIcon v-if="live" class="size-4" />
				<CheckIcon v-else class="size-4" />
			</span>
			<span class="ai-steps-headline" :class="{ 'ai-shimmer': live }">{{ headline }}</span>
			<span class="ai-steps-stats">
				<span v-for="stat in stats" :key="stat.key" class="ai-steps-stat">
					<component :is="stat.icon" class="size-3.5" />
					{{ stat.text }}
				</span>
				<span v-if="failedCount" class="ai-steps-stat ai-steps-stat--error">
					<XIcon class="size-3.5" />
					{{ failedCount }}
				</span>
				<span v-if="totalTime" class="ai-steps-stat">
					<ClockIcon class="size-3.5" />
					{{ totalTime }}
				</span>
			</span>
			<ChevronDownIcon class="ai-chevron size-4" :class="{ 'ai-chevron--open': open }" />
		</button>

		<div class="ai-fold" :class="{ 'ai-fold--open': open }">
			<div class="ai-fold-inner">
				<TransitionGroup tag="ol" name="ai-step" class="ai-step-list">
					<li
						v-for="step in steps"
						:key="step.id"
						class="ai-step"
						:class="[`ai-step--${step.status}`, `ai-step--${step.kind}`]"
					>
						<span class="ai-step-rail" aria-hidden="true">
							<span class="ai-step-icon">
								<component :is="metaOf(step).icon" class="size-3.5" />
							</span>
						</span>
						<div class="ai-step-body">
							<button
								type="button"
								class="ai-step-row"
								:class="{ 'ai-step-row--static': !hasDetails(step) }"
								:aria-expanded="hasDetails(step) ? !!expanded[step.id] : undefined"
								@click="toggleStep(step)"
							>
								<span class="ai-step-title">{{ metaOf(step).title }}</span>
								<span
									class="ai-step-sub"
									:class="{
										'ai-step-sub--mono': [
											'sandbox_bash',
											'launcher_compile_java',
											'sandbox_write',
											'sandbox_read',
											'sandbox_list',
										].includes(step.tool ?? ''),
										'ai-step-sub--thought': step.kind === 'thought',
									}"
								>
									<img
										v-if="(step.tool === 'web_fetch' || step.tool === 'view_image') && step.args"
										:src="favicon(step.args)"
										alt=""
										class="ai-favicon"
										loading="lazy"
									/>
									{{ subtitleOf(step) }}
								</span>
								<span class="ai-step-status">
									<span v-if="step.status === 'running'" class="ai-spinner" />
									<XIcon v-else-if="step.status === 'error'" class="size-3.5 text-red" />
									<span v-if="durationOf(step)" class="ai-step-time">{{ durationOf(step) }}</span>
									<ChevronDownIcon
										v-if="hasDetails(step)"
										class="ai-chevron size-3.5"
										:class="{ 'ai-chevron--open': expanded[step.id] }"
									/>
								</span>
							</button>

							<!-- The picture is the point of the step, so it is never folded away. -->
							<div v-if="step.tool === 'gen_image'" class="ai-gen">
								<button
									v-if="step.image"
									type="button"
									class="ai-gen-frame"
									:aria-label="head(step.args)"
									@click="emit('zoom', step.image)"
								>
									<img :src="step.image" alt="" class="ai-gen-image" />
								</button>
								<div v-else-if="step.status === 'running'" class="ai-gen-canvas" aria-live="polite">
									<span class="ai-gen-orb ai-gen-orb--a" />
									<span class="ai-gen-orb ai-gen-orb--b" />
									<span class="ai-gen-orb ai-gen-orb--c" />
									<span class="ai-gen-grain" />
									<span class="ai-gen-label">
										<SparklesIcon class="size-4" />
										<span class="ai-shimmer">Рисую…</span>
									</span>
								</div>
								<p v-else-if="step.status === 'error'" class="ai-gen-failed">{{ step.output }}</p>
							</div>

							<div class="ai-fold" :class="{ 'ai-fold--open': expanded[step.id] }">
								<div class="ai-fold-inner" :inert="!expanded[step.id] || undefined">
									<div v-if="details.get(step.id)?.kind === 'code'" class="ai-step-detail">
										<template
											v-for="detail in [detailAs(step.id, 'code')]"
											:key="step.id + detail.kind"
										>
											<div class="ai-codebox">
												<div class="ai-codebox-head">
													<FileCodeIcon class="size-3.5" />
													<span class="grow truncate">{{ detail.label }}</span>
													<span
														v-if="detail.lang && detail.lang !== detail.label"
														class="ai-codebox-lang"
														>{{ detail.lang }}</span
													>
													<button
														type="button"
														class="ai-icon-btn"
														:aria-label="'Скопировать'"
														@click.stop="copy(`${step.id}-code`, detail.code)"
													>
														<CheckIcon
															v-if="copied === `${step.id}-code`"
															class="size-3.5 text-green"
														/>
														<CopyIcon v-else class="size-3.5" />
													</button>
												</div>
												<pre class="ai-codebox-pre"><code>{{ detail.code }}</code></pre>
											</div>
											<div v-if="detail.output" class="ai-codebox ai-codebox--output">
												<div class="ai-codebox-head">
													<TerminalSquareIcon class="size-3.5" />
													<span class="grow">Вывод</span>
													<button
														type="button"
														class="ai-icon-btn"
														:aria-label="'Скопировать'"
														@click.stop="copy(`${step.id}-out`, detail.output)"
													>
														<CheckIcon
															v-if="copied === `${step.id}-out`"
															class="size-3.5 text-green"
														/>
														<CopyIcon v-else class="size-3.5" />
													</button>
												</div>
												<pre class="ai-codebox-pre"><code>{{ detail.output }}</code></pre>
											</div>
										</template>
									</div>

									<div
										v-else-if="details.get(step.id)?.kind === 'sources'"
										class="ai-step-detail ai-sources"
									>
										<a
											v-for="(source, sourceIndex) in detailAs(step.id, 'sources').sources"
											:key="sourceIndex"
											:href="source.url"
											class="ai-source"
											@click.prevent="emit('open-link', source.url)"
										>
											<img :src="favicon(source.url)" alt="" class="ai-favicon" loading="lazy" />
											<span class="ai-source-text">
												<span class="ai-source-title">{{ source.title }}</span>
												<span class="ai-source-host">{{ hostOf(source.url) }}</span>
											</span>
											<ExternalIcon class="ai-source-open size-3.5" />
										</a>
									</div>

									<div v-else-if="details.get(step.id)?.kind === 'page'" class="ai-step-detail">
										<template
											v-for="detail in [detailAs(step.id, 'page')]"
											:key="step.id + detail.kind"
										>
											<a
												:href="detail.url"
												class="ai-page-card"
												@click.prevent="emit('open-link', detail.url)"
											>
												<img
													:src="favicon(detail.url)"
													alt=""
													class="ai-favicon ai-favicon--lg"
													loading="lazy"
												/>
												<span class="ai-source-text">
													<span class="ai-source-title">{{ hostOf(detail.url) }}</span>
													<span class="ai-source-host">{{ pathOf(detail.url) || '/' }}</span>
												</span>
												<ExternalIcon class="ai-source-open size-3.5" />
											</a>
											<p v-if="detail.excerpt" class="ai-excerpt">{{ detail.excerpt }}</p>
										</template>
									</div>

									<p
										v-else-if="details.get(step.id)?.kind === 'text'"
										class="ai-step-detail ai-step-text"
									>
										{{ detailAs(step.id, 'text').text }}
									</p>
								</div>
							</div>
						</div>
					</li>
				</TransitionGroup>
				<p v-if="live && steps.length === 0" class="ai-steps-waiting">
					<span class="ai-dots"><span /><span /><span /></span>
					<span class="ai-shimmer">{{ phase }}</span>
				</p>
			</div>
		</div>
	</div>
</template>

<style scoped>
.ai-steps {
	display: flex;
	flex-direction: column;
	margin-bottom: 0.5rem;
	border: 1px solid var(--surface-5);
	border-radius: 0.9rem;
	background: color-mix(in srgb, var(--surface-3, var(--color-bg)) 55%, transparent);
	backdrop-filter: blur(14px) saturate(1.2);
	-webkit-backdrop-filter: blur(14px) saturate(1.2);
	overflow: hidden;
}

.ai-steps-head {
	display: flex;
	align-items: center;
	gap: 0.55rem;
	width: 100%;
	padding: 0.55rem 0.75rem;
	border: none;
	background: transparent;
	color: var(--color-contrast);
	font: inherit;
	font-size: 0.8125rem;
	text-align: left;
	cursor: pointer;
	transition: background-color 0.2s ease;
}

.ai-steps-head:hover {
	background: color-mix(in srgb, var(--color-contrast) 4%, transparent);
}

.ai-steps-badge {
	display: grid;
	place-items: center;
	width: 1.5rem;
	height: 1.5rem;
	flex-shrink: 0;
	border-radius: 999px;
	background: color-mix(in srgb, var(--color-green, #1bd96a) 16%, transparent);
	color: var(--color-green, #1bd96a);
}

.ai-steps-badge--live {
	background: color-mix(in srgb, var(--color-brand) 18%, transparent);
	color: var(--color-brand);
	animation: ai-pulse 1.6s ease-in-out infinite;
}

.ai-steps-headline {
	flex-shrink: 0;
	font-weight: 600;
}

.ai-steps-stats {
	display: flex;
	flex: 1;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 0.35rem;
	min-width: 0;
}

.ai-steps-stat {
	display: inline-flex;
	align-items: center;
	gap: 0.25rem;
	padding: 0.1rem 0.45rem;
	border-radius: 999px;
	background: color-mix(in srgb, var(--color-contrast) 6%, transparent);
	color: var(--color-secondary);
	font-size: 0.6875rem;
	white-space: nowrap;
}

.ai-steps-stat--error {
	color: var(--color-red);
}

.ai-chevron {
	flex-shrink: 0;
	color: var(--color-secondary);
	transform: rotate(-90deg);
	transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.ai-chevron--open {
	transform: rotate(0deg);
}

/* Height animates from nothing to what is inside, without measuring. */
.ai-fold {
	display: grid;
	grid-template-rows: 0fr;
	opacity: 0;
	transition:
		grid-template-rows 0.3s cubic-bezier(0.2, 0.8, 0.2, 1),
		opacity 0.25s ease;
}

.ai-fold--open {
	grid-template-rows: 1fr;
	opacity: 1;
}

.ai-fold-inner {
	min-height: 0;
	overflow: hidden;
}

.ai-step-list {
	margin: 0;
	padding: 0.15rem 0.75rem 0.6rem;
	list-style: none;
}

.ai-step {
	position: relative;
	display: flex;
	gap: 0.6rem;
}

/* The line that strings the steps together. */
.ai-step-rail {
	position: relative;
	display: flex;
	flex-direction: column;
	align-items: center;
	width: 1.5rem;
	flex-shrink: 0;
}

.ai-step-rail::after {
	content: '';
	position: absolute;
	top: 1.9rem;
	bottom: -0.15rem;
	width: 1px;
	background: var(--surface-5);
}

.ai-step:last-child .ai-step-rail::after {
	display: none;
}

.ai-step-icon {
	display: grid;
	place-items: center;
	width: 1.5rem;
	height: 1.5rem;
	margin-top: 0.3rem;
	border-radius: 0.45rem;
	border: 1px solid var(--surface-5);
	background: var(--color-button-bg);
	color: var(--color-secondary);
	transition:
		color 0.2s ease,
		border-color 0.2s ease,
		background-color 0.2s ease;
}

.ai-step--running .ai-step-icon {
	color: var(--color-brand);
	border-color: color-mix(in srgb, var(--color-brand) 50%, transparent);
	background: color-mix(in srgb, var(--color-brand) 12%, var(--color-button-bg));
}

.ai-step--error .ai-step-icon {
	color: var(--color-red);
	border-color: color-mix(in srgb, var(--color-red) 45%, transparent);
}

.ai-step--thought .ai-step-icon {
	border-style: dashed;
}

.ai-step-body {
	flex: 1;
	min-width: 0;
	padding-bottom: 0.2rem;
}

.ai-step-row {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	width: 100%;
	min-height: 2.1rem;
	padding: 0.25rem 0.4rem;
	margin-left: -0.4rem;
	border: none;
	border-radius: 0.55rem;
	background: transparent;
	color: inherit;
	font: inherit;
	text-align: left;
	cursor: pointer;
	transition: background-color 0.18s ease;
}

.ai-step-row:hover {
	background: color-mix(in srgb, var(--color-contrast) 5%, transparent);
}

.ai-step-row--static {
	cursor: default;
}

.ai-step-row--static:hover {
	background: transparent;
}

.ai-step-title {
	flex-shrink: 0;
	color: var(--color-contrast);
	font-size: 0.8125rem;
	font-weight: 600;
}

.ai-step-sub {
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
	flex: 1;
	min-width: 0;
	overflow: hidden;
	color: var(--color-secondary);
	font-size: 0.75rem;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.ai-step-sub--mono {
	font-family: var(--mono-font, ui-monospace, 'JetBrains Mono', Consolas, monospace);
	font-size: 0.7rem;
}

.ai-step-sub--thought {
	font-style: normal;
	opacity: 0.85;
}

.ai-step-status {
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
	flex-shrink: 0;
}

.ai-step-time {
	color: var(--color-secondary);
	font-size: 0.6875rem;
	font-variant-numeric: tabular-nums;
}

.ai-step-detail {
	display: flex;
	flex-direction: column;
	gap: 0.4rem;
	padding: 0.15rem 0 0.45rem;
}

.ai-step-text {
	margin: 0;
	color: var(--color-secondary);
	font-size: 0.75rem;
	line-height: 1.45;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	max-height: 14rem;
	overflow-y: auto;
}

/* Code and its output. */
.ai-codebox {
	border: 1px solid var(--surface-5);
	border-radius: 0.6rem;
	background: color-mix(in srgb, #000 35%, transparent);
	overflow: hidden;
}

.ai-codebox--output {
	background: color-mix(in srgb, #000 22%, transparent);
}

.ai-codebox-head {
	display: flex;
	align-items: center;
	gap: 0.4rem;
	padding: 0.3rem 0.4rem 0.3rem 0.6rem;
	border-bottom: 1px solid var(--surface-5);
	color: var(--color-secondary);
	font-size: 0.6875rem;
}

.ai-codebox-lang {
	padding: 0.05rem 0.4rem;
	border-radius: 999px;
	background: color-mix(in srgb, var(--color-brand) 14%, transparent);
	color: var(--color-brand);
	font-size: 0.625rem;
	text-transform: lowercase;
}

.ai-codebox-pre {
	margin: 0;
	max-height: 18rem;
	padding: 0.55rem 0.7rem;
	overflow: auto;
	color: var(--color-contrast);
	font-family: var(--mono-font, ui-monospace, 'JetBrains Mono', Consolas, monospace);
	font-size: 0.7rem;
	line-height: 1.5;
	white-space: pre;
}

.ai-icon-btn {
	display: grid;
	place-items: center;
	width: 1.5rem;
	height: 1.5rem;
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

.ai-icon-btn:hover {
	background: color-mix(in srgb, var(--color-contrast) 8%, transparent);
	color: var(--color-contrast);
}

/* Pages. */
.ai-favicon {
	width: 0.9rem;
	height: 0.9rem;
	flex-shrink: 0;
	border-radius: 0.2rem;
}

.ai-favicon--lg {
	width: 1.25rem;
	height: 1.25rem;
	border-radius: 0.3rem;
}

.ai-sources {
	gap: 0.25rem;
}

.ai-source,
.ai-page-card {
	display: flex;
	align-items: center;
	gap: 0.55rem;
	padding: 0.4rem 0.55rem;
	border: 1px solid var(--surface-5);
	border-radius: 0.6rem;
	background: color-mix(in srgb, var(--color-contrast) 3%, transparent);
	color: inherit;
	text-decoration: none;
	transition:
		background-color 0.18s ease,
		border-color 0.18s ease,
		transform 0.18s ease;
}

.ai-source:hover,
.ai-page-card:hover {
	background: color-mix(in srgb, var(--color-brand) 8%, transparent);
	border-color: color-mix(in srgb, var(--color-brand) 35%, var(--surface-5));
	transform: translateX(2px);
}

.ai-source-text {
	display: flex;
	flex: 1;
	flex-direction: column;
	min-width: 0;
}

.ai-source-title {
	overflow: hidden;
	color: var(--color-contrast);
	font-size: 0.75rem;
	font-weight: 600;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.ai-source-host {
	overflow: hidden;
	color: var(--color-secondary);
	font-size: 0.6875rem;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.ai-source-open {
	flex-shrink: 0;
	color: var(--color-secondary);
	opacity: 0;
	transition: opacity 0.18s ease;
}

.ai-source:hover .ai-source-open,
.ai-page-card:hover .ai-source-open {
	opacity: 1;
}

.ai-excerpt {
	display: -webkit-box;
	margin: 0;
	overflow: hidden;
	color: var(--color-secondary);
	font-size: 0.72rem;
	line-height: 1.45;
	-webkit-line-clamp: 5;
	-webkit-box-orient: vertical;
}

/* The picture being drawn: colour moving under grain, then the picture
   coming into focus where the colour was. */
.ai-gen {
	padding: 0.2rem 0 0.5rem;
}

.ai-gen-canvas,
.ai-gen-frame {
	position: relative;
	display: block;
	width: min(18rem, 100%);
	aspect-ratio: 1;
	border-radius: 0.9rem;
	overflow: hidden;
}

.ai-gen-canvas {
	background: color-mix(in srgb, var(--color-brand) 10%, #0b0b10);
	border: 1px solid color-mix(in srgb, var(--color-brand) 30%, var(--surface-5));
}

.ai-gen-orb {
	position: absolute;
	width: 70%;
	height: 70%;
	border-radius: 50%;
	filter: blur(28px);
	opacity: 0.75;
	mix-blend-mode: screen;
}

.ai-gen-orb--a {
	background: var(--color-brand);
	animation: ai-orb-a 5s ease-in-out infinite;
}

.ai-gen-orb--b {
	background: #6d5dfc;
	animation: ai-orb-b 6s ease-in-out infinite;
}

.ai-gen-orb--c {
	background: #22c3e6;
	animation: ai-orb-c 7s ease-in-out infinite;
}

.ai-gen-grain {
	position: absolute;
	inset: 0;
	background-image: repeating-radial-gradient(
		circle at 30% 30%,
		rgb(255 255 255 / 0.05) 0 1px,
		transparent 1px 3px
	);
	animation: ai-grain 0.6s steps(3) infinite;
}

.ai-gen-canvas::after {
	content: '';
	position: absolute;
	inset: 0;
	background: linear-gradient(
		110deg,
		transparent 30%,
		rgb(255 255 255 / 0.12) 50%,
		transparent 70%
	);
	background-size: 250% 100%;
	animation: ai-sweep 2.2s linear infinite;
}

.ai-gen-label {
	position: absolute;
	left: 50%;
	bottom: 0.75rem;
	z-index: 1;
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
	padding: 0.3rem 0.7rem;
	border-radius: 999px;
	background: rgb(0 0 0 / 0.35);
	backdrop-filter: blur(8px);
	color: #fff;
	font-size: 0.75rem;
	font-weight: 600;
	transform: translateX(-50%);
}

.ai-gen-frame {
	padding: 0;
	border: 1px solid var(--surface-5);
	background: #000;
	cursor: zoom-in;
}

.ai-gen-image {
	display: block;
	width: 100%;
	height: 100%;
	object-fit: cover;
	animation: ai-reveal 1.1s cubic-bezier(0.2, 0.8, 0.2, 1) both;
	transition: transform 0.35s ease;
}

.ai-gen-frame:hover .ai-gen-image {
	transform: scale(1.03);
}

.ai-gen-failed {
	margin: 0;
	color: var(--color-red);
	font-size: 0.75rem;
}

/* Live bits. */
.ai-spinner {
	width: 0.85rem;
	height: 0.85rem;
	border: 2px solid color-mix(in srgb, var(--color-brand) 25%, transparent);
	border-top-color: var(--color-brand);
	border-radius: 50%;
	animation: ai-spin 0.8s linear infinite;
}

.ai-shimmer {
	background: linear-gradient(
		90deg,
		var(--color-secondary) 0%,
		var(--color-contrast) 45%,
		var(--color-secondary) 90%
	);
	background-size: 200% 100%;
	-webkit-background-clip: text;
	background-clip: text;
	color: transparent;
	animation: ai-text-sweep 1.8s linear infinite;
}

.ai-steps-waiting {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	margin: 0;
	padding: 0.1rem 0.9rem 0.65rem;
	font-size: 0.75rem;
}

.ai-dots {
	display: inline-flex;
	gap: 3px;
}

.ai-dots span {
	width: 5px;
	height: 5px;
	border-radius: 50%;
	background: var(--color-brand);
	animation: ai-dot 1.2s ease-in-out infinite;
}

.ai-dots span:nth-child(2) {
	animation-delay: 0.15s;
}

.ai-dots span:nth-child(3) {
	animation-delay: 0.3s;
}

.ai-step-enter-active {
	transition:
		opacity 0.3s ease,
		transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.ai-step-enter-from {
	opacity: 0;
	transform: translateY(-4px);
}

@keyframes ai-spin {
	to {
		transform: rotate(360deg);
	}
}

@keyframes ai-pulse {
	0%,
	100% {
		box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-brand) 35%, transparent);
	}
	50% {
		box-shadow: 0 0 0 5px transparent;
	}
}

@keyframes ai-text-sweep {
	from {
		background-position: 200% 0;
	}
	to {
		background-position: -200% 0;
	}
}

@keyframes ai-dot {
	0%,
	80%,
	100% {
		opacity: 0.3;
		transform: translateY(0);
	}
	40% {
		opacity: 1;
		transform: translateY(-3px);
	}
}

@keyframes ai-orb-a {
	0%,
	100% {
		transform: translate(-20%, -15%) scale(1);
	}
	50% {
		transform: translate(35%, 25%) scale(1.15);
	}
}

@keyframes ai-orb-b {
	0%,
	100% {
		transform: translate(50%, -10%) scale(0.9);
	}
	50% {
		transform: translate(-10%, 45%) scale(1.1);
	}
}

@keyframes ai-orb-c {
	0%,
	100% {
		transform: translate(10%, 55%) scale(1);
	}
	50% {
		transform: translate(45%, -5%) scale(0.85);
	}
}

@keyframes ai-grain {
	0% {
		transform: translate(0, 0);
	}
	33% {
		transform: translate(-2px, 1px);
	}
	66% {
		transform: translate(1px, -2px);
	}
}

@keyframes ai-sweep {
	from {
		background-position: 150% 0;
	}
	to {
		background-position: -100% 0;
	}
}

@keyframes ai-reveal {
	from {
		filter: blur(22px) saturate(1.8);
		opacity: 0.2;
		transform: scale(1.08);
	}
	to {
		filter: none;
		opacity: 1;
		transform: none;
	}
}

@media (prefers-reduced-motion: reduce) {
	.ai-fold,
	.ai-chevron,
	.ai-step-enter-active {
		transition: none;
	}

	.ai-gen-orb,
	.ai-gen-grain,
	.ai-gen-canvas::after,
	.ai-gen-image,
	.ai-shimmer,
	.ai-steps-badge--live {
		animation: none;
	}
}
</style>

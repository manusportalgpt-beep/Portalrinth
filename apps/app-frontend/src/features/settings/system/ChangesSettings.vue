<script setup lang="ts">
/**
 * Settings → Changes.
 *
 * The top card keeps the launcher up to date: it checks the GitHub releases
 * (by tag and by name) and Tauri's own updater, installs the newest build in
 * one click, and - when "install at once" is on - does it by itself every
 * time the launcher starts and finds one.
 *
 * Below it, three changelogs side by side: Portalrinth (its own entries and
 * the release notes), Noctrinth (the fork it grew from) and Modrinth App.
 * Any of them can be run through the launcher's built-in translator.
 */
import {
	CheckIcon,
	DownloadIcon,
	ExternalIcon,
	LanguagesIcon,
	RefreshCwIcon,
	SpinnerIcon,
	UndoIcon,
} from '@modrinth/assets'
import { getChangelog } from '@modrinth/blog'
import { Button, Toggle, useVIntl } from '@modrinth/ui'
import { getVersion } from '@tauri-apps/api/app'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { openUrl } from '@tauri-apps/plugin-opener'
import dayjs from 'dayjs'
import { computed, onMounted, reactive, ref, watch } from 'vue'

import ModrinthMark from '@/assets/modrinth-mark.svg?component'
import NoctrinthMark from '@/assets/noctrinth-icon.svg?component'
import PortalrinthMark from '@/assets/portalrinth-icon.png'
import { PORTALRINTH_CHANGELOG } from '@/helpers/portalrinth-changelog'
import { PORTALRINTH_OWN_CHANGELOG } from '@/helpers/portalrinth-own-changelog'
import { resolveTarget, translateHtml } from '@/helpers/portalrinth-translate'
import {
	checkForLauncherUpdate,
	fetchLauncherReleases,
	installLauncherUpdate,
	LAUNCHER_RELEASES_URL,
	type LauncherRelease,
	launcherUpdate,
	saveUpdateSettings,
	updateSettings,
} from '@/helpers/portalrinth-updates'
import { renderChangelog } from '@/helpers/render-changelog'

const { locale } = useVIntl()

type SourceId = 'portalrinth' | 'noctrinth' | 'modrinth'

interface Section {
	title: string
	html: string
}

interface Entry {
	key: string
	version: string
	date: string
	sections: Section[]
	url?: string
	tag?: string
}

const NOCTRINTH_FEED = 'https://everelsu.github.io/Noctrinth/changelog.json'
const NOCTRINTH_URL = 'https://github.com/Everelsu/Noctrinth/releases'
const MODRINTH_URL = 'https://modrinth.com/news/changelog?filter=app'

const sources: { id: SourceId; label: string }[] = [
	{ id: 'portalrinth', label: 'Portalrinth' },
	{ id: 'noctrinth', label: 'Noctrinth' },
	{ id: 'modrinth', label: 'Modrinth App' },
]
const source = ref<SourceId>('portalrinth')

const installedVersion = ref('')
onMounted(async () => {
	installedVersion.value = await getVersion().catch(() => '')
	if (!launcherUpdate.checkedAt) void checkForLauncherUpdate()
	void loadReleases()
	void loadNoctrinth()
})

function isInstalled(version: string) {
	const label = launcherUpdate.current || installedVersion.value
	return Boolean(version && label && version === label)
}

// ---- Parsing --------------------------------------------------------------

const NEWLINE = String.fromCharCode(10)

function parseBody(body: string): Section[] {
	const sections: { title: string; lines: string[] }[] = []
	let current: { title: string; lines: string[] } | null = null
	for (const line of body.replace(/\r/g, '').split(NEWLINE)) {
		const heading = /^\s*#{2,3}\s+(.*)$/.exec(line)
		if (heading) {
			current = { title: heading[1].trim(), lines: [] }
			sections.push(current)
			continue
		}
		if (!current) {
			current = { title: '', lines: [] }
			sections.push(current)
		}
		current.lines.push(line)
	}
	return sections
		.map((section) => ({
			title: section.title,
			html: renderChangelog(section.lines.join(NEWLINE).trim()),
		}))
		.filter((section) => section.title || section.html)
}

function formatDate(date: string) {
	return dayjs(date).isValid() ? dayjs(date).format('D MMMM YYYY') : ''
}

// ---- Portalrinth: own entries + release notes -------------------------------

const releases = ref<LauncherRelease[]>([])
const releasesError = ref('')
async function loadReleases() {
	try {
		releases.value = await fetchLauncherReleases()
		releasesError.value = ''
	} catch (error) {
		releasesError.value = error instanceof Error ? error.message : String(error)
	}
}

const portalrinthEntries = computed<Entry[]>(() => {
	const own: Entry[] = PORTALRINTH_OWN_CHANGELOG.map((entry) => ({
		key: `own-${entry.version}`,
		version: entry.version,
		date: entry.date,
		sections: parseBody(entry.body),
	}))
	const known = new Set(own.map((entry) => entry.version))
	for (const release of releases.value) {
		const ownEntry = own.find((entry) => entry.version === release.label)
		if (ownEntry) {
			ownEntry.url = release.url
			ownEntry.tag = release.tag
			continue
		}
		if (known.has(release.label)) continue
		known.add(release.label)
		const body = release.body.trim()
		own.push({
			key: `gh-${release.tag}`,
			version: release.label,
			date: release.date,
			url: release.url,
			tag: release.tag,
			sections: body ? parseBody(body) : [{ title: '', html: `<p>Релиз «${release.name}».</p>` }],
		})
	}
	return own.sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
})

// ---- Noctrinth: the live feed, the bundled copy when offline ----------------

interface FeedEntry {
	version: string
	date: string
	body: string
	body_ru?: string
}
const noctrinthFeed = ref<FeedEntry[] | null>(null)
async function loadNoctrinth() {
	try {
		const response = await tauriFetch(NOCTRINTH_FEED)
		if (response.ok) noctrinthFeed.value = (await response.json()) as FeedEntry[]
	} catch {
		/* the bundled copy below */
	}
}

const noctrinthEntries = computed<Entry[]>(() =>
	((noctrinthFeed.value ?? PORTALRINTH_CHANGELOG) as FeedEntry[]).map((entry) => ({
		key: `noc-${entry.version}`,
		version: entry.version,
		date: entry.date,
		sections: parseBody((locale.value.startsWith('ru') && entry.body_ru) || entry.body),
	})),
)

// ---- Modrinth App --------------------------------------------------------

const modrinthEntries = computed<Entry[]>(() =>
	getChangelog()
		.filter((entry) => entry.product === 'app')
		.slice(0, 30)
		.map((entry) => ({
			key: `mr-${entry.version ?? entry.date}`,
			version: entry.version ?? '',
			date: String(entry.date),
			sections: parseBody(entry.body),
		})),
)

const entries = computed(() =>
	source.value === 'portalrinth'
		? portalrinthEntries.value
		: source.value === 'noctrinth'
			? noctrinthEntries.value
			: modrinthEntries.value,
)

const moreUrl = computed(() =>
	source.value === 'portalrinth'
		? LAUNCHER_RELEASES_URL
		: source.value === 'noctrinth'
			? NOCTRINTH_URL
			: MODRINTH_URL,
)

// ---- Translation ---------------------------------------------------------

const translateOn = ref(false)
const translating = ref(false)
const translated = reactive<Record<string, string>>({})

function sectionKey(entry: Entry, index: number) {
	return `${entry.key}#${index}`
}

async function translateVisible() {
	const target = resolveTarget(locale.value)
	translating.value = true
	try {
		const jobs: Promise<void>[] = []
		for (const entry of entries.value) {
			entry.sections.forEach((section, index) => {
				const key = sectionKey(entry, index)
				if (translated[key]) return
				const html = section.title ? `<h4>${section.title}</h4>${section.html}` : section.html
				jobs.push(
					translateHtml(html, target)
						.then((result) => {
							if (result) translated[key] = result.html
						})
						.catch(() => undefined),
				)
			})
		}
		await Promise.all(jobs)
	} finally {
		translating.value = false
	}
}

function toggleTranslate() {
	translateOn.value = !translateOn.value
	if (translateOn.value) void translateVisible()
}

watch(source, () => {
	if (translateOn.value) void translateVisible()
})

function sectionHtml(entry: Entry, index: number): string | null {
	if (!translateOn.value) return null
	return translated[sectionKey(entry, index)] ?? null
}

// ---- Update card ---------------------------------------------------------

const statusText = computed(() => {
	if (launcherUpdate.installing) {
		return launcherUpdate.progress > 0
			? `Загрузка обновления — ${Math.round(launcherUpdate.progress * 100)}%`
			: 'Готовлю обновление…'
	}
	if (launcherUpdate.checking) return 'Проверяю обновления…'
	if (launcherUpdate.error) return `Не удалось проверить: ${launcherUpdate.error}`
	if (launcherUpdate.available) {
		const version = launcherUpdate.nativeVersion || launcherUpdate.latest?.label || ''
		return `Доступна новая версия ${version}`
	}
	if (launcherUpdate.checkedAt) return 'У вас последняя версия'
	return 'Ещё не проверялось'
})

const checkedAgo = computed(() =>
	launcherUpdate.checkedAt ? dayjs(launcherUpdate.checkedAt).format('HH:mm') : '',
)

function setAutoInstall(value: boolean) {
	saveUpdateSettings({ autoInstall: value })
}
</script>

<template>
	<section class="changes-card">
		<div class="flex flex-wrap items-start justify-between gap-4">
			<div class="min-w-0 flex-1">
				<h2 class="m-0 text-lg font-semibold text-contrast">Обновления лаунчера</h2>
				<p class="m-0 mt-1 text-secondary">
					Установлено:
					<b class="text-contrast">Portalrinth {{ launcherUpdate.current || installedVersion }}</b>
					<template v-if="launcherUpdate.latest">
						· на GitHub: <b class="text-contrast">{{ launcherUpdate.latest.label }}</b>
						<span class="text-secondary">({{ launcherUpdate.latest.tag }})</span>
					</template>
				</p>
				<p
					class="changes-status m-0 mt-2"
					:class="{
						'changes-status--ok':
							!launcherUpdate.available && launcherUpdate.checkedAt && !launcherUpdate.error,
						'changes-status--new': launcherUpdate.available,
						'changes-status--error': launcherUpdate.error,
					}"
				>
					<SpinnerIcon
						v-if="launcherUpdate.checking || launcherUpdate.installing"
						class="size-4 animate-spin"
					/>
					<CheckIcon
						v-else-if="
							!launcherUpdate.available && launcherUpdate.checkedAt && !launcherUpdate.error
						"
						class="size-4"
					/>
					<DownloadIcon v-else-if="launcherUpdate.available" class="size-4" />
					<span>{{ statusText }}</span>
					<span v-if="checkedAgo && !launcherUpdate.checking" class="text-secondary"
						>· {{ checkedAgo }}</span
					>
				</p>
				<div
					v-if="launcherUpdate.installing && launcherUpdate.progress > 0"
					class="changes-progress"
				>
					<div
						class="changes-progress__bar"
						:style="{ transform: `scaleX(${launcherUpdate.progress})` }"
					/>
				</div>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<Button
					:disabled="launcherUpdate.checking || launcherUpdate.installing"
					@click="checkForLauncherUpdate"
				>
					<RefreshCwIcon :class="{ 'animate-spin': launcherUpdate.checking }" />
					Проверить обновления
				</Button>
				<Button
					v-if="launcherUpdate.available"
					color="brand"
					:disabled="launcherUpdate.installing"
					@click="installLauncherUpdate"
				>
					<DownloadIcon />
					Установить сейчас
				</Button>
			</div>
		</div>
		<div class="changes-row">
			<div class="min-w-0 flex-1">
				<h3 id="changes-auto-label" class="m-0 text-base font-semibold text-contrast">
					Ставить обновления сразу
				</h3>
				<p class="m-0 mt-1 text-secondary">
					При запуске лаунчер сам находит новейшую версию — по тегу и по названию релиза — и
					устанавливает её. Во время игры ничего не ставится.
				</p>
			</div>
			<Toggle
				id="changes-auto"
				:model-value="updateSettings.autoInstall"
				aria-labelledby="changes-auto-label"
				@update:model-value="setAutoInstall"
			/>
		</div>
	</section>

	<section class="mt-6">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div class="changes-tabs" role="tablist" aria-label="Список изменений">
				<button
					v-for="item in sources"
					:key="item.id"
					type="button"
					role="tab"
					class="changes-tab"
					:class="{ 'changes-tab--active': source === item.id }"
					:aria-selected="source === item.id"
					@click="source = item.id"
				>
					<span>{{ item.label }}</span>
					<img
						v-if="item.id === 'portalrinth'"
						:src="PortalrinthMark"
						alt=""
						class="changes-tab__icon"
					/>
					<NoctrinthMark v-else-if="item.id === 'noctrinth'" class="changes-tab__icon" />
					<ModrinthMark v-else class="changes-tab__icon" />
				</button>
			</div>
			<div class="flex items-center gap-2">
				<Button :disabled="translating" @click="toggleTranslate">
					<SpinnerIcon v-if="translating" class="animate-spin" />
					<UndoIcon v-else-if="translateOn" />
					<LanguagesIcon v-else />
					{{ translateOn ? 'Оригинал' : 'Перевести' }}
				</Button>
				<Button @click="openUrl(moreUrl)">
					<ExternalIcon />
					Всё на сайте
				</Button>
			</div>
		</div>
		<p v-if="translateOn" class="m-0 mt-2 text-sm text-secondary">
			Переведено встроенным переводчиком (Google). Свои записи Portalrinth уже на русском.
		</p>
		<p v-if="source === 'portalrinth' && releasesError" class="m-0 mt-2 text-sm text-secondary">
			Релизы с GitHub не загрузились ({{ releasesError }}) — показаны только свои записи.
		</p>

		<TransitionGroup tag="div" name="changes-list" class="mt-4 flex flex-col gap-3">
			<article v-for="entry in entries" :key="entry.key" class="changes-entry">
				<header class="flex flex-wrap items-center gap-2">
					<h3 class="m-0 text-lg font-bold text-contrast">
						{{ entry.version || formatDate(entry.date) }}
					</h3>
					<span v-if="isInstalled(entry.version)" class="changes-badge">Установлено</span>
					<span v-if="entry.tag" class="changes-tag">{{ entry.tag }}</span>
					<span class="ml-auto text-sm text-secondary">{{ formatDate(entry.date) }}</span>
					<button
						v-if="entry.url"
						v-tooltip="'Открыть релиз'"
						type="button"
						class="changes-link"
						@click="openUrl(entry.url)"
					>
						<ExternalIcon class="size-4" />
					</button>
				</header>
				<div v-for="(section, index) in entry.sections" :key="index" class="changes-section">
					<!-- eslint-disable-next-line vue/no-v-html -->
					<div
						v-if="sectionHtml(entry, index)"
						class="changes-markdown"
						v-html="sectionHtml(entry, index)"
					/>
					<template v-else>
						<h4 v-if="section.title" class="changes-section__title">{{ section.title }}</h4>
						<!-- eslint-disable-next-line vue/no-v-html -->
						<div class="changes-markdown" v-html="section.html" />
					</template>
				</div>
			</article>
		</TransitionGroup>
	</section>
</template>

<style scoped>
.changes-card {
	display: flex;
	flex-direction: column;
	gap: 1rem;
	padding: 1.1rem 1.25rem;
	border: 1px solid var(--surface-5);
	border-radius: 1.1rem;
	background: color-mix(in srgb, var(--color-raised-bg) 62%, transparent);
	backdrop-filter: blur(18px);
}

.changes-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	padding-top: 1rem;
	border-top: 1px solid var(--surface-5);
}

.changes-status {
	display: flex;
	align-items: center;
	gap: 0.4rem;
	font-weight: 600;
	color: var(--color-secondary);
}

.changes-status--ok {
	color: var(--color-green);
}

.changes-status--new {
	color: var(--color-brand);
}

.changes-status--error {
	color: var(--color-red);
}

.changes-progress {
	height: 6px;
	margin-top: 0.6rem;
	overflow: hidden;
	border-radius: 999px;
	background: var(--surface-5);
}

.changes-progress__bar {
	height: 100%;
	transform-origin: left;
	background: var(--color-brand);
	transition: transform 0.25s ease;
}

.changes-tabs {
	display: inline-flex;
	gap: 0.25rem;
	padding: 0.3rem;
	border: 1px solid var(--surface-5);
	border-radius: 999px;
	background: color-mix(in srgb, var(--color-raised-bg) 60%, transparent);
	backdrop-filter: blur(16px);
}

.changes-tab {
	display: inline-flex;
	align-items: center;
	gap: 0.45rem;
	padding: 0.4rem 0.85rem;
	border: none;
	border-radius: 999px;
	background: transparent;
	color: var(--color-primary);
	font: inherit;
	font-weight: 700;
	cursor: pointer;
	transition:
		background-color 0.2s ease,
		color 0.2s ease;
}

.changes-tab:hover {
	background: var(--surface-4);
}

.changes-tab--active,
.changes-tab--active:hover {
	color: var(--color-brand);
	background: var(--color-brand-highlight);
}

.changes-tab__icon {
	width: 1.1rem;
	height: 1.1rem;
	flex-shrink: 0;
	object-fit: contain;
}

.changes-entry {
	padding: 1rem 1.15rem;
	border: 1px solid var(--surface-5);
	border-radius: 1rem;
	background: color-mix(in srgb, var(--color-raised-bg) 55%, transparent);
	backdrop-filter: blur(14px);
}

.changes-badge,
.changes-tag {
	padding: 0.1rem 0.5rem;
	border-radius: 999px;
	font-size: 0.75rem;
	font-weight: 700;
}

.changes-badge {
	color: var(--color-brand);
	background: var(--color-brand-highlight);
}

.changes-tag {
	color: var(--color-secondary);
	background: var(--surface-4);
}

.changes-link {
	display: inline-grid;
	place-items: center;
	width: 1.9rem;
	height: 1.9rem;
	border: none;
	border-radius: 999px;
	background: transparent;
	color: var(--color-secondary);
	cursor: pointer;
	transition: background-color 0.15s ease;
}

.changes-link:hover {
	background: var(--surface-4);
	color: var(--color-contrast);
}

.changes-section {
	margin-top: 0.6rem;
}

.changes-section__title,
.changes-markdown :deep(h4) {
	margin: 0 0 0.3rem;
	font-size: 0.95rem;
	font-weight: 700;
	color: var(--color-contrast);
}

.changes-markdown :deep(ul) {
	margin: 0;
	padding-left: 1.2rem;
}

.changes-markdown :deep(li) {
	margin: 0.15rem 0;
	color: var(--color-primary);
}

.changes-markdown :deep(p) {
	margin: 0.25rem 0;
}

.changes-markdown :deep(img) {
	max-width: 100%;
	border-radius: 0.6rem;
}

.changes-markdown :deep(a) {
	color: var(--color-brand);
}

.changes-list-enter-active,
.changes-list-leave-active {
	transition:
		opacity 0.2s ease,
		transform 0.2s ease;
}

.changes-list-leave-active {
	position: absolute;
	width: 100%;
}

.changes-list-enter-from,
.changes-list-leave-to {
	opacity: 0;
	transform: translateY(6px);
}
</style>

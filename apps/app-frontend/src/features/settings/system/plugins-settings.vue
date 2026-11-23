<script setup lang="ts">
import {
	DownloadIcon,
	ExternalIcon,
	PaintbrushIcon,
	PlugIcon,
	PlusIcon,
	RefreshCwIcon,
	SearchIcon,
	SettingsIcon,
	ShieldIcon,
	SpinnerIcon,
	TrashIcon,
} from '@modrinth/assets'
import { Button, defineMessages, EmptyState, Input, NewModal, Toggle, useVIntl } from '@modrinth/ui'
import { computed, onMounted, ref } from 'vue'

import {
	type CatalogPluginEntry,
	type InstalledPlugin,
	catalogLoading,
	installCatalogPlugin,
	installPluginFiles,
	loadCatalog,
	plugins,
	pluginSafeMode,
	readPluginSettings,
	removePlugin,
	savePluginSettings,
	setPluginSafeMode,
	setQuickCss,
	togglePlugin,
} from '@/helpers/portalrinth-plugins'

const { formatMessage } = useVIntl()

const messages = defineMessages({
	title: {
		id: 'app.settings.plugins.title',
		defaultMessage: 'Плагины',
	},
	description: {
		id: 'app.settings.plugins.description',
		defaultMessage:
			'Темы и стили поверх интерфейса: плагин — это CSS, который лаунчер применяет поверх текущей темы. Код не исполняется, поэтому сломанная тема может разве что выглядеть странно, но не сломать лаунчер.',
	},
	install: {
		id: 'app.settings.plugins.install',
		defaultMessage: 'Установить',
	},
	installHint: {
		id: 'app.settings.plugins.install-hint',
		defaultMessage:
			'Поддерживается .zip с manifest.json и CSS-файлами, отдельный .css файл или папка с манифестом. Повторная установка плагина с тем же id обновляет его.',
	},
	empty: {
		id: 'app.settings.plugins.empty',
		defaultMessage: 'Пока не установлено ни одного плагина.',
	},
	enabled: {
		id: 'app.settings.plugins.enabled',
		defaultMessage: 'Включён',
	},
	delete: {
		id: 'app.settings.plugins.delete',
		defaultMessage: 'Удалить',
	},
	authorLabel: {
		id: 'app.settings.plugins.author-label',
		defaultMessage: 'Автор',
	},
	catalog: {
		id: 'app.settings.plugins.catalog',
		defaultMessage: 'Каталог',
	},
	catalogTitle: {
		id: 'app.settings.plugins.catalog-title',
		defaultMessage: 'Каталог Noctrinth',
	},
	catalogSubtitle: {
		id: 'app.settings.plugins.catalog-subtitle',
		defaultMessage: 'Плагины сообщества: темы, расширения и источники контента.',
	},
	search: {
		id: 'app.settings.plugins.search',
		defaultMessage: 'Поиск плагинов...',
	},
	catalogInstall: {
		id: 'app.settings.plugins.catalog-install',
		defaultMessage: 'Установить',
	},
	catalogInstalled: {
		id: 'app.settings.plugins.catalog-installed',
		defaultMessage: 'Установлено',
	},
	catalogInstalling: {
		id: 'app.settings.plugins.catalog-installing',
		defaultMessage: 'Установка...',
	},
	refresh: {
		id: 'app.settings.plugins.refresh',
		defaultMessage: 'Обновить',
	},
	catalogFailed: {
		id: 'app.settings.plugins.catalog-failed',
		defaultMessage: 'Каталог недоступен',
	},
	noResults: {
		id: 'app.settings.plugins.no-results',
		defaultMessage: 'Ничего не найдено',
	},
	noResultsDescription: {
		id: 'app.settings.plugins.no-results-description',
		defaultMessage: 'Под этот поиск нет плагина. Попробуйте другое слово.',
	},
	settingsTitle: {
		id: 'app.settings.plugins.settings-title',
		defaultMessage: 'Плагинные настройки',
	},
	apply: {
		id: 'app.settings.plugins.apply',
		defaultMessage: 'Применить',
	},
	close: {
		id: 'app.settings.plugins.close',
		defaultMessage: 'Закрыть',
	},
	unsupported: {
		id: 'app.settings.plugins.unsupported',
		defaultMessage: 'Этот плагин содержит код — он не запускается, применена только его CSS-часть.',
	},
	quickCssTitle: {
		id: 'app.settings.plugins.quick-css.title',
		defaultMessage: 'Быстрый CSS',
	},
	quickCssDescription: {
		id: 'app.settings.plugins.quick-css.description',
		defaultMessage:
			'Свой стиль без упаковки: пишите CSS прямо здесь — он применяется на лету и лежит поверх всех плагинов.',
	},
	quickCssPlaceholder: {
		id: 'app.settings.plugins.quick-css.placeholder',
		// Фигурные скобки экранированы по правилам ICU ('{' и '}'), иначе
		// парсер сообщений считает их аргументами и падает с MALFORMED_ARGUMENT.
		defaultMessage: "Например:\nbody '{'\n\tfilter: hue-rotate(30deg);\n'}'",
	},
	safeModeTitle: {
		id: 'app.settings.plugins.safe-mode.title',
		defaultMessage: 'Безопасный режим',
	},
	safeModeDescription: {
		id: 'app.settings.plugins.safe-mode.description',
		defaultMessage:
			'Полностью отключает все плагины и быстрый CSS до перезапуска лаунчера. Тот же переключатель — по Ctrl+Shift+Alt+P в любой момент.',
	},
	errorPrefix: {
		id: 'app.settings.plugins.error-prefix',
		defaultMessage: 'Не получилось установить:',
	},
	versionLabel: {
		id: 'app.settings.plugins.version-label',
		defaultMessage: 'версия',
	},
	byLabel: {
		id: 'app.settings.plugins.by-label',
		defaultMessage: 'автор',
	},
	sizes: {
		id: 'app.settings.plugins.sizes',
		defaultMessage: '{size} CSS',
	},
})

const installing = ref(false)
const error = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const catalogModal = ref<InstanceType<typeof NewModal> | null>(null)
const settingsModal = ref<InstanceType<typeof NewModal> | null>(null)

const catalog = ref<CatalogPluginEntry[] | null>(null)
const catalogError = ref('')
const catalogSearch = ref('')
const catalogFilter = ref('all')
const installingIds = ref(new Set<string>())

const settingsTarget = ref<InstalledPlugin | null>(null)
const settingsDraft = ref<Record<string, unknown>>({})

const typeOptions = [
	{
		id: 'all',
		label: formatMessage({
			id: 'app.settings.plugins.filter-all',
			defaultMessage: 'Все',
		}),
	},
	{
		id: 'theme',
		label: formatMessage({
			id: 'app.settings.plugins.filter-theme',
			defaultMessage: 'Темы',
		}),
	},
	{
		id: 'extension',
		label: formatMessage({
			id: 'app.settings.plugins.filter-extension',
			defaultMessage: 'Расширения',
		}),
	},
	{
		id: 'content-source',
		label: formatMessage({
			id: 'app.settings.plugins.filter-content-source',
			defaultMessage: 'Источники',
		}),
	},
]
const selectedType = ref(typeOptions[0])

function openPicker() {
	fileInput.value?.click()
}

function sizeOf(plugin: InstalledPlugin): string {
	const bytes = new TextEncoder().encode(plugin.css).length
	return bytes > 1024 * 1024
		? `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
		: `${Math.max(1, Math.round(bytes / 1024))} КБ`
}

async function pickAndInstall(event: Event) {
	const input = event.target as HTMLInputElement
	const files = Array.from(input.files ?? [])
	input.value = ''
	if (files.length === 0) return
	installing.value = true
	error.value = ''
	try {
		await installPluginFiles(files)
	} catch (caught) {
		error.value = caught instanceof Error ? caught.message : String(caught)
	} finally {
		installing.value = false
	}
}

function toggleSafeMode(on: boolean) {
	setPluginSafeMode(on)
}

async function openCatalog() {
	catalogModal.value?.show()
	await loadCatalogEntries(false)
}

async function loadCatalogEntries(force: boolean) {
	catalogError.value = ''
	if (catalog.value && !force) return
	catalogLoading.value = true
	try {
		const result = await loadCatalog()
		catalog.value = result.plugins ?? []
	} catch (caught) {
		catalogError.value = caught instanceof Error ? caught.message : String(caught)
	} finally {
		catalogLoading.value = false
	}
}

const filteredCatalog = computed(() => {
	const query = catalogSearch.value.trim().toLowerCase()
	return (catalog.value ?? []).filter((entry) => {
		if (
			selectedType.value &&
			selectedType.value.id !== 'all' &&
			(entry.type ?? 'theme') !== selectedType.value.id
		) {
			return false
		}
		if (!query) return true
		return [entry.name, entry.author, entry.description, ...(entry.tags ?? [])]
			.filter(Boolean)
			.some((field) => String(field).toLowerCase().includes(query))
	})
})

const installedIds = computed(() => new Set(plugins.map((plugin) => plugin.manifest.id)))

async function installFromCatalog(entry: CatalogPluginEntry) {
	if (installingIds.value.has(entry.id)) return
	installingIds.value = new Set([...installingIds.value, entry.id])
	error.value = ''
	try {
		await installCatalogPlugin(entry)
	} catch (caught) {
		error.value = caught instanceof Error ? caught.message : String(caught)
	} finally {
		const next = new Set(installingIds.value)
		next.delete(entry.id)
		installingIds.value = next
	}
}

const settingsSchema = computed(() => {
	const raw = settingsTarget.value?.manifest.settings
	return Array.isArray(raw) ? raw : []
})

function hasSettings(plugin: InstalledPlugin): boolean {
	return Array.isArray(plugin.manifest.settings) && plugin.manifest.settings.length > 0
}

function openSettings(plugin: InstalledPlugin) {
	settingsTarget.value = plugin
	settingsDraft.value = { ...readPluginSettings(plugin.manifest.id) }
	for (const raw of settingsSchema.value) {
		const setting = raw as { key?: string; default?: unknown }
		if (!setting?.key) continue
		if (settingsDraft.value[setting.key] === undefined && setting.default !== undefined) {
			settingsDraft.value[setting.key] = setting.default
		}
	}
	settingsModal.value?.show()
}

function saveSettings() {
	if (!settingsTarget.value) return
	savePluginSettings(settingsTarget.value.manifest.id, {
		...settingsDraft.value,
	})
	settingsModal.value?.hide()
}

function hostLabel(url: string | undefined): string {
	return url?.replace(/^https?:\/\//, '').replace(/\/$/, '') ?? ''
}

onMounted(() => {
	void loadCatalogEntries(false)
})
</script>

<template>
	<div class="flex flex-col gap-4">
		<section class="flex flex-col gap-2">
			<h2 class="m-0 flex items-center gap-2 text-lg font-bold text-primary">
				<PlugIcon class="text-brand" />
				{{ formatMessage(messages.title) }}
			</h2>
			<p class="m-0 max-w-3xl text-sm text-secondary">
				{{ formatMessage(messages.description) }}
			</p>
			<div class="flex flex-wrap items-center gap-2">
				<Button size="sm" type="colored" color="brand" @click="openCatalog">
					<DownloadIcon class="size-4" />
					{{ formatMessage(messages.catalog) }}
				</Button>
				<Button size="sm" :disabled="installing" @click="openPicker">
					<PlusIcon class="size-4" />
					{{ installing ? '…' : formatMessage(messages.install) }}
				</Button>
				<input
					ref="fileInput"
					class="hidden"
					type="file"
					accept=".zip,.css,application/zip,text/css"
					multiple
					@change="pickAndInstall"
				/>
				<p class="m-0 text-xs text-secondary">
					{{ formatMessage(messages.installHint) }}
				</p>
			</div>
			<p v-if="error" class="m-0 text-sm font-semibold text-red-500" role="alert">
				{{ formatMessage(messages.errorPrefix) }} {{ error }}
			</p>
		</section>

		<EmptyState v-if="plugins.length === 0" type="empty" :heading="formatMessage(messages.empty)">
			<template #actions>
				<Button type="colored" color="brand" size="sm" @click="openCatalog">
					<DownloadIcon class="size-4" />
					{{ formatMessage(messages.catalog) }}
				</Button>
			</template>
		</EmptyState>
		<div v-else class="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
			<div
				v-for="plugin in plugins"
				:key="plugin.manifest.id"
				class="plugin-card group flex flex-col overflow-hidden rounded-2xl border border-solid border-surface-5 bg-surface-2 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg"
			>
				<div
					class="relative aspect-[2/1] w-full overflow-hidden border-0 border-b border-solid border-surface-5 bg-surface-3"
				>
					<img
						v-if="plugin.manifest.banner"
						:src="plugin.manifest.banner"
						alt=""
						class="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
					/>
					<div
						v-else
						class="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-surface-4 to-surface-3"
					>
						<PaintbrushIcon class="size-10 text-secondary" aria-hidden="true" />
					</div>
				</div>
				<div class="flex grow flex-col gap-2 p-4">
					<div class="flex gap-3">
						<img
							v-if="plugin.manifest.icon"
							:src="plugin.manifest.icon"
							alt=""
							class="-mt-9 size-14 shrink-0 rounded-xl border-2 border-solid border-surface-2 bg-surface-3 object-cover shadow-md"
						/>
						<span
							v-else
							class="-mt-9 flex size-14 shrink-0 items-center justify-center rounded-xl border-2 border-solid border-surface-2 bg-surface-4 shadow-md"
						>
							<PlugIcon class="size-6 text-secondary" aria-hidden="true" />
						</span>
						<div class="flex min-w-0 flex-col gap-0.5 pt-1">
							<div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
								<span class="truncate text-lg font-bold text-primary">
									{{ plugin.manifest.name }}
								</span>
								<span
									v-if="plugin.manifest.version"
									class="rounded-full bg-surface-4 px-2 py-0.5 text-xs font-medium text-secondary"
								>
									v{{ plugin.manifest.version }}
								</span>
							</div>
							<span v-if="plugin.manifest.author" class="truncate text-sm text-secondary">
								{{ formatMessage(messages.authorLabel) }}:
								{{ plugin.manifest.author }}
							</span>
						</div>
					</div>
					<p
						v-if="plugin.manifest.description"
						class="m-0 line-clamp-2 text-sm font-normal text-secondary"
					>
						{{ plugin.manifest.description }}
					</p>
					<div v-if="plugin.manifest.tags?.length" class="flex flex-wrap gap-1.5">
						<span
							v-for="tag in plugin.manifest.tags.slice(0, 4)"
							:key="tag"
							class="rounded-full bg-surface-4 px-2.5 py-0.5 text-xs text-secondary"
						>
							{{ tag }}
						</span>
					</div>
					<div class="flex items-center gap-2 text-xs text-secondary">
						{{ formatMessage(messages.sizes, { size: sizeOf(plugin) }) }}
					</div>
					<p
						v-if="plugin.manifest.entry"
						class="m-0 rounded-xl bg-surface-4 px-3 py-2 text-xs text-secondary"
					>
						{{ formatMessage(messages.unsupported) }}
					</p>
					<div class="mt-auto flex items-center justify-between gap-2 pt-1">
						<div class="flex items-center gap-2">
							<Toggle
								:model-value="plugin.enabled"
								:aria-label="plugin.manifest.name"
								@update:model-value="(value: boolean) => togglePlugin(plugin.manifest.id, value)"
							/>
							<span class="text-sm text-secondary">
								{{ formatMessage(messages.enabled) }}
							</span>
						</div>
						<div class="flex gap-1">
							<button
								v-if="hasSettings(plugin)"
								v-tooltip="formatMessage(messages.settingsTitle)"
								type="button"
								class="plugin-icon-btn"
								:aria-label="formatMessage(messages.settingsTitle)"
								@click="openSettings(plugin)"
							>
								<SettingsIcon class="size-4" aria-hidden="true" />
							</button>
							<button
								v-tooltip="formatMessage(messages.delete)"
								type="button"
								class="plugin-icon-btn plugin-icon-btn-danger"
								:aria-label="formatMessage(messages.delete)"
								@click="removePlugin(plugin.manifest.id)"
							>
								<TrashIcon class="size-4" aria-hidden="true" />
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>

		<section class="flex flex-col gap-2">
			<div class="flex items-center justify-between gap-3">
				<div>
					<h3 class="m-0 text-base font-bold text-primary">
						{{ formatMessage(messages.quickCssTitle) }}
					</h3>
					<p class="m-0 max-w-3xl text-sm text-secondary">
						{{ formatMessage(messages.quickCssDescription) }}
					</p>
				</div>
				<Toggle
					:model-value="quickCss.enabled"
					:aria-label="formatMessage(messages.quickCssTitle)"
					@update:model-value="(value: boolean) => (quickCss.enabled = value)"
				/>
			</div>
			<textarea
				class="rounded-xl border border-solid border-surface-5 bg-surface-2 p-3 font-mono text-xs text-primary"
				rows="8"
				spellcheck="false"
				:placeholder="formatMessage(messages.quickCssPlaceholder)"
				:value="quickCss.css"
				@input="setQuickCss(($event.target as HTMLTextAreaElement).value)"
			/>
		</section>

		<section
			class="flex items-center justify-between gap-3 rounded-xl border border-solid border-surface-5 p-3"
		>
			<div>
				<h3 class="m-0 flex items-center gap-2 text-base font-bold text-primary">
					<ShieldIcon class="size-4 text-brand" />
					{{ formatMessage(messages.safeModeTitle) }}
				</h3>
				<p class="m-0 max-w-3xl text-sm text-secondary">
					{{ formatMessage(messages.safeModeDescription) }}
				</p>
			</div>
			<Toggle
				:model-value="pluginSafeMode"
				:aria-label="formatMessage(messages.safeModeTitle)"
				@update:model-value="toggleSafeMode"
			/>
		</section>

		<NewModal
			ref="catalogModal"
			:header="formatMessage(messages.catalogTitle)"
			max-width="56rem"
			scrollable
			max-content-height="70vh"
		>
			<div class="flex flex-col gap-4">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<p class="m-0 text-sm text-secondary">
						{{ formatMessage(messages.catalogSubtitle) }}
					</p>
					<Button
						type="quiet"
						size="sm"
						:disabled="catalogLoading"
						@click="loadCatalogEntries(true)"
					>
						<SpinnerIcon v-if="catalogLoading" class="size-4 animate-spin" />
						<RefreshCwIcon v-else class="size-4" aria-hidden="true" />
						{{ formatMessage(messages.refresh) }}
					</Button>
				</div>
				<Input
					v-model="catalogSearch"
					:icon="SearchIcon"
					:placeholder="formatMessage(messages.search)"
					autocomplete="off"
				/>
				<div class="flex flex-wrap gap-2">
					<button
						v-for="option in typeOptions"
						:key="option.id"
						type="button"
						class="catalog-chip"
						:class="{ selected: selectedType?.id === option.id }"
						@click="selectedType = option"
					>
						{{ option.label }}
					</button>
				</div>

				<p v-if="catalogError" class="m-0 rounded-xl bg-surface-4 px-3 py-2 text-sm text-secondary">
					{{ formatMessage(messages.catalogFailed) }}: {{ catalogError }}
				</p>

				<SpinnerIcon
					v-if="catalogLoading && !catalog"
					class="mx-auto size-8 animate-spin text-contrast"
				/>

				<div v-else-if="filteredCatalog.length" class="grid grid-cols-1 gap-4 lg:grid-cols-2">
					<div
						v-for="entry in filteredCatalog"
						:key="entry.id"
						class="plugin-card group flex flex-col overflow-hidden rounded-2xl border border-solid border-surface-5 bg-surface-2 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg"
					>
						<div
							class="relative aspect-[2/1] w-full overflow-hidden border-0 border-b border-solid border-surface-5 bg-surface-3"
						>
							<img
								v-if="entry.banner_url"
								:src="entry.banner_url"
								alt=""
								loading="lazy"
								class="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
							/>
							<div
								v-else
								class="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-surface-4 to-surface-3"
							>
								<PaintbrushIcon class="size-10 text-secondary" aria-hidden="true" />
							</div>
						</div>
						<div class="flex grow flex-col gap-2 p-4">
							<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
								<span class="text-lg font-bold text-primary">{{ entry.name }}</span>
								<span
									class="rounded-full bg-surface-4 px-2 py-0.5 text-xs font-medium text-secondary"
								>
									v{{ entry.version }}
								</span>
								<span
									v-if="entry.type"
									class="rounded-full bg-surface-4 px-2 py-0.5 text-xs text-secondary"
								>
									{{ entry.type }}
								</span>
							</div>
							<span v-if="entry.author" class="text-sm text-secondary">
								{{ formatMessage(messages.authorLabel) }}: {{ entry.author }}
							</span>
							<p
								v-if="entry.description"
								class="m-0 line-clamp-3 text-sm font-normal text-secondary"
							>
								{{ entry.description }}
							</p>
							<div v-if="entry.tags?.length" class="flex flex-wrap gap-1.5">
								<span
									v-for="tag in entry.tags.slice(0, 5)"
									:key="tag"
									class="rounded-full bg-surface-4 px-2.5 py-0.5 text-xs text-secondary"
								>
									{{ tag }}
								</span>
							</div>
							<div class="mt-auto flex items-center justify-between gap-2 pt-1">
								<Button
									v-if="!installedIds.has(entry.id) && entry.download_url"
									type="colored"
									color="brand"
									size="sm"
									:disabled="installingIds.has(entry.id)"
									@click="installFromCatalog(entry)"
								>
									<SpinnerIcon v-if="installingIds.has(entry.id)" class="size-4 animate-spin" />
									<DownloadIcon v-else class="size-4" aria-hidden="true" />
									{{
										formatMessage(
											installingIds.has(entry.id)
												? messages.catalogInstalling
												: messages.catalogInstall,
										)
									}}
								</Button>
								<Button v-else type="outlined" size="sm" disabled>
									{{ formatMessage(messages.catalogInstalled) }}
								</Button>
								<a
									v-if="entry.homepage"
									:href="entry.homepage"
									target="_blank"
									rel="noopener noreferrer"
									class="flex items-center gap-1 text-sm text-secondary underline hover:text-contrast"
								>
									<ExternalIcon class="size-3.5" aria-hidden="true" />
									{{ hostLabel(entry.homepage) }}
								</a>
							</div>
						</div>
					</div>
				</div>

				<EmptyState
					v-else-if="catalog"
					type="no-search-result"
					:heading="formatMessage(messages.noResults)"
					:description="formatMessage(messages.noResultsDescription)"
				/>
			</div>
		</NewModal>

		<NewModal
			ref="settingsModal"
			:header="
				settingsTarget
					? formatMessage(messages.settingsTitle) + ' — ' + settingsTarget.manifest.name
					: formatMessage(messages.settingsTitle)
			"
			max-width="30rem"
		>
			<div v-if="settingsTarget" class="flex flex-col gap-4">
				<template v-if="settingsSchema.length">
					<div v-for="(raw, index) in settingsSchema" :key="index" class="flex flex-col gap-1.5">
						<div
							v-if="(raw as { type?: string }).type === 'boolean'"
							class="flex items-center justify-between gap-4"
						>
							<span class="text-base text-primary">
								{{
									(raw as { label?: string; key?: string }).label ?? (raw as { key?: string }).key
								}}
							</span>
							<Toggle
								:model-value="(settingsDraft[(raw as { key?: string }).key!] as boolean) || false"
								@update:model-value="
									(value: boolean) => (settingsDraft[(raw as { key?: string }).key!] = value)
								"
							/>
						</div>
						<template v-else>
							<label
								class="text-base text-primary"
								:for="`plugin-setting-${(raw as { key?: string }).key}`"
							>
								{{
									(raw as { label?: string; key?: string }).label ?? (raw as { key?: string }).key
								}}
							</label>
							<select
								v-if="
									(raw as { type?: string }).type === 'select' &&
									Array.isArray((raw as { options?: unknown[] }).options) &&
									((raw as { options?: unknown[] }).options?.length ?? 0) > 0
								"
								:id="`plugin-setting-${(raw as { key?: string }).key}`"
								:value="String(settingsDraft[(raw as { key?: string }).key!] ?? '')"
								class="rounded-xl border border-solid border-surface-5 bg-surface-2 px-3 py-2 text-primary"
								@change="
									(event) =>
										(settingsDraft[(raw as { key?: string }).key!] = (
											$event.target as HTMLSelectElement
										).value)
								"
							>
								<option
									v-for="option in (raw as { options?: unknown[] }).options"
									:key="String(option)"
									:value="String(option)"
								>
									{{ String(option) }}
								</option>
							</select>
							<input
								v-else-if="(raw as { type?: string }).type === 'number'"
								:id="`plugin-setting-${(raw as { key?: string }).key}`"
								:value="String(settingsDraft[(raw as { key?: string }).key!] ?? '')"
								type="number"
								class="rounded-xl border border-solid border-surface-5 bg-surface-2 px-3 py-2 text-primary"
								@input="
									(event) =>
										(settingsDraft[(raw as { key?: string }).key!] = (
											$event.target as HTMLInputElement
										).value)
								"
							/>
							<input
								v-else
								:id="`plugin-setting-${(raw as { key?: string }).key}`"
								:value="String(settingsDraft[(raw as { key?: string }).key!] ?? '')"
								autocomplete="off"
								class="rounded-xl border border-solid border-surface-5 bg-surface-2 px-3 py-2 text-primary"
								@input="
									(event) =>
										(settingsDraft[(raw as { key?: string }).key!] = (
											$event.target as HTMLInputElement
										).value)
								"
							/>
						</template>
					</div>
				</template>
				<p v-else class="m-0 text-sm text-secondary">
					{{ formatMessage(messages.settingsTitle) }}
				</p>
				<div class="flex justify-end gap-2">
					<Button @click="settingsModal?.hide()">
						{{ formatMessage(messages.close) }}
					</Button>
					<Button type="colored" color="brand" @click="saveSettings">
						{{ formatMessage(messages.apply) }}
					</Button>
				</div>
			</div>
		</NewModal>
	</div>
</template>

<style scoped>
.plugin-card {
	container-type: inline-size;
}

.plugin-icon-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 2rem;
	height: 2rem;
	border-radius: 0.75rem;
	color: var(--color-secondary);
	transition:
		background-color 0.15s ease,
		color 0.15s ease,
		transform 0.15s ease;
}

.plugin-icon-btn:hover {
	background: var(--color-surface-4);
	color: var(--color-contrast);
	transform: scale(1.05);
}

.plugin-icon-btn:active {
	transform: scale(0.95);
}

.plugin-icon-btn-danger:hover {
	color: var(--color-red);
}

.catalog-chip {
	border-radius: 9999px;
	padding: 0.25rem 0.75rem;
	font-size: 0.875rem;
	color: var(--color-secondary);
	background: var(--color-surface-3);
	border: 1px solid var(--color-surface-5);
	transition:
		background-color 0.15s ease,
		color 0.15s ease;
}

.catalog-chip:hover {
	color: var(--color-contrast);
}

.catalog-chip.selected {
	background: var(--color-brand);
	color: var(--color-accent-contrast);
	border-color: var(--color-brand);
}
</style>

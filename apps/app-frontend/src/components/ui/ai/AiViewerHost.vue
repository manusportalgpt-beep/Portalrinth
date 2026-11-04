<script setup lang="ts">
import {
	ArrowLeftIcon,
	BookOpenIcon,
	CopyIcon,
	DownloadIcon,
	ExternalIcon,
	ImageIcon,
	LanguagesIcon,
	SpinnerIcon,
	XIcon,
	ZoomInIcon,
	ZoomOutIcon,
} from '@modrinth/assets'
import { Avatar, injectNotificationManager, useVIntl } from '@modrinth/ui'
import { save } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'
import { openUrl } from '@tauri-apps/plugin-opener'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { readSelectedBuild } from '@/helpers/ai-assistant'
import {
	closeImageViewer,
	closeReader,
	imageViewer,
	openImageViewer,
	openReader,
	reader,
	readerBack,
} from '@/helpers/ai-reader'
import { add_screenshot, getInstanceIconUrl, list as listInstances } from '@/helpers/instance'
import { resolveTarget, translateHtml } from '@/helpers/portalrinth-translate'
import { proxiedFetch } from '@/helpers/proxy-fetch'

const { locale } = useVIntl()
const { addNotification } = injectNotificationManager()

// ---- Reader ---------------------------------------------------------------

const translated = ref('')
const translating = ref(false)
const showTranslated = ref(false)

watch(
	() => reader.page,
	() => {
		translated.value = ''
		showTranslated.value = false
	},
)

const articleHtml = computed(() =>
	showTranslated.value && translated.value ? translated.value : (reader.page?.html ?? ''),
)

async function toggleTranslate() {
	if (showTranslated.value) {
		showTranslated.value = false
		return
	}
	if (translated.value) {
		showTranslated.value = true
		return
	}
	if (!reader.page) return
	translating.value = true
	try {
		const result = await translateHtml(reader.page.html, resolveTarget(locale.value))
		translated.value = result?.html ?? reader.page.html
		showTranslated.value = true
	} catch (error) {
		addNotification({ title: 'Перевод не удался', text: String(error), type: 'error' })
	} finally {
		translating.value = false
	}
}

/** Links stay in the reader, pictures open in the viewer. */
function onArticleClick(event: MouseEvent) {
	const target = event.target as HTMLElement
	const image = target.closest('img') as HTMLImageElement | null
	if (image?.src) {
		event.preventDefault()
		openImageViewer(image.src, image.alt)
		return
	}
	const link = target.closest('a') as HTMLAnchorElement | null
	if (link?.href) {
		event.preventDefault()
		if (event.ctrlKey || event.metaKey) void openUrl(link.href)
		else void openReader(link.href)
	}
}

// ---- Image viewer ---------------------------------------------------------

const zoom = ref(1)
watch(
	() => imageViewer.src,
	() => (zoom.value = 1),
)

function fileNameFor(src: string, name: string): string {
	const fromName = name.replace(/[\\/:*?"<>|]+/g, ' ').trim()
	if (fromName && /\.(png|jpe?g|webp|gif)$/i.test(fromName)) return fromName
	const mime = /^data:image\/(\w+)/.exec(src)?.[1]
	if (mime) return `${fromName || 'portalus-image'}.${mime === 'jpeg' ? 'jpg' : mime}`
	try {
		const last = new URL(src).pathname.split('/').filter(Boolean).pop() ?? ''
		if (/\.(png|jpe?g|webp|gif)$/i.test(last)) return decodeURIComponent(last)
	} catch {
		/* not a URL */
	}
	return `${fromName || 'image'}.png`
}

async function imageBytes(src: string): Promise<Uint8Array> {
	if (src.startsWith('data:')) {
		const base64 = src.slice(src.indexOf(',') + 1)
		return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
	}
	const response = await proxiedFetch(src, { signal: AbortSignal.timeout(30000) })
	if (!response.ok) throw new Error(`HTTP ${response.status}`)
	return new Uint8Array(await response.arrayBuffer())
}

const downloading = ref(false)
async function downloadImage() {
	if (!imageViewer.src) return
	downloading.value = true
	try {
		const defaultPath = fileNameFor(imageViewer.src, imageViewer.name)
		const extension = defaultPath.split('.').pop() ?? 'png'
		const path = await save({
			defaultPath,
			filters: [{ name: 'Изображение', extensions: [extension] }],
		})
		if (!path) return
		await writeFile(path, await imageBytes(imageViewer.src))
		addNotification({ title: 'Изображение сохранено', text: path, type: 'success' })
	} catch (error) {
		addNotification({ title: 'Не удалось сохранить', text: String(error), type: 'error' })
	} finally {
		downloading.value = false
	}
}

async function copyImageLink() {
	try {
		await navigator.clipboard.writeText(imageViewer.src)
		addNotification({ title: 'Ссылка скопирована', type: 'success' })
	} catch {
		/* clipboard refused */
	}
}

const isRemoteImage = computed(() => /^https?:\/\//.test(imageViewer.src))

// ---- Saving an image among the screenshots --------------------------------

interface ScreenshotTarget {
	id: string
	name: string
	icon?: string
}

const targets = ref<ScreenshotTarget[]>([])
const chooserOpen = ref(false)
const saving = ref(false)

watch(
	() => imageViewer.open,
	async (open) => {
		chooserOpen.value = false
		if (!open) return
		try {
			const instances = await listInstances()
			targets.value = instances.map((instance) => ({
				id: instance.id,
				name: instance.name,
				icon: getInstanceIconUrl(instance.icon_path) ?? undefined,
			}))
		} catch {
			targets.value = []
		}
	},
)

/** Any picture becomes a PNG here: the screenshots folder indexes PNGs, and
 * a drawing from the assistant may arrive as anything else. */
async function asPngBytes(src: string): Promise<Uint8Array> {
	const bytes = await imageBytes(src)
	try {
		const bitmap = await createImageBitmap(new Blob([bytes.buffer as ArrayBuffer]))
		const canvas = document.createElement('canvas')
		canvas.width = bitmap.width
		canvas.height = bitmap.height
		const context = canvas.getContext('2d')
		if (!context) throw new Error('canvas is unavailable')
		context.drawImage(bitmap, 0, 0)
		bitmap.close()
		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob((result) => resolve(result), 'image/png'),
		)
		if (!blob) throw new Error('PNG encoding failed')
		return new Uint8Array(await blob.arrayBuffer())
	} catch {
		// Already a PNG, most likely - the validator will have the last word.
		return bytes
	}
}

async function saveToScreenshots(target: ScreenshotTarget) {
	if (!imageViewer.src || saving.value) return
	saving.value = true
	try {
		const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
		const saved = await add_screenshot(
			target.id,
			`${imageViewer.name || 'portalus'}-${stamp}.png`.replace(/[\\/:*?"<>|]+/g, ' ').trim(),
			await asPngBytes(imageViewer.src),
		)
		chooserOpen.value = false
		addNotification({
			title: 'Сохранено в скриншоты',
			text: `«${target.name}» · ${saved.file_name}`,
			type: 'success',
		})
	} catch (error) {
		addNotification({ title: 'Не удалось сохранить в скриншоты', text: String(error), type: 'error' })
	} finally {
		saving.value = false
	}
}

async function onSaveToScreenshots() {
	if (saving.value) return
	const selectedId = readSelectedBuild()?.id
	const selected = targets.value.find((target) => target.id === selectedId)
	if (selected && targets.value.length <= 1) {
		await saveToScreenshots(selected)
		return
	}
	if (targets.value.length === 1) {
		await saveToScreenshots(targets.value[0])
		return
	}
	chooserOpen.value = !chooserOpen.value
}

function onKey(event: KeyboardEvent) {
	if (event.key !== 'Escape') return
	if (imageViewer.open) closeImageViewer()
	else if (reader.open) closeReader()
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
	<Teleport to="body">
		<Transition name="ai-viewer">
			<div v-if="reader.open" class="ai-viewer-overlay" @click.self="closeReader">
				<div class="ai-viewer-window ai-reader-window">
					<div class="ai-viewer-bar">
						<button
							v-if="reader.history.length"
							class="ai-viewer-btn"
							aria-label="Назад"
							@click="readerBack"
						>
							<ArrowLeftIcon class="size-4" />
						</button>
						<BookOpenIcon v-else class="size-4 shrink-0 text-secondary" />
						<div class="min-w-0 grow">
							<p class="truncate font-semibold text-contrast">
								{{ reader.page?.title || 'Загрузка…' }}
							</p>
							<p class="truncate text-xs text-secondary">{{ reader.page?.site || reader.url }}</p>
						</div>
						<button
							class="ai-viewer-btn ai-viewer-btn--text"
							:disabled="!reader.page || translating"
							@click="toggleTranslate"
						>
							<SpinnerIcon v-if="translating" class="size-4 animate-spin" />
							<LanguagesIcon v-else class="size-4" />
							{{ showTranslated ? 'Оригинал' : 'Перевести' }}
						</button>
						<button
							class="ai-viewer-btn"
							aria-label="Открыть в браузере"
							title="Открыть в браузере"
							@click="() => openUrl(reader.url)"
						>
							<ExternalIcon class="size-4" />
						</button>
						<button class="ai-viewer-btn" aria-label="Закрыть" @click="closeReader">
							<XIcon class="size-4" />
						</button>
					</div>
					<div class="ai-reader-scroll">
						<Transition name="ai-viewer-fade" mode="out-in">
							<div v-if="reader.loading" key="loading" class="ai-reader-state">
								<SpinnerIcon class="size-6 animate-spin" />
								<span>Открываю страницу…</span>
							</div>
							<div v-else-if="reader.error" key="error" class="ai-reader-state">
								<span>Страница не открылась: {{ reader.error }}</span>
								<button class="ai-viewer-btn ai-viewer-btn--text" @click="() => openUrl(reader.url)">
									<ExternalIcon class="size-4" />
									Открыть в браузере
								</button>
							</div>
							<!-- eslint-disable-next-line vue/no-v-html -- sanitised in ai-reader.ts -->
							<article
								v-else
								:key="reader.url + showTranslated"
								class="ai-reader-article"
								@click="onArticleClick"
								v-html="articleHtml"
							/>
						</Transition>
					</div>
				</div>
			</div>
		</Transition>

		<Transition name="ai-viewer">
			<div v-if="imageViewer.open" class="ai-viewer-overlay ai-image-overlay" @click.self="closeImageViewer">
				<div class="ai-image-stage" @click.self="closeImageViewer">
					<img
						:src="imageViewer.src"
						:alt="imageViewer.name"
						class="ai-image-full"
						:style="{ transform: `scale(${zoom})` }"
						@wheel.prevent="(event) => (zoom = Math.min(4, Math.max(0.5, zoom - event.deltaY / 600)))"
					/>
				</div>
				<div class="ai-image-toolbar">
					<button class="ai-viewer-btn" aria-label="Уменьшить" @click="zoom = Math.max(0.5, zoom - 0.25)">
						<ZoomOutIcon class="size-4" />
					</button>
					<span class="ai-image-zoom">{{ Math.round(zoom * 100) }}%</span>
					<button class="ai-viewer-btn" aria-label="Увеличить" @click="zoom = Math.min(4, zoom + 0.25)">
						<ZoomInIcon class="size-4" />
					</button>
					<span class="ai-image-sep" />
					<div class="relative">
						<button
							class="ai-viewer-btn ai-viewer-btn--text"
							:disabled="saving || !targets.length"
							@click="onSaveToScreenshots"
						>
							<SpinnerIcon v-if="saving" class="size-4 animate-spin" />
							<ImageIcon v-else class="size-4" />
							В скриншоты
						</button>
						<div v-if="chooserOpen" class="ai-screens-chooser">
							<p class="m-0 px-2 pt-1.5 text-xs font-semibold text-secondary">
								В какую сборку?
							</p>
							<button
								v-for="target in targets"
								:key="target.id"
								type="button"
								class="ai-screens-option"
								@click="() => saveToScreenshots(target)"
							>
								<Avatar v-if="target.icon" :src="target.icon" size="22px" no-shadow class="!rounded-md" />
								<span class="truncate">{{ target.name }}</span>
							</button>
						</div>
					</div>
					<button class="ai-viewer-btn ai-viewer-btn--text" :disabled="downloading" @click="downloadImage">
						<SpinnerIcon v-if="downloading" class="size-4 animate-spin" />
						<DownloadIcon v-else class="size-4" />
						Скачать
					</button>
					<button v-if="isRemoteImage" class="ai-viewer-btn" aria-label="Копировать ссылку" @click="copyImageLink">
						<CopyIcon class="size-4" />
					</button>
					<button
						v-if="isRemoteImage"
						class="ai-viewer-btn"
						aria-label="Открыть в браузере"
						@click="() => openUrl(imageViewer.src)"
					>
						<ExternalIcon class="size-4" />
					</button>
					<button class="ai-viewer-btn" aria-label="Закрыть" @click="closeImageViewer">
						<XIcon class="size-4" />
					</button>
				</div>
			</div>
		</Transition>
	</Teleport>
</template>

<style scoped>
.ai-viewer-overlay {
	position: fixed;
	inset: 0;
	z-index: 120;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 2rem;
	background: rgb(0 0 0 / 45%);
	backdrop-filter: blur(10px);
}

.ai-viewer-window {
	display: flex;
	flex-direction: column;
	overflow: hidden;
	border: 1px solid var(--surface-5);
	border-radius: 1.25rem;
	background: color-mix(in srgb, var(--color-raised-bg) 80%, transparent);
	backdrop-filter: blur(22px);
	box-shadow: 0 24px 60px rgb(0 0 0 / 45%);
}

.ai-reader-window {
	width: min(56rem, 100%);
	height: min(48rem, 100%);
}

.ai-viewer-bar {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.6rem 0.8rem;
	border-bottom: 1px solid var(--surface-5);
}

.ai-viewer-btn {
	display: inline-flex;
	flex-shrink: 0;
	align-items: center;
	justify-content: center;
	gap: 0.4rem;
	height: 2rem;
	min-width: 2rem;
	padding: 0 0.5rem;
	border-radius: 0.6rem;
	color: var(--color-secondary);
	background: transparent;
	transition:
		background 0.18s ease,
		color 0.18s ease,
		transform 0.12s ease;
}

.ai-viewer-btn:hover:not(:disabled) {
	color: var(--color-contrast);
	background: color-mix(in srgb, var(--color-contrast) 9%, transparent);
}

.ai-viewer-btn:active:not(:disabled) {
	transform: scale(0.95);
}

.ai-viewer-btn:disabled {
	opacity: 0.5;
	cursor: default;
}

.ai-viewer-btn--text {
	padding: 0 0.7rem;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--surface-5);
}

.ai-reader-scroll {
	flex: 1;
	overflow-y: auto;
	padding: 1.25rem 1.75rem 2rem;
}

.ai-reader-state {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 0.75rem;
	height: 100%;
	min-height: 12rem;
	color: var(--color-secondary);
	text-align: center;
}

.ai-reader-article {
	color: var(--color-base);
	font-size: 0.95rem;
	line-height: 1.65;
	overflow-wrap: anywhere;
}

.ai-reader-article :deep(h1),
.ai-reader-article :deep(h2),
.ai-reader-article :deep(h3),
.ai-reader-article :deep(h4) {
	margin: 1.2em 0 0.5em;
	color: var(--color-contrast);
	font-weight: 700;
	line-height: 1.3;
}

.ai-reader-article :deep(h2) {
	font-size: 1.3rem;
	padding-bottom: 0.3rem;
	border-bottom: 1px solid var(--surface-5);
}

.ai-reader-article :deep(h3) {
	font-size: 1.1rem;
}

.ai-reader-article :deep(p),
.ai-reader-article :deep(ul),
.ai-reader-article :deep(ol),
.ai-reader-article :deep(blockquote),
.ai-reader-article :deep(pre),
.ai-reader-article :deep(table) {
	margin: 0 0 0.85em;
}

.ai-reader-article :deep(ul) {
	padding-left: 1.3rem;
	list-style: disc;
}

.ai-reader-article :deep(ol) {
	padding-left: 1.3rem;
	list-style: decimal;
}

.ai-reader-article :deep(a) {
	color: var(--color-brand);
	text-decoration: underline;
	text-underline-offset: 2px;
	cursor: pointer;
}

.ai-reader-article :deep(img) {
	display: inline-block;
	max-width: min(100%, 32rem);
	height: auto;
	margin: 0.4rem 0.4rem 0.4rem 0;
	border-radius: 0.6rem;
	vertical-align: middle;
	cursor: zoom-in;
	transition: transform 0.18s ease;
}

.ai-reader-article :deep(img:hover) {
	transform: scale(1.02);
}

.ai-reader-article :deep(figure) {
	margin: 0.8rem 0;
}

.ai-reader-article :deep(figcaption) {
	color: var(--color-secondary);
	font-size: 0.85rem;
}

.ai-reader-article :deep(table) {
	display: block;
	max-width: 100%;
	overflow-x: auto;
	border-collapse: collapse;
}

.ai-reader-article :deep(th),
.ai-reader-article :deep(td) {
	padding: 0.35rem 0.6rem;
	border: 1px solid var(--surface-5);
	vertical-align: top;
}

.ai-reader-article :deep(th) {
	background: color-mix(in srgb, var(--color-contrast) 6%, transparent);
	color: var(--color-contrast);
}

.ai-reader-article :deep(pre),
.ai-reader-article :deep(code) {
	font-family: var(--mono-font, monospace);
	font-size: 0.85rem;
}

.ai-reader-article :deep(pre) {
	padding: 0.75rem 1rem;
	overflow-x: auto;
	border-radius: 0.75rem;
	background: color-mix(in srgb, var(--color-bg) 70%, transparent);
	white-space: pre-wrap;
}

.ai-reader-article :deep(blockquote) {
	padding-left: 0.9rem;
	border-left: 3px solid var(--color-brand);
	color: var(--color-secondary);
}

.ai-image-overlay {
	flex-direction: column;
	gap: 1rem;
	background: rgb(0 0 0 / 70%);
}

.ai-image-stage {
	display: flex;
	flex: 1;
	align-items: center;
	justify-content: center;
	width: 100%;
	min-height: 0;
	overflow: auto;
}

.ai-image-full {
	max-width: min(80rem, 92vw);
	max-height: calc(100vh - 9rem);
	border-radius: 0.9rem;
	box-shadow: 0 18px 50px rgb(0 0 0 / 55%);
	transition: transform 0.2s ease;
	image-rendering: auto;
}

.ai-image-toolbar {
	display: flex;
	align-items: center;
	gap: 0.25rem;
	padding: 0.35rem;
	border: 1px solid var(--surface-5);
	border-radius: 0.9rem;
	background: color-mix(in srgb, var(--color-raised-bg) 78%, transparent);
	backdrop-filter: blur(18px);
}

.ai-image-zoom {
	min-width: 3rem;
	color: var(--color-secondary);
	font-size: 0.8rem;
	font-variant-numeric: tabular-nums;
	text-align: center;
}

.ai-image-sep {
	width: 1px;
	height: 1.25rem;
	margin: 0 0.25rem;
	background: var(--surface-5);
}

.ai-screens-chooser {
	position: absolute;
	right: 0;
	bottom: calc(100% + 0.5rem);
	z-index: 5;
	display: flex;
	flex-direction: column;
	gap: 0.15rem;
	max-height: 16rem;
	min-width: 14rem;
	overflow-y: auto;
	padding: 0.35rem 0.25rem 0.4rem;
	border: 1px solid var(--surface-5);
	border-radius: 0.8rem;
	background: color-mix(in srgb, var(--color-raised-bg) 92%, transparent);
	backdrop-filter: blur(18px);
	box-shadow: 0 12px 32px rgb(0 0 0 / 35%);
}

.ai-screens-option {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	border: none;
	border-radius: 0.6rem;
	padding: 0.35rem 0.5rem;
	background: transparent;
	color: var(--color-contrast);
	font-size: 0.85rem;
	cursor: pointer;
	text-align: left;
}

.ai-screens-option:hover {
	background: color-mix(in srgb, var(--color-contrast) 8%, transparent);
}

.ai-viewer-enter-active,
.ai-viewer-leave-active {
	transition: opacity 0.22s ease;
}

.ai-viewer-enter-active .ai-viewer-window,
.ai-viewer-leave-active .ai-viewer-window,
.ai-viewer-enter-active .ai-image-full,
.ai-viewer-leave-active .ai-image-full {
	transition: transform 0.26s cubic-bezier(0.2, 0.9, 0.3, 1.2);
}

.ai-viewer-enter-from,
.ai-viewer-leave-to {
	opacity: 0;
}

.ai-viewer-enter-from .ai-viewer-window,
.ai-viewer-leave-to .ai-viewer-window {
	transform: scale(0.95) translateY(10px);
}

.ai-viewer-enter-from .ai-image-full,
.ai-viewer-leave-to .ai-image-full {
	transform: scale(0.94);
}

.ai-viewer-fade-enter-active,
.ai-viewer-fade-leave-active {
	transition: opacity 0.18s ease;
}

.ai-viewer-fade-enter-from,
.ai-viewer-fade-leave-to {
	opacity: 0;
}
</style>

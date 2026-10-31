<script lang="ts">
/**
 * Проект, названный вслух: иконка слева, название градиентной ссылкой,
 * а при наведении (ничего открывать не надо) - карточка-подсказка с
 * иконкой, автором, описанием и фильтрами (лоадер, версия, загрузки).
 * Данные приходят прямо из токена [[mod|...]] в ответе Порталуса; чего
 * не хватает - добираем из Modrinth API по slug и кэшируем.
 */
import { TextQuoteIcon } from '@modrinth/assets'
import { computed, defineComponent, h, type PropType, ref } from 'vue'

import { addAiPing } from '@/helpers/ai-pings'

export interface AiMentionMeta {
	ptype: string
	id: string
	title: string
	author?: string
	icon?: string
	desc?: string
	loader?: string
	url?: string
}

const META_CACHE_KEY = 'portalrinth-ai-modmeta'
const metaCache = new Map<string, MentionRecord>()
let cacheLoaded = false

interface MentionRecord {
	title?: string
	author?: string
	icon?: string
	desc?: string
	loaders?: string[]
	downloads?: number
	ts: number
}

function loadDiskCache() {
	if (cacheLoaded) return
	cacheLoaded = true
	try {
		const raw = localStorage.getItem(META_CACHE_KEY)
		if (!raw) return
		const parsed = JSON.parse(raw) as Record<string, MentionRecord>
		for (const [slug, record] of Object.entries(parsed)) metaCache.set(slug, record)
	} catch {
		/* an empty cache is perfectly fine */
	}
}

function saveDiskCache() {
	try {
		const out: Record<string, MentionRecord> = {}
		for (const [slug, record] of metaCache) out[slug] = record
		localStorage.setItem(META_CACHE_KEY, JSON.stringify(out))
	} catch {
		/* storage full or unavailable - memory cache still works */
	}
}

/** Fetches whatever the token did not carry: author, description, icon, loaders. */
async function fetchMeta(slug: string): Promise<MentionRecord | undefined> {
	loadDiskCache()
	const cached = metaCache.get(slug)
	if (cached && Date.now() - cached.ts < 7 * 24 * 60 * 60 * 1000) return cached
	try {
		const response = await fetch(`https://api.modrinth.com/v2/project/${encodeURIComponent(slug)}`)
		if (!response.ok) return cached
		const data = (await response.json()) as {
			title?: string
			owner?: string
			author?: string
			description?: string
			icon_url?: string
			loaders?: string[]
			downloads?: number
			slug?: string
		}
		const record: MentionRecord = {
			title: data.title,
			author: data.owner ?? data.author,
			desc: data.description,
			icon: data.icon_url || undefined,
			loaders: Array.isArray(data.loaders) ? data.loaders.slice(0, 4) : undefined,
			downloads: data.downloads,
			ts: Date.now(),
		}
		metaCache.set(slug, record)
		if (metaCache.size > 300) {
			const oldest = [...metaCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0]
			if (oldest) metaCache.delete(oldest[0])
		}
		saveDiskCache()
		return record
	} catch {
		return cached
	}
}

const TYPE_LABELS: Record<string, string> = {
	mod: 'Мод',
	modpack: 'Сборка',
	shader: 'Шейдер',
	resourcepack: 'Ресурс-пак',
	datapack: 'Датапак',
	skin: 'Скин',
	server: 'Сервер',
	plugin: 'Плагин',
}

function compactCount(value?: number): string {
	if (!value && value !== 0) return ''
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
	if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
	return String(value)
}

export default defineComponent({
	name: 'AiModMention',
	props: {
		meta: { type: Object as PropType<AiMentionMeta>, required: true },
	},
	emits: ['open'],
	setup(props, { emit }) {
		const remote = ref<MentionRecord | undefined>(undefined)
		const wantsMeta = !props.meta.author || !props.meta.desc || !props.meta.icon
		const slug =
			props.meta.ptype !== 'skin' && !props.meta.id.startsWith('cf:') ? props.meta.id : ''
		if (wantsMeta && slug) void fetchMeta(slug).then((record) => (remote.value = record))

		const title = computed(() => props.meta.title || remote.value?.title || props.meta.id)
		const author = computed(() => props.meta.author || remote.value?.author || '')
		const desc = computed(() => props.meta.desc || remote.value?.desc || '')
		const icon = computed(() => props.meta.icon || remote.value?.icon || '')
		const loaders = computed(() => {
			if (props.meta.loader) return props.meta.loader.split(',').map((l) => l.trim()).filter(Boolean)
			if (remote.value?.loaders?.length) return remote.value.loaders
			return []
		})
		const downloads = computed(() => remote.value?.downloads ?? 0)
		const typeLabel = computed(() => TYPE_LABELS[props.meta.ptype] ?? 'Проект')

		const path = computed(() => {
			if (props.meta.url) return props.meta.url
			if (props.meta.ptype === 'skin') return '/browse/skin'
			if (props.meta.id.startsWith('cf:')) return `/curseforge/${props.meta.id.slice(3)}`
			return `/project/${props.meta.id}`
		})

		function open(event: MouseEvent) {
			event.preventDefault()
			event.stopPropagation()
			emit('open', path.value)
		}

		/** Пинг: объект прицепится чипом к следующему сообщению игрока. */
		function ping(event: MouseEvent) {
			event.preventDefault()
			event.stopPropagation()
			addAiPing({
				kind: 'project',
				title: title.value,
				subtitle: typeLabel.value,
				meta: { ptype: props.meta.ptype, id: props.meta.id, title: title.value },
			})
		}

		return () =>
			h('span', { class: 'ai-mention' }, [
				h(
					'button',
					{
						type: 'button',
						class: 'ai-mention-link',
						title: `${typeLabel.value}: ${title.value}`,
						onClick: open,
					},
					[
						icon.value
							? h('img', { src: icon.value, class: 'ai-mention-icon', alt: '', loading: 'lazy' })
							: h('span', { class: 'ai-mention-glyph' }, (title.value || '?').slice(0, 1).toUpperCase()),
						h('span', { class: 'ai-mention-name' }, title.value),
					],
				),
				h('span', { class: 'ai-mention-card' }, [
					h('span', { class: 'ai-mention-head' }, [
						icon.value
							? h('img', { src: icon.value, class: 'ai-mention-card-icon', alt: '', loading: 'lazy' })
							: h('span', { class: 'ai-mention-glyph ai-mention-glyph-big' }, (title.value || '?').slice(0, 1).toUpperCase()),
						h('span', { class: 'ai-mention-card-names' }, [
							h('span', { class: 'ai-mention-card-title' }, title.value),
							h(
								'span',
								{ class: 'ai-mention-card-meta' },
								[author.value ? author.value : null, typeLabel.value].filter(Boolean).join(' · '),
							),
						]),
					]),
					desc.value
						? h('span', { class: 'ai-mention-card-desc' }, desc.value)
						: slug
							? h('span', { class: 'ai-mention-card-desc ai-mention-card-desc-dim' }, 'Загрузка описания…')
							: null,
					loaders.value.length || downloads.value
						? h('span', { class: 'ai-mention-card-tags' }, [
								...loaders.value.map((loader) =>
									h('span', { class: 'ai-mention-tag ai-mention-tag-loader', key: `l-${loader}` }, loader),
								),
								h('span', { class: 'ai-mention-tag', key: 'dl' }, `${compactCount(downloads.value)} ↓`),
							])
						: null,
						h('span', { class: 'ai-mention-card-foot' }, [
							h(
								'button',
								{
									type: 'button',
									class: 'ai-mention-ping',
									title: 'Прицепить к следующему сообщению',
									onClick: ping,
								},
								[h(TextQuoteIcon, { class: 'size-3' }), 'Пингануть'],
							),
						]),
				]),
			])
	},
})
</script>

<style>
.ai-mention {
	position: relative;
	display: inline;
}

.ai-mention-link {
	display: inline-flex;
	align-items: center;
	gap: 0.3rem;
	padding: 0 0.15rem;
	margin: 0;
	border: none;
	background: transparent;
	font: inherit;
	line-height: inherit;
	cursor: pointer;
	vertical-align: baseline;
}

.ai-mention-icon {
	width: 1.15rem;
	height: 1.15rem;
	border-radius: 0.3rem;
	object-fit: cover;
	border: 1px solid var(--surface-5);
	vertical-align: -0.2rem;
}

.ai-mention-glyph {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 1.15rem;
	height: 1.15rem;
	border-radius: 0.3rem;
	background: color-mix(in srgb, var(--color-brand) 18%, transparent);
	color: var(--color-brand);
	font-size: 0.625rem;
	font-weight: 800;
	vertical-align: -0.2rem;
}

.ai-mention-glyph-big {
	width: 2.5rem;
	height: 2.5rem;
	border-radius: 0.55rem;
	font-size: 1rem;
	vertical-align: middle;
}

.ai-mention-name {
	background: linear-gradient(92deg, var(--color-brand), color-mix(in srgb, var(--color-brand) 55%, #7c8cff));
	-webkit-background-clip: text;
	background-clip: text;
	-webkit-text-fill-color: transparent;
	color: transparent;
	font-weight: 700;
	text-decoration: underline;
	text-decoration-style: dotted;
	text-decoration-color: color-mix(in srgb, var(--color-brand) 45%, transparent);
	text-underline-offset: 3px;
	transition: text-decoration-color 0.18s ease;
}

.ai-mention-link:hover .ai-mention-name {
	text-decoration-style: solid;
	text-decoration-color: var(--color-brand);
}

/* The hover card: opens right above the mention, no click needed. */
.ai-mention-card {
	position: absolute;
	bottom: calc(100% + 0.5rem);
	left: 50%;
	transform: translate(-50%, 0.35rem);
	z-index: 60;
	display: flex;
	flex-direction: column;
	gap: 0.35rem;
	width: min(21rem, 78vw);
	padding: 0.6rem 0.7rem;
	border: 1px solid color-mix(in srgb, var(--color-brand) 28%, var(--surface-5));
	border-radius: 0.75rem;
	background: color-mix(in srgb, var(--color-raised-bg) 92%, transparent);
	backdrop-filter: blur(14px);
	-webkit-backdrop-filter: blur(14px);
	box-shadow: 0 0.6rem 1.6rem rgb(0 0 0 / 0.28);
	opacity: 0;
	visibility: hidden;
	pointer-events: none;
	transition:
		opacity 0.16s ease,
		transform 0.16s ease,
		visibility 0.16s;
}

.ai-mention:hover .ai-mention-card,
.ai-mention-link:focus-visible ~ .ai-mention-card {
	opacity: 1;
	visibility: visible;
	transform: translate(-50%, 0);
	pointer-events: auto;
}

.ai-mention-card-foot {
	display: flex;
	justify-content: flex-end;
}

.ai-mention-ping {
	display: inline-flex;
	align-items: center;
	gap: 0.3rem;
	padding: 0.2rem 0.6rem;
	border: 1px solid color-mix(in srgb, var(--color-brand) 35%, transparent);
	border-radius: 999px;
	background: color-mix(in srgb, var(--color-brand) 12%, transparent);
	color: var(--color-brand);
	font: inherit;
	font-size: 0.6875rem;
	font-weight: 700;
	cursor: pointer;
	transition:
		background 0.16s ease,
		border-color 0.16s ease,
		transform 0.16s ease;
}

.ai-mention-ping:hover {
	background: color-mix(in srgb, var(--color-brand) 22%, transparent);
	border-color: var(--color-brand);
	transform: translateY(-1px);
}

.ai-mention-head {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	min-width: 0;
}

.ai-mention-card-icon {
	width: 2.5rem;
	height: 2.5rem;
	flex-shrink: 0;
	border-radius: 0.55rem;
	border: 1px solid var(--surface-5);
	object-fit: cover;
}

.ai-mention-card-names {
	display: flex;
	flex-direction: column;
	min-width: 0;
}

.ai-mention-card-title {
	font-weight: 700;
	font-size: 0.875rem;
	color: var(--color-contrast);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.ai-mention-card-meta {
	font-size: 0.6875rem;
	color: var(--color-secondary);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.ai-mention-card-desc {
	font-size: 0.75rem;
	line-height: 1.45;
	color: var(--color-secondary);
	display: -webkit-box;
	-webkit-line-clamp: 3;
	line-clamp: 3;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.ai-mention-card-desc-dim {
	opacity: 0.6;
	font-style: italic;
}

.ai-mention-card-tags {
	display: flex;
	flex-wrap: wrap;
	gap: 0.25rem;
}

.ai-mention-tag {
	display: inline-flex;
	align-items: center;
	padding: 0.05rem 0.45rem;
	border-radius: 999px;
	font-size: 0.625rem;
	font-weight: 700;
	text-transform: capitalize;
	background: color-mix(in srgb, var(--color-contrast) 8%, transparent);
	color: var(--color-secondary);
}

.ai-mention-tag-loader {
	background: color-mix(in srgb, var(--color-brand) 16%, transparent);
	color: var(--color-brand);
}
</style>

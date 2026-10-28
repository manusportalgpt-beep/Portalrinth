/**
 * Portalus's reader: web pages and wiki articles shown inside the launcher.
 *
 * Fandom and other MediaWiki sites are read through their own API (clean
 * article HTML without the site's chrome); any other page has its main
 * content cut out and cleaned. The same text feeds the agent's web_fetch, so
 * the player reads exactly what Portalus read.
 */
import { reactive } from 'vue'

import { proxiedFetch } from './proxy-fetch'

const READER_UA =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

export interface ReaderPage {
	url: string
	title: string
	/** Sanitised article HTML, safe for v-html. */
	html: string
	/** Plain text of the same article, for the model. */
	text: string
	images: string[]
	site: string
}

const DROP_SELECTORS = [
	'script',
	'style',
	'noscript',
	'iframe',
	'object',
	'embed',
	'form',
	'input',
	'button',
	'select',
	'textarea',
	'nav',
	'header',
	'footer',
	'aside',
	'svg',
	'link',
	'meta',
	'.navbox',
	'.mw-editsection',
	'.toc',
	'#toc',
	'.reference',
	'.mw-references-wrap',
	'.noprint',
	'.global-navigation',
	'.page-footer',
	'.fandom-community-header',
	'.wds-global-footer',
	'.ad-slot',
	'[class*="advert"]',
	'[id*="cookie"]',
	'[class*="cookie"]',
	'[aria-hidden="true"]',
].join(',')

const ALLOWED_TAGS = new Set([
	'p',
	'br',
	'hr',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'ul',
	'ol',
	'li',
	'dl',
	'dt',
	'dd',
	'a',
	'b',
	'strong',
	'i',
	'em',
	'u',
	's',
	'code',
	'pre',
	'blockquote',
	'table',
	'thead',
	'tbody',
	'tr',
	'th',
	'td',
	'caption',
	'img',
	'figure',
	'figcaption',
	'span',
	'div',
	'section',
	'article',
	'sup',
	'sub',
	'small',
	'mark',
	'kbd',
])

function absolute(value: string, base: string): string {
	try {
		return new URL(value, base).toString()
	} catch {
		return ''
	}
}

/** Walks the tree once: unknown tags are unwrapped, attributes cut to a safe few. */
function sanitize(root: Element, base: string, images: string[]): void {
	root.querySelectorAll(DROP_SELECTORS).forEach((node) => node.remove())
	const walk = (element: Element) => {
		for (const child of [...element.children]) {
			const tag = child.tagName.toLowerCase()
			if (!ALLOWED_TAGS.has(tag)) {
				// Unwrap, keep the text inside.
				walk(child)
				child.replaceWith(...child.childNodes)
				continue
			}
			const keep: Record<string, string> = {}
			if (tag === 'a') {
				const href = child.getAttribute('href') ?? ''
				const link = href.startsWith('#') ? '' : absolute(href, base)
				if (/^https?:/.test(link)) keep.href = link
			}
			if (tag === 'img') {
				// Lazy-loading sites keep the real picture in data-src.
				const raw =
					child.getAttribute('data-src') ||
					child.getAttribute('data-original') ||
					child.getAttribute('src') ||
					''
				const src = absolute(raw, base)
				if (!/^https?:/.test(src) || /^data:image\/gif/.test(raw)) {
					child.remove()
					continue
				}
				// Fandom thumbnails: ask for a sharper copy.
				keep.src = src.replace(/\/scale-to-width-down\/\d+/, '/scale-to-width-down/800')
				keep.alt = child.getAttribute('alt') ?? ''
				keep.loading = 'lazy'
				if (!images.includes(keep.src)) images.push(keep.src)
			}
			if (tag === 'td' || tag === 'th') {
				for (const name of ['colspan', 'rowspan']) {
					const value = child.getAttribute(name)
					if (value && /^\d+$/.test(value)) keep[name] = value
				}
			}
			for (const attribute of [...child.attributes]) child.removeAttribute(attribute.name)
			for (const [name, value] of Object.entries(keep)) child.setAttribute(name, value)
			walk(child)
		}
	}
	walk(root)
	// Empty wrappers left behind by removed widgets.
	root.querySelectorAll('div, span, section, p').forEach((node) => {
		if (!node.textContent?.trim() && !node.querySelector('img')) node.remove()
	})
}

function textOf(root: Element): string {
	const blocks: string[] = []
	root.querySelectorAll('h1,h2,h3,h4,p,li,td,th,pre,blockquote,figcaption,dt,dd').forEach((node) => {
		const line = node.textContent?.replace(/\s+/g, ' ').trim()
		if (!line) return
		const tag = node.tagName.toLowerCase()
		blocks.push(/^h\d$/.test(tag) ? `\n## ${line}` : tag === 'li' ? `- ${line}` : line)
	})
	const text = blocks.join('\n').replace(/\n{3,}/g, '\n\n').trim()
	return text || (root.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** Fandom, Minecraft Wiki and other MediaWiki sites: the article itself. */
async function readMediaWiki(url: URL): Promise<ReaderPage | null> {
	const match = /^\/(?:([a-z-]{2,10})\/)?(?:wiki|w)\/(.+)$/.exec(url.pathname)
	if (!match) return null
	const lang = match[1] && url.hostname.endsWith('fandom.com') ? `/${match[1]}` : ''
	const page = decodeURIComponent(match[2])
	const api = `${url.origin}${lang}/api.php?action=parse&format=json&redirects=1&disableeditsection=1&prop=text|displaytitle&page=${encodeURIComponent(page)}`
	const response = await proxiedFetch(api, {
		headers: { 'User-Agent': READER_UA, Accept: 'application/json' },
		signal: AbortSignal.timeout(20000),
	})
	if (!response.ok) return null
	const data = (await response.json()) as {
		parse?: { title?: string; displaytitle?: string; text?: { '*'?: string } }
	}
	const raw = data.parse?.text?.['*']
	if (!raw) return null
	const doc = new DOMParser().parseFromString(`<div id="reader-root">${raw}</div>`, 'text/html')
	const root = doc.getElementById('reader-root')!
	// The Fandom infobox lives in an <aside>: keep it, it holds the main picture.
	root.querySelectorAll('aside.portable-infobox').forEach((aside) => {
		const box = doc.createElement('div')
		box.append(...aside.childNodes)
		aside.replaceWith(box)
	})
	const images: string[] = []
	sanitize(root, url.toString(), images)
	return {
		url: url.toString(),
		title: (data.parse?.title ?? page).replace(/_/g, ' '),
		html: root.innerHTML,
		text: textOf(root),
		images,
		site: url.hostname,
	}
}

/** Picks the block holding the most paragraph text - the article, not the menu. */
function mainBlock(doc: Document): Element {
	const preferred = doc.querySelector(
		'article, main, [role="main"], #content, .post-content, .entry-content, .article-body, .markdown-body, #mw-content-text',
	)
	if (preferred && (preferred.textContent?.length ?? 0) > 400) return preferred
	let best: Element = doc.body
	let bestScore = 0
	doc.body.querySelectorAll('div, section').forEach((node) => {
		const paragraphs = node.querySelectorAll(':scope > p, :scope > div > p')
		let score = 0
		paragraphs.forEach((paragraph) => (score += paragraph.textContent?.length ?? 0))
		if (score > bestScore) {
			bestScore = score
			best = node
		}
	})
	return bestScore > 300 ? best : doc.body
}

/** Last resort for script-built pages: a public reader that renders them. */
async function readThroughJina(url: string): Promise<ReaderPage | null> {
	const response = await proxiedFetch(`https://r.jina.ai/${url}`, {
		headers: { Accept: 'text/plain', 'X-Return-Format': 'markdown' },
		signal: AbortSignal.timeout(30000),
	})
	if (!response.ok) return null
	const markdown = await response.text()
	const body = markdown.replace(/^[\s\S]*?Markdown Content:\s*/i, '').trim()
	if (body.length < 80) return null
	const title = /^Title:\s*(.+)$/m.exec(markdown)?.[1]?.trim() ?? url
	const images: string[] = []
	const escape = (value: string) =>
		value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
	const html = body
		.split(/\n{2,}/)
		.map((block) => {
			const image = /^!\[([^\]]*)\]\((https?:[^)\s]+)\)$/.exec(block.trim())
			if (image) {
				images.push(image[2])
				return `<img src="${escape(image[2])}" alt="${escape(image[1])}" loading="lazy">`
			}
			const heading = /^(#{1,4})\s+(.+)$/.exec(block.trim())
			if (heading) return `<h${heading[1].length + 1}>${escape(heading[2])}</h${heading[1].length + 1}>`
			const linked = escape(block).replace(
				/\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
				(_m, text: string, href: string) => `<a href="${href}">${text}</a>`,
			)
			return `<p>${linked.replace(/\n/g, '<br>')}</p>`
		})
		.join('')
	return { url, title, html, text: body.slice(0, 20000), images, site: new URL(url).hostname }
}

const cache = new Map<string, ReaderPage>()

/** Reads any page: MediaWiki API first, then the page itself, then the reader. */
export async function readPage(rawUrl: string): Promise<ReaderPage> {
	const url = new URL(rawUrl.trim())
	const cached = cache.get(url.toString())
	if (cached) return cached
	let page: ReaderPage | null = null
	if (/fandom\.com$|minecraft\.wiki$|wikipedia\.org$|\.wiki$/.test(url.hostname)) {
		page = await readMediaWiki(url).catch(() => null)
	}
	if (!page) {
		const response = await proxiedFetch(url.toString(), {
			headers: {
				Accept: 'text/html,application/xhtml+xml',
				'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
				'User-Agent': READER_UA,
			},
			signal: AbortSignal.timeout(20000),
		}).catch(() => null)
		if (response?.ok) {
			const type = response.headers.get('content-type') ?? ''
			const source = await response.text()
			if (/json|text\/plain/.test(type)) {
				const escaped = source.slice(0, 20000).replace(/&/g, '&amp;').replace(/</g, '&lt;')
				page = {
					url: url.toString(),
					title: url.pathname.split('/').pop() || url.hostname,
					html: `<pre>${escaped}</pre>`,
					text: source.slice(0, 20000),
					images: [],
					site: url.hostname,
				}
			} else {
				const doc = new DOMParser().parseFromString(source, 'text/html')
				const title =
					doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
					doc.title ||
					url.hostname
				const block = mainBlock(doc)
				const images: string[] = []
				const hero = doc.querySelector('meta[property="og:image"]')?.getAttribute('content')
				sanitize(block, url.toString(), images)
				const text = textOf(block)
				if (text.length > 200) {
					const heroHtml =
						hero && !images.includes(absolute(hero, url.toString()))
							? `<img src="${absolute(hero, url.toString())}" alt="" loading="lazy">`
							: ''
					page = {
						url: url.toString(),
						title: title.trim(),
						html: heroHtml + block.innerHTML,
						text,
						images: hero ? [absolute(hero, url.toString()), ...images] : images,
						site: url.hostname,
					}
				}
			}
		}
	}
	if (!page) page = await readThroughJina(url.toString()).catch(() => null)
	if (!page) throw new Error('страница не открылась')
	cache.set(url.toString(), page)
	if (cache.size > 30) cache.delete(cache.keys().next().value as string)
	return page
}

// ---- Shared viewer state: the reader window and the image viewer --------

export const reader = reactive({
	open: false,
	loading: false,
	error: '',
	url: '',
	page: null as ReaderPage | null,
	history: [] as string[],
})

export async function openReader(url: string): Promise<void> {
	if (!/^https?:\/\//.test(url)) return
	if (reader.open && reader.url && reader.url !== url) reader.history.push(reader.url)
	reader.open = true
	reader.loading = true
	reader.error = ''
	reader.url = url
	reader.page = null
	try {
		const page = await readPage(url)
		if (reader.url === url) reader.page = page
	} catch (error) {
		if (reader.url === url) reader.error = String(error).replace(/^Error:\s*/, '')
	} finally {
		if (reader.url === url) reader.loading = false
	}
}

export function readerBack(): void {
	const previous = reader.history.pop()
	if (previous) {
		reader.url = ''
		void openReader(previous)
	}
}

export function closeReader(): void {
	reader.open = false
	reader.history = []
}

export const imageViewer = reactive({
	open: false,
	src: '',
	name: '',
})

export function openImageViewer(src: string, name = ''): void {
	if (!src) return
	imageViewer.src = src
	imageViewer.name = name
	imageViewer.open = true
}

export function closeImageViewer(): void {
	imageViewer.open = false
}

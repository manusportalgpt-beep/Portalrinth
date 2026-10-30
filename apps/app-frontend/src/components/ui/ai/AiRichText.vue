<script lang="ts">
/**
 * Portalus's prose, drawn the way it was written: **bold**, *italic*,
 * ~~strike~~, `code`, headings, lists, quotes, rules and tables. Built from
 * nodes, never from raw HTML, so nothing a model writes can inject markup.
 *
 * Links open through the chat's own handler (launcher pages, the reader,
 * the browser) and carry a copy button that shows on hover; inline code
 * copies itself on click - handy for a LAN address or a command.
 */
import { CheckIcon, CopyIcon, ExternalIcon } from '@modrinth/assets'
import { defineComponent, h, ref, type VNode } from 'vue'

import AiModMention, { type AiMentionMeta } from './AiModMention.vue'

type Inline =
	| { kind: 'text'; text: string }
	| { kind: 'code'; text: string }
	| { kind: 'link'; url: string; children: Inline[] }
	| { kind: 'strong' | 'em' | 'del'; children: Inline[] }
	| { kind: 'mod'; mention: AiMentionMeta }

type Align = 'left' | 'center' | 'right' | ''

type Block =
	| { kind: 'p'; lines: string[] }
	| { kind: 'h'; level: number; text: string }
	| { kind: 'hr' }
	| { kind: 'quote'; lines: string[] }
	| { kind: 'list'; ordered: boolean; items: { depth: number; marker: string; text: string }[] }
	| { kind: 'table'; head: string[]; align: Align[]; rows: string[][] }

const INLINE_RE =
	/(`+)([^`][\s\S]*?)\1(?!`)|\[([^\]\n]+)\]\(((?:https?:\/\/|\/)[^\s)]+)\)|(https?:\/\/[^\s<>"'`)\]]+[^\s<>"'`)\].,;:!?])|\*\*(?!\s)([\s\S]+?)\*\*|__(?!\s)([^_\n]+?)__|~~(?!\s)([\s\S]+?)~~|\*(?![\s*])([^*\n]+?)\*|(?<![\p{L}\p{N}_])_(?![\s_])([^_\n]+?)_(?![\p{L}\p{N}_])/gu

/** A project named in passing: [[mod|тип::id::Название::автор::иконка::описание::лоадер::url]]
 * - the launcher draws it as a live chip with a hover card. Parts after the
 * title are optional; an unfinished token (still streaming) stays raw text. */
const MENTION_RE = /\[\[mod\|([\s\S]*?)\]\]/g

function parseMentionArgs(raw: string): AiMentionMeta | undefined {
	const parts = raw.split('::').map((part) => part.trim())
	const ptype = (parts[0] ?? '').toLowerCase()
	const id = parts[1] ?? ''
	if (!/^[a-z]+$/.test(ptype) || !id || id.length > 200) return undefined
	const meta: AiMentionMeta = { ptype, id, title: parts[2] || id }
	if (parts[3]) meta.author = parts[3].slice(0, 80)
	if (parts[4]) meta.icon = parts[4]
	if (parts[5]) meta.desc = parts[5].slice(0, 300)
	if (parts[6]) meta.loader = parts[6].slice(0, 60)
	if (parts[7] && /^https?:\/\/|^\//.test(parts[7])) meta.url = parts[7]
	return meta
}

export function parseInline(text: string, depth = 0): Inline[] {
	if (depth > 6) return [{ kind: 'text', text }]
	const out: Inline[] = []
	let cursor = 0
	for (const match of text.matchAll(MENTION_RE)) {
		const start = match.index ?? 0
		if (start > cursor) out.push(...parsePlainInline(text.slice(cursor, start), depth))
		const mention = parseMentionArgs(match[1] ?? '')
		if (mention) out.push({ kind: 'mod', mention })
		else out.push({ kind: 'text', text: match[0] })
		cursor = start + match[0].length
	}
	if (cursor < text.length) out.push(...parsePlainInline(text.slice(cursor), depth))
	return out
}

function parsePlainInline(text: string, depth: number): Inline[] {
	const out: Inline[] = []
	const re = new RegExp(INLINE_RE.source, INLINE_RE.flags)
	let cursor = 0
	let match = re.exec(text)
	while (match) {
		if (match.index > cursor) out.push({ kind: 'text', text: text.slice(cursor, match.index) })
		if (match[2] !== undefined) out.push({ kind: 'code', text: match[2].trim() })
		else if (match[3] !== undefined)
			out.push({ kind: 'link', url: match[4], children: parseInline(match[3], depth + 1) })
		else if (match[5] !== undefined) out.push({ kind: 'link', url: match[5], children: [{ kind: 'text', text: match[5] }] })
		else if (match[6] !== undefined || match[7] !== undefined)
			out.push({ kind: 'strong', children: parseInline(match[6] ?? match[7], depth + 1) })
		else if (match[8] !== undefined) out.push({ kind: 'del', children: parseInline(match[8], depth + 1) })
		else out.push({ kind: 'em', children: parseInline(match[9] ?? match[10], depth + 1) })
		cursor = match.index + match[0].length
		match = re.exec(text)
	}
	if (cursor < text.length) out.push({ kind: 'text', text: text.slice(cursor) })
	return out
}

const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/
const LIST_ITEM = /^(\s*)([-*•+]|\d{1,3}[.)])\s+(.*)$/

function splitRow(line: string): string[] {
	let row = line.trim()
	if (row.startsWith('|')) row = row.slice(1)
	if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1)
	// Pipes inside `code` stay put: cells split only outside backticks.
	const cells: string[] = []
	let cell = ''
	let inCode = false
	for (let i = 0; i < row.length; i++) {
		const char = row[i]
		if (char === '\\' && row[i + 1] === '|') {
			cell += '|'
			i++
		} else if (char === '`') {
			inCode = !inCode
			cell += char
		} else if (char === '|' && !inCode) {
			cells.push(cell.trim())
			cell = ''
		} else cell += char
	}
	cells.push(cell.trim())
	return cells
}

export function parseBlocks(text: string): Block[] {
	const lines = text.replace(/\r\n?/g, '\n').split('\n')
	const blocks: Block[] = []
	let i = 0
	const isBlank = (line: string | undefined) => line === undefined || !line.trim()
	const startsBlock = (index: number) => {
		const line = lines[index] ?? ''
		return (
			/^\s{0,3}#{1,6}\s+/.test(line) ||
			/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line) ||
			/^\s*>/.test(line) ||
			LIST_ITEM.test(line) ||
			(line.includes('|') && TABLE_SEPARATOR.test(lines[index + 1] ?? ''))
		)
	}
	while (i < lines.length) {
		const line = lines[i]
		if (isBlank(line)) {
			i++
			continue
		}
		const heading = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
		if (heading) {
			blocks.push({ kind: 'h', level: Math.min(heading[1].length, 4), text: heading[2] })
			i++
			continue
		}
		if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
			blocks.push({ kind: 'hr' })
			i++
			continue
		}
		if (line.includes('|') && TABLE_SEPARATOR.test(lines[i + 1] ?? '')) {
			const head = splitRow(line)
			const align = splitRow(lines[i + 1]).map((cell): Align => {
				const left = cell.startsWith(':')
				const right = cell.endsWith(':')
				return left && right ? 'center' : right ? 'right' : left ? 'left' : ''
			})
			i += 2
			const rows: string[][] = []
			while (i < lines.length && !isBlank(lines[i]) && lines[i].includes('|')) {
				rows.push(splitRow(lines[i]))
				i++
			}
			blocks.push({ kind: 'table', head, align, rows })
			continue
		}
		if (/^\s*>/.test(line)) {
			const quote: string[] = []
			while (i < lines.length && /^\s*>/.test(lines[i])) {
				quote.push(lines[i].replace(/^\s*>\s?/, ''))
				i++
			}
			blocks.push({ kind: 'quote', lines: quote })
			continue
		}
		const item = LIST_ITEM.exec(line)
		if (item) {
			const ordered = /\d/.test(item[2])
			const items: { depth: number; marker: string; text: string }[] = []
			while (i < lines.length) {
				const current = LIST_ITEM.exec(lines[i])
				if (current) {
					items.push({
						depth: Math.min(Math.floor(current[1].replace(/\t/g, '  ').length / 2), 4),
						marker: /\d/.test(current[2]) ? current[2].replace(')', '.') : '',
						text: current[3],
					})
					i++
					continue
				}
				// A wrapped line belongs to the item above; a blank line followed
				// by another item keeps the list going.
				if (!isBlank(lines[i]) && !startsBlock(i) && items.length) {
					items[items.length - 1].text += `\n${lines[i].trim()}`
					i++
					continue
				}
				if (isBlank(lines[i]) && LIST_ITEM.test(lines[i + 1] ?? '')) {
					i++
					continue
				}
				break
			}
			blocks.push({ kind: 'list', ordered, items })
			continue
		}
		const paragraph: string[] = []
		while (i < lines.length && !isBlank(lines[i]) && (paragraph.length === 0 || !startsBlock(i))) {
			paragraph.push(lines[i])
			i++
		}
		blocks.push({ kind: 'p', lines: paragraph })
	}
	return blocks
}

const MODRINTH_PATH = /^\/(project|mod|modpack|resourcepack|shader|datapack|plugin|user)\//

/** What the copy button puts on the clipboard: a link anyone can open. */
function shareableUrl(url: string): string {
	if (MODRINTH_PATH.test(url)) return `https://modrinth.com${url}`
	if (/^\/curseforge\/\d+/.test(url)) return `https://www.curseforge.com/projects/${url.split('/')[2]}`
	return url
}

export default defineComponent({
	name: 'AiRichText',
	props: {
		text: { type: String, required: true },
	},
	emits: ['open'],
	setup(props, { emit }) {
		const copied = ref('')
		let copiedTimer: ReturnType<typeof setTimeout> | undefined

		async function copy(value: string) {
			try {
				await navigator.clipboard.writeText(value)
				copied.value = value
				clearTimeout(copiedTimer)
				copiedTimer = setTimeout(() => (copied.value = ''), 1400)
			} catch {
				/* the clipboard said no */
			}
		}

		function inline(nodes: Inline[]): (VNode | string)[] {
			return nodes.map((node) => {
				switch (node.kind) {
					case 'text':
						return node.text
					case 'strong':
						return h('strong', { class: 'ai-md-strong' }, inline(node.children))
					case 'em':
						return h('em', { class: 'ai-md-em' }, inline(node.children))
					case 'del':
						return h('del', { class: 'ai-md-del' }, inline(node.children))
					case 'code':
						return h(
							'code',
							{
								class: ['ai-md-code', { 'ai-md-code--copied': copied.value === node.text }],
								title: 'Нажмите, чтобы скопировать',
								onClick: () => copy(node.text),
							},
							node.text,
						)
					case 'link': {
						const share = shareableUrl(node.url)
						return h('span', { class: 'ai-md-linkwrap' }, [
							h(
								'a',
								{
									class: 'ai-link',
									href: share,
									title: share,
									onClick: (event: MouseEvent) => {
										event.preventDefault()
										emit('open', node.url)
									},
								},
								[...inline(node.children), h(ExternalIcon, { class: 'ai-link-icon' })],
							),
							h(
								'button',
								{
									type: 'button',
									class: ['ai-md-copy', { 'ai-md-copy--done': copied.value === share }],
									title: 'Скопировать ссылку',
									'aria-label': 'Скопировать ссылку',
									onClick: (event: MouseEvent) => {
										event.stopPropagation()
										void copy(share)
									},
								},
								[h(copied.value === share ? CheckIcon : CopyIcon)],
							),
						])
					}
					case 'mod':
						return h(AiModMention, {
							meta: node.mention,
							onOpen: (path: string) => emit('open', path),
						})
				}
				return ''
			})
		}

		function lines(list: string[]): (VNode | string)[] {
			const out: (VNode | string)[] = []
			list.forEach((line, index) => {
				if (index > 0) out.push(h('br'))
				out.push(...inline(parseInline(line)))
			})
			return out
		}

		function block(item: Block, index: number): VNode {
			switch (item.kind) {
				case 'h':
					return h(`h${item.level + 1}`, { key: index, class: `ai-md-h ai-md-h${item.level}` }, inline(parseInline(item.text)))
				case 'hr':
					return h('hr', { key: index, class: 'ai-md-hr' })
				case 'quote':
					return h('blockquote', { key: index, class: 'ai-md-quote' }, lines(item.lines))
				case 'list':
					return h(
						item.ordered ? 'ol' : 'ul',
						{ key: index, class: ['ai-md-list', item.ordered ? 'ai-md-ol' : 'ai-md-ul'] },
						item.items.map((entry, entryIndex) =>
							h(
								'li',
								{
									key: entryIndex,
									class: 'ai-md-li',
									style: { marginLeft: `${entry.depth * 1.1}rem` },
									'data-marker': entry.marker || undefined,
								},
								lines(entry.text.split('\n')),
							),
						),
					)
				case 'table':
					return h('div', { key: index, class: 'ai-md-table-wrap' }, [
						h('table', { class: 'ai-md-table' }, [
							h(
								'thead',
								h(
									'tr',
									item.head.map((cell, cellIndex) =>
										h('th', { style: { textAlign: item.align[cellIndex] || undefined } }, inline(parseInline(cell))),
									),
								),
							),
							h(
								'tbody',
								item.rows.map((row, rowIndex) =>
									h(
										'tr',
										{ key: rowIndex },
										item.head.map((_, cellIndex) =>
											h(
												'td',
												{ style: { textAlign: item.align[cellIndex] || undefined } },
												inline(parseInline(row[cellIndex] ?? '')),
											),
										),
									),
								),
							),
						]),
					])
				default:
					return h('p', { key: index, class: 'ai-md-p' }, lines(item.lines))
			}
		}

		return () => h('div', { class: 'ai-md' }, parseBlocks(props.text).map(block))
	},
})
</script>

<style>
.ai-md {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
	font-size: 0.875rem;
	line-height: 1.6;
	overflow-wrap: anywhere;
}

.ai-md-p,
.ai-md-h,
.ai-md-list,
.ai-md-quote {
	margin: 0;
}

.ai-md-strong {
	font-weight: 700;
	color: var(--color-contrast);
}

.ai-md-em {
	font-style: italic;
}

.ai-md-del {
	opacity: 0.65;
}

.ai-md-h {
	color: var(--color-contrast);
	font-weight: 800;
	line-height: 1.3;
	margin-top: 0.25rem;
}

.ai-md-h1 {
	font-size: 1.125rem;
}

.ai-md-h2 {
	font-size: 1rem;
}

.ai-md-h3,
.ai-md-h4 {
	font-size: 0.9375rem;
}

.ai-md-hr {
	width: 100%;
	height: 1px;
	margin: 0.25rem 0;
	border: 0;
	background: color-mix(in srgb, var(--color-contrast) 14%, transparent);
}

.ai-md-quote {
	padding: 0.375rem 0.75rem;
	border-left: 3px solid var(--color-brand);
	border-radius: 0 0.5rem 0.5rem 0;
	background: color-mix(in srgb, var(--color-brand) 8%, transparent);
	color: var(--color-secondary);
}

.ai-md-list {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
	padding: 0;
	list-style: none;
}

.ai-md-li {
	position: relative;
	padding-left: 1.25rem;
}

.ai-md-ul > .ai-md-li::before {
	content: '';
	position: absolute;
	left: 0.375rem;
	top: 0.65em;
	width: 0.375rem;
	height: 0.375rem;
	border-radius: 999px;
	background: var(--color-brand);
}

.ai-md-ol > .ai-md-li {
	padding-left: 1.6rem;
}

.ai-md-ol > .ai-md-li::before {
	content: attr(data-marker);
	position: absolute;
	left: 0;
	min-width: 1.3rem;
	color: var(--color-brand);
	font-weight: 700;
	font-variant-numeric: tabular-nums;
}

.ai-md-code {
	padding: 0.05rem 0.375rem;
	border: 1px solid color-mix(in srgb, var(--color-contrast) 12%, transparent);
	border-radius: 0.375rem;
	background: color-mix(in srgb, var(--color-bg) 55%, transparent);
	font-family: var(--mono-font, ui-monospace, monospace);
	font-size: 0.8125rem;
	cursor: copy;
	transition:
		background-color 0.2s ease,
		border-color 0.2s ease;
}

.ai-md-code:hover {
	border-color: color-mix(in srgb, var(--color-brand) 50%, transparent);
}

.ai-md-code--copied {
	border-color: var(--color-green);
	background: color-mix(in srgb, var(--color-green) 16%, transparent);
}

.ai-md .ai-link {
	color: var(--color-brand);
	text-decoration: underline;
	text-decoration-color: color-mix(in srgb, var(--color-brand) 45%, transparent);
	text-underline-offset: 2px;
	cursor: pointer;
	transition: text-decoration-color 0.18s ease;
}

.ai-md .ai-link:hover {
	text-decoration-color: var(--color-brand);
}

.ai-md .ai-link-icon {
	display: inline;
	width: 0.75rem;
	height: 0.75rem;
	margin-left: 0.125rem;
	vertical-align: baseline;
	opacity: 0.7;
}

.ai-md-linkwrap {
	position: relative;
	display: inline;
}

.ai-md-copy {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 1.25rem;
	height: 1.25rem;
	margin-left: 0.125rem;
	padding: 0;
	vertical-align: -0.2rem;
	border: 1px solid color-mix(in srgb, var(--color-contrast) 12%, transparent);
	border-radius: 0.375rem;
	background: color-mix(in srgb, var(--color-raised-bg) 60%, transparent);
	backdrop-filter: blur(10px);
	-webkit-backdrop-filter: blur(10px);
	color: var(--color-secondary);
	cursor: pointer;
	opacity: 0;
	transform: scale(0.85);
	pointer-events: none;
	transition:
		opacity 0.18s ease,
		transform 0.18s ease,
		color 0.18s ease;
}

.ai-md-copy svg {
	width: 0.75rem;
	height: 0.75rem;
}

.ai-md-linkwrap:hover .ai-md-copy,
.ai-md-copy:focus-visible,
.ai-md-copy--done {
	opacity: 1;
	transform: scale(1);
	pointer-events: auto;
}

.ai-md-copy:hover {
	color: var(--color-contrast);
}

.ai-md-copy--done {
	color: var(--color-green);
}

.ai-md-table-wrap {
	max-width: 100%;
	overflow-x: auto;
	border: 1px solid color-mix(in srgb, var(--color-contrast) 12%, transparent);
	border-radius: 0.625rem;
	background: color-mix(in srgb, var(--color-bg) 35%, transparent);
	backdrop-filter: blur(12px);
	-webkit-backdrop-filter: blur(12px);
}

.ai-md-table {
	width: 100%;
	border-collapse: collapse;
	font-size: 0.8125rem;
}

.ai-md-table th,
.ai-md-table td {
	padding: 0.4rem 0.75rem;
	text-align: left;
	vertical-align: top;
	border-bottom: 1px solid color-mix(in srgb, var(--color-contrast) 8%, transparent);
}

.ai-md-table th {
	color: var(--color-contrast);
	font-weight: 700;
	white-space: nowrap;
	background: color-mix(in srgb, var(--color-brand) 10%, transparent);
}

.ai-md-table tbody tr:last-child td {
	border-bottom: 0;
}

.ai-md-table tbody tr {
	transition: background-color 0.15s ease;
}

.ai-md-table tbody tr:hover {
	background: color-mix(in srgb, var(--color-contrast) 4%, transparent);
}
</style>

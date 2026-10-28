<script setup lang="ts">
/**
 * Portalrinth's own: what a page puts in the side panel - filters, a
 * project's or an organisation's links, members, and so on - stays usable
 * while the panel is folded. Every clickable thing there that has an icon is
 * drawn on the rail as that icon, grouped as the page groups them, naming
 * itself on hover; pressing it presses the real one, so the page cannot tell
 * the difference and nothing has to be taught about the rail.
 */
import { nextTick, onBeforeUnmount, shallowRef, watch } from 'vue'

const props = defineProps<{
	/** Whether the rail is showing; nothing is watched while it is not. */
	active: boolean
}>()

type MirrorItem = {
	id: number
	label: string
	svg: string | null
	img: string | null
	active: boolean
	el: HTMLElement
}

type MirrorGroup = { id: number; items: MirrorItem[] }

const CANDIDATES =
	'a[href], button, [role="button"], [role="checkbox"], [role="radio"], [role="link"]'
const MAX_ITEMS = 120

const groups = shallowRef<MirrorGroup[]>([])

let observer: MutationObserver | null = null
let frame = 0
const ids = new WeakMap<Element, number>()
let nextId = 1
const idOf = (el: Element) => {
	let id = ids.get(el)
	if (!id) {
		id = nextId++
		ids.set(el, id)
	}
	return id
}

function target() {
	return document.getElementById('sidebar-teleport-target')
}

/** Hidden by the page itself (not by the folded panel around it). */
function hiddenWithin(el: HTMLElement, root: HTMLElement) {
	for (let node: HTMLElement | null = el; node && node !== root; node = node.parentElement) {
		if (node.style.display === 'none' || node.hidden) return true
	}
	return false
}

function labelOf(el: HTMLElement) {
	const text =
		el.getAttribute('aria-label') ||
		el.getAttribute('title') ||
		el.dataset.tooltip ||
		(el.textContent ?? '').replace(/\s+/g, ' ').trim()
	return text.length > 80 ? `${text.slice(0, 77)}...` : text
}

function isActive(el: HTMLElement) {
	return (
		el.getAttribute('aria-checked') === 'true' ||
		el.getAttribute('aria-pressed') === 'true' ||
		el.getAttribute('aria-current') === 'page' ||
		el.classList.contains('bg-brand-highlight') ||
		el.classList.contains('router-link-exact-active')
	)
}

/** The section the page put it in: the nearest one with a heading. */
function groupOf(el: HTMLElement, root: HTMLElement) {
	let last: HTMLElement = el
	for (let node = el.parentElement; node && node !== root; node = node.parentElement) {
		if (node.querySelector('h1, h2, h3, h4, h5, h6, .project-sidebar-section')) {
			if (node.classList.contains('project-sidebar-section')) return node
			if (
				node.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > button h3')
			)
				return node
		}
		last = node
	}
	return last
}

function collect() {
	frame = 0
	const root = target()
	if (!root) {
		groups.value = []
		return
	}
	const byGroup = new Map<HTMLElement, MirrorItem[]>()
	let count = 0
	for (const el of root.querySelectorAll<HTMLElement>(CANDIDATES)) {
		if (count >= MAX_ITEMS) break
		// The outer of two nested ones is the one a person presses.
		if (
			el.parentElement?.closest(CANDIDATES) &&
			root.contains(el.parentElement.closest(CANDIDATES))
		)
			continue
		// Section headers and their fold arrows are the panel's own furniture.
		if (el.querySelector('h1, h2, h3, h4, h5, h6, .transition-transform')) continue
		if ((el as HTMLButtonElement).disabled) continue
		if (hiddenWithin(el, root)) continue
		const icon =
			el.querySelector<SVGElement>('svg:not(.filter-action-icon)') ??
			(el.tagName === 'svg' ? (el as unknown as SVGElement) : null)
		const img = icon ? null : el.querySelector<HTMLImageElement>('img[src]')
		if (!icon && !img) continue
		const label = labelOf(el)
		if (!label) continue
		const group = groupOf(el, root)
		const list = byGroup.get(group) ?? []
		list.push({
			id: idOf(el),
			label,
			svg: icon ? icon.outerHTML : null,
			img: img?.src ?? null,
			active: isActive(el),
			el,
		})
		byGroup.set(group, list)
		count++
	}
	groups.value = [...byGroup.entries()].map(([group, items]) => ({ id: idOf(group), items }))
}

function schedule() {
	if (frame) return
	frame = requestAnimationFrame(collect)
}

function start() {
	stop()
	const root = target()
	if (!root) return
	observer = new MutationObserver(schedule)
	observer.observe(root, {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: ['class', 'style', 'aria-checked', 'aria-pressed', 'aria-current', 'hidden'],
	})
	collect()
}

function stop() {
	observer?.disconnect()
	observer = null
	if (frame) cancelAnimationFrame(frame)
	frame = 0
}

watch(
	() => props.active,
	async (active) => {
		if (active) {
			await nextTick()
			start()
		} else {
			stop()
			groups.value = []
		}
	},
	{ immediate: true },
)

onBeforeUnmount(stop)

function press(item: MirrorItem) {
	if (item.el.isConnected) item.el.click()
}
</script>

<template>
	<div v-if="groups.length" class="rail-mirror">
		<TransitionGroup name="rail-mirror-group" tag="div" class="rail-mirror__groups">
			<div v-for="group in groups" :key="group.id" class="rail-mirror__group">
				<button
					v-for="item in group.items"
					:key="item.id"
					v-tooltip.left="item.label"
					type="button"
					class="rail-mirror__item"
					:class="{ 'rail-mirror__item--active': item.active }"
					:aria-label="item.label"
					:aria-pressed="item.active"
					@click="press(item)"
				>
					<!-- eslint-disable-next-line vue/no-v-html -->
					<span v-if="item.svg" class="rail-mirror__icon" v-html="item.svg" />
					<img
						v-else-if="item.img"
						:src="item.img"
						alt=""
						class="rail-mirror__img"
						draggable="false"
					/>
				</button>
			</div>
		</TransitionGroup>
	</div>
</template>

<style scoped>
.rail-mirror {
	display: flex;
	flex-direction: column;
	align-items: center;
	width: 100%;
	min-height: 0;
	margin-top: 0.5rem;
	overflow-y: auto;
	scrollbar-width: none;
	mask-image: linear-gradient(
		to bottom,
		transparent,
		#000 0.5rem,
		#000 calc(100% - 0.75rem),
		transparent
	);
}

.rail-mirror::-webkit-scrollbar {
	display: none;
}

.rail-mirror__groups {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.5rem;
	width: 100%;
	padding: 0.5rem 0;
}

.rail-mirror__group {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.25rem;
	width: 100%;
}

.rail-mirror__group + .rail-mirror__group::before {
	content: '';
	display: block;
	width: 1.5rem;
	height: 2px;
	margin-bottom: 0.25rem;
	border-radius: 999px;
	background: var(--brand-gradient-border, var(--surface-5));
}

.rail-mirror__item {
	display: grid;
	place-items: center;
	width: 2.25rem;
	height: 2.25rem;
	flex-shrink: 0;
	padding: 0;
	border: 1px solid transparent;
	border-radius: var(--radius-md, 0.75rem);
	background: transparent;
	color: var(--color-secondary);
	cursor: pointer;
	transition:
		background-color 0.2s ease,
		border-color 0.2s ease,
		color 0.2s ease,
		transform 0.15s ease;
}

.rail-mirror__item:hover,
.rail-mirror__item:focus-visible {
	background: var(--brand-gradient-button, var(--surface-4));
	border-color: var(--brand-gradient-border, var(--surface-5));
	color: var(--color-contrast);
	outline: none;
}

.rail-mirror__item:active {
	transform: scale(0.92);
}

.rail-mirror__item--active,
.rail-mirror__item--active:hover {
	background: var(--color-brand-highlight);
	border-color: color-mix(in srgb, var(--color-brand) 45%, transparent);
	color: var(--color-brand);
}

.rail-mirror__icon {
	display: grid;
	place-items: center;
	width: 1.25rem;
	height: 1.25rem;
}

.rail-mirror__icon :deep(svg) {
	width: 100%;
	height: 100%;
}

.rail-mirror__img {
	width: 1.5rem;
	height: 1.5rem;
	border-radius: 0.375rem;
	object-fit: cover;
}

.rail-mirror-group-enter-active,
.rail-mirror-group-leave-active {
	transition:
		opacity 0.2s ease,
		transform 0.2s ease;
}

.rail-mirror-group-enter-from,
.rail-mirror-group-leave-to {
	opacity: 0;
	transform: translateX(6px);
}

@media (prefers-reduced-motion: reduce) {
	.rail-mirror__item,
	.rail-mirror-group-enter-active,
	.rail-mirror-group-leave-active {
		transition: none;
	}
}
</style>

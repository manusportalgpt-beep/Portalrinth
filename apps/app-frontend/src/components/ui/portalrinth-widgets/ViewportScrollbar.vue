<script setup lang="ts">
/**
 * The page's scrollbar, drawn over the content instead of beside it.
 *
 * The native one reserved a 16px gutter at the right edge of the page: every
 * pinned bar (the install header, an instance's or a project's header) ended
 * short of the window's rounded corner and left an empty strip beside it.
 * Without the gutter the page reaches the edge, and this thin thumb floats
 * above it - it shows while scrolling or under the pointer, and can be dragged.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = withDefaults(defineProps<{ target?: string }>(), { target: '.app-viewport' })

const visible = ref(false)
const hovered = ref(false)
const dragging = ref(false)
const box = ref({ top: 0, left: 0, height: 0 })
const thumb = ref({ top: 0, height: 0 })

let el: HTMLElement | null = null
let frame = 0
let hideTimer: ReturnType<typeof setTimeout> | undefined
let resizeObserver: ResizeObserver | null = null
let mutationObserver: MutationObserver | null = null
let dragStartY = 0
let dragStartScroll = 0

const INSET_TOP = 18
const INSET_BOTTOM = 6
const MIN_THUMB = 36

function measure() {
	frame = 0
	if (!el) return
	const rect = el.getBoundingClientRect()
	const trackHeight = Math.max(0, rect.height - INSET_TOP - INSET_BOTTOM)
	box.value = { top: rect.top + INSET_TOP, left: rect.right - 12, height: trackHeight }
	const { scrollHeight, clientHeight, scrollTop } = el
	if (scrollHeight <= clientHeight + 1 || trackHeight <= 0) {
		thumb.value = { top: 0, height: 0 }
		return
	}
	const height = Math.max(MIN_THUMB, (clientHeight / scrollHeight) * trackHeight)
	const travel = trackHeight - height
	const top = (scrollTop / (scrollHeight - clientHeight)) * travel
	thumb.value = { top, height }
}

function schedule() {
	if (!frame) frame = requestAnimationFrame(measure)
}

function onScroll() {
	schedule()
	visible.value = true
	clearTimeout(hideTimer)
	hideTimer = setTimeout(() => {
		if (!dragging.value) visible.value = false
	}, 900)
}

function observeChildren() {
	if (!el || !resizeObserver) return
	resizeObserver.disconnect()
	resizeObserver.observe(el)
	for (const child of Array.from(el.children)) resizeObserver.observe(child)
	schedule()
}

function attach() {
	el = document.querySelector<HTMLElement>(props.target)
	if (!el) return false
	el.addEventListener('scroll', onScroll, { passive: true })
	resizeObserver = new ResizeObserver(schedule)
	mutationObserver = new MutationObserver(observeChildren)
	mutationObserver.observe(el, { childList: true })
	observeChildren()
	return true
}

let attachTimer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
	window.addEventListener('resize', schedule)
	if (!attach()) {
		attachTimer = setInterval(() => {
			if (attach()) clearInterval(attachTimer)
		}, 250)
	}
})

onBeforeUnmount(() => {
	clearInterval(attachTimer)
	clearTimeout(hideTimer)
	if (frame) cancelAnimationFrame(frame)
	window.removeEventListener('resize', schedule)
	el?.removeEventListener('scroll', onScroll)
	resizeObserver?.disconnect()
	mutationObserver?.disconnect()
	stopDrag()
})

function onThumbDown(event: PointerEvent) {
	if (!el) return
	event.preventDefault()
	dragging.value = true
	dragStartY = event.clientY
	dragStartScroll = el.scrollTop
	window.addEventListener('pointermove', onDrag)
	window.addEventListener('pointerup', stopDrag)
}

function onDrag(event: PointerEvent) {
	if (!el) return
	const travel = box.value.height - thumb.value.height
	if (travel <= 0) return
	const ratio = (el.scrollHeight - el.clientHeight) / travel
	el.scrollTop = dragStartScroll + (event.clientY - dragStartY) * ratio
}

function stopDrag() {
	window.removeEventListener('pointermove', onDrag)
	window.removeEventListener('pointerup', stopDrag)
	if (dragging.value) {
		dragging.value = false
		onScroll()
	}
}

/** A click on the track jumps a page toward the pointer, like the native bar. */
function onTrackDown(event: PointerEvent) {
	if (!el || event.target !== event.currentTarget) return
	const offset = event.clientY - box.value.top
	const direction = offset < thumb.value.top ? -1 : 1
	el.scrollBy({ top: direction * el.clientHeight * 0.9, behavior: 'smooth' })
}
</script>

<template>
	<div
		v-if="thumb.height > 0"
		class="viewport-scrollbar"
		:class="{ 'viewport-scrollbar--shown': visible || hovered || dragging }"
		:style="{ top: `${box.top}px`, left: `${box.left}px`, height: `${box.height}px` }"
		@pointerenter="hovered = true"
		@pointerleave="hovered = false"
		@pointerdown="onTrackDown"
	>
		<div
			class="viewport-scrollbar__thumb"
			:class="{ 'viewport-scrollbar__thumb--active': dragging }"
			:style="{ height: `${thumb.height}px`, transform: `translateY(${thumb.top}px)` }"
			@pointerdown.stop="onThumbDown"
		/>
	</div>
</template>

<style scoped>
.viewport-scrollbar {
	position: fixed;
	z-index: 31;
	width: 10px;
	opacity: 0;
	transition: opacity 0.25s ease;
}

.viewport-scrollbar--shown,
.viewport-scrollbar:hover {
	opacity: 1;
}

.viewport-scrollbar__thumb {
	width: 6px;
	margin-left: 2px;
	border-radius: 999px;
	background: var(--color-scrollbar);
	will-change: transform;
	transition:
		width 0.15s ease,
		margin 0.15s ease,
		background-color 0.15s ease;
	cursor: default;
}

.viewport-scrollbar:hover .viewport-scrollbar__thumb,
.viewport-scrollbar__thumb--active {
	width: 8px;
	margin-left: 1px;
	background: color-mix(in srgb, var(--color-scrollbar) 70%, var(--color-contrast));
}
</style>

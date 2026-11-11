<template>
	<div
		v-if="filteredLinks.length > (showSingleTab ? 0 : 1)"
		:class="pageNav ? '-mx-6 -mt-2 mb-1 overflow-x-auto px-6 py-2' : 'contents'"
		v-bind="pageNav ? $attrs : {}"
	>
		<nav
			ref="scrollContainer"
			class="relative flex w-fit rounded-full p-1 text-xs sm:text-sm font-bold"
			:class="{
				'border border-solid border-surface-4': mode === 'navigation',
				'tab-color-delayed': colorChangeDelayed,
			}"
			v-bind="pageNav ? {} : $attrs"
		>
			<template v-if="mode === 'navigation'">
				<RouterLink
					v-for="(link, index) in filteredLinks"
					v-show="link.shown ?? true"
					:key="link.href"
					ref="tabLinkElements"
					:replace="replace"
					:to="query ? (link.href ? `?${query}=${link.href}` : '?') : link.href"
					class="button-animation z-[1] flex flex-row items-center gap-2 px-4 py-2 focus:rounded-full"
					:class="getSSRFallbackClasses(index)"
					@mouseenter="link.onHover?.()"
					@focus="link.onHover?.()"
				>
					<component
						:is="link.icon"
						v-if="link.icon"
						class="tab-color hidden sm:block size-5"
						:class="getIconClasses(index)"
					/>
					<span class="tab-color text-nowrap" :class="getLabelClasses(index)">
						{{ link.label }}
					</span>
					<component
						:is="link.iconRight"
						v-if="link.iconRight"
						class="tab-color hidden sm:block size-4"
						:class="getIconClasses(index)"
					/>
				</RouterLink>
			</template>

			<template v-else>
				<div
					v-for="(link, index) in filteredLinks"
					v-show="link.shown ?? true"
					:key="link.href"
					ref="tabLinkElements"
					class="button-animation z-[1] flex flex-row items-center gap-2 px-4 py-2 hover:cursor-pointer focus:rounded-full"
					:class="getSSRFallbackClasses(index)"
					@click="emit('tabClick', index, link)"
				>
					<component
						:is="link.icon"
						v-if="link.icon"
						class="tab-color size-5"
						:class="getIconClasses(index)"
					/>
					<span class="tab-color text-nowrap" :class="getLabelClasses(index)">
						{{ link.label }}
					</span>
					<component
						:is="link.iconRight"
						v-if="link.iconRight"
						class="tab-color size-4"
						:class="getIconClasses(index)"
					/>
				</div>
			</template>

			<div
				v-if="sliderReady && currentActiveIndex !== -1"
				class="pointer-events-none absolute rounded-full"
				:class="[
					subpageSelected ? 'bg-button-bg' : 'bg-button-bgSelected',
					{
						'navtabs-transition': transitionsEnabled,
						'navtabs-slider-in': sliderMountAnim,
					},
				]"
				:style="sliderStyle"
				aria-hidden="true"
			/>
		</nav>
	</div>
</template>

<script setup lang="ts">
import type { Component } from 'vue'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { navTabsSliderMemory } from './navtabs-slider-memory'

const route = useRoute()

defineOptions({ inheritAttrs: false })

interface Tab {
	label: string
	href: string
	shown?: boolean
	icon?: Component
	/** An icon drawn after the label - part of the same button. */
	iconRight?: Component
	subpages?: string[]
	onHover?: () => void
}

const props = withDefaults(
	defineProps<{
		replace?: boolean
		links: Tab[]
		query?: string
		mode?: 'navigation' | 'local'
		activeIndex?: number
		pageNav?: boolean
		/** Keeps the tabs rendered when only one is shown, so the layout doesn't shift as tabs are filtered. */
		showSingleTab?: boolean
	}>(),
	{
		mode: 'navigation',
		query: undefined,
		activeIndex: undefined,
		pageNav: false,
		showSingleTab: false,
	},
)

const emit = defineEmits<{
	tabClick: [index: number, tab: Tab]
}>()

// DOM refs
const scrollContainer = ref<HTMLElement | null>(null)
const tabLinkElements = ref<HTMLElement[]>()

const sliderLeft = ref(0)
const sliderTop = ref(0)
const sliderRight = ref(0)
const sliderBottom = ref(0)

const currentActiveIndex = ref(-1)
const subpageSelected = ref(false)

const sliderReady = ref(false)
const transitionsEnabled = ref(false)
/** True while the mount sequence (remembered spot -> slide, or the fade-in)
    is still playing: any positionSlider() call inside that window must not
    start a second one, or the pill snaps instead of travelling. */
let mountSequence = false
/** The freshest geometry seen while the mount sequence runs. */
let pendingPosition: {
	left: number
	top: number
	right: number
	bottom: number
} | null = null
/** True while the pill plays its mount animation, cleared shortly after. */
const sliderMountAnim = ref(false)
const colorChangeDelayed = ref(false)

const sliderDelays = ref({ left: '0ms', top: '0ms', right: '0ms', bottom: '0ms' })

const filteredLinks = computed(() => props.links.filter((link) => link.shown ?? true))

/** The Discover tab bars (Browse and Skin Browse) share one pill that is
    supposed to travel between pages; those are the bars that record and
    replay the pill's geometry across remounts. */
const isDiscoverBar = computed(() =>
	filteredLinks.value.some((link) => link.href.startsWith('/browse')),
)

const sliderStyle = computed(() => ({
	left: `${sliderLeft.value}px`,
	top: `${sliderTop.value}px`,
	right: `${sliderRight.value}px`,
	bottom: `${sliderBottom.value}px`,
}))

const leftDelay = computed(() => sliderDelays.value.left)
const rightDelay = computed(() => sliderDelays.value.right)
const topDelay = computed(() => sliderDelays.value.top)
const bottomDelay = computed(() => sliderDelays.value.bottom)

const isActiveAndNotSubpage = computed(
	() => (index: number) => currentActiveIndex.value === index && !subpageSelected.value,
)

function getSSRFallbackClasses(index: number) {
	if (sliderReady.value) return {}
	if (currentActiveIndex.value !== index) return {}

	return {
		'rounded-full': true,
		'bg-button-bgSelected': !subpageSelected.value,
		'bg-button-bg': subpageSelected.value,
	}
}

function getIconClasses(index: number) {
	return {
		'text-button-textSelected': isActiveAndNotSubpage.value(index),
		'text-secondary': !isActiveAndNotSubpage.value(index),
	}
}

function getLabelClasses(index: number) {
	return {
		'text-button-textSelected': isActiveAndNotSubpage.value(index),
		'text-contrast': !isActiveAndNotSubpage.value(index),
	}
}

function computeActiveIndex(): { index: number; isSubpage: boolean } {
	if (props.mode === 'local' && props.activeIndex !== undefined) {
		return {
			index: Math.min(props.activeIndex, filteredLinks.value.length - 1),
			isSubpage: false,
		}
	}

	let subpageIndex = -1

	for (let i = filteredLinks.value.length - 1; i >= 0; i--) {
		const link = filteredLinks.value[i]
		const decodedPath = decodeURIComponent(route.path)
		const decodedHref = decodeURIComponent(link.href.split('?')[0])

		if (props.query) {
			const queryValue = route.query[props.query]
			if (queryValue === link.href || (!queryValue && !link.href)) {
				return { index: i, isSubpage: false }
			}
			continue
		}

		if (decodedPath === decodedHref) {
			return { index: i, isSubpage: false }
		}

		const isSubpageMatch =
			(decodedPath.startsWith(decodedHref) &&
				(decodedPath.length === decodedHref.length || decodedPath[decodedHref.length] === '/')) ||
			link.subpages?.some((subpage) => decodedPath.includes(subpage))

		if (isSubpageMatch && subpageIndex === -1) {
			subpageIndex = i
		}
	}

	return { index: subpageIndex, isSubpage: subpageIndex !== -1 }
}

function getTabElement(index: number): HTMLElement | null {
	if (index === -1) return null

	const container = scrollContainer.value as HTMLElement | undefined
	if (!container) return null

	const tabs = container.querySelectorAll('.button-animation')
	const element = tabs[index] as HTMLElement | undefined

	if (!element) return null

	return element
}

function getSliderPosition() {
	const el = getTabElement(currentActiveIndex.value)
	const parent = scrollContainer.value
	if (!el || !parent) return null

	return {
		left: el.offsetLeft,
		top: el.offsetTop,
		right: parent.clientWidth - el.offsetLeft - el.offsetWidth,
		bottom: parent.clientHeight - el.offsetTop - el.offsetHeight,
	}
}

function applySliderPosition(newPosition: {
	left: number
	top: number
	right: number
	bottom: number
}) {
	sliderLeft.value = newPosition.left
	sliderTop.value = newPosition.top
	sliderRight.value = newPosition.right
	sliderBottom.value = newPosition.bottom
	if (isDiscoverBar.value) {
		// Keep the travel memory current: whichever Discover bar unmounts
		// last leaves the pill's geometry here for its sibling to pick up.
		navTabsSliderMemory.snapshot = newPosition
	}
}

function animateSliderTo(newPosition: {
	left: number
	top: number
	right: number
	bottom: number
}) {
	const STAGGER_DELAY = '175ms'

	sliderDelays.value = {
		left: newPosition.left < sliderLeft.value ? '0ms' : STAGGER_DELAY,
		right: newPosition.left < sliderLeft.value ? STAGGER_DELAY : '0ms',
		top: newPosition.top < sliderTop.value ? '0ms' : STAGGER_DELAY,
		bottom: newPosition.top < sliderTop.value ? STAGGER_DELAY : '0ms',
	}

	applySliderPosition(newPosition)
}

function positionSlider(animate = true) {
	const newPosition = getSliderPosition()
	if (!newPosition) {
		return
	}

	if (!sliderReady.value) {
		// A call while the mount sequence is still playing only refreshes the
		// target the sequence will land on - starting another sequence here
		// used to snap the pill straight to the tab (the remounted Серверы and
		// Скины bars lost their slide exactly this way).
		if (mountSequence) {
			pendingPosition = newPosition
			return
		}
		const remembered = isDiscoverBar.value ? navTabsSliderMemory.snapshot : null
		if (remembered) {
			// A sibling Discover bar just unmounted: begin where the pill
			// stood there, then travel to the active tab, so a page swap
			// reads as one sliding pill instead of one fading in.
			mountSequence = true
			pendingPosition = newPosition
			applySliderPosition(remembered)
			navTabsSliderMemory.snapshot = null
			// sliderReady waits for the first frame: while it is down, a resize
			// observer's first call cannot snap the pill into place mid-setup.
			nextTick(() => {
				requestAnimationFrame(() => {
					sliderReady.value = true
					transitionsEnabled.value = true
					// One full frame with the transitions on and the pill standing at
					// its remembered spot, so the slide below always runs at the pace
					// of a live tab change — a remounted bar (Серверы, Скины) used to
					// apply class and coordinates in one flush and arrive sooner than
					// every other tab.
					requestAnimationFrame(() => {
						if (pendingPosition) animateSliderTo(pendingPosition)
						pendingPosition = null
						mountSequence = false
					})
				})
			})
		} else {
			mountSequence = true
			pendingPosition = newPosition
			applySliderPosition(newPosition)
			sliderReady.value = true
			sliderMountAnim.value = true
			nextTick(() => {
				requestAnimationFrame(() => {
					transitionsEnabled.value = true
					// The pill has faded in by now; hand transitions over to the
					// live slider so the next tab change slides as before.
					window.setTimeout(() => {
						sliderMountAnim.value = false
						pendingPosition = null
						mountSequence = false
					}, 220)
				})
			})
		}
		return
	}

	if (!animate) {
		/* Nothing moved (the observer's first callback right after mount,
		 * most often) - touching the transition here would cancel a slide
		 * that is only just beginning. */
		if (
			newPosition.left === sliderLeft.value &&
			newPosition.top === sliderTop.value &&
			newPosition.right === sliderRight.value &&
			newPosition.bottom === sliderBottom.value
		) {
			return
		}
		transitionsEnabled.value = false
		applySliderPosition(newPosition)
		requestAnimationFrame(() => {
			transitionsEnabled.value = true
		})
		return
	}

	animateSliderTo(newPosition)
}

/** Which page owns a route for the Discover bars: the skin shelf is its own
    component, every other /browse path lives in Browse. Two different keys
    across one navigation mean this bar unmounts and its sibling takes over. */
function handoffTarget(path: unknown): string {
	const p = String(path ?? '')
	if (p.startsWith('/browse/skin')) return 'browse-skin'
	if (p.startsWith('/browse')) return 'browse'
	return p
}

/** True while a navigation is handing this Discover bar over to its sibling
    page (Browse <-> Skin Browse): the bar is about to unmount, so it must not
    chase the new route. Its move would overwrite the pill's remembered
    position with the destination, and the mounting sibling would find the
    snapshot already standing on the target - the pill would appear in place
    instead of travelling, exactly what the Скины tab used to do. */
let handoffInFlight = false

function resetSliderPosition() {
	/* The mount sequence owns the pill until its slide has started: the
	 * observer's first callback lands between the two frames of that
	 * sequence (sliderReady is already up by then), and measuring here
	 * would snap the pill straight to the active tab - the inherited
	 * travel of the remounted Серверы/Скины bar died exactly this way. */
	if (!sliderReady.value || currentActiveIndex.value === -1 || mountSequence) {
		return
	}
	positionSlider(false)
}

async function updateActiveTab() {
	await nextTick()
	const { index, isSubpage } = computeActiveIndex()
	colorChangeDelayed.value = sliderReady.value && index !== currentActiveIndex.value
	currentActiveIndex.value = index
	subpageSelected.value = isSubpage

	if (index !== -1) {
		positionSlider()
	}
}

const initialActive = computeActiveIndex()
currentActiveIndex.value = initialActive.index
subpageSelected.value = initialActive.isSubpage

let resizeObserver: ResizeObserver | undefined

onMounted(() => {
	updateActiveTab()
	resizeObserver = new ResizeObserver(resetSliderPosition)
	if (scrollContainer.value) {
		resizeObserver.observe(scrollContainer.value)
	}
})

onUnmounted(() => {
	resizeObserver?.disconnect()
})

watch(
	() => [route.path, route.query],
	([newPath], [oldPath]) => {
		if (props.mode !== 'navigation') return
		handoffInFlight = isDiscoverBar.value && handoffTarget(newPath) !== handoffTarget(oldPath)
		if (handoffInFlight) {
			if (!String(newPath).startsWith('/browse')) {
				// Leaving Discover entirely: no sibling bar will pick the
				// pill up, so drop the memory - a stale position from an old
				// visit must not leak into the next fresh mount.
				navTabsSliderMemory.snapshot = null
			}
			return
		}
		updateActiveTab()
	},
)

watch(
	() => props.activeIndex,
	() => {
		if (props.mode === 'local') {
			updateActiveTab()
		}
	},
)

watch(
	() => props.links,
	async () => {
		// The same navigation also replays the links (Browse rebuilds its
		// suffix from the query), and this watcher fires right after the
		// route one: a dying bar must stay quiet here too.
		if (handoffInFlight) return
		await nextTick()
		updateActiveTab()
	},
	{ deep: true },
)
</script>

<style scoped>
nav {
	/* A glass plate, not an opaque one: an almost-black slab behind the tabs
           read as a black board laid over the page. The blur keeps the labels
           readable over whatever the page carries. */
	background: color-mix(in srgb, var(--color-raised-bg) 55%, transparent);
	backdrop-filter: blur(12px) saturate(1.2);
	-webkit-backdrop-filter: blur(12px) saturate(1.2);
}

.navtabs-transition {
	transition:
		left 80ms cubic-bezier(0.4, 0, 0.2, 1) v-bind(leftDelay),
		right 80ms cubic-bezier(0.4, 0, 0.2, 1) v-bind(rightDelay),
		top 80ms cubic-bezier(0.4, 0, 0.2, 1) v-bind(topDelay),
		bottom 80ms cubic-bezier(0.4, 0, 0.2, 1) v-bind(bottomDelay);
}

.navtabs-slider-in {
	animation: navtabs-slider-in 180ms cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes navtabs-slider-in {
	from {
		opacity: 0;
		transform: scale(0.85);
	}
	to {
		opacity: 1;
		transform: scale(1);
	}
}

.tab-color {
	transition: color 100ms cubic-bezier(0.4, 0, 0.2, 1);
}

.tab-color-delayed .tab-color {
	transition-delay: 100ms;
}
</style>

<script setup lang="ts">
/**
 * The app's mark in the title bar, which also says when it is busy.
 *
 * One mark. There used to be two: the wordmark beside the icon, which read as
 * two logos rather than as a name and a symbol, and the wordmark said the old
 * name besides. The icon is what the window, the taskbar and the installer all
 * carry, so it is what the title bar shows, and the app's name is the title
 * beside it.
 *
 * It turns whenever the launcher is doing something: a download, an install, a
 * mod arriving, a pack unpacking, Minecraft itself coming down, and a page
 * load. The turn runs for as long as the work does. Page loads here finish in
 * tens of milliseconds - far too quick to be seen - so one is held for a full
 * turn once it starts, which is the smallest amount of movement that reads as
 * "it heard you".
 *
 * Nothing on it is drawn through the main thread: the turn is a CSS animation
 * of `transform` and a gradient, both of which the compositor runs however busy
 * the page underneath is, which during startup it is.
 */
import { injectLoadingState } from '@modrinth/ui'
import { onBeforeUnmount, ref, watch } from 'vue'

import { useAppBusy } from '@/composables/use-app-busy'

/** How long a turn is held once it has started, so a fast page load is still seen. */
const MINIMUM_VISIBLE_MS = 1200

const loading = injectLoadingState()
const working = useAppBusy()
const active = ref(false)

let startedAt = 0
let stopTimer: number | undefined

function clearStopTimer(): void {
	if (stopTimer !== undefined) {
		window.clearTimeout(stopTimer)
		stopTimer = undefined
	}
}

watch(
	() => loading.pending.value,
	(pending) => {
		clearStopTimer()

		if (pending) {
			if (!active.value) {
				startedAt = performance.now()
				active.value = true
			}
			return
		}

		const remaining = MINIMUM_VISIBLE_MS - (performance.now() - startedAt)
		if (remaining <= 0) {
			active.value = false
			return
		}

		stopTimer = window.setTimeout(() => {
			active.value = false
			stopTimer = undefined
		}, remaining)
	},
	{ immediate: true },
)

onBeforeUnmount(clearStopTimer)
</script>

<template>
	<span class="portalrinth-logo" :class="{ 'is-active': active || working }">
		<span class="portalrinth-logo__mark" aria-hidden="true" />
		<span class="portalrinth-logo__name">Portalrinth</span>
	</span>
</template>

<style scoped>
.portalrinth-logo {
	display: inline-flex;
	align-items: center;
	gap: 0.5rem;
	user-select: none;
}

.portalrinth-logo__mark {
	display: block;
	height: 1.75rem;
	width: 1.75rem;
	background: url('@/assets/portalrinth-icon.png') center / contain no-repeat;
}

/*
 * Under "all icons in the accent" the artwork steps aside and the mark
 * becomes a silhouette in the accent colour - the same shape, worn as a
 * mask over the colour the rest of the interface is picked out in. A
 * gradient accent hands over its first colour, as it does everywhere
 * else only one colour will do.
 */
html.portalrinth-icons-accent .portalrinth-logo__mark {
	background: var(--portalrinth-accent, var(--color-brand));
	-webkit-mask: url('@/assets/portalrinth-icon.png') center / contain no-repeat;
	mask: url('@/assets/portalrinth-icon.png') center / contain no-repeat;
}

/*
 * The name beside the mark, in the app's own weight and size.
 *
 * It is set as text rather than drawn into the artwork so it is the name that
 * is there - readable, selectable and the same name everywhere else - rather
 * than a picture of a name that has to be redrawn to be changed.
 */
.portalrinth-logo__name {
	font-size: 1.0625rem;
	font-weight: 600;
	line-height: 1;
	letter-spacing: 0.01em;
	color: var(--color-contrast);
}

/*
 * A slow pulse rather than a spin. The mark is a waveform, not a wheel, and a
 * picture of a wave that turns is a picture of nothing; what says "working" is
 * the light moving through it, which is what this does - and what
 * `prefers-reduced-motion` is given the stillness in place of.
 */
.portalrinth-logo.is-active {
	animation: portalrinth-logo-pulse 1.6s ease-in-out infinite;
}

@keyframes portalrinth-logo-pulse {
	0%,
	100% {
		opacity: 1;
		transform: scale(1);
	}
	50% {
		opacity: 0.72;
		transform: scale(0.97);
	}
}

@media (prefers-reduced-motion: reduce) {
	.portalrinth-logo.is-active {
		animation: none;
		opacity: 0.8;
	}
}
</style>

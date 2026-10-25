<script setup lang="ts">
/**
 * The background picture, behind the whole window. While there is one, the
 * window's frame lets it through, and the cards on a page a little of it.
 */
import { computed, ref, watchEffect } from 'vue'

import { audioSettings } from '@/helpers/portalrinth-audio'
import {
	backgroundBlur,
	backgroundDim,
	backgroundIsVideo,
	backgroundUrl,
	headerShade,
	headerShadeOpacity,
	pageShade,
} from '@/helpers/portalrinth-background'

/*
 * A background video plays silent unless its sound is turned on in
 * Settings → Sound; then at the volume set there or under the title bar's
 * sound button.
 */
const video = ref<HTMLVideoElement | null>(null)
function applyVideoVolume() {
	if (video.value) video.value.volume = Math.min(1, Math.max(0, audioSettings.videoVolume / 100))
}
watchEffect(applyVideoVolume)

/** The darkening is a veil painted over the picture, in the same layer. */
const backgroundImage = computed(() => {
	const veil = `rgba(0, 0, 0, ${Math.min(100, Math.max(0, backgroundDim.value)) / 100})`
	return `linear-gradient(${veil}, ${veil}), url(${backgroundUrl.value})`
})

watchEffect(() => {
	document.documentElement.classList.toggle('portalrinth-backdrop-active', !!backgroundUrl.value)
})

watchEffect(() => {
	document.documentElement.style.setProperty('--portalrinth-page-shade', `${pageShade.value}%`)
})

watchEffect(() => {
	document.documentElement.style.setProperty(
		'--portalrinth-header-shade',
		`${headerShadeOpacity(headerShade.value)}%`,
	)
})
</script>

<template>
	<Transition name="portalrinth-backdrop">
		<div
			v-if="backgroundUrl && !backgroundIsVideo"
			:key="backgroundUrl"
			class="portalrinth-backdrop"
			:class="{ 'portalrinth-backdrop--blur': backgroundBlur }"
			:style="{ backgroundImage }"
		/>
		<!--
			A video that moves is drawn by the video itself rather than painted
			behind: a picture cannot hold motion, and the frame is the only thing
			that can play it.
		-->
		<video
			v-if="backgroundUrl && backgroundIsVideo"
			:key="backgroundUrl"
			ref="video"
			class="portalrinth-backdrop"
			:class="{ 'portalrinth-backdrop--blur': backgroundBlur }"
			:src="backgroundUrl"
			autoplay
			loop
			:muted="!audioSettings.videoSound"
			playsinline
			@loadedmetadata="applyVideoVolume"
		/>
	</Transition>
</template>

<style>
.portalrinth-backdrop {
	position: fixed;
	inset: 0;
	z-index: 0;
	pointer-events: none;
	background-position: center;
	background-size: cover;
	background-repeat: no-repeat;
	object-fit: cover;
}

.portalrinth-backdrop::after {
	/* A glow of the accent from the top corner, so the picture sits in the
	   same colour as everything over it. */
	content: '';
	position: absolute;
	inset: 0;
	background:
		radial-gradient(
			ellipse at 15% 0%,
			color-mix(in srgb, var(--color-brand) 22%, transparent),
			transparent 60%
		),
		radial-gradient(
			ellipse at 100% 100%,
			color-mix(in srgb, var(--color-brand) 12%, transparent),
			transparent 55%
		);
}

.portalrinth-backdrop--blur {
	filter: blur(14px);
	/* The blur pulls the edges in; scaled up so they stay off-screen. */
	transform: scale(1.08);
}

.portalrinth-backdrop-enter-active,
.portalrinth-backdrop-leave-active {
	transition: opacity 0.4s ease;
}

.portalrinth-backdrop-enter-from,
.portalrinth-backdrop-leave-to {
	opacity: 0;
}

:root.portalrinth-backdrop-active .app-grid-layout {
	background-color: color-mix(in srgb, var(--color-raised-bg) 45%, transparent);
}

:root.portalrinth-backdrop-active .app-grid-navbar,
:root.portalrinth-backdrop-active .app-title-bar,
:root.portalrinth-backdrop-active .app-window-controls {
	background-color: transparent;
}

:root.portalrinth-backdrop-active body {
	/* The theme's solid surfaces, kept here so the page can mix from them. */
	--portalrinth-solid-surface-2: var(--surface-2);
	--portalrinth-solid-surface-3: var(--surface-3);
	--portalrinth-solid-surface-4: var(--surface-4);
}

:root.portalrinth-backdrop-active .app-viewport {
	/* How much darker than the frame the page is: a setting, 50% unless set. */
	background-color: color-mix(
		in srgb,
		var(--color-bg) var(--portalrinth-page-shade, 50%),
		transparent
	);
}

:root.portalrinth-backdrop-active .app-contents {
	/* The cards on a page let the picture through too, a little. */
	--surface-2: color-mix(in srgb, var(--portalrinth-solid-surface-2) 72%, transparent);
	--surface-3: color-mix(in srgb, var(--portalrinth-solid-surface-3) 72%, transparent);
	--surface-4: color-mix(in srgb, var(--portalrinth-solid-surface-4) 72%, transparent);
	--color-raised-bg: var(--surface-3);
	--color-button-bg: var(--surface-4);
}

/* The frame's buttons — the sidebar's, the title bar's, the window's own — lit
   on hover with a veil rather than a solid grey disc. */
:root.portalrinth-backdrop-active .app-grid-layout,
:root.portalrinth-backdrop-active .app-window-controls {
	--color-button-bg: color-mix(in srgb, var(--portalrinth-solid-surface-4) 55%, transparent);
}

/* What opens over everything is frosted glass: mostly solid, so it reads as
   easily as before, with the picture blurred through it. */
:root.portalrinth-backdrop-active .modal-body,
:root.portalrinth-backdrop-active .download-manager-panel {
	--surface-3: color-mix(in srgb, var(--portalrinth-solid-surface-3) 80%, transparent);
	--color-raised-bg: var(--surface-3);
	backdrop-filter: blur(24px) saturate(1.3);
}

/* The bar over the search while adding content to an instance takes after
   the page: see-through, with the picture blurred under it. */
:root.portalrinth-backdrop-active .browse-install-header {
	background-color: color-mix(
		in srgb,
		var(--color-bg) var(--portalrinth-header-shade, 60%),
		transparent
	);
	backdrop-filter: blur(24px) saturate(1.3);
	-webkit-backdrop-filter: blur(24px) saturate(1.3);
}

/* A blurred layer is not cut by the rounded page it sits in, so it is given
   the page's arcs itself - otherwise its square corner shows past them. */
:root.portalrinth-backdrop-active .browse-install-header {
	border-top-left-radius: var(--radius-xl);
}

:root.portalrinth-backdrop-active .sidebar-enabled .browse-install-header {
	border-top-right-radius: var(--radius-xl);
}

/* Menus and tooltips too, a touch more solid: they are small and read fast. */
:root.portalrinth-backdrop-active [role='menu'],
:root.portalrinth-backdrop-active .v-popper--theme-dropdown .v-popper__inner,
:root.portalrinth-backdrop-active .v-popper__inner.v-popper--theme-tooltip {
	--surface-3: color-mix(in srgb, var(--portalrinth-solid-surface-3) 84%, transparent);
	--_popper-arrow-bg: var(--surface-3);
	backdrop-filter: blur(18px) saturate(1.3);
}

/* An open dropdown list is drawn inside the page; it stays solid to be read. */
:root.portalrinth-backdrop-active .app-contents :has(> .combobox-options-scrollbar) {
	--surface-4: var(--portalrinth-solid-surface-4);
}

:root.portalrinth-backdrop-active .app-sidebar {
	/* Part of the frame, like the bar on the left: the frame's veil shows through. */
	background: transparent;
}
</style>

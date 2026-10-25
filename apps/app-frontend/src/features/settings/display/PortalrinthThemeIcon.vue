<template>
	<span
		class="grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-4 text-contrast"
		aria-hidden="true"
	>
		<img v-if="icon.startsWith('data:')" :src="icon" alt="" class="size-full object-cover" />
		<component :is="component" v-else class="size-5" />
	</span>
</template>

<script setup lang="ts">
/** A saved theme's icon: one of the set, or a picture of one's own. */
import {
	CrownIcon,
	GameIcon,
	GlobeIcon,
	HeartIcon,
	ImageIcon,
	MoonIcon,
	MusicIcon,
	PaletteIcon,
	RocketIcon,
	SparklesIcon,
	StarIcon,
	SunIcon,
} from '@modrinth/assets'
import { type Component, computed } from 'vue'

import type { ThemeIconName } from '@/helpers/portalrinth-themes'

const props = defineProps<{ icon: string }>()

const ICONS: Record<ThemeIconName, Component> = {
	palette: PaletteIcon,
	star: StarIcon,
	heart: HeartIcon,
	sparkles: SparklesIcon,
	moon: MoonIcon,
	sun: SunIcon,
	game: GameIcon,
	rocket: RocketIcon,
	crown: CrownIcon,
	music: MusicIcon,
	globe: GlobeIcon,
	image: ImageIcon,
}

const component = computed(() => ICONS[props.icon as ThemeIconName] ?? PaletteIcon)
</script>

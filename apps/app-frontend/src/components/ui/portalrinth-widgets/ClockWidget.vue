<template>
	<div
		v-tooltip="tooltip"
		class="flex items-center gap-1.5 rounded-xl px-2 py-1 text-sm font-medium text-contrast"
	>
		<component :is="icon" class="size-4 shrink-0" :class="iconClass" />
		<span class="tabular-nums">{{ timeLabel }}</span>
	</div>
</template>

<script setup lang="ts">
/**
 * The title-bar clock, standing at the top center the way a desktop
 * clock does. It shows the system timezone's own time - what the PC
 * shows - and picks its icon by the part of the day: a sunrise around
 * dawn, a sun through the day, a sunset in the evening, a moon at night.
 */
import { MoonIcon, SunIcon, SunriseIcon, SunsetIcon } from '@modrinth/assets'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { systemTime, timeOfDay, type TimeOfDay } from '@/helpers/portalrinth-widgets'

const now = ref(new Date())
let timer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
	timer = setInterval(() => {
		now.value = new Date()
	}, 10_000)
})

onBeforeUnmount(() => {
	if (timer) clearInterval(timer)
})

const part = computed<TimeOfDay>(() => timeOfDay(now.value))

const icon = computed(() => {
	if (part.value === 'sunrise') return SunriseIcon
	if (part.value === 'day') return SunIcon
	if (part.value === 'sunset') return SunsetIcon
	return MoonIcon
})

const iconClass = computed(() => (part.value === 'night' ? 'text-secondary' : 'text-orange'))

const timeLabel = computed(() => systemTime(now.value))

const tooltip = computed(() => {
	const full = now.value.toLocaleString([], {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		hour: '2-digit',
		minute: '2-digit',
	})
	const parts: Record<TimeOfDay, string> = {
		sunrise: 'Рассвет',
		day: 'День',
		sunset: 'Закат',
		night: 'Ночь',
	}
	return `${full} · ${parts[part.value]}`
})
</script>

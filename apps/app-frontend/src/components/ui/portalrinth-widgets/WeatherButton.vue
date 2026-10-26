<template>
        <FloatingMenu placement="bottom-end" panel-class="!p-3" @open="onOpen">
                <button
                        v-tooltip="formatMessage(messages.title)"
                        class="flex items-center gap-1.5 rounded-xl border-none bg-transparent px-2 py-1 text-sm font-medium text-contrast backdrop-blur transition-colors hover:bg-button-bg"
                >
                        <component :is="weatherIcon" v-if="!failed" class="size-4 shrink-0" :class="weather.temp < 0 ? 'text-blue' : 'text-orange'" />
                        <span v-if="loaded && !failed" class="tabular-nums">{{ weather.temp }}°</span>
                        <span v-else-if="failed" class="text-secondary">—</span>
                        <span v-else class="size-3 animate-pulse rounded-full bg-surface-5" />
                </button>
                <template #popper>
                        <div class="flex w-[15rem] flex-col gap-2 p-1">
                                <span class="text-sm font-semibold text-contrast">
                                        {{ formatMessage(messages.title) }}
                                </span>
                                <template v-if="loaded && !failed">
                                        <div class="flex items-center gap-3">
                                                <component :is="weatherIcon" class="size-9 shrink-0" :class="weather.temp < 0 ? 'text-blue' : 'text-orange'" />
                                                <div class="flex flex-col">
                                                        <span class="text-2xl font-bold tabular-nums text-contrast">{{ weather.temp }}°C</span>
                                                        <span class="text-xs text-secondary">{{ weather.label }}</span>
                                                </div>
                                        </div>
                                        <p class="m-0 text-xs text-secondary">
                                                {{ weather.place }} · {{ formatMessage(messages.wind) }} {{ weather.wind }} км/ч ·
                                                {{ weather.isDay ? formatMessage(messages.day) : formatMessage(messages.night) }}
                                        </p>
                                </template>
                                <p v-else-if="failed" class="m-0 text-sm text-red">
                                        {{ formatMessage(messages.fail) }}
                                </p>
                                <p v-else class="m-0 text-sm text-secondary">
                                        {{ formatMessage(messages.loading) }}
                                </p>
                                <Button size="sm" :disabled="loading" @click="() => run(true)">
                                        {{ formatMessage(messages.refresh) }}
                                </Button>
                        </div>
                </template>
        </FloatingMenu>
</template>

<script setup lang="ts">
/**
 * The title-bar weather button: a quiet, blurred chip with the weather
 * icon and the temperature right beside it, living with the sound and
 * speed buttons. Data comes keyless from Open-Meteo; the player's rough
 * place is found by IP, or any city can be asked for through the refresh
 * flow of the AI (the same helper powers its weather tool).
 */
import {
        CloudDrizzleIcon,
        CloudFogIcon,
        CloudIcon,
        CloudLightningIcon,
        CloudRainIcon,
        CloudSnowIcon,
        MoonIcon,
        SunIcon,
} from '@modrinth/assets'
import { Button, defineMessages, FloatingMenu, useVIntl } from '@modrinth/ui'
import { computed, ref } from 'vue'

import { fetchWeather, type WeatherNow } from '@/helpers/portalrinth-widgets'

const { formatMessage } = useVIntl()

const messages = defineMessages({
        title: { id: 'app.weather.title', defaultMessage: 'Погода' },
        wind: { id: 'app.weather.wind', defaultMessage: 'ветер' },
        day: { id: 'app.weather.day', defaultMessage: 'день' },
        night: { id: 'app.weather.night', defaultMessage: 'ночь' },
        loading: { id: 'app.weather.loading', defaultMessage: 'Смотрю в окно…' },
        fail: { id: 'app.weather.fail', defaultMessage: 'Погода не отвечает' },
        refresh: { id: 'app.weather.refresh', defaultMessage: 'Обновить' },
})

const weather = ref<WeatherNow | null>(null)
const loading = ref(false)
const loaded = ref(false)
const failed = ref(false)

const weatherIcon = computed(() => {
        const data = weather.value
        if (!data) return SunIcon
        const code = data.code
        if (code === 0 || code === 1) return data.isDay ? SunIcon : MoonIcon
        if (code === 2 || code === 3) return CloudIcon
        if (code === 45 || code === 48) return CloudFogIcon
        if ((code >= 51 && code <= 57) || (code >= 80 && code <= 82)) return CloudDrizzleIcon
        if ((code >= 61 && code <= 67) || code === 95 || code === 96 || code === 99)
                return code === 95 || code === 96 || code === 99 ? CloudLightningIcon : CloudRainIcon
        if ((code >= 71 && code <= 77) || code === 85 || code === 86) return CloudSnowIcon
        return CloudIcon
})

async function run(force = false) {
        if (loading.value) return
        loading.value = true
        failed.value = false
        try {
                weather.value = await fetchWeather(undefined, force)
                loaded.value = true
        } catch {
                failed.value = true
        } finally {
                loading.value = false
        }
}

function onOpen() {
        if (!loaded.value) void run()
}
</script>

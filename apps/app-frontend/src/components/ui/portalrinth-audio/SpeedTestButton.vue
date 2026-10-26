<template>
        <FloatingMenu placement="bottom-end" panel-class="!p-3" @open="onOpen">
                <IconButton
                        v-tooltip="formatMessage(messages.title)"
                        type="quiet"
                        :color="state === 'running' ? 'brand' : undefined"
                        :label="formatMessage(messages.title)"
                >
                        <GaugeIcon :class="{ 'ai-speed-pulse': state === 'running' }" />
                </IconButton>
                <template #popper>
                        <div class="flex w-[15rem] flex-col gap-2 p-1">
                                <span class="text-sm font-semibold text-contrast">
                                        {{ formatMessage(messages.title) }}
                                </span>
                                <p v-if="state === 'running'" class="m-0 text-sm text-secondary">
                                        {{ formatMessage(messages.running) }}
                                </p>
                                <template v-else-if="state === 'done'">
                                        <div class="flex items-baseline gap-2">
                                                <span class="text-xl font-bold text-contrast">{{ mbpsLabel }}</span>
                                                <span class="text-xs text-secondary">{{ formatMessage(messages.down) }}</span>
                                        </div>
                                        <div class="flex items-baseline gap-2">
                                                <span class="text-lg font-bold text-contrast">{{ pingLabel }}</span>
                                                <span class="text-xs text-secondary">{{ formatMessage(messages.ping) }}</span>
                                        </div>
                                </template>
                                <p v-else-if="state === 'fail'" class="m-0 text-sm text-red">
                                        {{ formatMessage(messages.fail) }}
                                </p>
                                <Button size="sm" :disabled="state === 'running'" @click="runTest">
                                        {{ state === 'done' || state === 'fail'
                                                ? formatMessage(messages.again)
                                                : formatMessage(messages.measure) }}
                                </Button>
                        </div>
                </template>
        </FloatingMenu>
</template>

<script setup lang="ts">
/**
 * The title bar's internet speed test. Lives where the sound button sits;
 * when music is playing it stands right of it. Measures ping and download
 * speed against Cloudflare's speed endpoints - straight through the Tauri
 * HTTP client, so a configured proxy does not skew the numbers.
 */
import { GaugeIcon } from '@modrinth/assets'
import { Button, defineMessages, FloatingMenu, IconButton, useVIntl } from '@modrinth/ui'
import { computed, ref } from 'vue'

import { fetch as tauriFetch } from '@tauri-apps/plugin-http'

const { formatMessage } = useVIntl()

const messages = defineMessages({
        title: { id: 'app.speed.title', defaultMessage: 'Скорость интернета' },
        measure: { id: 'app.speed.measure', defaultMessage: 'Измерить' },
        again: { id: 'app.speed.again', defaultMessage: 'Измерить снова' },
        running: { id: 'app.speed.running', defaultMessage: 'Измеряю…' },
        down: { id: 'app.speed.down', defaultMessage: 'Мбит/с загрузка' },
        ping: { id: 'app.speed.ping', defaultMessage: 'мс пинг' },
        fail: { id: 'app.speed.fail', defaultMessage: 'Не получилось измерить' },
})

const state = ref<'idle' | 'running' | 'done' | 'fail'>('idle')
const mbps = ref(0)
const ping = ref(0)

const mbpsLabel = computed(() => mbps.value.toFixed(1))
const pingLabel = computed(() => String(ping.value))

async function measurePing(): Promise<number> {
        const times: number[] = []
        for (let attempt = 0; attempt < 3; attempt++) {
                const started = performance.now()
                await tauriFetch('https://speed.cloudflare.com/__down?bytes=0', {
                        signal: AbortSignal.timeout(8000),
                })
                times.push(performance.now() - started)
        }
        return Math.round(Math.min(...times))
}

async function runTest() {
        if (state.value === 'running') return
        state.value = 'running'
        try {
                ping.value = await measurePing()
                const bytes = 12_000_000
                const started = performance.now()
                const response = await tauriFetch(`https://speed.cloudflare.com/__down?bytes=${bytes}`, {
                        signal: AbortSignal.timeout(45000),
                })
                if (!response.ok) throw new Error(`HTTP ${response.status}`)
                const buffer = await response.arrayBuffer()
                const seconds = Math.max(0.05, (performance.now() - started) / 1000)
                mbps.value = Math.round(((buffer.byteLength * 8) / seconds / 1_000_000) * 10) / 10
                state.value = 'done'
        } catch {
                state.value = 'fail'
        }
}

function onOpen() {
        if (state.value === 'idle') void runTest()
}
</script>

<style scoped>
.ai-speed-pulse {
        animation: speed-pulse 1.1s ease-in-out infinite;
}

@keyframes speed-pulse {
        0%,
        100% {
                opacity: 0.45;
                transform: scale(0.94);
        }
        50% {
                opacity: 1;
                transform: scale(1.06);
        }
}

@media (prefers-reduced-motion: reduce) {
        .ai-speed-pulse {
                animation: none;
        }
}
</style>

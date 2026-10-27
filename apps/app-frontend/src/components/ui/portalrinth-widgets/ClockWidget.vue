<template>
        <FloatingMenu placement="bottom-center" panel-class="!p-0" @open="onOpen">
                <button
                        v-tooltip="tooltip"
                        class="flex items-center gap-1.5 rounded-xl border-none bg-transparent px-2 py-1 text-sm font-medium text-contrast backdrop-blur transition-colors hover:bg-button-bg"
                >
                        <component :is="icon" class="size-4 shrink-0" :class="iconClass" />
                        <span class="tabular-nums">{{ timeLabel }}</span>
                </button>
                <template #popper>
                        <div class="flex w-[19rem] flex-col gap-3 p-3">
                                <!-- The three faces of the clock: time, timer, stopwatch -->
                                <div class="flex gap-1 rounded-xl bg-surface-4 p-1">
                                        <button
                                                v-for="tabName in ['time', 'timer', 'stopwatch']"
                                                :key="tabName"
                                                class="grow rounded-lg border-0 px-2 py-1 text-xs font-semibold transition-colors"
                                                :class="tab === tabName ? 'bg-brand text-contrast' : 'bg-transparent text-secondary hover:text-contrast'"
                                                @click="tab = tabName"
                                        >
                                                {{ formatMessage(tabLabels[tabName]) }}
                                        </button>
                                </div>

                                <!-- Time: exact local seconds + the world clock around them -->
                                <template v-if="tab === 'time'">
                                        <div class="flex flex-col items-center gap-1 py-2">
                                                <span class="text-4xl font-bold tabular-nums text-contrast">{{ exactTime }}</span>
                                                <span class="text-xs text-secondary">{{ fullDate }}</span>
                                                <span class="flex items-center gap-1 text-xs text-secondary">
                                                        <GlobeIcon class="size-3" />
                                                        {{ timezone }}
                                                </span>
                                        </div>
                                        <div class="flex max-h-40 flex-col gap-0.5 overflow-y-auto">
                                                <div
                                                        v-for="row in world"
                                                        :key="row.zone"
                                                        class="flex items-center justify-between rounded-lg px-2 py-1 text-xs"
                                                        :class="row.zone === timezone ? 'bg-button-bg font-semibold text-contrast' : 'text-secondary'"
                                                >
                                                        <span class="truncate">{{ shortZone(row.zone) }}</span>
                                                        <span class="tabular-nums">{{ row.time }}</span>
                                                </div>
                                        </div>
                                </template>

                                <!-- Timer: countdown with consequences -->
                                <template v-else-if="tab === 'timer'">
                                        <div class="flex flex-col items-center gap-1 py-1">
                                                <span class="text-4xl font-bold tabular-nums" :class="timerFinished ? 'text-orange' : 'text-contrast'">
                                                        {{ timerDisplay }}
                                                </span>
                                                <span v-if="timerNote" class="text-center text-xs text-brand">{{ timerNote }}</span>
                                        </div>
                                        <div class="flex flex-wrap gap-1.5">
                                                <Button v-for="preset in [1, 3, 5, 10, 30, 60]" :key="preset" size="sm" class="!px-2.5" @click="() => pick(preset)">
                                                        {{ preset }} мин
                                                </Button>
                                        </div>
                                        <div class="flex gap-1.5">
                                                <Button v-if="!timerRunning" class="grow" size="sm" @click="timerStart">
                                                        <PlayIcon class="!size-3.5" />
                                                        Пуск
                                                </Button>
                                                <Button v-else class="grow" size="sm" @click="timerPause">
                                                        <PauseIcon class="!size-3.5" />
                                                        Пауза
                                                </Button>
                                                <Button class="grow" size="sm" type="quiet" @click="timerReset">Сброс</Button>
                                        </div>
                                        <div class="flex flex-col gap-1 rounded-xl bg-surface-4 px-3 py-2">
                                                <span class="text-xs font-semibold text-contrast">По окончании:</span>
                                                <div class="flex gap-1">
                                                        <button
                                                                v-for="option in actionOptions"
                                                                :key="option.id"
                                                                class="grow rounded-lg border-0 px-2 py-1 text-xs transition-colors"
                                                                :class="binding.action === option.id ? 'bg-brand text-contrast' : 'bg-surface-5 text-secondary hover:text-contrast'"
                                                                @click="() => pickAction(option.id)"
                                                        >
                                                                {{ option.label }}
                                                        </button>
                                                </div>
                                                <template v-if="binding.action !== 'none'">
                                                        <select
                                                                class="w-full rounded-lg border-0 bg-surface-5 px-2 py-1 text-xs text-contrast"
                                                                :value="binding.instanceId"
                                                                @change="pickInstance(($event.target as HTMLSelectElement).value)"
                                                        >
                                                                <option value="">— выбери сборку —</option>
                                                                <option v-for="instance in instances" :key="instance.id" :value="instance.id">
                                                                        {{ instance.name }}
                                                                </option>
                                                        </select>
                                                        <span class="text-[11px] text-secondary">
                                                                {{ binding.action === 'close-game' ? 'Игра закроется сама, когда время выйдет.' : 'Игра запустится сама, когда время выйдет.' }}
                                                        </span>
                                                </template>
                                        </div>
                                </template>

                                <!-- Stopwatch: laps and all -->
                                <template v-else>
                                        <div class="flex flex-col items-center gap-1 py-2">
                                                <span class="text-4xl font-bold tabular-nums text-contrast">{{ stopwatchDisplay }}</span>
                                        </div>
                                        <div class="flex gap-1.5">
                                                <Button v-if="!stopwatchRunning" class="grow" size="sm" @click="stopwatchStart">
                                                        <PlayIcon class="!size-3.5" />
                                                        Пуск
                                                </Button>
                                                <Button v-else class="grow" size="sm" @click="stopwatchPause">
                                                        <PauseIcon class="!size-3.5" />
                                                        Пауза
                                                </Button>
                                                <Button size="sm" :disabled="!stopwatchRunning" @click="stopwatchLap">Круг</Button>
                                                <Button class="grow" size="sm" type="quiet" @click="stopwatchReset">Сброс</Button>
                                        </div>
                                        <div v-if="laps.length > 0" class="flex max-h-40 flex-col gap-0.5 overflow-y-auto">
                                                <div
                                                        v-for="(lap, index) in laps"
                                                        :key="index"
                                                        class="flex items-center justify-between rounded-lg px-2 py-1 text-xs text-secondary"
                                                >
                                                        <span>Круг {{ laps.length - index }}</span>
                                                        <span class="tabular-nums">{{ formatStopwatch(lap) }}</span>
                                                </div>
                                        </div>
                                </template>
                        </div>
                </template>
        </FloatingMenu>
</template>

<script setup lang="ts">
/**
 * The title-bar clock, standing at the top center the way a desktop clock
 * does. A click opens the time panel: exact local seconds, the world clock,
 * a countdown timer that can close or open a game when it runs out, and a
 * stopwatch with laps.
 */
import { GlobeIcon, MoonIcon, PauseIcon, PlayIcon, SunIcon, SunriseIcon, SunsetIcon } from '@modrinth/assets'
import { Button, defineMessages, FloatingMenu, useVIntl } from '@modrinth/ui'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import {
        exactLocalTime,
        formatStopwatch,
        setTimerBinding,
        setTimerMinutes,
        stopwatchLap,
        stopwatchPause,
        stopwatchReset,
        stopwatchStart,
        systemTimezone,
        timerInstances,
        timerPause,
        timerReset,
        timerStart,
        useStopwatch,
        useTimer,
        worldTimes,
        type TimerAction,
} from '@/helpers/portalrinth-clock'
import { systemTime, timeOfDay } from '@/helpers/portalrinth-widgets'

const { formatMessage } = useVIntl()

const messages = defineMessages({
        time: { id: 'app.clock.time', defaultMessage: 'Время' },
        timer: { id: 'app.clock.timer', defaultMessage: 'Таймер' },
        stopwatch: { id: 'app.clock.stopwatch', defaultMessage: 'Секундомер' },
        none: { id: 'app.clock.action-none', defaultMessage: 'Ничего' },
        closeGame: { id: 'app.clock.action-close', defaultMessage: 'Закрыть игру' },
        openGame: { id: 'app.clock.action-open', defaultMessage: 'Открыть игру' },
})

const now = ref(new Date())
let ticker: ReturnType<typeof setInterval> | undefined

onMounted(() => {
        ticker = setInterval(() => {
                now.value = new Date()
        }, 1000)
})

onBeforeUnmount(() => {
        if (ticker) clearInterval(ticker)
})

const tab = ref<'time' | 'timer' | 'stopwatch'>('time')

const tabLabels = {
        time: { id: 'app.clock.time', defaultMessage: 'Время' },
        timer: { id: 'app.clock.timer', defaultMessage: 'Таймер' },
        stopwatch: { id: 'app.clock.stopwatch', defaultMessage: 'Секундомер' },
} as const

const part = computed(() => timeOfDay(now.value))

const icon = computed(() => {
        if (part.value === 'sunrise') return SunriseIcon
        if (part.value === 'day') return SunIcon
        if (part.value === 'sunset') return SunsetIcon
        return MoonIcon
})

const iconClass = computed(() => (part.value === 'night' ? 'text-secondary' : 'text-orange'))

const timeLabel = computed(() => systemTime(now.value))
const exactTime = computed(() => exactLocalTime(now.value))
const timezone = computed(() => systemTimezone())
const world = computed(() => worldTimes(now.value))
const fullDate = computed(() =>
        now.value.toLocaleString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
)

const tooltip = computed(() => {
        const dayPart: Record<string, string> = {
                sunrise: 'Рассвет',
                day: 'День',
                sunset: 'Закат',
                night: 'Ночь',
        }
        return `${fullDate.value} · ${dayPart[part.value]}`
})

// Timer
const timer = useTimer()
const timerRunning = timer.running
const timerNote = timer.note
const timerFinished = timer.finished
const binding = timer.binding
const instances = ref<{ id: string; name: string }[]>([])
const actionOptions: { id: TimerAction; label: string }[] = [
        { id: 'none', label: formatMessage(messages.none) },
        { id: 'close-game', label: formatMessage(messages.closeGame) },
        { id: 'open-game', label: formatMessage(messages.openGame) },
]

const timerDisplay = computed(() => formatStopwatch(timer.remaining.value))

function pick(minutes: number) {
        setTimerMinutes(minutes)
}

function pickAction(action: TimerAction) {
        setTimerBinding({ action, instanceId: binding.value.instanceId })
}

function pickInstance(instanceId: string) {
        setTimerBinding({ action: binding.value.action, instanceId })
}

// Stopwatch
const stopwatch = useStopwatch()
const stopwatchRunning = stopwatch.running
const laps = stopwatch.laps
const stopwatchDisplay = computed(() => formatStopwatch(stopwatch.elapsed.value))

function onOpen() {
        if (instances.value.length === 0) {
                void timerInstances().then((list) => {
                        instances.value = list
                })
        }
}
</script>

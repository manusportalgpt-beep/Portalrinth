/**
 * The clock popover's machinery: a stopwatch, a countdown timer with
 * consequences (close the game, open one), and nothing that touches the
 * network. Everything is a module singleton - the popover closes and opens
 * freely, the seconds keep running. The tick only exists while something
 * actually runs, so an idle clock costs nothing.
 */
import { ref } from 'vue'

import { kill, list, run } from '@/helpers/instance'

// ---- Stopwatch -------------------------------------------------------------

const stopwatchRunning = ref(false)
const stopwatchElapsed = ref(0)
const stopwatchLaps = ref<number[]>([])

let stopwatchStartedAt = 0
let stopwatchTicker: ReturnType<typeof setInterval> | undefined

function stopwatchTick(): void {
        stopwatchElapsed.value = Date.now() - stopwatchStartedAt
}

export function useStopwatch() {
        return {
                running: stopwatchRunning,
                elapsed: stopwatchElapsed,
                laps: stopwatchLaps,
        }
}

export function stopwatchStart(): void {
        if (stopwatchRunning.value) return
        stopwatchStartedAt = Date.now() - stopwatchElapsed.value
        stopwatchRunning.value = true
        if (!stopwatchTicker) stopwatchTicker = setInterval(stopwatchTick, 50)
}

export function stopwatchPause(): void {
        if (!stopwatchRunning.value) return
        stopwatchTick()
        stopwatchRunning.value = false
        if (stopwatchTicker) {
                clearInterval(stopwatchTicker)
                stopwatchTicker = undefined
        }
}

export function stopwatchReset(): void {
        stopwatchPause()
        stopwatchElapsed.value = 0
        stopwatchLaps.value = []
}

export function stopwatchLap(): void {
        if (!stopwatchRunning.value) return
        stopwatchTick()
        stopwatchLaps.value = [...stopwatchLaps.value, stopwatchElapsed.value]
}

/** MM:SS.d or H:MM:SS.d, the way a stopwatch reads. */
export function formatStopwatch(ms: number): string {
        const total = Math.max(0, Math.floor(ms))
        const hours = Math.floor(total / 3_600_000)
        const minutes = Math.floor((total % 3_600_000) / 60_000)
        const seconds = Math.floor((total % 60_000) / 1000)
        const tenth = Math.floor((total % 1000) / 100)
        const two = (value: number) => String(value).padStart(2, '0')
        return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}.${tenth}` : `${two(minutes)}:${two(seconds)}.${tenth}`
}

// ---- Timer -----------------------------------------------------------------

export type TimerAction = 'none' | 'close-game' | 'open-game'

export interface TimerBinding {
        action: TimerAction
        /** The build the action lands on; empty means "ask me never, use last chosen". */
        instanceId: string
}

const BINDINGS_KEY = 'portalrinth-timer-bindings'

function readBinding(): TimerBinding {
        try {
                const raw = localStorage.getItem(BINDINGS_KEY)
                if (raw) {
                        const parsed = JSON.parse(raw) as TimerBinding
                        if (parsed && ['none', 'close-game', 'open-game'].includes(parsed.action)) {
                                return { action: parsed.action, instanceId: typeof parsed.instanceId === 'string' ? parsed.instanceId : '' }
                        }
                }
        } catch {
                /* broken settings are the same as none */
        }
        return { action: 'none', instanceId: '' }
}

const timerDuration = ref(5 * 60 * 1000)
const timerRemaining = ref(timerDuration.value)
const timerRunning = ref(false)
const timerBinding = ref<TimerBinding>(readBinding())
const timerNote = ref('')
const timerFinished = ref(false)

let timerDeadline = 0
let timerTicker: ReturnType<typeof setInterval> | undefined

export function useTimer() {
        return {
                duration: timerDuration,
                remaining: timerRemaining,
                running: timerRunning,
                binding: timerBinding,
                note: timerNote,
                finished: timerFinished,
        }
}

export function setTimerBinding(binding: TimerBinding): void {
        timerBinding.value = binding
        try {
                localStorage.setItem(BINDINGS_KEY, JSON.stringify(binding))
        } catch {
                /* the choice lives until the restart */
        }
}

export function setTimerMinutes(minutes: number): void {
        const ms = Math.max(10_000, Math.min(24 * 60 * 60 * 1000, Math.round(minutes * 60_000)))
        timerDuration.value = ms
        if (!timerRunning.value) timerRemaining.value = ms
}

export function timerStart(): void {
        if (timerRunning.value) return
        if (timerRemaining.value <= 0) timerRemaining.value = timerDuration.value
        timerDeadline = Date.now() + timerRemaining.value
        timerRunning.value = true
        timerFinished.value = false
        timerNote.value = ''
        if (!timerTicker) timerTicker = setInterval(timerTick, 200)
}

export function timerPause(): void {
        if (!timerRunning.value) return
        timerRemaining.value = Math.max(0, timerDeadline - Date.now())
        timerRunning.value = false
        if (timerTicker) {
                clearInterval(timerTicker)
                timerTicker = undefined
        }
}

export function timerReset(): void {
        timerPause()
        timerRemaining.value = timerDuration.value
        timerFinished.value = false
        timerNote.value = ''
}

async function runTimerAction(): Promise<void> {
        const binding = timerBinding.value
        if (binding.action === 'none') return
        try {
                if (binding.action === 'close-game') {
                        if (binding.instanceId) {
                                await kill(binding.instanceId)
                                timerNote.value = 'Игра закрыта по таймеру'
                        } else {
                                timerNote.value = 'Сборка для закрытия не выбрана'
                        }
                } else if (binding.action === 'open-game') {
                        if (binding.instanceId) {
                                await run(binding.instanceId)
                                timerNote.value = 'Игра запущена по таймеру'
                        } else {
                                timerNote.value = 'Сборка для запуска не выбрана'
                        }
                }
        } catch (error) {
                timerNote.value = `Не вышло: ${String(error).slice(0, 120)}`
        }
}

function timerTick(): void {
        const left = timerDeadline - Date.now()
        if (left > 0) {
                timerRemaining.value = left
                return
        }
        timerRemaining.value = 0
        timerPause()
        timerFinished.value = true
        void runTimerAction()
}

/** Lists builds for the binding chooser; empty when the folder is closed. */
export async function timerInstances(): Promise<{ id: string; name: string }[]> {
        try {
                const all = await list()
                return all.map((instance) => ({ id: instance.id, name: instance.name }))
        } catch {
                return []
        }
}

// ---- World clock -----------------------------------------------------------

/** The system's own IANA region, e.g. "Europe/Moscow". */
export function systemTimezone(): string {
        try {
                return Intl.DateTimeFormat().resolvedOptions().timeZone || ''
        } catch {
                return ''
        }
}

const WORLD_ZONES = [
        'Europe/Moscow',
        'Europe/Kaliningrad',
        'Europe/Kyiv',
        'Europe/Minsk',
        'Asia/Almaty',
        'Asia/Yekaterinburg',
        'Asia/Novosibirsk',
        'Asia/Vladivostok',
        'Europe/London',
        'Europe/Berlin',
        'America/New_York',
        'UTC',
]

/** A short world clock: the own region first, then a spread of zones. */
export function worldTimes(now: Date): { zone: string; time: string }[] {
        const own = systemTimezone()
        const zones = [own, ...WORLD_ZONES.filter((zone) => zone !== own)].filter(Boolean)
        const rows: { zone: string; time: string }[] = []
        for (const zone of zones) {
                try {
                        rows.push({
                                zone,
                                time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: zone }),
                        })
                } catch {
                        /* an unknown zone just does not get a row */
                }
        }
        return rows
}

/** Exact time of the own region, seconds included. */
export function exactLocalTime(now: Date): string {
        return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

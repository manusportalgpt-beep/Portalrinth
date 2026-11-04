<template>
        <Transition name="portalus-chip">
                <button
                        v-if="visible"
                        v-tooltip="hint"
                        type="button"
                        class="portalus-chip"
                        :style="{ left: `${anchorLeft}px` }"
                        aria-label="Порталус"
                        @click="openChat"
                >
                        <span class="portalus-chip-orb" :class="{ 'portalus-chip-orb--busy': agentBusy }">
                                <MessagesSquareIcon class="size-3.5" />
                        </span>
                        <span v-if="aiDockDone" class="portalus-chip-tick">
                                <CheckCircleIcon class="size-3" />
                        </span>
                        <span v-else-if="aiDockUnread" class="portalus-chip-dot" />
                </button>
        </Transition>
</template>

<script setup lang="ts">
/**
 * Portalus, back at the top by the title-bar clock - but now as one small
 * icon instead of a whole dock platform. While he works, a ring spins
 * around the orb; when a run is over a green tick lights up; fresh news
 * puts a dot on top. Hovering tells in one line what he is up to, a click
 * opens his chat. On the chat page the icon hides - the talk is already
 * in full view there.
 */
import { CheckCircleIcon, MessagesSquareIcon } from '@modrinth/assets'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
        agentBusy,
        agentNavNotice,
        agentPhase,
        agentTurn,
        aiDockDone,
        aiDockUnread,
} from '@/helpers/ai-assistant'
import { titlebarClockShift } from '@/helpers/titlebar-clock'

const route = useRoute()
const router = useRouter()
const dismissed = ref(false)
/** One showing per action: while Portalus works the icon is up, a click that
 * opens the chat puts it away, and only the next run brings it back. */
const visible = computed(
        () =>
                route.path !== '/ai' &&
                !dismissed.value &&
                (agentBusy.value || aiDockDone.value || agentNavNotice.value !== null || aiDockUnread.value),
)

const phaseLabel = computed(() =>
        agentPhase.value === 'working' ? 'Работаю' : 'Думаю',
)

const runningStep = computed(() =>
        [...agentTurn.value.steps].reverse().find((step) => step.status === 'running'),
)

const TOOL_LABELS: Record<string, string> = {
        web_search: 'ищу в интернете',
        web_fetch: 'читаю страницу',
        fandom: 'читаю вики',
        launcher_search_mods: 'ищу моды',
        launcher_install: 'ставлю',
        install_modpack: 'ставлю модпак',
        create_instance: 'создаю сборку',
        launch_instance: 'запускаю игру',
        lan_publish: 'открываю мир',
        update_mods: 'обновляю моды',
        navigate: 'открываю экран',
        gen_image: 'рисую',
        sandbox_bash: 'выполняю команду',
        sandbox_write: 'пишу файл',
        instance_info: 'смотрю сборку',
        instance_logs: 'читаю лог краша',
        instance_read: 'читаю файл',
        instance_files: 'смотрю файлы сборки',
        instance_worlds: 'смотрю миры',
        sandbox_read: 'читаю файл',
        sandbox_list: 'смотрю файлы',
        sandbox_download: 'скачиваю файл',
        sandbox_show: 'показываю картинку',
        sandbox_pack: 'упаковываю архив',
        sandbox_unpack: 'распаковываю архив',
        sandbox_delete: 'удаляю',
        find_wallpaper: 'ищу обои',
        launcher_set_accent: 'меняю акцент',
        launcher_set_gradient: 'меняю градиент',
        launcher_set_background: 'ставлю фон',
        launcher_set_theme: 'меняю тему',
        launcher_compile_java: 'компилирую мод',
        open_page: 'открываю статью',
        get_page: 'смотрю экран',
        list_instances: 'смотрю сборки',
        instance_search: 'ищу сборки',
        open_instance: 'открываю сборку',
        show_poll: 'спрашиваю',
        task_start: 'составляю план',
        mod_toggle: 'переключаю мод',
        mod_update: 'обновляю моды',
        launcher_gradle_build: 'собираю мод',
}

function toolLabel(tool: string): string {
        return TOOL_LABELS[tool] ?? tool.replace(/_/g, ' ')
}

/** One-line hint on hover: what he is doing, or the last news. */
const hint = computed(() => {
        if (agentBusy.value) {
                const step = runningStep.value
                if (step?.kind === 'tool' && step.tool)
                        return `Порталус · ${phaseLabel.value} · ${toolLabel(step.tool)}`
                return `Порталус · ${phaseLabel.value}…`
        }
        const news = agentNavNotice.value?.text
        if (news) return `Порталус · ${news.split('\n')[0].slice(0, 120)}`
        if (aiDockDone.value) return 'Порталус · готово — можно продолжать'
        return 'Порталус'
})

// News marks the icon unread so the player knows Portalus said something.
watch(
        () => agentNavNotice.value?.at,
        (at) => {
                if (!at) return
                dismissed.value = false
                aiDockUnread.value = true
        },
)
watch(agentBusy, (busy, was) => {
        if (busy) {
                aiDockDone.value = false
                dismissed.value = false
        } else if (was) {
                aiDockDone.value = true
                aiDockUnread.value = true
        }
})

function openChat() {
        agentNavNotice.value = null
        aiDockUnread.value = false
        // The talk has been handed over to the chat: the icon goes to sleep
        // until the next finished action.
        dismissed.value = true
        void router.push('/ai')
}

// Sits just left of the title-bar clock, so the time stays readable; the
// CSS shifts the whole icon back by its own width (translateX(-100%)).
const anchorLeft = ref(0)
function place() {
        const clock = document.querySelector<HTMLElement>('[data-titlebar-clock]')
        if (!clock) {
                anchorLeft.value = window.innerWidth / 2 + 64
                return
        }
        // The clock eases to its new place (a 0.25s transform), so its rect is
        // mid-flight while a long breadcrumb trail settles - reading it is how
        // Portalus used to end up sitting on the time. Its centre, though, is
        // exactly the title bar's centre plus the shift the breadcrumbs asked
        // for: compute from that instead of chasing a moving target. Only the
        // width is taken from the clock, and a transform never changes it.
        const clockWidth = clock.getBoundingClientRect().width
        if (clockWidth <= 0) {
                anchorLeft.value = window.innerWidth / 2 + 64
                return
        }
        const bar = clock.closest<HTMLElement>('.app-title-bar')
        const barRect = bar?.getBoundingClientRect()
        const center =
                barRect && barRect.width > 0 ? barRect.left + barRect.width / 2 : window.innerWidth / 2
        anchorLeft.value = center + titlebarClockShift.value - clockWidth / 2 - 8
}
let observer: ResizeObserver | undefined
onMounted(() => {
        place()
        window.addEventListener('resize', place)
        const clock = document.querySelector<HTMLElement>('[data-titlebar-clock]')
        if (clock && 'ResizeObserver' in window) {
                observer = new ResizeObserver(place)
                observer.observe(clock)
        }
})
watch(visible, (shown) => {
        if (shown) void nextTick(place)
})

// The clock steps aside for a long breadcrumb trail; Portalus rides along.
// The shift is the source of truth, so a plain re-place is enough - no
// waiting for the clock's own transition to settle.
watch(titlebarClockShift, () => {
        place()
})
onBeforeUnmount(() => {
        window.removeEventListener('resize', place)
        observer?.disconnect()
})
</script>

<style scoped>
.portalus-chip {
        position: fixed;
        top: 0.45rem;
        z-index: 80;
        pointer-events: auto;
        transform: translateX(-100%);
        display: grid;
        place-items: center;
        width: 1.75rem;
        height: 1.75rem;
        padding: 0;
        border: none;
        border-radius: 999px;
        background: transparent;
        cursor: pointer;
        transition:
                background-color 0.18s ease,
                transform 0.18s ease;
}

.portalus-chip:hover {
        background: color-mix(in srgb, var(--color-contrast) 8%, transparent);
}

.portalus-chip-orb {
        position: relative;
        display: grid;
        place-items: center;
        width: 1.35rem;
        height: 1.35rem;
        border-radius: 999px;
        color: var(--color-brand);
        background: color-mix(in srgb, var(--color-brand) 16%, transparent);
}

.portalus-chip-orb--busy::after {
        content: '';
        position: absolute;
        inset: -3px;
        border-radius: inherit;
        border: 2px solid transparent;
        border-top-color: var(--color-brand);
        animation: portalus-chip-spin 0.9s linear infinite;
}

.portalus-chip-tick {
        position: absolute;
        right: -0.2rem;
        bottom: -0.2rem;
        display: grid;
        place-items: center;
        width: 0.85rem;
        height: 0.85rem;
        border-radius: 999px;
        background: var(--color-raised-bg);
        color: var(--color-green);
}

.portalus-chip-dot {
        position: absolute;
        right: -0.05rem;
        top: -0.05rem;
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 999px;
        background: var(--color-brand);
}

@keyframes portalus-chip-spin {
        to {
                transform: rotate(360deg);
        }
}

.portalus-chip-enter-active,
.portalus-chip-leave-active {
        transition:
                opacity 0.2s ease,
                translate 0.2s ease;
}

.portalus-chip-enter-from,
.portalus-chip-leave-to {
        opacity: 0;
        translate: 0 -0.4rem;
}
</style>

<template>
        <span class="install-progress-anchor" @mouseenter="hover = true" @mouseleave="hover = false">
                <slot />
                <Transition name="install-progress-pop">
                        <div v-if="hover && panelShown" class="install-progress-pop" role="status">
                                <div class="install-progress-head">
                                        <span class="install-progress-title">{{ title }}</span>
                                        <span class="install-progress-percent">{{ percentLabel }}</span>
                                </div>
                                <div class="install-progress-track">
                                        <div
                                                class="install-progress-fill"
                                                :class="{ 'install-progress-fill--wait': waiting }"
                                                :style="{ width: fillWidth }"
                                        />
                                </div>
                                <p class="install-progress-phase">{{ phaseText }}</p>
                        </div>
                </Transition>
        </span>
</template>

<script setup lang="ts">
/**
 * A little panel that appears above the install button on hover while an
 * install runs: the whole-job progress bar in the accent gradient and the
 * percent done (0-100), plus the live phase text. The button itself is tiny
 * and often just says "Installing" - this tells the player how far along
 * the job actually is, without opening the download manager.
 */
import { defineMessages, useVIntl } from '@modrinth/ui'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { createInstallJobProgressTracker } from '@/components/ui/download-manager/install-job-progress'
import { useInstallJobDisplay } from '@/components/ui/download-manager/use-install-job-display'
import {
        install_job_list,
        type InstallJobSnapshot,
} from '@/helpers/install'
import { injectAppEvents } from '@/providers/app-events'

const { formatMessage } = useVIntl()

const messages = defineMessages({
        waiting: {
                id: 'portalrinth.install.progress.waiting',
                defaultMessage: 'Preparing…',
        },
        installing: {
                id: 'portalrinth.install.progress.installing',
                defaultMessage: 'Installing content…',
        },
})

const props = defineProps<{
        /** The button's own installing state: shows the panel even before the job reports in. */
        active?: boolean
}>()

const hover = ref(false)
const events = injectAppEvents()

const jobs = ref(new Map<string, InstallJobSnapshot>())
const tracker = createInstallJobProgressTracker()
const display = useInstallJobDisplay()

function track(job: InstallJobSnapshot) {
        tracker.update(job)
        if (
                job.status === 'succeeded' ||
                job.status === 'failed' ||
                job.status === 'interrupted' ||
                job.status === 'canceled'
        ) {
                jobs.value.delete(job.job_id)
        } else {
                jobs.value.set(job.job_id, job)
        }
}

const activeJob = computed(() => {
        let newest: InstallJobSnapshot | null = null
        for (const job of jobs.value.values()) {
                if (!newest || job.created > newest.created) newest = job
        }
        return newest
})

const panelShown = computed(() => !!props.active || !!activeJob.value)
const job = computed(() => activeJob.value)
const overall = computed(() => (job.value ? tracker.get(job.value.job_id) : 0))
const waiting = computed(() => !job.value || overall.value <= 0.001)

const percent = computed(() => {
        const value = Math.round(overall.value * 100)
        return Math.max(0, Math.min(99, value))
})

const percentLabel = computed(() => `${percent.value}%`)
const fillWidth = computed(() => (waiting.value ? '100%' : `${percent.value}%`))
const title = computed(() =>
        job.value ? display.getTitle(job.value) : formatMessage(messages.installing),
)
const phaseText = computed(() =>
        job.value ? display.getText(job.value) : formatMessage(messages.waiting),
)

let unlisten: (() => void) | undefined

onMounted(async () => {
        unlisten = events.on('install_job', track)
        try {
                const list = await install_job_list(false)
                for (const item of list) track(item)
        } catch {
                /* the panel is cosmetic - a failed listing just means no progress shown */
        }
})

onBeforeUnmount(() => {
        unlisten?.()
})
</script>

<style scoped>
.install-progress-anchor {
        position: relative;
        display: inline-flex;
}

.install-progress-pop {
        position: absolute;
        bottom: calc(100% + 0.6rem);
        left: 50%;
        transform: translateX(-50%);
        z-index: 60;
        width: max-content;
        max-width: min(20rem, calc(100vw - 3rem));
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        padding: 0.65rem 0.8rem 0.6rem;
        border-radius: 1rem;
        border: 1px solid color-mix(in srgb, var(--color-contrast) 14%, transparent);
        background: color-mix(in srgb, var(--color-raised-bg) 88%, transparent);
        backdrop-filter: blur(14px) saturate(1.2);
        -webkit-backdrop-filter: blur(14px) saturate(1.2);
        box-shadow:
                0 10px 28px rgb(0 0 0 / 30%),
                inset 0 1px 0 rgb(255 255 255 / 6%);
        pointer-events: none;
}

.install-progress-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 1rem;
        min-width: 0;
}

.install-progress-title {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        font-size: 0.78rem;
        font-weight: 700;
        color: var(--color-contrast);
}

.install-progress-percent {
        flex-shrink: 0;
        font-size: 0.78rem;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        color: var(--color-brand);
}

.install-progress-track {
        height: 0.45rem;
        border-radius: 999px;
        overflow: hidden;
        background: var(--color-button-bg);
}

.install-progress-fill {
        height: 100%;
        border-radius: inherit;
        background: var(--portalrinth-accent-gradient, var(--color-brand));
        transition: width 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.install-progress-fill--wait {
        width: 30% !important;
        animation: install-progress-slide 1.1s ease-in-out infinite;
}

@keyframes install-progress-slide {
        0% {
                margin-left: -30%;
        }
        100% {
                margin-left: 100%;
        }
}

.install-progress-phase {
        margin: 0;
        font-size: 0.7rem;
        color: var(--color-secondary);
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
}

.install-progress-pop-enter-active,
.install-progress-pop-leave-active {
        transition:
                opacity 0.18s ease,
                transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.install-progress-pop-enter-from,
.install-progress-pop-leave-to {
        opacity: 0;
        transform: translateX(-50%) translateY(6px) scale(0.96);
}

@media (prefers-reduced-motion: reduce) {
        .install-progress-fill,
        .install-progress-fill--wait {
                animation: none;
                transition: none;
        }
}
</style>

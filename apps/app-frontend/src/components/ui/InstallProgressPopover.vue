<template>
        <span class="install-progress-anchor" @mouseenter="hover = true" @mouseleave="hover = false">
                <slot />
                <Transition name="install-progress-pop">
                        <div v-if="hover && panelShown" class="install-progress-pop" role="status">
                                <div
                                        class="install-progress-track"
                                        :class="{ 'install-progress-track--wait': waiting }"
                                >
                                        <div class="install-progress-fill" :style="{ width: fillWidth }" />
                                </div>
                                <span v-if="!waiting" class="install-progress-percent">{{ percentLabel }}</span>
                        </div>
                </Transition>
        </span>
</template>

<script setup lang="ts">
/**
 * A quiet strip that appears above the install button on hover while an
 * install runs: one thin bar in the accent gradient and a small percent.
 * No headline, no phase captions - the button next to it already says
 * "Installing", so the panel only answers "how far along".
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { createInstallJobProgressTracker } from '@/components/ui/download-manager/install-job-progress'
import {
        install_job_list,
        type InstallJobSnapshot,
} from '@/helpers/install'
import { injectAppEvents } from '@/providers/app-events'

const props = defineProps<{
        /** The button's own installing state: shows the bar even before the job reports in. */
        active?: boolean
        /** Count only jobs for this project (a search card), not every install in the app. */
        projectId?: string
}>()

const hover = ref(false)
const events = injectAppEvents()

const jobs = ref(new Map<string, InstallJobSnapshot>())
const tracker = createInstallJobProgressTracker()

function track(job: InstallJobSnapshot) {
        if (props.projectId) {
                const details = job.details
                if (details.type !== 'modpack' || details.project_id !== props.projectId) return
        }
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

let unlisten: (() => void) | undefined

onMounted(async () => {
        unlisten = events.on('install_job', track)
        try {
                const list = await install_job_list(false)
                for (const item of list) track(item)
        } catch {
                /* the strip is cosmetic - a failed listing just means no progress shown */
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
        /* Opens downward: the button sits right under the title bar, and a
           panel opening upward is clipped away by the viewport's top edge. */
        top: calc(100% + 0.5rem);
        left: 50%;
        transform: translateX(-50%);
        z-index: 60;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        width: 11rem;
        padding: 0.5rem 0.65rem;
        border-radius: 0.8rem;
        border: 1px solid color-mix(in srgb, var(--color-contrast) 10%, transparent);
        background: color-mix(in srgb, var(--color-raised-bg) 90%, transparent);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        box-shadow: 0 6px 18px rgb(0 0 0 / 22%);
        pointer-events: none;
}

.install-progress-track {
        flex: 1;
        height: 0.35rem;
        border-radius: 999px;
        overflow: hidden;
        background: var(--color-button-bg);
}

.install-progress-fill {
        height: 100%;
        border-radius: inherit;
        background: var(--portalrinth-accent-gradient, var(--color-brand));
        transition: width 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.install-progress-track--wait .install-progress-fill {
        width: 35% !important;
        animation: install-progress-slide 1.3s ease-in-out infinite;
}

@keyframes install-progress-slide {
        0% {
                margin-left: -35%;
        }
        100% {
                margin-left: 100%;
        }
}

.install-progress-percent {
        flex-shrink: 0;
        font-size: 0.72rem;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        color: var(--color-secondary);
}

.install-progress-pop-enter-active,
.install-progress-pop-leave-active {
        transition:
                opacity 0.15s ease,
                transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.install-progress-pop-enter-from,
.install-progress-pop-leave-to {
        opacity: 0;
        transform: translateX(-50%) translateY(-4px) scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
        .install-progress-fill,
        .install-progress-track--wait .install-progress-fill {
                animation: none;
                transition: none;
        }
}
</style>

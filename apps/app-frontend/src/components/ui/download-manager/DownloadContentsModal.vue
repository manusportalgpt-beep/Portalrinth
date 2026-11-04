<script setup lang="ts">
import {
        CalendarIcon,
        ChevronDownIcon,
        DownloadIcon,
        ExternalIcon,
        EyeIcon,
        HeartIcon,
        XIcon,
} from '@modrinth/assets'
import {
        Avatar,
        Collapsible,
        defineMessages,
        useFormatNumber,
        useVIntl,
} from '@modrinth/ui'
import { computed, reactive, ref, watch } from 'vue'

import ModalWrapper from '@/components/ui/modal/ModalWrapper.vue'

import { type ContentEntryMeta,entryMeta } from './contents-meta'
import type { DownloadManagerJob } from './use-download-manager'

const props = defineProps<{ job: DownloadManagerJob }>()

const { formatMessage, locale } = useVIntl()
const formatNumber = useFormatNumber()
const dateFormat = computed(
        () => new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'short', year: 'numeric' }),
)

const messages = defineMessages({
        title: { id: 'app.download-manager.contents.title', defaultMessage: 'What is being downloaded' },
        current: { id: 'app.download-manager.contents.current', defaultMessage: 'Downloading now' },
        loaded: { id: 'app.download-manager.contents.loaded', defaultMessage: 'Downloaded' },
        pending: { id: 'app.download-manager.contents.pending', defaultMessage: 'To be downloaded' },
        preparing: { id: 'app.download-manager.contents.preparing', defaultMessage: 'Preparing…' },
        failure: { id: 'app.download-manager.contents.failure', defaultMessage: 'Failed' },
        all: { id: 'app.download-manager.contents.kind.all', defaultMessage: 'All' },
        mod: { id: 'app.download-manager.contents.kind.mod', defaultMessage: 'Mods' },
        resourcePack: {
                id: 'app.download-manager.contents.kind.resource_pack',
                defaultMessage: 'Resource packs',
        },
        shader: { id: 'app.download-manager.contents.kind.shader', defaultMessage: 'Shaders' },
        dataPack: { id: 'app.download-manager.contents.kind.data_pack', defaultMessage: 'Data packs' },
        likes: { id: 'app.download-manager.contents.likes', defaultMessage: 'Likes' },
        downloads: { id: 'app.download-manager.contents.downloads', defaultMessage: 'Downloads' },
        updated: { id: 'app.download-manager.contents.updated', defaultMessage: 'Last updated' },
        openPage: { id: 'app.download-manager.contents.open-page', defaultMessage: 'Open the project page' },
})

const modal = ref()
const kindFilter = ref<'all' | 'mod' | 'resource_pack' | 'shader' | 'data_pack'>('all')
const collapsed = ref(new Set<string>())
const metas = reactive<Record<string, ContentEntryMeta | null>>({})

function show() {
        kindFilter.value = 'all'
        modal.value?.show()
}

defineExpose({ show })

const contents = computed(() => props.job.contents ?? null)
const entries = computed(() => contents.value?.entries ?? [])
const doneSet = computed(() => new Set(contents.value?.done ?? []))
const failedSet = computed(() => new Set(contents.value?.failed ?? []))
const activeSet = computed(() => new Set(contents.value?.active ?? []))

const filtered = computed(() =>
        entries.value.filter(
                (entry) => kindFilter.value === 'all' || entry.kind === kindFilter.value,
        ),
)
const loadedEntries = computed(() => filtered.value.filter((entry) => doneSet.value.has(entry.path)))
const failedEntries = computed(() => filtered.value.filter((entry) => failedSet.value.has(entry.path)))
const pendingEntries = computed(() =>
        filtered.value.filter(
                (entry) => !doneSet.value.has(entry.path) && !failedSet.value.has(entry.path),
        ),
)

/** The one file at the top: something in flight, or the next one waiting. */
const currentEntry = computed(() => {
        const active = entries.value.find((entry) => activeSet.value.has(entry.path))
        const next = entries.value.find(
                (entry) => !doneSet.value.has(entry.path) && !failedSet.value.has(entry.path),
        )
        return active ?? next ?? null
})

const currentMeta = ref<ContentEntryMeta | null>(null)
watch(
        () => currentEntry.value?.path,
        async () => {
                currentMeta.value = null
                const entry = currentEntry.value
                if (!entry) return
                const known = metas[metaKey(entry)]
                if (known !== undefined) {
                        currentMeta.value = known
                        return
                }
                currentMeta.value = (await entryMeta(entry)) ?? null
                metas[metaKey(entry)] = currentMeta.value
        },
        { immediate: true },
)

const metaKey = (entry: { source: string; id: string; key: string }) => `${entry.source}:${entry.id || entry.key}`

/** Authors, likes and the rest are asked for once the rows are on screen. */
watch(
        [loadedEntries, () => modal.value],
        async ([loaded]) => {
                if (!loaded?.length) return
                for (const entry of loaded) {
                        const key = metaKey(entry)
                        if (metas[key] !== undefined) continue
                        metas[key] = null
                        metas[key] = (await entryMeta(entry)) ?? null
                }
        },
        { immediate: true },
)

function toggleSection(id: string) {
        if (collapsed.value.has(id)) collapsed.value.delete(id)
        else collapsed.value.add(id)
}

function formatDate(value: string | null): string {
        if (!value) return ''
        const date = new Date(value)
        return Number.isNaN(date.getTime()) ? '' : dateFormat.value.format(date)
}
</script>

<template>
        <ModalWrapper ref="modal" :header="formatMessage(messages.title)">
                <div class="contents-modal">
                        <section class="contents-current">
                                <p class="m-0 text-xs font-semibold uppercase tracking-wide text-secondary">
                                        {{ formatMessage(messages.current) }}
                                </p>
                                <div v-if="currentEntry" class="flex items-center gap-2.5">
                                        <Avatar
                                                :src="currentMeta?.iconUrl ?? currentEntry.icon_url ?? undefined"
                                                size="36px"
                                                no-shadow
                                                class="!rounded-xl border border-solid border-surface-5"
                                        />
                                        <div class="min-w-0 flex-1">
                                                <p class="m-0 truncate text-sm font-semibold text-contrast">
                                                        {{ currentMeta?.title || currentEntry.title }}
                                                </p>
                                                <p
                                                        v-if="currentMeta?.author || currentEntry.author"
                                                        class="m-0 truncate text-xs text-secondary"
                                                >
                                                        {{ currentMeta?.author || currentEntry.author }}
                                                </p>
                                        </div>
                                        <EyeIcon class="size-4 shrink-0 text-brand" aria-hidden="true" />
                                </div>
                                <p v-else class="m-0 text-sm font-medium text-secondary">
                                        {{ formatMessage(messages.preparing) }}
                                </p>
                                <div class="contents-bar" role="progressbar" :aria-valuenow="Math.round(job.progress * 100)">
                                        <div class="contents-bar-fill" :style="{ width: `${Math.round(job.progress * 100)}%` }" />
                                </div>
                                <p class="m-0 text-xs font-medium text-secondary tabular-nums">
                                        {{ job.progressLabel || `${Math.round(job.progress * 100)}%` }}
                                </p>
                        </section>

                        <div class="contents-filters">
                                <button
                                        v-for="kind in [
                                                { id: 'all', label: formatMessage(messages.all) },
                                                { id: 'mod', label: formatMessage(messages.mod) },
                                                { id: 'resource_pack', label: formatMessage(messages.resourcePack) },
                                                { id: 'shader', label: formatMessage(messages.shader) },
                                                { id: 'data_pack', label: formatMessage(messages.dataPack) },
                                        ] as const"
                                        :key="kind.id"
                                        type="button"
                                        class="contents-chip"
                                        :class="{ 'contents-chip--on': kindFilter === kind.id }"
                                        @click="kindFilter = kind.id"
                                >
                                        {{ kind.label }}
                                </button>
                        </div>

                        <div class="contents-sections">
                                <section>
                                        <button
                                                type="button"
                                                class="contents-section-head"
                                                :aria-expanded="!collapsed.has('loaded')"
                                                @click="() => toggleSection('loaded')"
                                        >
                                                <ChevronDownIcon
                                                        class="size-4 shrink-0 transition-transform"
                                                        :class="{ '-rotate-90': collapsed.has('loaded') }"
                                                        aria-hidden="true"
                                                />
                                                <span class="font-semibold">{{ formatMessage(messages.loaded) }}</span>
                                                <span class="contents-count">{{ formatNumber(loadedEntries.length) }}</span>
                                        </button>
                                        <Collapsible :collapsed="collapsed.has('loaded')">
                                                <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
                                                        <li
                                                                v-for="entry in loadedEntries"
                                                                :key="`${entry.source}-${entry.key}-${entry.path}`"
                                                                class="contents-row"
                                                        >
                                                                <Avatar
                                                                        :src="metas[metaKey(entry)]?.iconUrl ?? entry.icon_url ?? undefined"
                                                                        size="32px"
                                                                        no-shadow
                                                                        class="!rounded-lg border border-solid border-surface-5"
                                                                />
                                                                <div class="min-w-0 flex-1">
                                                                        <p class="m-0 truncate text-sm font-semibold text-contrast">
                                                                                {{ metas[metaKey(entry)]?.title || entry.title }}
                                                                        </p>
                                                                        <p
                                                                                v-if="metas[metaKey(entry)]?.description"
                                                                                class="m-0 truncate text-xs text-secondary"
                                                                        >
                                                                                {{ metas[metaKey(entry)]?.description }}
                                                                        </p>
                                                                        <div class="flex items-center gap-2 text-xs text-secondary">
                                                                                <span
                                                                                        v-if="metas[metaKey(entry)]?.author"
                                                                                        class="truncate"
                                                                                >
                                                                                        {{ metas[metaKey(entry)]?.author }}
                                                                                </span>
                                                                                <span
                                                                                        v-if="metas[metaKey(entry)]?.likes != null"
                                                                                        v-tooltip="formatMessage(messages.likes)"
                                                                                        class="flex items-center gap-0.5 tabular-nums"
                                                                                >
                                                                                        <HeartIcon class="size-3" aria-hidden="true" />
                                                                                        {{ formatNumber(metas[metaKey(entry)]?.likes ?? 0) }}
                                                                                </span>
                                                                                <span
                                                                                        v-if="metas[metaKey(entry)]?.downloads != null"
                                                                                        v-tooltip="formatMessage(messages.downloads)"
                                                                                        class="flex items-center gap-0.5 tabular-nums"
                                                                                >
                                                                                        <DownloadIcon class="size-3" aria-hidden="true" />
                                                                                        {{ formatNumber(metas[metaKey(entry)]?.downloads ?? 0) }}
                                                                                </span>
                                                                                <span
                                                                                        v-if="formatDate(metas[metaKey(entry)]?.updated ?? null)"
                                                                                        v-tooltip="formatMessage(messages.updated)"
                                                                                        class="flex items-center gap-0.5 tabular-nums"
                                                                                >
                                                                                        <CalendarIcon class="size-3" aria-hidden="true" />
                                                                                        {{ formatDate(metas[metaKey(entry)]?.updated ?? null) }}
                                                                                </span>
                                                                        </div>
                                                                </div>
                                                                <a
                                                                        v-if="metas[metaKey(entry)]?.url"
                                                                        v-tooltip="formatMessage(messages.openPage)"
                                                                        :href="metas[metaKey(entry)]?.url ?? undefined"
                                                                        class="contents-link"
                                                                        target="_blank"
                                                                        rel="noopener"
                                                                        @click.stop
                                                                >
                                                                        <ExternalIcon class="size-3.5" aria-hidden="true" />
                                                                </a>
                                                        </li>
                                                        <li
                                                                v-for="entry in failedEntries"
                                                                :key="`f-${entry.source}-${entry.key}-${entry.path}`"
                                                                class="contents-row contents-row--failed"
                                                        >
                                                                <Avatar
                                                                        :src="entry.icon_url ?? undefined"
                                                                        size="32px"
                                                                        no-shadow
                                                                        class="!rounded-lg border border-solid border-surface-5"
                                                                />
                                                                <div class="min-w-0 flex-1">
                                                                        <p class="m-0 truncate text-sm font-semibold text-contrast">
                                                                                {{ entry.title }}
                                                                        </p>
                                                                        <p class="m-0 text-xs text-red">
                                                                                {{ formatMessage(messages.failure) }}
                                                                        </p>
                                                                </div>
                                                                <XIcon class="size-4 shrink-0 text-red" aria-hidden="true" />
                                                        </li>
                                                </ul>
                                        </Collapsible>
                                </section>

                                <section>
                                        <button
                                                type="button"
                                                class="contents-section-head"
                                                :aria-expanded="!collapsed.has('pending')"
                                                @click="() => toggleSection('pending')"
                                        >
                                                <ChevronDownIcon
                                                        class="size-4 shrink-0 transition-transform"
                                                        :class="{ '-rotate-90': collapsed.has('pending') }"
                                                        aria-hidden="true"
                                                />
                                                <span class="font-semibold">{{ formatMessage(messages.pending) }}</span>
                                                <span class="contents-count">{{ formatNumber(pendingEntries.length) }}</span>
                                        </button>
                                        <Collapsible :collapsed="collapsed.has('pending')">
                                                <ul class="m-0 flex list-none flex-col gap-1 p-0">
                                                        <li
                                                                v-for="entry in pendingEntries"
                                                                :key="`p-${entry.source}-${entry.key}-${entry.path}`"
                                                                class="contents-row contents-row--pending"
                                                        >
                                                                <Avatar
                                                                        :src="entry.icon_url ?? undefined"
                                                                        size="32px"
                                                                        no-shadow
                                                                        class="!rounded-lg border border-solid border-surface-5"
                                                                />
                                                                <div class="min-w-0 flex-1">
                                                                        <p class="m-0 truncate text-sm font-medium text-secondary">
                                                                                {{ entry.title }}
                                                                        </p>
                                                                        <p v-if="entry.author" class="m-0 truncate text-xs text-secondary">
                                                                                {{ entry.author }}
                                                                        </p>
                                                                </div>
                                                                <span
                                                                        v-if="activeSet.has(entry.path)"
                                                                        class="contents-pulse"
                                                                        aria-hidden="true"
                                                                />
                                                        </li>
                                                </ul>
                                        </Collapsible>
                                </section>
                        </div>
                </div>
        </ModalWrapper>
</template>

<style scoped>
.contents-modal {
        display: flex;
        flex-direction: column;
        gap: 0.9rem;
        max-height: min(70vh, 42rem);
}

.contents-current {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 0.75rem;
        border-radius: 1rem;
        background: var(--surface-2);
}

.contents-bar {
        position: relative;
        height: 0.5rem;
        overflow: hidden;
        border-radius: 999px;
        background: var(--surface-5);
}

.contents-bar-fill {
        height: 100%;
        border-radius: 999px;
        background: var(--portalrinth-accent-gradient, var(--color-brand));
        background-size: 200% 100%;
        animation: contents-bar-flow 2.2s ease-in-out infinite;
        transition: width 0.4s ease;
}

@keyframes contents-bar-flow {
        0%,
        100% {
                background-position: 0% 50%;
        }
        50% {
                background-position: 100% 50%;
        }
}

.contents-filters {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
}

.contents-chip {
        cursor: pointer;
        border: 1px solid var(--surface-5);
        border-radius: 999px;
        padding: 0.25rem 0.75rem;
        background: transparent;
        color: var(--color-primary);
        font-size: 0.8rem;
        font-weight: 500;
        transition:
                background-color 0.15s ease,
                color 0.15s ease,
                border-color 0.15s ease;
}

.contents-chip:hover {
        background: var(--surface-3);
}

.contents-chip--on {
        border-color: transparent;
        background: var(--color-brand-highlight);
        color: var(--color-brand);
}

.contents-sections {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        overflow-y: auto;
        min-height: 0;
        padding-right: 0.25rem;
}

.contents-section-head {
        display: flex;
        width: 100%;
        align-items: center;
        gap: 0.4rem;
        border: none;
        background: transparent;
        color: var(--color-contrast);
        font-size: 0.85rem;
        padding: 0.25rem 0.25rem;
        cursor: pointer;
        text-align: left;
}

.contents-count {
        min-width: 1.4rem;
        border-radius: 999px;
        background: var(--surface-4);
        color: var(--color-secondary);
        font-size: 0.72rem;
        font-weight: 600;
        text-align: center;
        padding: 0.05rem 0.4rem;
}

.contents-row {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        padding: 0.4rem 0.5rem;
        border-radius: 0.75rem;
}

.contents-row:hover {
        background: var(--surface-2);
}

.contents-row--pending {
        opacity: 0.55;
}

.contents-row--failed {
        opacity: 0.8;
}

.contents-link {
        display: grid;
        place-items: center;
        color: var(--color-secondary);
}

.contents-pulse {
        width: 0.55rem;
        height: 0.55rem;
        flex-shrink: 0;
        border-radius: 999px;
        background: var(--color-brand);
        animation: contents-pulse 1.2s ease-in-out infinite;
}

@keyframes contents-pulse {
        0%,
        100% {
                opacity: 0.35;
                transform: scale(0.85);
        }
        50% {
                opacity: 1;
                transform: scale(1.1);
        }
}
</style>

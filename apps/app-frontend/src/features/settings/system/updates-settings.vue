<script setup lang="ts">
/**
 * Settings → Обновления: the release notes of the three family repos -
 * Portalrinth, Noctrinth and Modrinth App - each with a one-click Google
 * translation, plus the launcher's own update: is there a newer release,
 * and a button that downloads its .exe and runs it.
 */
import {
        DownloadIcon,
        ExternalIcon,
        LanguagesIcon,
        PackageIcon,
        RefreshCwIcon,
        RocketIcon,
} from '@modrinth/assets'
import { Button, IconButton, defineMessages, useVIntl } from '@modrinth/ui'
import { onMounted, ref } from 'vue'

import { resolveTarget, translateText } from '@/helpers/portalrinth-translate'
import {
        UPDATE_REPOS,
        downloadAndRunUpdate,
        fetchReleases,
        launcherUpdateInfo,
        type LauncherUpdate,
        type ReleaseNote,
} from '@/helpers/portalrinth-updates'

const { formatMessage, locale } = useVIntl()

const messages = defineMessages({
        title: { id: 'app.settings.updates.title', defaultMessage: 'Обновления' },
        note: {
                id: 'app.settings.updates.note',
                defaultMessage: 'Свежие логи обновлений Modrinth App, Noctrinth и Порталуса — с переводом на твой язык.',
        },
        launcher: { id: 'app.settings.updates.launcher', defaultMessage: 'Лаунчер' },
        current: { id: 'app.settings.updates.current', defaultMessage: 'Установлена версия' },
        upToDate: { id: 'app.settings.updates.up-to-date', defaultMessage: 'У тебя последняя версия' },
        available: { id: 'app.settings.updates.available', defaultMessage: 'Доступно обновление' },
        update: { id: 'app.settings.updates.update', defaultMessage: 'Обновить (.exe)' },
        downloading: { id: 'app.settings.updates.downloading', defaultMessage: 'Скачиваю…' },
        running: { id: 'app.settings.updates.running', defaultMessage: 'Установщик запущен — дальше он сам' },
        releasePage: { id: 'app.settings.updates.release-page', defaultMessage: 'Страница релиза' },
        translate: { id: 'app.settings.updates.translate', defaultMessage: 'Перевести' },
        translated: { id: 'app.settings.updates.translated', defaultMessage: 'Оригинал' },
        translatedNote: {
                id: 'app.settings.updates.translated-note',
                defaultMessage: 'Переведено Google-переводчиком',
        },
        noReleases: { id: 'app.settings.updates.no-releases', defaultMessage: 'Релизов нет или недоступны' },
        fail: { id: 'app.settings.updates.fail', defaultMessage: 'Не отвечает' },
        refresh: { id: 'app.settings.updates.refresh', defaultMessage: 'Обновить' },
})

interface RepoState {
        id: string
        label: string
        repo: string
        loading: boolean
        failed: boolean
        releases: ReleaseNote[]
        translated: Record<string, string>
        pending: Record<string, boolean>
}

const repos = ref<RepoState[]>(
        UPDATE_REPOS.map((repo) => ({ ...repo, loading: true, failed: false, releases: [], translated: {}, pending: {} })),
)
const update = ref<LauncherUpdate | null>(null)
const updateFailed = ref(false)
const updating = ref(false)
const updateNote = ref('')

async function loadRepo(repo: RepoState) {
        repo.loading = true
        repo.failed = false
        repo.releases = []
        repo.translated = {}
        try {
                repo.releases = await fetchReleases(repo.repo)
        } catch {
                repo.failed = true
        } finally {
                repo.loading = false
        }
}

async function loadAll() {
        updateFailed.value = false
        updateNote.value = ''
        try {
                update.value = await launcherUpdateInfo()
        } catch {
                updateFailed.value = true
        }
        await Promise.all(repos.value.map((repo) => loadRepo(repo)))
}

onMounted(loadAll)

async function toggleTranslate(repo: RepoState, release: ReleaseNote) {
        const key = release.tag
        if (repo.translated[key]) {
                // Destructuring instead of delete: the lint forbids dynamic deletion.
                const { [key]: removed, ...next } = repo.translated
                void removed
                repo.translated = next
                return
        }
        if (repo.pending[key]) return
        repo.pending[key] = true
        try {
                const text = await translateText(release.body || release.name, resolveTarget(locale.value))
                repo.translated = { ...repo.translated, [key]: text || release.body }
        } catch {
                repo.translated = { ...repo.translated, [key]: release.body }
        } finally {
                const { [key]: pending, ...nextPending } = repo.pending
                void pending
                repo.pending = nextPending
        }
}

async function runUpdate() {
        if (!update.value || updating.value) return
        updating.value = true
        updateNote.value = formatMessage(messages.downloading)
        try {
                await downloadAndRunUpdate(update.value)
                updateNote.value = formatMessage(messages.running)
        } catch (error) {
                updateNote.value = `Не вышло: ${String(error).slice(0, 140)}`
        } finally {
                updating.value = false
        }
}

async function openRelease(url: string): Promise<void> {
        try {
                const { openUrl } = await import('@tauri-apps/plugin-opener')
                await openUrl(url)
        } catch {
                /* the link simply did not open */
        }
}
</script>

<template>
        <div class="flex flex-col gap-5">
                <div>
                        <h2 class="m-0 flex items-center gap-2 text-lg font-bold text-contrast">
                                <RocketIcon class="size-5 text-blue" />
                                {{ formatMessage(messages.title) }}
                        </h2>
                        <p class="mt-1 mb-0 text-sm text-secondary">{{ formatMessage(messages.note) }}</p>
                </div>

                <!-- The launcher's own update -->
                <div class="flex flex-col gap-2 rounded-xl bg-surface-2 px-4 py-3">
                        <div class="flex items-center gap-2">
                                <PackageIcon class="size-4 text-secondary" />
                                <span class="text-sm font-bold text-contrast">{{ formatMessage(messages.launcher) }}</span>
                                <IconButton
                                        v-tooltip="formatMessage(messages.refresh)"
                                        type="quiet"
                                        size="sm"
                                        :label="formatMessage(messages.refresh)"
                                        @click="loadAll"
                                >
                                        <RefreshCwIcon class="!size-3.5" />
                                </IconButton>
                        </div>
                        <template v-if="update">
                                <p class="m-0 text-sm text-secondary">
                                        {{ formatMessage(messages.current) }}: <span class="font-semibold text-contrast">{{ update.current }}</span>
                                </p>
                                <div v-if="update.isNewer" class="flex flex-wrap items-center gap-2">
                                        <span class="text-sm font-semibold text-orange">
                                                {{ formatMessage(messages.available) }}: {{ update.latest }}
                                        </span>
                                        <Button :disabled="updating" @click="runUpdate">
                                                <DownloadIcon class="!size-4" />
                                                {{ updateNote || formatMessage(messages.update) }}
                                        </Button>
                                        <Button class="!bg-transparent" @click="() => openRelease(update.releaseUrl)">
                                                <ExternalIcon class="!size-4" />
                                                {{ formatMessage(messages.releasePage) }}
                                        </Button>
                                </div>
                                <p v-else class="m-0 text-sm text-brand">{{ formatMessage(messages.upToDate) }} ({{ update.latest }})</p>
                                <p v-if="updateNote && update.isNewer" class="m-0 text-xs text-secondary">{{ updateNote }}</p>
                        </template>
                        <p v-else-if="updateFailed" class="m-0 text-sm text-red">{{ formatMessage(messages.fail) }}</p>
                        <p v-else class="m-0 text-sm text-secondary">…</p>
                </div>

                <!-- The three repos' logs -->
                <div v-for="repo in repos" :key="repo.id" class="flex flex-col gap-2">
                        <div class="flex items-center gap-2">
                                <h3 class="m-0 text-sm font-bold text-contrast">{{ repo.label }}</h3>
                                <a
                                        :href="`https://github.com/${repo.repo}/releases`"
                                        class="flex items-center gap-1 text-xs text-secondary hover:text-contrast"
                                        @click.prevent="openRelease(`https://github.com/${repo.repo}/releases`)"
                                >
                                        <ExternalIcon class="size-3" />
                                        GitHub
                                </a>
                                <IconButton
                                        v-tooltip="formatMessage(messages.refresh)"
                                        type="quiet"
                                        size="sm"
                                        :label="formatMessage(messages.refresh)"
                                        @click="() => loadRepo(repo)"
                                >
                                        <RefreshCwIcon class="!size-3.5" />
                                </IconButton>
                        </div>

                        <p v-if="repo.loading" class="m-0 text-sm text-secondary">…</p>
                        <p v-else-if="repo.failed" class="m-0 text-sm text-red">{{ formatMessage(messages.fail) }}</p>
                        <p v-else-if="repo.releases.length === 0" class="m-0 text-sm text-secondary">
                                {{ formatMessage(messages.noReleases) }}
                        </p>

                        <div v-for="release in repo.releases" v-else :key="release.tag" class="flex flex-col gap-1 rounded-xl bg-surface-2 px-4 py-3">
                                <div class="flex items-center gap-2">
                                        <span class="text-sm font-semibold text-contrast">{{ release.name || release.tag }}</span>
                                        <span class="rounded-md bg-button-bg px-1.5 py-0.5 font-mono text-xs text-secondary">{{ release.tag }}</span>
                                        <span class="text-xs text-secondary">{{ release.date }}</span>
                                        <IconButton
                                                v-tooltip="repo.translated[release.tag] ? formatMessage(messages.translated) : formatMessage(messages.translate)"
                                                type="quiet"
                                                size="sm"
                                                :label="formatMessage(messages.translate)"
                                                :disabled="repo.pending[release.tag]"
                                                @click="() => toggleTranslate(repo, release)"
                                        >
                                                <LanguagesIcon class="!size-3.5" :class="repo.translated[release.tag] ? 'text-brand' : ''" />
                                        </IconButton>
                                </div>
                                <p v-if="repo.translated[release.tag]" class="m-0 whitespace-pre-wrap text-xs text-secondary">
                                        {{ repo.translated[release.tag] }}
                                        <span class="text-[10px] opacity-70"> · {{ formatMessage(messages.translatedNote) }}</span>
                                </p>
                                <p v-else-if="release.body" class="m-0 whitespace-pre-wrap text-xs text-secondary">{{ release.body }}</p>
                        </div>
                </div>
        </div>
</template>

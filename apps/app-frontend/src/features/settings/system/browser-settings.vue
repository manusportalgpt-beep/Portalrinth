<script setup lang="ts">
/**
 * Settings → Браузер: a search bar the page opens with, real DuckDuckGo
 * results, and every page opening in its own launcher window (WebView).
 * A typed address skips the search and goes straight to the window.
 */
import { ExternalIcon, GlobeIcon, SearchIcon, TrashIcon } from '@modrinth/assets'
import { Button, IconButton, Input, defineMessages, useVIntl } from '@modrinth/ui'
import { onMounted, ref } from 'vue'

import {
        browserHistory,
        looksLikeUrl,
        normalizeUrl,
        openInBrowserWindow,
        rememberBrowserQuery,
        searchWeb,
        type BrowserHit,
} from '@/helpers/portalrinth-browser'

const { formatMessage } = useVIntl()

const messages = defineMessages({
        title: { id: 'app.settings.browser.title', defaultMessage: 'Браузер' },
        placeholder: { id: 'app.settings.browser.placeholder', defaultMessage: 'Найти в интернете или ввести адрес…' },
        search: { id: 'app.settings.browser.search', defaultMessage: 'Искать' },
        open: { id: 'app.settings.browser.open', defaultMessage: 'Открыть' },
        opening: { id: 'app.settings.browser.opening', defaultMessage: 'Открываю…' },
        searching: { id: 'app.settings.browser.searching', defaultMessage: 'Ищу…' },
        nothing: { id: 'app.settings.browser.nothing', defaultMessage: 'Ничего не нашлось — попробуй иначе' },
        error: { id: 'app.settings.browser.error', defaultMessage: 'Поиск не ответил' },
        note: {
                id: 'app.settings.browser.note',
                defaultMessage: 'Страницы открываются в отдельном окне лаунчера — как обычный браузер, только внутри Порталуса.',
        },
        history: { id: 'app.settings.browser.history', defaultMessage: 'Недавние запросы' },
        clear: { id: 'app.settings.browser.clear', defaultMessage: 'Очистить историю' },
})

const query = ref('')
const results = ref<BrowserHit[]>([])
const busy = ref(false)
const note = ref('')
const noteBad = ref(false)
const history = ref<string[]>([])

onMounted(() => {
        history.value = browserHistory()
})

function remember(queryText: string) {
        rememberBrowserQuery(queryText)
        history.value = browserHistory()
}

async function openDirect(raw: string) {
        const url = normalizeUrl(raw)
        note.value = formatMessage(messages.opening)
        noteBad.value = false
        remember(raw.trim())
        try {
                await openInBrowserWindow(url)
                note.value = ''
        } catch {
                note.value = formatMessage(messages.error)
                noteBad.value = true
        }
}

async function run() {
        const text = query.value.trim()
        if (!text || busy.value) return
        if (looksLikeUrl(text)) {
                await openDirect(text)
                return
        }
        busy.value = true
        note.value = formatMessage(messages.searching)
        noteBad.value = false
        results.value = []
        try {
                results.value = await searchWeb(text)
                remember(text)
                note.value = results.value.length > 0 ? '' : formatMessage(messages.nothing)
                noteBad.value = results.value.length === 0
        } catch {
                note.value = formatMessage(messages.error)
                noteBad.value = true
        } finally {
                busy.value = false
        }
}

function clearHistory() {
        try {
                localStorage.removeItem('portalrinth-browser-history')
        } catch {
                /* nothing to clear then */
        }
        history.value = []
}
</script>

<template>
        <div class="flex flex-col gap-4">
                <div>
                        <h2 class="m-0 flex items-center gap-2 text-lg font-bold text-contrast">
                                <GlobeIcon class="size-5 text-blue" />
                                {{ formatMessage(messages.title) }}
                        </h2>
                        <p class="mt-1 mb-0 text-sm text-secondary">{{ formatMessage(messages.note) }}</p>
                </div>

                <div class="flex gap-2">
                        <div class="relative grow">
                                <SearchIcon class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-secondary" />
                                <Input
                                        ref="searchInput"
                                        v-model="query"
                                        class="!pl-9"
                                        :placeholder="formatMessage(messages.placeholder)"
                                        autocomplete="off"
                                        @keydown.enter.prevent="run"
                                />
                        </div>
                        <Button :disabled="busy || !query.trim()" @click="run">
                                <SearchIcon class="!size-4" />
                                {{ formatMessage(messages.search) }}
                        </Button>
                </div>

                <p v-if="note" class="m-0 text-sm" :class="noteBad ? 'text-red' : 'text-secondary'">{{ note }}</p>

                <div v-if="results.length > 0" class="flex flex-col gap-1">
                        <button
                                v-for="(hit, index) in results"
                                :key="index"
                                class="flex flex-col gap-0.5 rounded-xl border-0 bg-transparent px-3 py-2 text-left transition-colors hover:bg-button-bg"
                                @click="openInBrowserWindow(hit.url)"
                        >
                                <span class="flex items-center gap-1.5 text-sm font-semibold text-contrast">
                                        <ExternalIcon class="size-3.5 shrink-0 text-secondary" />
                                        <span class="truncate">{{ hit.title }}</span>
                                </span>
                                <span class="truncate text-xs text-secondary">{{ hit.url }}</span>
                        </button>
                </div>

                <div v-if="history.length > 0" class="flex flex-col gap-2">
                        <div class="flex items-center justify-between">
                                <span class="text-xs font-semibold uppercase tracking-wide text-secondary">
                                        {{ formatMessage(messages.history) }}
                                </span>
                                <IconButton
                                        v-tooltip="formatMessage(messages.clear)"
                                        type="quiet"
                                        size="sm"
                                        :label="formatMessage(messages.clear)"
                                        @click="clearHistory"
                                >
                                        <TrashIcon class="!size-3.5" />
                                </IconButton>
                        </div>
                        <div class="flex flex-wrap gap-1.5">
                                <button
                                        v-for="item in history"
                                        :key="item"
                                        class="rounded-full border-0 bg-button-bg px-3 py-1 text-xs text-contrast transition-opacity hover:opacity-80"
                                        @click="
                                                () => {
                                                        query = item
                                                        run()
                                                }
                                        "
                                >
                                        {{ item }}
                                </button>
                        </div>
                </div>
        </div>
</template>

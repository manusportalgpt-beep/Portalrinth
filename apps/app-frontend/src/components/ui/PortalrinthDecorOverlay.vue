<script setup lang="ts">
/**
 * The layer every placed decoration is drawn on, and the page editor itself.
 *
 * In normal days the layer lets everything pass through: a pumpkin over the
 * search bar never blocks the search bar. When the editor is open, its things
 * wake up - they can be dragged, stretched by the corner, sent away - and a
 * small bar offers what a page editor offers: add a picture, add a video,
 * and carry the whole look into a .prth file or back out of one.
 */
import {
        ChevronDownIcon,
        ChevronUpIcon,
        CopyIcon,
        DownloadIcon,
        ImageIcon,
        MusicIcon,
        TrashIcon,
        UploadIcon,
        VideoIcon,
        XIcon,
} from '@modrinth/assets'
import { Button, defineMessages, useVIntl } from '@modrinth/ui'
        import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

        import {
                addDecoration,
                chooseThemeSound,
                clearPage,
                decorEditorOpen,
                decorUrl,
                duplicateDecoration,
                EDITOR_PAGES,
                exportTheme,
                importTheme,
                itemsForPage,
                moveDecorationToPage,
                moveDecorLayer,
                normalizeDecorItem,
                removeDecoration,
                removeThemeSound,
                themeSound,
                themeSoundOn,
                updateDecorItem,
                useDecorPage,
        } from '@/helpers/portalrinth-decor'

        const { formatMessage } = useVIntl()
        const { page } = useDecorPage()

        const messages = defineMessages({
                editorTitle: { id: 'app.decor.editor.title', defaultMessage: 'Редактор страниц' },
                addImage: { id: 'app.decor.editor.add-image', defaultMessage: 'Картинка/GIF' },
                addVideo: { id: 'app.decor.editor.add-video', defaultMessage: 'Видео' },
                done: { id: 'app.decor.editor.done', defaultMessage: 'Готово' },
                clear: { id: 'app.decor.editor.clear', defaultMessage: 'Очистить страницу' },
                exportTheme: { id: 'app.decor.editor.export', defaultMessage: 'Экспорт темы (.prth)' },
                importTheme: { id: 'app.decor.editor.import', defaultMessage: 'Импорт темы' },
                hint: {
                        id: 'app.decor.editor.hint',
                        defaultMessage:
                                'Перетаскивай, тяни за уголок, крестик убирает. Одна страница = одна вкладка лаунчера.',
                },
                soundPick: { id: 'app.decor.editor.sound-pick', defaultMessage: 'Выбрать звук' },
                soundRemove: { id: 'app.decor.editor.sound-remove', defaultMessage: 'Убрать звук' },
                selected: { id: 'app.decor.editor.selected', defaultMessage: 'Выбрано' },
                opacity: { id: 'app.decor.editor.opacity', defaultMessage: 'Прозрачность' },
                layerUp: { id: 'app.decor.editor.layer-up', defaultMessage: 'Слой выше' },
                layerDown: { id: 'app.decor.editor.layer-down', defaultMessage: 'Слой ниже' },
                duplicate: { id: 'app.decor.editor.duplicate', defaultMessage: 'Дублировать' },
                move: { id: 'app.decor.editor.move', defaultMessage: 'Перенести на страницу' },
        })

        const items = computed(() => itemsForPage(page.value))

        /** Object URLs of the kept files, alive while the page shows them. */
        const urls = ref<Record<string, string>>({})
        watch(
                items,
                async (list) => {
                        const keep = new Set<string>()
                        for (const item of list) {
                                keep.add(item.asset)
                                if (!urls.value[item.asset]) {
                                        const url = await decorUrl(item.asset, item.ext)
                                        if (url) urls.value[item.asset] = url
                                }
                        }
                        const next: Record<string, string> = {}
                        for (const [asset, url] of Object.entries(urls.value)) {
                                if (keep.has(asset)) {
                                        next[asset] = url
                                } else {
                                        URL.revokeObjectURL(url)
                                }
                        }
                        urls.value = next
                },
                { immediate: true, deep: true },
        )
        onBeforeUnmount(() => {
                for (const url of Object.values(urls.value)) URL.revokeObjectURL(url)
        })

        // ---- Dragging and stretching ----------------------------------------------

        interface Drag {
                id: string
                mode: 'move' | 'resize'
                startX: number
                startY: number
                item: { x: number; y: number; w: number; h: number }
        }

        let drag: Drag | null = null

        function onPointerDown(event: PointerEvent, id: string, mode: Drag['mode']) {
                const item = items.value.find((kept) => kept.id === id)
                if (!item) return
                selectedId.value = id
                drag = {
                        id,
                        mode,
                        startX: event.clientX,
                        startY: event.clientY,
                        item: { x: item.x, y: item.y, w: item.w, h: item.h },
                }
                ;(event.target as HTMLElement).setPointerCapture?.(event.pointerId)
                event.preventDefault()
        }

        function onPointerMove(event: PointerEvent) {
                if (!drag) return
                const dx = ((event.clientX - drag.startX) / window.innerWidth) * 100
                const dy = ((event.clientY - drag.startY) / window.innerHeight) * 100
                if (drag.mode === 'move') {
                        updateDecorItem(drag.id, normalizeDecorItem({
                                ...base(drag),
                                x: drag.item.x + dx,
                                y: drag.item.y + dy,
                        }))
                } else {
                        updateDecorItem(drag.id, normalizeDecorItem({
                                ...base(drag),
                                w: Math.max(3, drag.item.w + dx),
                                h: Math.max(3, drag.item.h + dy),
                        }))
                }
        }

        function base(state: Drag): { id: string; page: string; asset: string; kind: 'image' | 'video'; opacity: number } {
                const item = items.value.find((kept) => kept.id === state.id)
                return {
                        id: state.id,
                        page: item?.page ?? page.value,
                        asset: item?.asset ?? '',
                        kind: item?.kind ?? 'image',
                        opacity: item?.opacity ?? 100,
                }
        }

        function onPointerUp() {
                drag = null
        }

        onMounted(() => {
                window.addEventListener('pointermove', onPointerMove)
                window.addEventListener('pointerup', onPointerUp)
                window.addEventListener('keydown', onEditorKey)
        })
        onBeforeUnmount(() => {
                window.removeEventListener('pointermove', onPointerMove)
                window.removeEventListener('pointerup', onPointerUp)
                window.removeEventListener('keydown', onEditorKey)
        })

        // ---- Selection and the inspector ------------------------------------------

        const selectedId = ref<string | null>(null)
        const selectedItem = computed(() => items.value.find((kept) => kept.id === selectedId.value) ?? null)

        watch(items, (list) => {
                if (selectedId.value && !list.some((kept) => kept.id === selectedId.value)) {
                        selectedId.value = null
                }
        })

        function patchSelected(patch: Partial<{ x: number; y: number; w: number; h: number; opacity: number }>) {
                if (!selectedItem.value) return
                updateDecorItem(selectedItem.value.id, normalizeDecorItem({ ...selectedItem.value, ...patch }))
        }

        function onEditorKey(event: KeyboardEvent) {
                if (!decorEditorOpen.value || !selectedItem.value) return
                const tag = (event.target as HTMLElement | null)?.tagName
                if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
                if (event.key === 'Delete' || event.key === 'Backspace') {
                        event.preventDefault()
                        void removeDecoration(selectedItem.value.id)
                        selectedId.value = null
                        return
                }
                const step = event.shiftKey ? 3 : 0.5
                const moves: Record<string, [number, number]> = {
                        ArrowLeft: [-step, 0],
                        ArrowRight: [step, 0],
                        ArrowUp: [0, -step],
                        ArrowDown: [0, step],
                }
                const move = moves[event.key]
                if (move) {
                        event.preventDefault()
                        patchSelected({ x: selectedItem.value.x + move[0], y: selectedItem.value.y + move[1] })
                }
        }

        // ---- The editor bar --------------------------------------------------------

        const busy = ref(false)

        async function pick(kind: 'image' | 'video') {
                busy.value = true
                try {
                        await addDecoration(page.value, kind)
                } finally {
                        busy.value = false
                }
        }

        async function exportOne() {
                busy.value = true
                try {
                        const { useAccentPreset } = await import('@/composables/use-accent')
                        const accent = useAccentPreset()
                        await exportTheme(
                                { id: accent.id.value, tint: accent.tintBackground.value, customColor: accent.customColor.value },
                                'Тема Portalrinth',
                        )
                } finally {
                        busy.value = false
                }
        }

        async function importOne() {
                busy.value = true
                try {
                        await importTheme()
                } catch (error) {
                        console.warn('Theme import failed:', error)
                } finally {
                        busy.value = false
                }
        }

        async function pickSound() {
                busy.value = true
                try {
                        await chooseThemeSound()
                } finally {
                        busy.value = false
                }
        }

        function clearOne() {
                void clearPage(page.value)
        }

        function toggleSound() {
                themeSoundOn.value = !themeSoundOn.value
        }
</script>

<template>
        <div class="portalrinth-decor" :class="{ 'portalrinth-decor--editing': decorEditorOpen }">
                <!-- The placed things themselves. Silent glass when nobody edits. -->
                <div
                        v-for="item in items"
                        :key="item.id"
                        class="portalrinth-decor__item"
                        :class="{ 'portalrinth-decor__item--selected': decorEditorOpen && item.id === selectedId }"
                        :style="{
                                left: `${item.x}%`,
                                top: `${item.y}%`,
                                width: `${item.w}%`,
                                height: `${item.h}%`,
                                opacity: item.opacity / 100,
                        }"
                >
                        <video
                                v-if="item.kind === 'video' && urls[item.asset]"
                                :src="urls[item.asset]"
                                class="portalrinth-decor__media"
                                autoplay
                                loop
                                muted
                                playsinline
                        />
                        <img
                                v-else-if="urls[item.asset]"
                                :src="urls[item.asset]"
                                class="portalrinth-decor__media"
                                alt=""
                        />
                        <template v-if="decorEditorOpen">
                                <div class="portalrinth-decor__handle" @pointerdown="onPointerDown($event, item.id, 'move')" />
                                <button
                                        type="button"
                                        class="portalrinth-decor__resize"
                                        @pointerdown="onPointerDown($event, item.id, 'resize')"
                                />
                                <button
                                        type="button"
                                        class="portalrinth-decor__delete"
                                        @click="removeDecoration(item.id)"
                                >
                                        <XIcon class="size-3.5" />
                                </button>
                        </template>
                </div>

                <!-- The editor's own bar, at the bottom middle of the window. -->
                <div v-if="decorEditorOpen" class="portalrinth-decor__bar">
                        <span class="portalrinth-decor__page">{{ EDITOR_PAGES.find((p) => p.key === page)?.label ?? 'Страница' }}</span>
                        <Button :disabled="busy" size="small" @click="pick('image')">
                                <ImageIcon /> {{ formatMessage(messages.addImage) }}
                        </Button>
                        <Button :disabled="busy" size="small" @click="pick('video')">
                                <VideoIcon /> {{ formatMessage(messages.addVideo) }}
                        </Button>
                        <Button :disabled="busy" size="small" @click="exportOne">
                                <DownloadIcon /> {{ formatMessage(messages.exportTheme) }}
                        </Button>
                        <Button :disabled="busy" size="small" @click="importOne">
                                <UploadIcon /> {{ formatMessage(messages.importTheme) }}
                        </Button>
                        <Button
                                v-tooltip="themeSound ? undefined : 'В теме пока нет звука'"
                                :disabled="!themeSound"
                                size="small"
                                @click="toggleSound()"
                        >
                                <MusicIcon /> {{ themeSoundOn ? 'Звук темы: вкл' : 'Звук темы: выкл' }}
                        </Button>
                        <Button :disabled="busy" size="small" @click="pickSound">
                                <MusicIcon /> {{ formatMessage(messages.soundPick) }}
                        </Button>
                        <Button
                                v-if="themeSound"
                                v-tooltip="formatMessage(messages.soundRemove)"
                                size="small"
                                @click="removeThemeSound()"
                        >
                                <XIcon />
                        </Button>
                        <Button size="small" @click="clearOne">
                                <TrashIcon /> {{ formatMessage(messages.clear) }}
                        </Button>
                        <Button type="colored" color="brand" size="small" @click="decorEditorOpen = false">
                                {{ formatMessage(messages.done) }}
                        </Button>
                        <span class="portalrinth-decor__hint">{{ formatMessage(messages.hint) }}</span>
                </div>

                <!-- The inspector of the selected thing: transparency, layers, a
                     new home, a copy, or a goodbye. -->
                <div v-if="decorEditorOpen && selectedItem" class="portalrinth-decor__inspector">
                        <div class="portalrinth-decor__row">
                                <span class="portalrinth-decor__row-label">
                                        {{ formatMessage(messages.selected) }} ·
                                        {{ selectedItem.kind === 'video' ? 'Видео' : 'Картинка' }}
                                </span>
                                <button type="button" class="portalrinth-decor__icon-btn" @click="selectedId = null">
                                        <XIcon class="size-3.5" />
                                </button>
                        </div>
                        <div class="portalrinth-decor__row">
                                <span class="portalrinth-decor__row-label">{{ formatMessage(messages.opacity) }}</span>
                                <input
                                        type="range"
                                        min="10"
                                        max="100"
                                        :value="selectedItem.opacity"
                                        @input="patchSelected({ opacity: Number(($event.target as HTMLInputElement).value) })"
                                />
                                <span class="portalrinth-decor__row-value">{{ selectedItem.opacity }}%</span>
                        </div>
                        <div class="portalrinth-decor__row">
                                <span class="portalrinth-decor__row-label">{{ formatMessage(messages.move) }}</span>
                                <select
                                        class="portalrinth-decor__page-select"
                                        :value="selectedItem.page"
                                        @change="moveDecorationToPage(selectedItem.id, ($event.target as HTMLSelectElement).value)"
                                >
                                        <option v-for="p in EDITOR_PAGES" :key="p.key" :value="p.key">{{ p.label }}</option>
                                </select>
                        </div>
                        <div class="portalrinth-decor__row">
                                <button
                                        v-tooltip="formatMessage(messages.layerUp)"
                                        type="button"
                                        class="portalrinth-decor__icon-btn"
                                        @click="moveDecorLayer(selectedItem.id, 1)"
                                >
                                        <ChevronUpIcon class="size-4" />
                                </button>
                                <button
                                        v-tooltip="formatMessage(messages.layerDown)"
                                        type="button"
                                        class="portalrinth-decor__icon-btn"
                                        @click="moveDecorLayer(selectedItem.id, -1)"
                                >
                                        <ChevronDownIcon class="size-4" />
                                </button>
                                <button
                                        v-tooltip="formatMessage(messages.duplicate)"
                                        type="button"
                                        class="portalrinth-decor__icon-btn"
                                        @click="duplicateDecoration(selectedItem.id)"
                                >
                                        <CopyIcon class="size-4" />
                                </button>
                                <button
                                        v-tooltip="formatMessage(messages.clear)"
                                        type="button"
                                        class="portalrinth-decor__icon-btn portalrinth-decor__icon-btn--danger"
                                        @click="removeDecoration(selectedItem.id); selectedId = null"
                                >
                                        <TrashIcon class="size-4" />
                                </button>
                        </div>
                </div>
        </div>
</template>

<style scoped>
.portalrinth-decor__item {
        position: fixed;
        z-index: 40;
        pointer-events: none;
}

.portalrinth-decor--editing .portalrinth-decor__item {
        pointer-events: auto;
}

.portalrinth-decor__media {
        width: 100%;
        height: 100%;
        object-fit: contain;
        -webkit-user-drag: none;
        user-select: none;
}

.portalrinth-decor__handle {
        position: absolute;
        inset: 0;
        cursor: move;
        border: 1px dashed color-mix(in srgb, var(--color-brand) 70%, transparent);
}

.portalrinth-decor__resize {
        position: absolute;
        right: -6px;
        bottom: -6px;
        width: 14px;
        height: 14px;
        padding: 0;
        border: 2px solid var(--color-brand);
        border-radius: 999px;
        background: var(--color-raised-bg);
        cursor: nwse-resize;
}

.portalrinth-decor__delete {
        position: absolute;
        right: -8px;
        top: -8px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        padding: 0;
        border: 1px solid var(--color-surface-5);
        border-radius: 999px;
        background: var(--color-raised-bg);
        color: var(--color-contrast);
        cursor: pointer;
}

.portalrinth-decor__bar {
        position: fixed;
        bottom: 0.75rem;
        left: 50%;
        z-index: 300;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem;
        max-width: min(56rem, calc(100vw - 2rem));
        padding: 0.6rem 0.75rem;
        border: 1px solid color-mix(in srgb, var(--color-contrast) 14%, transparent);
        border-radius: 1rem;
        background: color-mix(in srgb, var(--color-raised-bg) 82%, transparent);
        backdrop-filter: blur(18px) saturate(1.3);
        -webkit-backdrop-filter: blur(18px) saturate(1.3);
        box-shadow: 0 10px 32px rgb(0 0 0 / 28%);
        transform: translateX(-50%);
}

.portalrinth-decor__page {
        font-weight: 700;
        color: var(--color-contrast);
        white-space: nowrap;
}

.portalrinth-decor__hint {
        width: 100%;
        font-size: 0.72rem;
        color: var(--color-secondary);
}

.portalrinth-decor__item--selected .portalrinth-decor__handle {
        border: 2px solid var(--color-brand);
}

.portalrinth-decor__inspector {
        position: fixed;
        right: 1rem;
        bottom: 5rem;
        z-index: 300;
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        width: 16rem;
        padding: 0.75rem;
        border: 1px solid color-mix(in srgb, var(--color-contrast) 14%, transparent);
        border-radius: 1rem;
        background: color-mix(in srgb, var(--color-raised-bg) 88%, transparent);
        backdrop-filter: blur(18px) saturate(1.3);
        -webkit-backdrop-filter: blur(18px) saturate(1.3);
        box-shadow: 0 10px 32px rgb(0 0 0 / 28%);
}

.portalrinth-decor__row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
}

.portalrinth-decor__row-label {
        flex: 1;
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--color-contrast);
}

.portalrinth-decor__row-value {
        font-size: 0.72rem;
        color: var(--color-secondary);
}

.portalrinth-decor__icon-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 1.75rem;
        height: 1.75rem;
        padding: 0;
        border: 1px solid var(--color-surface-5);
        border-radius: 0.5rem;
        background: var(--color-button-bg);
        color: var(--color-contrast);
        cursor: pointer;
}

.portalrinth-decor__icon-btn:hover {
        filter: brightness(1.15);
}

.portalrinth-decor__icon-btn--danger {
        color: var(--color-red, #ff4949);
}

.portalrinth-decor__page-select {
        flex: 1;
        padding: 0.25rem 0.4rem;
        border: 1px solid var(--color-surface-5);
        border-radius: 0.5rem;
        background: var(--color-button-bg);
        color: var(--color-contrast);
        font-size: 0.75rem;
}

.portalrinth-decor__inspector input[type='range'] {
        flex: 1;
        accent-color: var(--color-brand);
}
</style>

<script setup lang="ts">
/**
 * Редактор дизайна: живая настройка внешнего вида поверх настоящего
 * лаунчера. Нижняя панель - круглые стеклянные кнопки без фона (только
 * блюр), у каждой - всплывающий инструмент. «Выделение» подсвечивает
 * большие зоны оболочки (панель, титл-бар, контент) - щёлкнул, и правишь
 * только её: стекло, блюр, заливку, скругление.
 *
 * CSS мы не пишем в исходники: всё живёт в одном сгенерированном <style>
 * (helpers/portalrinth-design.ts), поэтому сломать вёрстку невозможно -
 * «Сброс» возвращает всё как было.
 */
import {
        CheckIcon,
        ImageIcon,
        MousePointer2Icon,
        PaletteIcon,
        RotateCounterClockwiseIcon,
        SaveIcon,
        SparklesIcon,
        XIcon,
} from '@modrinth/assets'
import { Button, defineMessages, Slider, Toggle, useVIntl } from '@modrinth/ui'
import { computed, ref, watch } from 'vue'

import {
        ACCENT_PRESETS,
        accentColorFor,
        accentGradientAnimated,
        CUSTOM_ACCENT_ID,
        setAccentGradientAnimated,
        setAccentPreset,
        setCustomAccentColor,
        useAccentPreset,
} from '@/composables/use-accent'
import {
        backgroundBlur,
        backgroundDim,
        headerShade,
        loadBackground,
        pageShade,
        saveBackgroundBlur,
        saveBackgroundDim,
        saveHeaderShade,
        savePageShade,
} from '@/helpers/portalrinth-background'
import {
        clearZone,
        DEFAULT_BLUR,
        DEFAULT_FILL,
        resetDesign,
        setZone,
        zoneState,
} from '@/helpers/portalrinth-design'
import {
        applyThemeBackground,
        MAX_THEMES,
        savedThemes,
        saveTheme,
} from '@/helpers/portalrinth-themes'
import { get as getSettings, set as setSettings } from '@/helpers/settings'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (event: 'close'): void }>()

const { formatMessage } = useVIntl()

const messages = defineMessages({
        title: { id: 'app.design.title', defaultMessage: 'Редактор дизайна' },
        description: {
                id: 'app.design.description',
                defaultMessage: 'Меняй вид лаунчера вживую: акцент, фон, стекло. «Сброс» вернёт всё как было.',
        },
        toolAccent: { id: 'app.design.tool.accent', defaultMessage: 'Акцент' },
        toolBackground: { id: 'app.design.tool.background', defaultMessage: 'Фон' },
        toolZones: { id: 'app.design.tool.zones', defaultMessage: 'Выделение' },
        toolThemes: { id: 'app.design.tool.themes', defaultMessage: 'Темы' },
        toolReset: { id: 'app.design.tool.reset', defaultMessage: 'Сброс' },
        done: { id: 'app.design.done', defaultMessage: 'Готово' },
        pickHint: {
                id: 'app.design.pick-hint',
                defaultMessage: 'Наведи на область лаунчера и щёлкни, чтобы выбрать её',
        },
        pickActive: { id: 'app.design.pick-active', defaultMessage: 'Кликни по зоне' },
        zoneSidebar: { id: 'app.design.zone.sidebar', defaultMessage: 'Левая панель' },
        zoneTitlebar: { id: 'app.design.zone.titlebar', defaultMessage: 'Верхняя панель' },
        zoneContent: { id: 'app.design.zone.content', defaultMessage: 'Контент' },
        zoneSidebarHint: {
                id: 'app.design.zone.sidebar.hint',
                defaultMessage: 'Стекло: без фона, с блюром',
        },
        zoneTitlebarHint: {
                id: 'app.design.zone.titlebar.hint',
                defaultMessage: 'Стекло: без фона, с блюром',
        },
        zoneContentHint: {
                id: 'app.design.zone.content.hint',
                defaultMessage: 'Стекло: без фона, с блюром',
        },
        zoneGlass: { id: 'app.design.zone.glass', defaultMessage: 'Стекло (без фона + блюр)' },
        zoneBlur: { id: 'app.design.zone.blur', defaultMessage: 'Блюр' },
        zoneFill: { id: 'app.design.zone.fill', defaultMessage: 'Заливка фона' },
        zoneRadius: { id: 'app.design.zone.radius', defaultMessage: 'Скругление' },
        zoneReset: { id: 'app.design.zone.reset', defaultMessage: 'Сбросить зону' },
        accentShimmer: { id: 'app.design.accent.shimmer', defaultMessage: 'Движение градиента' },
        accentCustom: { id: 'app.design.accent.custom', defaultMessage: 'Свой цвет' },
        backgroundDim: { id: 'app.design.background.dim', defaultMessage: 'Затемнение фона' },
        backgroundPage: { id: 'app.design.background.page', defaultMessage: 'Плотность страниц' },
        backgroundHeader: { id: 'app.design.background.header', defaultMessage: 'Плотность шапки' },
        backgroundBlurLabel: { id: 'app.design.background.blur', defaultMessage: 'Блюр фона' },
        themesSave: { id: 'app.design.themes.save', defaultMessage: 'Сохранить текущий вид' },
        themesApply: { id: 'app.design.themes.apply', defaultMessage: 'Применить' },
        themesEmpty: { id: 'app.design.themes.empty', defaultMessage: 'Пока ни одной сохранённой темы' },
        resetDone: { id: 'app.design.reset-done', defaultMessage: 'Дизайн сброшен' },
})

type Tool = 'accent' | 'background' | 'zones' | 'themes'

const activeTool = ref<Tool | ''>('')
const picking = ref(false)
const hoverZone = ref<string | null>(null)
const hoverBox = ref<{ x: number; y: number; w: number; h: number } | null>(null)
const selectedZone = ref<string | null>(null)
const resetNote = ref(false)

watch(
        () => props.open,
        (open) => {
                if (!open) {
                        picking.value = false
                        hoverZone.value = null
                        hoverBox.value = null
                }
        },
)

function toggleTool(tool: Tool) {
        if (activeTool.value === tool) activeTool.value = ''
        else activeTool.value = tool
}

// ---- Акцент --------------------------------------------------------------

const accent = useAccentPreset()

/** Тот же способ сохранить акцент, что и у всех настроек лаунчера. */
async function persistAccent(): Promise<void> {
        try {
                const settings = await getSettings()
                await setSettings({
                        ...settings,
                        accent_preset: accent.id.value,
                        accent_tint_background: accent.tintBackground.value,
                        accent_custom_color:
                                accent.id.value === CUSTOM_ACCENT_ID ? accent.customColor.value : settings.accent_custom_color,
                })
        } catch {
                /* показано сейчас - сохранение не удалось */
        }
}

function pickPreset(id: string) {
        setAccentPreset(id, accent.tintBackground.value)
        void persistAccent()
}

const customColor = ref(accent.customColor.value)
watch(customColor, (color) => {
        if (!/^#[0-9a-fA-F]{6}$/.test(color)) return
        setCustomAccentColor(color)
        void persistAccent()
})

const shimmer = computed({
        get: () => accentGradientAnimated.value,
        set: (value: boolean) => setAccentGradientAnimated(value),
})

// ---- Фон -----------------------------------------------------------------

const bgBlur = computed({
        get: () => backgroundBlur.value,
        set: async (value: boolean) => {
                await saveBackgroundBlur(value)
                await loadBackground(value, backgroundDim.value)
        },
})

const bgDim = computed({
        get: () => backgroundDim.value,
        set: async (value: number) => {
                await saveBackgroundDim(value)
                await loadBackground(backgroundBlur.value, value)
        },
})

const pageShadeValue = computed({
        get: () => pageShade.value,
        set: (value: number) => savePageShade(value),
})

const headerShadeValue = computed({
        get: () => headerShade.value,
        set: (value: number) => saveHeaderShade(value),
})

// ---- Выделение зон -------------------------------------------------------

const ZONE_MESSAGE_KEYS = {
        sidebar: 'zoneSidebar',
        titlebar: 'zoneTitlebar',
        content: 'zoneContent',
} as const

function zoneName(id: string): string {
        const key = ZONE_MESSAGE_KEYS[id as keyof typeof ZONE_MESSAGE_KEYS]
        return key ? formatMessage(messages[key]) : id
}

function onPickMove(event: MouseEvent) {
        const element = document.elementFromPoint(event.clientX, event.clientY)
        const zoneElement = element?.closest('[data-pd-zone]') as HTMLElement | null
        if (!zoneElement) {
                hoverZone.value = null
                hoverBox.value = null
                return
        }
        const id = zoneElement.getAttribute('data-pd-zone') ?? ''
        hoverZone.value = id
        const box = zoneElement.getBoundingClientRect()
        hoverBox.value = { x: box.left, y: box.top, w: box.width, h: box.height }
}

function onPickClick() {
        if (!hoverZone.value) return
        selectedZone.value = hoverZone.value
        activeTool.value = 'zones'
}

function zoneOf(id: string | null) {
        return id ? zoneState(id) : {}
}

function updateZone(id: string, patch: Parameters<typeof setZone>[1]) {
        setZone(id, patch)
}

function removeZone(id: string | null) {
        if (!id) return
        clearZone(id)
        selectedZone.value = null
}

// ---- Темы ----------------------------------------------------------------

async function applySavedTheme(themeId: string) {
        const theme = savedThemes.value.find((kept) => kept.id === themeId)
        if (!theme) return
        await applyThemeBackground(theme)
        setAccentPreset(theme.accent.preset, theme.accent.tint)
        await persistAccent()
}

async function saveCurrentTheme() {
        await saveTheme(`Дизайн ${savedThemes.value.length + 1}`, 'palette', {
                preset: accent.id.value,
                tint: accent.tintBackground.value,
                color: accent.id.value === CUSTOM_ACCENT_ID ? accent.customColor.value : '#000000',
        })
}

function doReset() {
        resetDesign()
        selectedZone.value = null
        resetNote.value = true
        setTimeout(() => (resetNote.value = false), 2000)
}
</script>

<template>
        <Teleport to="body">
                <div v-if="open" class="pdz-root">
                        <!-- Слой выделения: ловит мышь, когда включён режим «Выделение» -->
                        <div
                                v-if="picking"
                                class="pdz-pick-layer"
                                @mousemove="onPickMove"
                                @click="onPickClick"
                        >
                                <div
                                        v-if="hoverBox"
                                        class="pdz-hover-box"
                                        :style="{
                                                left: `${hoverBox.x}px`,
                                                top: `${hoverBox.y}px`,
                                                width: `${hoverBox.w}px`,
                                                height: `${hoverBox.h}px`,
                                        }"
                                />
                                <div v-if="hoverZone" class="pdz-hover-label">{{ zoneName(hoverZone) }}</div>
                                <p class="pdz-pick-hint">{{ formatMessage(messages.pickHint) }}</p>
                        </div>

                        <!-- Нижняя панель инструментов -->
                        <div class="pdz-panel">
                                <p v-if="activeTool === '' && !picking" class="pdz-panel-hint">
                                        {{ formatMessage(messages.description) }}
                                </p>
                                <div class="pdz-buttons">
                                        <button
                                                class="pdz-round"
                                                :class="{ 'pdz-round--on': activeTool === 'accent' }"
                                                :title="formatMessage(messages.toolAccent)"
                                                @click="toggleTool('accent')"
                                        >
                                                <PaletteIcon class="size-5" />
                                        </button>
                                        <button
                                                class="pdz-round"
                                                :class="{ 'pdz-round--on': activeTool === 'background' }"
                                                :title="formatMessage(messages.toolBackground)"
                                                @click="toggleTool('background')"
                                        >
                                                <ImageIcon class="size-5" />
                                        </button>
                                        <button
                                                class="pdz-round"
                                                :class="{ 'pdz-round--on': picking || activeTool === 'zones' }"
                                                :title="formatMessage(messages.toolZones)"
                                                @click="
                                                        () => {
                                                                picking = !picking
                                                                activeTool = picking ? 'zones' : ''
                                                        }
                                                "
                                        >
                                                <MousePointer2Icon class="size-5" />
                                        </button>
                                        <button
                                                class="pdz-round"
                                                :class="{ 'pdz-round--on': activeTool === 'themes' }"
                                                :title="formatMessage(messages.toolThemes)"
                                                @click="toggleTool('themes')"
                                        >
                                                <SparklesIcon class="size-5" />
                                        </button>
                                        <button class="pdz-round" :title="formatMessage(messages.toolReset)" @click="doReset">
                                                <RotateCounterClockwiseIcon class="size-5" />
                                        </button>
                                        <button class="pdz-round pdz-round--done" :title="formatMessage(messages.done)" @click="emit('close')">
                                                <CheckIcon class="size-5" />
                                        </button>
                                </div>

                                <!-- Всплывающие инструменты -->
                                <Transition name="pdz-pop">
                                        <div v-if="activeTool === 'accent'" class="pdz-popover">
                                                <h3 class="pdz-pop-title">{{ formatMessage(messages.toolAccent) }}</h3>
                                                <div class="pdz-swatches">
                                                        <button
                                                                v-for="preset in ACCENT_PRESETS"
                                                                :key="preset.id"
                                                                class="pdz-swatch"
                                                                :class="{ 'pdz-swatch--on': accent.id.value === preset.id }"
                                                                :style="{ background: accentColorFor(preset) }"
                                                                :aria-label="preset.id"
                                                                @click="pickPreset(preset.id)"
                                                        />
                                                </div>
                                                <label class="pdz-row">
                                                        <span>{{ formatMessage(messages.accentCustom) }}</span>
                                                        <input v-model="customColor" type="color" class="pdz-color" />
                                                </label>
                                                <label class="pdz-row pdz-row--between">
                                                        <span>{{ formatMessage(messages.accentShimmer) }}</span>
                                                        <Toggle v-model="shimmer" />
                                                </label>
                                        </div>
                                </Transition>

                                <Transition name="pdz-pop">
                                        <div v-if="activeTool === 'background'" class="pdz-popover">
                                                <h3 class="pdz-pop-title">{{ formatMessage(messages.toolBackground) }}</h3>
                                                <label class="pdz-row pdz-row--between">
                                                        <span>{{ formatMessage(messages.backgroundBlurLabel) }}</span>
                                                        <Toggle v-model="bgBlur" />
                                                </label>
                                                <div class="pdz-slider">
                                                        <span>{{ formatMessage(messages.backgroundDim) }}</span>
                                                        <Slider v-model="bgDim" :min="0" :max="100" :step="1" unit="%" />
                                                </div>
                                                <div class="pdz-slider">
                                                        <span>{{ formatMessage(messages.backgroundPage) }}</span>
                                                        <Slider v-model="pageShadeValue" :min="0" :max="100" :step="1" unit="%" />
                                                </div>
                                                <div class="pdz-slider">
                                                        <span>{{ formatMessage(messages.backgroundHeader) }}</span>
                                                        <Slider v-model="headerShadeValue" :min="0" :max="100" :step="1" unit="%" />
                                                </div>
                                        </div>
                                </Transition>

                                <Transition name="pdz-pop">
                                        <div v-if="activeTool === 'zones'" class="pdz-popover pdz-popover--wide">
                                                <h3 class="pdz-pop-title">{{ formatMessage(messages.toolZones) }}</h3>
                                                <p v-if="!selectedZone" class="pdz-pop-hint">
                                                        {{ picking ? formatMessage(messages.pickActive) : formatMessage(messages.pickHint) }}
                                                </p>
                                                <template v-else>
                                                        <div class="pdz-zone-head">
                                                                <span class="pdz-zone-name">{{ zoneName(selectedZone) }}</span>
                                                                <button class="pdz-zone-reset" @click="removeZone(selectedZone)">
                                                                        <XIcon class="size-3.5" />
                                                                        {{ formatMessage(messages.zoneReset) }}
                                                                </button>
                                                        </div>
                                                        <label class="pdz-row pdz-row--between">
                                                                <span>{{ formatMessage(messages.zoneGlass) }}</span>
                                                                <Toggle
                                                                        :model-value="zoneOf(selectedZone).glass ?? false"
                                                                        @update:model-value="(value: boolean) => updateZone(selectedZone!, { glass: value })"
                                                                />
                                                        </label>
                                                        <template v-if="zoneOf(selectedZone).glass">
                                                                <div class="pdz-slider">
                                                                        <span>{{ formatMessage(messages.zoneBlur) }}</span>
                                                                        <Slider
                                                                                :model-value="zoneOf(selectedZone).blur ?? DEFAULT_BLUR"
                                                                                :min="0"
                                                                                :max="40"
                                                                                :step="1"
                                                                                unit="px"
                                                                                @update:model-value="(value: number) => updateZone(selectedZone!, { blur: value })"
                                                                        />
                                                                </div>
                                                                <div class="pdz-slider">
                                                                        <span>{{ formatMessage(messages.zoneFill) }}</span>
                                                                        <Slider
                                                                                :model-value="zoneOf(selectedZone).fill ?? DEFAULT_FILL"
                                                                                :min="0"
                                                                                :max="100"
                                                                                :step="1"
                                                                                unit="%"
                                                                                @update:model-value="(value: number) => updateZone(selectedZone!, { fill: value })"
                                                                        />
                                                                </div>
                                                        </template>
                                                        <div class="pdz-slider">
                                                                <span>{{ formatMessage(messages.zoneRadius) }}</span>
                                                                <Slider
                                                                        :model-value="zoneOf(selectedZone).radius ?? 0"
                                                                        :min="0"
                                                                        :max="32"
                                                                        :step="1"
                                                                        unit="px"
                                                                        @update:model-value="(value: number) => updateZone(selectedZone!, { radius: value })"
                                                                />
                                                        </div>
                                                </template>
                                        </div>
                                </Transition>

                                <Transition name="pdz-pop">
                                        <div v-if="activeTool === 'themes'" class="pdz-popover">
                                                <h3 class="pdz-pop-title">{{ formatMessage(messages.toolThemes) }}</h3>
                                                <Button type="outlined" class="pdz-theme-save" @click="saveCurrentTheme">
                                                        <SaveIcon aria-hidden="true" />
                                                        {{ formatMessage(messages.themesSave) }}
                                                </Button>
                                                <p v-if="savedThemes.length === 0" class="pdz-pop-hint">
                                                        {{ formatMessage(messages.themesEmpty) }}
                                                </p>
                                                <div v-else class="pdz-themes">
                                                        <button
                                                                v-for="theme in savedThemes.slice(0, MAX_THEMES)"
                                                                :key="theme.id"
                                                                class="pdz-theme"
                                                                @click="applySavedTheme(theme.id)"
                                                        >
                                                                <span
                                                                        class="pdz-theme-swatch"
                                                                        :style="{ background: theme.accent.color !== '#000000' ? theme.accent.color : accentColorFor(ACCENT_PRESETS[0]) }"
                                                                />
                                                                {{ theme.name }}
                                                        </button>
                                                </div>
                                        </div>
                                </Transition>

                                <Transition name="pdz-fade">
                                        <span v-if="resetNote" class="pdz-reset-note">{{ formatMessage(messages.resetDone) }}</span>
                                </Transition>
                        </div>
                </div>
        </Teleport>
</template>

<style scoped>
.pdz-root {
        position: fixed;
        inset: 0;
        z-index: 400;
        pointer-events: none;
}

.pdz-pick-layer {
        position: absolute;
        inset: 0;
        pointer-events: auto;
        cursor: crosshair;
        background: transparent;
}

.pdz-hover-box {
        position: fixed;
        border: 2px solid var(--color-brand);
        border-radius: 0.75rem;
        background: color-mix(in srgb, var(--color-brand) 8%, transparent);
        box-shadow: 0 0 0 999rem rgb(0 0 0 / 0.25);
        transition: all 0.12s ease;
        pointer-events: none;
}

.pdz-hover-label {
        position: fixed;
        left: 50%;
        top: 4.5rem;
        transform: translateX(-50%);
        padding: 0.3rem 0.9rem;
        border-radius: 999px;
        background: var(--color-brand);
        color: var(--color-contrast);
        font-weight: 700;
        font-size: 0.8125rem;
        pointer-events: none;
}

.pdz-pick-hint {
        position: fixed;
        left: 50%;
        bottom: 7.5rem;
        transform: translateX(-50%);
        margin: 0;
        padding: 0.35rem 1rem;
        border-radius: 999px;
        background: color-mix(in srgb, var(--color-bg) 75%, transparent);
        backdrop-filter: blur(12px);
        color: var(--color-secondary);
        font-size: 0.8125rem;
        pointer-events: none;
}

.pdz-panel {
        position: absolute;
        left: 50%;
        bottom: 1.25rem;
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
        pointer-events: auto;
}

.pdz-panel-hint {
        margin: 0;
        padding: 0.3rem 1rem;
        border-radius: 999px;
        background: color-mix(in srgb, var(--color-bg) 65%, transparent);
        backdrop-filter: blur(12px);
        color: var(--color-secondary);
        font-size: 0.8125rem;
        white-space: nowrap;
}

.pdz-buttons {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        padding: 0.55rem 0.9rem;
        border: 1px solid color-mix(in srgb, var(--color-contrast) 12%, transparent);
        border-radius: 999px;
        background: color-mix(in srgb, var(--color-bg) 45%, transparent);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        box-shadow: 0 0.8rem 2rem rgb(0 0 0 / 0.35);
}

.pdz-round {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 3rem;
        height: 3rem;
        border: none;
        border-radius: 999px;
        background: transparent;
        color: var(--color-contrast);
        cursor: pointer;
        transition:
                background 0.18s ease,
                color 0.18s ease,
                transform 0.18s ease;
}

.pdz-round:hover {
        background: color-mix(in srgb, var(--color-contrast) 12%, transparent);
        transform: scale(1.12);
}

.pdz-round:active {
        transform: scale(0.96);
}

.pdz-round--on {
        background: color-mix(in srgb, var(--color-brand) 25%, transparent);
        color: var(--color-brand);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-brand) 45%, transparent);
}

.pdz-round--done {
        background: color-mix(in srgb, var(--color-green) 20%, transparent);
        color: var(--color-green);
}

.pdz-popover {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 0.7rem;
        width: min(22rem, 90vw);
        padding: 1rem 1.1rem;
        border: 1px solid color-mix(in srgb, var(--color-contrast) 14%, transparent);
        border-radius: 1.25rem;
        background: color-mix(in srgb, var(--color-bg) 55%, transparent);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        box-shadow: 0 0.8rem 2rem rgb(0 0 0 / 0.35);
}

.pdz-pop-title {
        margin: 0;
        font-size: 1rem;
        font-weight: 700;
        color: var(--color-contrast);
}

.pdz-pop-hint {
        margin: 0;
        font-size: 0.8125rem;
        color: var(--color-secondary);
}

.pdz-swatches {
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem;
}

.pdz-swatch {
        width: 1.6rem;
        height: 1.6rem;
        padding: 0;
        border: 2px solid transparent;
        border-radius: 999px;
        cursor: pointer;
        transition: transform 0.15s ease;
}

.pdz-swatch:hover {
        transform: scale(1.15);
}

.pdz-swatch--on {
        border-color: var(--color-contrast);
}

.pdz-row {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        font-size: 0.875rem;
        color: var(--color-contrast);
}

.pdz-row--between {
        justify-content: space-between;
}

.pdz-color {
        width: 2.2rem;
        height: 2.2rem;
        padding: 0;
        border: 1px solid color-mix(in srgb, var(--color-contrast) 20%, transparent);
        border-radius: 0.5rem;
        background: transparent;
        cursor: pointer;
}

.pdz-slider {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        font-size: 0.8125rem;
        color: var(--color-secondary);
}

.pdz-zone-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
}

.pdz-zone-name {
        font-weight: 700;
        color: var(--color-brand);
}

.pdz-zone-reset {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.15rem 0.55rem;
        border: 1px solid color-mix(in srgb, var(--color-contrast) 16%, transparent);
        border-radius: 999px;
        background: transparent;
        color: var(--color-secondary);
        font-size: 0.75rem;
        cursor: pointer;
        transition: color 0.15s ease, border-color 0.15s ease;
}

.pdz-zone-reset:hover {
        color: var(--color-red);
        border-color: var(--color-red);
}

.pdz-theme-save {
        align-self: flex-start;
}

.pdz-themes {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
}

.pdz-theme {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.25rem 0.7rem;
        border: 1px solid color-mix(in srgb, var(--color-contrast) 14%, transparent);
        border-radius: 999px;
        background: color-mix(in srgb, var(--color-contrast) 6%, transparent);
        color: var(--color-contrast);
        font-size: 0.8125rem;
        cursor: pointer;
        transition: border-color 0.15s ease, transform 0.15s ease;
}

.pdz-theme:hover {
        border-color: var(--color-brand);
        transform: translateY(-1px);
}

.pdz-theme-swatch {
        width: 0.85rem;
        height: 0.85rem;
        border-radius: 999px;
}

.pdz-reset-note {
        padding: 0.25rem 0.9rem;
        border-radius: 999px;
        background: color-mix(in srgb, var(--color-green) 18%, transparent);
        color: var(--color-green);
        font-size: 0.8125rem;
        font-weight: 600;
}

.pdz-pop-enter-active,
.pdz-pop-leave-active {
        transition:
                opacity 0.18s ease,
                transform 0.18s ease;
}

.pdz-pop-enter-from,
.pdz-pop-leave-to {
        opacity: 0;
        transform: translateY(0.6rem) scale(0.97);
}

.pdz-fade-enter-active,
.pdz-fade-leave-active {
        transition: opacity 0.2s ease;
}

.pdz-fade-enter-from,
.pdz-fade-leave-to {
        opacity: 0;
}
</style>

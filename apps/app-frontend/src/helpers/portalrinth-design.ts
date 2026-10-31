/**
 * Редактор дизайна: правит вид лаунчера БЕЗ правки его кода. Всё держится
 * на CSS-переменных и сгенерированном блоке <style>: ни одного класса в
 * исходниках мы не трогаем, так что сломать вёрстку (и Tailwind) нельзя -
 * сброс возвращает всё как было одним движением.
 *
 * Зоны - большие области оболочки (левая панель, титл-бар, контент),
 * помеченные data-pd-zone в App.vue. Для зоны доступны: «стекло» (прозрачный
 * фон + блюр), сила блюра, затемнение фона, скругление углов.
 */
import { ref, watch } from 'vue'

export interface DesignZoneState {
        /** Прозрачный фон + блюр («без фона + блюр»). */
        glass?: boolean
        /** Сила блюра, px (1-40). */
        blur?: number
        /** Насколько плотно заливать фон, % (0 - совсем прозрачно). */
        fill?: number
        /** Скругление углов, px (0-32). */
        radius?: number
}

export interface DesignState {
        zones: Record<string, DesignZoneState>
}

export interface DesignZoneMeta {
        id: string
        nameKey: string
        hintKey: string
}

export const DESIGN_ZONES: DesignZoneMeta[] = [
        { id: 'sidebar', nameKey: 'app.design.zone.sidebar', hintKey: 'app.design.zone.sidebar.hint' },
        { id: 'titlebar', nameKey: 'app.design.zone.titlebar', hintKey: 'app.design.zone.titlebar.hint' },
        { id: 'content', nameKey: 'app.design.zone.content', hintKey: 'app.design.zone.content.hint' },
]

const DESIGN_KEY = 'portalrinth.design.v1'
const STYLE_ID = 'portalrinth-design-style'

export const DEFAULT_BLUR = 16
export const DEFAULT_FILL = 35
export const DEFAULT_RADIUS = 14

function readState(): DesignState {
        try {
                const raw = localStorage.getItem(DESIGN_KEY)
                if (!raw) return { zones: {} }
                const parsed = JSON.parse(raw) as DesignState
                if (!parsed || typeof parsed !== 'object' || !parsed.zones) return { zones: {} }
                return { zones: parsed.zones }
        } catch {
                return { zones: {} }
        }
}

export const designState = ref<DesignState>(readState())

function persist(): void {
        try {
                localStorage.setItem(DESIGN_KEY, JSON.stringify(designState.value))
        } catch {
                /* хранилище полно - дизайн всё равно живёт до перезапуска */
        }
}

export function zoneState(id: string): DesignZoneState {
        return designState.value.zones[id] ?? {}
}

export function setZone(id: string, patch: DesignZoneState): void {
        const merged: DesignZoneState = { ...zoneState(id), ...patch }
        const empty = !merged.glass && !merged.radius
        const zones = { ...designState.value.zones }
        // Без динамического delete: пустые зоны просто не попадают в новый объект.
        zones[id] = merged
        designState.value = {
                zones: empty ? omitZone(zones, id) : zones,
        }
}

export function clearZone(id: string): void {
        designState.value = { zones: omitZone({ ...designState.value.zones }, id) }
}

function omitZone(zones: Record<string, DesignZoneState>, id: string): Record<string, DesignZoneState> {
        return Object.fromEntries(Object.entries(zones).filter(([key]) => key !== id))
}

export function resetDesign(): void {
        designState.value = { zones: {} }
        persist()
        applyDesign()
}

/** Правило для одной зоны; пустая строка, когда зона не настроена. */
function zoneCss(id: string, state: DesignZoneState): string {
        if (!state.glass && !state.radius) return ''
        const blur = Math.min(Math.max(state.blur ?? DEFAULT_BLUR, 0), 40)
        const fill = Math.min(Math.max(state.fill ?? DEFAULT_FILL, 0), 100)
        const lines: string[] = [
                `background-color: color-mix(in srgb, var(--color-bg) ${fill}%, transparent) !important;`,
        ]
        if (blur > 0) {
                lines.push(`backdrop-filter: blur(${blur}px) !important;`)
                lines.push(`-webkit-backdrop-filter: blur(${blur}px) !important;`)
        }
        if (state.radius) lines.push(`border-radius: ${state.radius}px !important;`)
        return `[data-pd-zone="${id}"] {\n\t${lines.join('\n\t')}\n}\n`
}

/** Пересобирает (или создаёт) единственный <style> со всеми правками дизайна. */
export function applyDesign(): void {
        if (typeof document === 'undefined') return
        let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
        if (!style) {
                style = document.createElement('style')
                style.id = STYLE_ID
                document.head.appendChild(style)
        }
        const zones = designState.value.zones
        style.textContent = Object.keys(zones)
                .map((id) => zoneCss(id, zones[id]))
                .join('')
}

let started = false

/** Ставит сохранённый дизайн при запуске лаунчера и следит за изменениями. */
export function startDesignWatcher(): void {
        if (started) return
        started = true
        applyDesign()
        watch(designState, () => {
                persist()
                applyDesign()
        }, { deep: true })
}

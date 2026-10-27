/**
 * Global launcher hotkeys, set by the player in Settings → Hotkeys.
 * A hotkey is a plain combo string built from KeyboardEvent.code - "Ctrl+Shift+KeyN"
 * - so it stays true no matter which letter layout is active. Handlers live with the
 * screens that own the actions (App.vue registers the page ones); this module only
 * keeps the map, matches key events and persists the player's choices.
 */
import { ref } from 'vue'

export interface HotkeyActionDef {
        id: string
        label: string
        hint?: string
        defaultCombo: string
}

/** Every action a key can be bound to. */
export const HOTKEY_ACTIONS: HotkeyActionDef[] = [
        { id: 'new-instance', label: 'Создать сборку', defaultCombo: 'Ctrl+KeyN' },
        {
                id: 'instance-picker',
                label: 'Открыть сборку (выбор сборки)',
                defaultCombo: 'Ctrl+KeyO',
        },
        { id: 'page-home', label: 'Экран: Домашний', defaultCombo: 'Ctrl+Digit1' },
        { id: 'page-mods', label: 'Экран: Найти моды', defaultCombo: 'Ctrl+Digit2' },
        { id: 'page-modpacks', label: 'Экран: Сборки (Modrinth)', defaultCombo: 'Ctrl+Digit3' },
        { id: 'page-skins', label: 'Экран: Скины', defaultCombo: 'Ctrl+Digit4' },
        { id: 'page-ai', label: 'Экран: Порталус (ИИ)', defaultCombo: 'Ctrl+Digit5' },
        { id: 'page-screenshots', label: 'Экран: Скриншоты', defaultCombo: 'Ctrl+Digit6' },
        { id: 'page-settings', label: 'Экран: Настройки', defaultCombo: 'Ctrl+Digit0' },
        { id: 'new-chat', label: 'Порталус: новый чат', defaultCombo: 'Ctrl+KeyT' },
        { id: 'kill-game', label: 'Закрыть игру', defaultCombo: 'Ctrl+Shift+KeyK' },
        { id: 'fullscreen', label: 'Полный экран', defaultCombo: 'F11' },
]

const STORAGE_KEY = 'portalrinth-hotkeys'

function isCombo(value: unknown): value is string {
        return typeof value === 'string' && /^[A-Z](?:\+(?:[A-Z][a-zA-Z0-9]*|Comma|Period|Slash|Backslash|Semicolon|Quote|Minus|Equal|Bracket\w+))+$/i.test(value)
}

function readCombos(): Record<string, string> {
        try {
                const raw = localStorage.getItem(STORAGE_KEY)
                const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
                const clean: Record<string, string> = {}
                for (const action of HOTKEY_ACTIONS) {
                        const value = parsed[action.id]
                        clean[action.id] = isCombo(value) ? value : action.defaultCombo
                }
                return clean
        } catch {
                const clean: Record<string, string> = {}
                for (const action of HOTKEY_ACTIONS) clean[action.id] = action.defaultCombo
                return clean
        }
}

/** id → combo, reactive for the settings list. */
const combos = ref<Record<string, string>>(readCombos())

export function useHotkeys(): typeof combos {
        return combos
}

export function hotkeyCombo(id: string): string {
        return combos.value[id] ?? HOTKEY_ACTIONS.find((action) => action.id === id)?.defaultCombo ?? ''
}

export function setHotkeyCombo(id: string, combo: string | null): void {
        const next = { ...combos.value }
        if (!combo) {
                const fallback = HOTKEY_ACTIONS.find((action) => action.id === id)?.defaultCombo ?? ''
                next[id] = fallback
        } else {
                // One combo - one action: whoever held it before lets it go.
                for (const other of Object.keys(next)) {
                        if (other !== id && next[other] === combo) next[other] = ''
                }
                next[id] = combo
        }
        combos.value = next
        try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        } catch {
                /* the choice lives until the restart, fine */
        }
}

/** "Ctrl+Shift+KeyN" → "Ctrl+Shift+N". */
export function formatCombo(combo: string): string {
        return combo
                .split('+')
                .map((part) => {
                        if (part === 'Control' || part === 'Ctrl') return 'Ctrl'
                        if (part === 'Shift') return 'Shift'
                        if (part === 'Alt') return 'Alt'
                        if (part === 'Meta') return 'Win'
                        if (part.startsWith('Key')) return part.slice(3)
                        if (part.startsWith('Digit')) return part.slice(5)
                        if (part === 'Comma') return ','
                        if (part === 'Period') return '.'
                        if (part === 'Slash') return '/'
                        if (part === 'Backslash') return '\\'
                        if (part === 'Semicolon') return ';'
                        if (part === 'Quote') return "'"
                        if (part === 'Minus') return '-'
                        if (part === 'Equal') return '='
                        if (part === 'Space') return 'Space'
                        return part
                })
                .join(' + ')
}

/** Builds the stored combo shape from a live keyboard event. */
export function comboFromEvent(event: KeyboardEvent): string | null {
        const code = event.code
        if (!code) return null
        const isModifier = ['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(code)
        if (isModifier) return null
        const parts: string[] = []
        if (event.ctrlKey) parts.push('Ctrl')
        if (event.metaKey) parts.push('Win')
        if (event.altKey) parts.push('Alt')
        if (event.shiftKey) parts.push('Shift')
        if (code === 'Space' || code.startsWith('Key') || code.startsWith('Digit') || code.startsWith('F') || code === 'Comma' || code === 'Period' || code === 'Slash' || code === 'Backslash' || code === 'Semicolon' || code === 'Quote' || code === 'Minus' || code === 'Equal' || code.startsWith('Bracket')) {
                parts.push(code)
        } else if (code === 'Backquote') {
                parts.push('Backquote')
        } else {
                return null
        }
        // A bare letter or digit would eat every keystroke - require a modifier.
        if (parts.length === 1 && !code.startsWith('F')) return null
        return parts.join('+')
}

type HotkeyHandler = () => void | Promise<void>
const handlers = new Map<string, HotkeyHandler>()

/** The last registered handler for an id wins (the owning screen sets it up). */
export function registerHotkeyHandler(id: string, handler: HotkeyHandler): void {
        handlers.set(id, handler)
}

function isTypingTarget(target: EventTarget | null): boolean {
        if (!(target instanceof HTMLElement)) return false
        if (target.isContentEditable) return true
        const tag = target.tagName
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/**
 * The one keydown listener: matches the event against the player's combos and
 * fires the owning handler. Returns true when the key was consumed.
 */
export function handleHotkeyKeyEvent(event: KeyboardEvent): boolean {
        if (isTypingTarget(event.target)) return false
        const combo = comboFromEvent(event)
        if (!combo) return false
        for (const [id, wanted] of Object.entries(combos.value)) {
                if (!wanted || wanted !== combo) continue
                const handler = handlers.get(id)
                if (!handler) continue
                event.preventDefault()
                void handler()
                return true
        }
        return false
}

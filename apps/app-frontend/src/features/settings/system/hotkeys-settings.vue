<script setup lang="ts">
/**
 * Settings → Горячие клавиши: every launcher action that deserves a key,
 * listed with its current combo. Click a combo to record a new one (press
 * the keys, Esc backs out), the cross resets it to the default. Combos are
 * stored by KeyboardEvent.code, so a Russian layout never breaks them.
 */
import { KeyboardIcon, RotateCcwIcon } from '@modrinth/assets'
import { IconButton, defineMessages, useVIntl } from '@modrinth/ui'
import { computed, onBeforeUnmount, ref } from 'vue'

import {
        HOTKEY_ACTIONS,
        comboFromEvent,
        formatCombo,
        setHotkeyCombo,
        useHotkeys,
} from '@/helpers/portalrinth-hotkeys'

const { formatMessage } = useVIntl()

const messages = defineMessages({
        title: { id: 'app.settings.hotkeys.title', defaultMessage: 'Горячие клавиши' },
        note: {
                id: 'app.settings.hotkeys.note',
                defaultMessage: 'Нажми на сочетание и задай своё. Работает из любого экрана лаунчера (когда курсор не в поле ввода).',
        },
        press: { id: 'app.settings.hotkeys.press', defaultMessage: 'Нажми сочетание… (Esc — отмена)' },
        reset: { id: 'app.settings.hotkeys.reset', defaultMessage: 'Вернуть по умолчанию' },
        taken: { id: 'app.settings.hotkeys.taken', defaultMessage: 'Убрано с другой команды' },
})

const combos = useHotkeys()
const recording = ref<string | null>(null)
const note = ref('')

const rows = computed(() =>
        HOTKEY_ACTIONS.map((action) => ({
                ...action,
                combo: combos.value[action.id] ?? action.defaultCombo,
                display: formatCombo(combos.value[action.id] ?? action.defaultCombo),
        })),
)

function startRecording(id: string) {
        recording.value = id
        note.value = ''
        window.addEventListener('keydown', onRecordKey, true)
}

function stopRecording() {
        recording.value = null
        window.removeEventListener('keydown', onRecordKey, true)
}

function onRecordKey(event: KeyboardEvent) {
        if (!recording.value) return
        event.preventDefault()
        event.stopPropagation()
        if (event.key === 'Escape') {
                stopRecording()
                return
        }
        const combo = comboFromEvent(event)
        if (!combo) return
        setHotkeyCombo(recording.value, combo)
        stopRecording()
}

function reset(id: string) {
        setHotkeyCombo(id, null)
        note.value = formatMessage(messages.taken)
}

onBeforeUnmount(stopRecording)
</script>

<template>
        <div class="flex flex-col gap-4">
                <div>
                        <h2 class="m-0 flex items-center gap-2 text-lg font-bold text-contrast">
                                <KeyboardIcon class="size-5 text-blue" />
                                {{ formatMessage(messages.title) }}
                        </h2>
                        <p class="mt-1 mb-0 text-sm text-secondary">{{ formatMessage(messages.note) }}</p>
                </div>

                <p v-if="recording" class="m-0 rounded-xl bg-brand-highlight px-3 py-2 text-sm font-semibold text-contrast">
                        {{ formatMessage(messages.press) }}
                </p>

                <div class="flex flex-col gap-1">
                        <div
                                v-for="row in rows"
                                :key="row.id"
                                class="flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-button-bg"
                        >
                                <span class="grow text-sm text-contrast">{{ row.label }}</span>
                                <button
                                        class="min-w-28 rounded-lg border-0 bg-button-bg px-3 py-1 font-mono text-xs text-contrast transition-opacity"
                                        :class="recording === row.id ? 'animate-pulse opacity-70' : 'hover:opacity-80'"
                                        @click="startRecording(row.id)"
                                >
                                        {{ recording === row.id ? '…' : row.display || '—' }}
                                </button>
                                <IconButton
                                        v-tooltip="formatMessage(messages.reset)"
                                        type="quiet"
                                        size="sm"
                                        :label="formatMessage(messages.reset)"
                                        @click="() => reset(row.id)"
                                >
                                        <RotateCcwIcon class="!size-3.5" />
                                </IconButton>
                        </div>
                </div>

                <p v-if="note" class="m-0 text-xs text-secondary">{{ note }}</p>
        </div>
</template>

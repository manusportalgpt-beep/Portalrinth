<template>
        <Transition name="ai-notice">
                <div
                        v-if="notice && route.path !== '/ai'"
                        class="pointer-events-none fixed left-1/2 top-2 z-[80] -translate-x-1/2"
                >
                        <div
                                class="pointer-events-auto ai-notice-pill"
                                @mouseenter="expanded = true"
                                @mouseleave="expanded = false"
                        >
                                <template v-if="!expanded">
                                        <span class="ai-notice-glow" />
                                        <span class="ai-notice-short">Порталус</span>
                                </template>
                                <template v-else>
                                        <button
                                                class="ai-notice-close"
                                                :aria-label="'Скрыть'"
                                                @click="dismiss"
                                        >
                                                <XIcon class="size-3.5" />
                                        </button>
                                        <p class="ai-notice-text">{{ notice.text }}</p>
                                        <div class="flex items-center gap-2">
                                                <input
                                                        v-model="draft"
                                                        class="ai-notice-input"
                                                        :placeholder="`Ответить ${assistantName}…`"
                                                        @keydown.enter.prevent="reply"
                                                />
                                                <Button color="brand" size="sm" @click="reply">
                                                        {{ formatMessage(messages.send) }}
                                                </Button>
                                        </div>
                                </template>
                        </div>
                </div>
        </Transition>
</template>

<script setup lang="ts">
/**
 * The small top-center notch Portalus leaves behind when he moves the player
 * to another screen: collapsed it is a translucent pill, hovered it unfolds
 * into his message with a one-line way to answer without reopening the chat.
 */
import { XIcon } from '@modrinth/assets'
import { Button, useVIntl } from '@modrinth/ui'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { agentNavNotice, queuedUserMessage } from '@/helpers/ai-assistant'

const { formatMessage } = useVIntl()
const messages = {
        send: { id: 'app.ai.notice.send', defaultMessage: 'Отправить' },
}

const route = useRoute()
const router = useRouter()
const expanded = ref(false)
const draft = ref('')
const assistantName = computed(() => 'Порталус')
const notice = computed(() => agentNavNotice.value)

function dismiss() {
        agentNavNotice.value = null
        expanded.value = false
}

function reply() {
        const text = draft.value.trim()
        if (!text) return
        queuedUserMessage.value = text
        draft.value = ''
        agentNavNotice.value = null
        expanded.value = false
        void router.push('/ai')
}
</script>

<style scoped>
.ai-notice-pill {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        min-width: 5.5rem;
        max-width: min(34rem, 90vw);
        border-radius: 999px;
        border: 1px solid rgb(255 255 255 / 22%);
        background: rgb(255 255 255 / 12%);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        box-shadow: 0 8px 28px rgb(0 0 0 / 22%);
        padding: 0.35rem 0.9rem;
        align-items: center;
        transition:
                border-radius 0.2s ease,
                background 0.2s ease,
                padding 0.2s ease;
}

.ai-notice-pill:hover {
        border-radius: 1.25rem;
        background: rgb(255 255 255 / 16%);
        padding: 0.75rem 1rem;
}

.ai-notice-glow {
        position: absolute;
        inset: -2px;
        border-radius: inherit;
        background: radial-gradient(60% 120% at 50% 0%, rgb(255 255 255 / 14%), transparent 70%);
        pointer-events: none;
}

.ai-notice-short {
        font-size: 0.75rem;
        font-weight: 600;
        color: rgb(255 255 255 / 92%);
        text-shadow: 0 1px 4px rgb(0 0 0 / 45%);
}

.ai-notice-close {
        position: absolute;
        right: 0.4rem;
        top: 0.4rem;
        display: inline-flex;
        border: none;
        background: transparent;
        color: rgb(255 255 255 / 70%);
        cursor: pointer;
        padding: 0.15rem;
        border-radius: 999px;
}

.ai-notice-close:hover {
        color: rgb(255 255 255 / 100%);
}

.ai-notice-text {
        margin: 0.35rem 0 0;
        font-size: 0.8125rem;
        line-height: 1.45;
        color: rgb(255 255 255 / 96%);
        white-space: pre-wrap;
        word-break: break-word;
        max-height: 12rem;
        overflow-y: auto;
        text-shadow: 0 1px 4px rgb(0 0 0 / 45%);
}

.ai-notice-input {
        flex-grow: 1;
        min-width: 0;
        border: 1px solid rgb(255 255 255 / 28%);
        border-radius: 999px;
        background: rgb(0 0 0 / 22%);
        color: rgb(255 255 255 / 96%);
        font: inherit;
        font-size: 0.8125rem;
        padding: 0.35rem 0.75rem;
        outline: none;
}

.ai-notice-input::placeholder {
        color: rgb(255 255 255 / 55%);
}

.ai-notice-input:focus {
        border-color: rgb(255 255 255 / 55%);
}

.ai-notice-enter-active,
.ai-notice-leave-active {
        transition:
                transform 0.25s ease,
                opacity 0.25s ease;
}

.ai-notice-enter-from,
.ai-notice-leave-to {
        transform: translateY(-0.75rem);
        opacity: 0;
}
</style>

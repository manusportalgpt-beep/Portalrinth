<script setup lang="ts">/**
 * Settings → Resources → DNS: a shelf of public resolvers that often reach
 * what an internet provider hides, with a live check against each one.
 *
 * The launcher only ever *asks* the servers here (a plain DNS query, the way
 * any computer resolves names); it never edits the system's network settings.
 * Applying a server is the player's move - the hint below says where - and
 * leaving or removing it undoes everything, which is what makes this safe.
 */
import { CheckIcon, CopyIcon, PlusIcon, SpinnerIcon, TrashIcon } from '@modrinth/assets'
import { Button, defineMessages, IconButton, Input, useVIntl } from '@modrinth/ui'
import { computed, reactive, ref } from 'vue'

import { invoke } from '@tauri-apps/api/core'

const { formatMessage } = useVIntl()

interface DnsServer {
        name: string
        preferred: string
        alternate: string
        about: string
}

const SERVERS: DnsServer[] = [
        {
                name: 'Quad9',
                preferred: '9.9.9.9',
                alternate: '149.112.112.112',
                about:
                        'Крупный международный резолвер с фильтрацией вредоносных доменов и политикой «не логировать IP». Часто открывает то, что провайдер прячет, и просто быстрый.',
        },
        {
                name: 'GeoHide',
                preferred: '159.194.200.33',
                alternate: '193.233.112.67',
                about:
                        'Резолвер, заточенный под обход геоблокировок: отвечает адресами, которые работают там, где обычные ответы «поплыли» по региону.',
        },
        {
                name: 'Zapret DNS',
                preferred: '83.217.211.149',
                alternate: '',
                about:
                        'Резолвер проекта zapret — обходит DNS-блокировки и подмены ответов на уровне провайдера. Альтернативного адреса нет: работает одним сервером.',
        },
        {
                name: 'DNS-AI',
                preferred: '194.87.196.13',
                alternate: '45.151.102.219',
                about:
                        'Настроен на доступ к ИИ-сервисам (OpenRouter, API моделей), которые из России отвечают неохотно. Помогает, когда чат ИИ «не дозванивается».',
        },
        {
                name: 'MagicDNS',
                preferred: '109.120.132.43',
                alternate: '94.249.177.102',
                about: 'Публичный резолвер с обходом блокировок, быстрый из России.',
        },
]

const messages = defineMessages({
        title: { id: 'app.settings.dns.title', defaultMessage: 'DNS servers' },
        description: {
                id: 'app.settings.dns.description',
                defaultMessage:
                        'Public resolvers that can reach what an internet provider hides - game servers like Hypixel included. The launcher only queries them to check; it never changes your system settings, so trying them is completely safe.',
        },
        howTo: {
                id: 'app.settings.dns.how-to',
                defaultMessage:
                        'To actually use one: Windows → network adapter settings → DNS → enter the addresses below manually, or put them into your router. IPv4 fields only - nothing else is affected.',
        },
        preferred: { id: 'app.settings.dns.preferred', defaultMessage: 'Preferred' },
        alternate: { id: 'app.settings.dns.alternate', defaultMessage: 'Alternate' },
        noAlternate: { id: 'app.settings.dns.no-alternate', defaultMessage: 'None' },
        check: { id: 'app.settings.dns.check', defaultMessage: 'Check' },
        checking: { id: 'app.settings.dns.checking', defaultMessage: 'Checking…' },
        ok: { id: 'app.settings.dns.ok', defaultMessage: 'answers in {ms} ms' },
        fail: { id: 'app.settings.dns.fail', defaultMessage: 'no answer: {detail}' },
        customTitle: {
                id: 'app.settings.dns.custom.title',
                defaultMessage: 'Your own DNS server',
        },
        customName: { id: 'app.settings.dns.custom.name', defaultMessage: 'Name' },
        customIp: { id: 'app.settings.dns.custom.ip', defaultMessage: 'IP address' },
        customAdd: { id: 'app.settings.dns.custom.add', defaultMessage: 'Add server' },
        customBad: {
                id: 'app.settings.dns.custom.bad',
                defaultMessage: 'The address must be an IP, like 9.9.9.9',
        },
        copied: { id: 'app.settings.dns.copied', defaultMessage: 'Copied' },
        copy: { id: 'app.settings.dns.copy', defaultMessage: 'Copy' },
        remove: { id: 'app.settings.dns.remove', defaultMessage: 'Remove' },
})

// ---- The check -------------------------------------------------------------

interface CheckState {
        state: 'idle' | 'running' | 'ok' | 'fail'
        ms: number
        ips: string[]
        detail: string
}

const checks = reactive<Record<string, CheckState>>({})

function checkOf(server: string): CheckState {
        if (!checks[server]) {
                checks[server] = { state: 'idle', ms: 0, ips: [], detail: '' }
        }
        return checks[server]
}

async function check(server: string) {
        const state = checkOf(server)
        if (state.state === 'running') return
        state.state = 'running'
        state.detail = ''
        try {
                const result = await invoke<{ ok: boolean; ips: string[]; ms: number; detail: string }>(
                        'plugin:portalrinth-dns|dns_check',
                        { server, domain: 'modrinth.com' },
                )
                state.state = result.ok ? 'ok' : 'fail'
                state.ms = result.ms
                state.ips = result.ips
                state.detail = result.detail
        } catch (error) {
                state.state = 'fail'
                state.detail = String((error as Error)?.message ?? error).slice(0, 120)
        }
}

// ---- Custom servers --------------------------------------------------------

const CUSTOM_KEY = 'portalrinth-dns-custom'

function readCustom(): DnsServer[] {
        try {
                const raw = localStorage.getItem(CUSTOM_KEY)
                const parsed = raw ? JSON.parse(raw) : []
                return Array.isArray(parsed) ? parsed : []
        } catch {
                return []
        }
}

const customServers = ref<DnsServer[]>(readCustom())
const newName = ref('')
const newIp = ref('')
const nameError = ref(false)

const canAdd = computed(() => newName.value.trim().length > 0 && newIp.value.trim().length > 0)

function isIp(value: string): boolean {
        return /^\d{1,3}(\.\d{1,3}){3}$/.test(value) || value.includes(':')
}

function addCustom() {
        const name = newName.value.trim()
        const ip = newIp.value.trim().split(/\s+/)[0] ?? ''
        if (!name || !isIp(ip)) {
                nameError.value = true
                return
        }
        nameError.value = false
        customServers.value = [
                ...customServers.value,
                { name, preferred: ip, alternate: '', about: '' },
        ]
        try {
                localStorage.setItem(CUSTOM_KEY, JSON.stringify(customServers.value))
        } catch {
                /* the list just does not survive a restart */
        }
        newName.value = ''
        newIp.value = ''
}

function removeCustom(name: string) {
        customServers.value = customServers.value.filter((server) => server.name !== name)
        try {
                localStorage.setItem(CUSTOM_KEY, JSON.stringify(customServers.value))
        } catch {
                /* same here */
        }
}

// ---- Copy ------------------------------------------------------------------

const copiedIp = ref('')
let copiedTimer: ReturnType<typeof setTimeout> | undefined

async function copyIp(ip: string) {
        try {
                await navigator.clipboard.writeText(ip)
                copiedIp.value = ip
                clearTimeout(copiedTimer)
                copiedTimer = setTimeout(() => (copiedIp.value = ''), 1500)
        } catch {
                /* the field is right there to select by hand */
        }
}
</script>

<template>
        <div class="flex flex-col gap-2.5">
                <h2 class="mt-0 m-0 text-lg font-semibold text-contrast">
                        {{ formatMessage(messages.title) }}
                </h2>
                <p class="m-0 leading-tight text-secondary">{{ formatMessage(messages.description) }}</p>
                <p class="m-0 leading-tight text-secondary">{{ formatMessage(messages.howTo) }}</p>

                <div class="mt-1 flex flex-col gap-2">
                        <div
                                v-for="server in [...SERVERS, ...customServers]"
                                :key="server.name"
                                class="flex flex-col gap-2 rounded-2xl border-2 border-solid p-4"
                                :class="
                                        checks[server.preferred]?.state === 'ok'
                                                ? 'border-green border-solid'
                                                : 'border-surface-5'
                                "
                        >
                                <div class="flex flex-wrap items-center gap-2">
                                        <span class="font-semibold text-contrast">{{ server.name }}</span>
                                        <Button size="sm" :disabled="checks[server.preferred]?.state === 'running'" @click="() => check(server.preferred)">
                                                <SpinnerIcon v-if="checks[server.preferred]?.state === 'running'" class="size-3.5 animate-spin" />
                                                <CheckIcon v-else-if="checks[server.preferred]?.state === 'ok'" class="size-3.5 text-green" />
                                                {{ checks[server.preferred]?.state === 'running' ? formatMessage(messages.checking) : formatMessage(messages.check) }}
                                        </Button>
                                        <span
                                                v-if="checks[server.preferred]?.state === 'ok'"
                                                class="text-sm text-green"
                                        >
                                                {{ formatMessage(messages.ok, { ms: checks[server.preferred].ms }) }}
                                        </span>
                                        <span
                                                v-else-if="checks[server.preferred]?.state === 'fail'"
                                                class="text-sm text-red"
                                        >
                                                {{ formatMessage(messages.fail, { detail: checks[server.preferred].detail }) }}
                                        </span>
                                        <IconButton
                                                v-if="customServers.some((custom) => custom.name === server.name)"
                                                v-tooltip="formatMessage(messages.remove)"
                                                class="ml-auto"
                                                @click="() => removeCustom(server.name)"
                                        >
                                                <TrashIcon class="size-4" />
                                        </IconButton>
                                </div>
                                <p v-if="server.about" class="m-0 text-sm leading-snug text-secondary">
                                        {{ server.about }}
                                </p>
                                <div class="flex flex-wrap items-center gap-2 text-sm">
                                        <button class="dns-ip" @click="() => copyIp(server.preferred)">
                                                {{ formatMessage(messages.preferred) }}: <code>{{ server.preferred }}</code>
                                                <CopyIcon v-if="copiedIp !== server.preferred" class="size-3 opacity-60" />
                                                <span v-else class="text-green">{{ formatMessage(messages.copied) }}</span>
                                        </button>
                                        <template v-if="server.alternate">
                                                <button class="dns-ip" @click="() => copyIp(server.alternate)">
                                                        {{ formatMessage(messages.alternate) }}: <code>{{ server.alternate }}</code>
                                                        <CopyIcon v-if="copiedIp !== server.alternate" class="size-3 opacity-60" />
                                                        <span v-else class="text-green">{{ formatMessage(messages.copied) }}</span>
                                                </button>
                                        </template>
                                        <span v-else class="text-secondary">
                                                {{ formatMessage(messages.alternate) }}: {{ formatMessage(messages.noAlternate) }}
                                        </span>
                                </div>
                        </div>
                </div>

                <div class="mt-1 flex flex-col gap-2 rounded-2xl bg-surface-2 p-4">
                        <span class="font-semibold text-contrast">{{ formatMessage(messages.customTitle) }}</span>
                        <div class="flex flex-wrap items-center gap-2">
                                <Input v-model="newName" :placeholder="formatMessage(messages.customName)" class="w-48" />
                                <Input
                                        v-model="newIp"
                                        :placeholder="formatMessage(messages.customIp)"
                                        class="w-52"
                                        @keydown.enter="addCustom"
                                />
                                <Button :disabled="!canAdd" @click="addCustom">
                                        <PlusIcon class="size-4" />
                                        {{ formatMessage(messages.customAdd) }}
                                </Button>
                        </div>
                        <p v-if="nameError" class="m-0 text-xs font-semibold text-red">
                                {{ formatMessage(messages.customBad) }}
                        </p>
                </div>
        </div>
</template>


<style scoped>
.dns-ip {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        border: none;
        background: transparent;
        color: var(--color-secondary);
        cursor: pointer;
        padding: 0.1rem 0;
        font-size: 0.8125rem;
}

.dns-ip:hover code {
        color: var(--color-contrast);
}

.dns-ip code {
        background: var(--color-button-bg);
        border-radius: 0.375rem;
        padding: 0.05rem 0.4rem;
        font-size: 0.8125rem;
}
</style>

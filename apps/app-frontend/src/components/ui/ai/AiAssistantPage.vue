<script setup lang="ts">
import {
	ArrowUpIcon,
	BotIcon,
	ChevronDownIcon,
	ChevronUpIcon,
	SparklesIcon,
	TrashIcon,
	WrenchIcon,
} from '@modrinth/assets'
import { Button, IconButton, Input, useVIntl } from '@modrinth/ui'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import AiProviderSettings from '@/components/ui/ai/AiProviderSettings.vue'
import {
	aiComplete,
	aiHistory,
	type AiMessage,
	aiSettings,
	clearAiHistory,
	providerById,
	pushAiMessage,
} from '@/helpers/ai-assistant'

const { formatMessage } = useVIntl()

const messages = {
	heading: { id: 'app.ai.heading', defaultMessage: 'ИИ-Помощник' },
	description: {
		id: 'app.ai.description',
		defaultMessage:
			'Локальный агент лаунчера: собирает сборки, ищет моды, объясняет ошибки и умеет открывать нужные экраны сам.',
	},
	placeholder: {
		id: 'app.ai.input.placeholder',
		defaultMessage: 'Спросите что-нибудь… например, «собери сборку на 1.21 с JEI»',
	},
	send: { id: 'app.ai.send', defaultMessage: 'Отправить' },
	clear: { id: 'app.ai.clear', defaultMessage: 'Очистить историю' },
	emptyTitle: { id: 'app.ai.empty.title', defaultMessage: 'Чем помочь?' },
	emptyHint: {
		id: 'app.ai.empty.hint',
		defaultMessage:
			'Спросите про моды, сборки, скины или ошибки — ответы приходят от выбранной модели, а действия агент выполняет прямо в лаунчере.',
	},
	suggestionBuild: {
		id: 'app.ai.suggestion.build',
		defaultMessage: 'Собери сборку на 1.21.1 с оптимизацией',
	},
	suggestionMods: {
		id: 'app.ai.suggestion.mods',
		defaultMessage: 'Найди мод на карты для Forge 1.20.1',
	},
	suggestionCrash: {
		id: 'app.ai.suggestion.crash',
		defaultMessage: 'Почему сборка не запускается? Что посмотреть в логах?',
	},
	suggestionSkins: {
		id: 'app.ai.suggestion.skins',
		defaultMessage: 'Как поменять скин игрока в лаунчере?',
	},
	thinking: { id: 'app.ai.thinking', defaultMessage: 'Думает…' },
	modelSection: { id: 'app.ai.tab.section', defaultMessage: 'Модель' },
}

const suggestions = computed(() => [
	formatMessage(messages.suggestionBuild),
	formatMessage(messages.suggestionMods),
	formatMessage(messages.suggestionCrash),
	formatMessage(messages.suggestionSkins),
])

const input = ref('')
const sending = ref(false)
const streaming = ref('')
const errorText = ref('')
const showModelPanel = ref(false)
const scrollBox = ref<HTMLElement | null>(null)
let typeTimer: ReturnType<typeof setInterval> | undefined

const visibleHistory = computed(() => aiHistory.value.filter((m) => m.role !== 'note'))

const providerLabel = computed(
	() => providerById(aiSettings.value.provider)?.label ?? aiSettings.value.provider,
)

function stopTyping() {
	clearInterval(typeTimer)
	typeTimer = undefined
	streaming.value = ''
}

function scrollToBottom() {
	void nextTick(() => {
		const box = scrollBox.value
		if (box) box.scrollTop = box.scrollHeight
	})
}

watch(visibleHistory, scrollToBottom, { deep: false })
watch(streaming, scrollToBottom)

function providerName(id?: string) {
	if (!id) return ''
	return providerById(id)?.label ?? id
}

function actionName(tool: string) {
	const map: Record<string, string> = {
		navigate: 'открыл экран',
		open_creation_modal: 'открыл создание сборки',
		open_instance: 'открыл сборку',
		list_instances: 'посмотрел список сборок',
		get_page: 'посмотрел, где вы находитесь',
		web_fetch: 'прочитал страницу',
		web_search: 'поискал в интернете',
		celebrate: 'отплясывает',
	}
	return map[tool] ?? tool
}

async function send(text?: string) {
	const message = (text ?? input.value).trim()
	if (!message || sending.value) return
	errorText.value = ''
	input.value = ''
	pushAiMessage({ role: 'user', content: message, ts: Date.now() })
	sending.value = true

	const payload = aiHistory.value
		.filter((m) => m.role !== 'note')
		.slice(-20)
		.map((m) => ({
			role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
			content: m.content,
		}))

	try {
		const result = await aiComplete({
			kind: 'tab',
			messages: payload,
			onActionDone: () => {
				streaming.value = ''
			},
		})
		stopTyping()
		const done: AiMessage = {
			role: 'assistant',
			content: result.content,
			ts: Date.now(),
			provider: result.provider,
			actions: result.actions,
		}
		if (aiSettings.value.chatEffects) {
			let index = 0
			const content = result.content
			typeTimer = setInterval(() => {
				index = Math.min(content.length, index + 3)
				streaming.value = content.slice(0, index)
				if (index >= content.length) {
					stopTyping()
					pushAiMessage(done)
				}
			}, 16)
		} else {
			pushAiMessage(done)
		}
	} catch (error) {
		stopTyping()
		errorText.value = String((error as Error)?.message ?? error)
	} finally {
		sending.value = false
	}
}

function clearChat() {
	if (sending.value) return
	stopTyping()
	errorText.value = ''
	clearAiHistory()
}

onBeforeUnmount(stopTyping)

defineExpose({ send })
</script>

<template>
	<div class="ai-page flex h-full min-h-0 flex-col">
		<div class="flex items-start justify-between gap-3 px-6 pt-6">
			<div class="flex flex-col gap-1">
				<h1 class="m-0 flex items-center gap-2 text-2xl font-bold text-primary">
					<SparklesIcon class="text-brand" />
					{{ formatMessage(messages.heading) }}
				</h1>
				<p class="m-0 max-w-3xl text-base text-secondary">
					{{ formatMessage(messages.description) }}
				</p>
			</div>
			<div class="flex items-center gap-2">
				<Button
					@click="
						() => {
							showModelPanel = !showModelPanel
						}
					"
				>
					<component :is="showModelPanel ? ChevronUpIcon : ChevronDownIcon" />
					{{ providerLabel }}
				</Button>
				<IconButton
					v-tooltip="formatMessage(messages.clear)"
					:disabled="sending"
					:label="formatMessage(messages.clear)"
					@click="clearChat"
				>
					<TrashIcon />
				</IconButton>
			</div>
		</div>

		<div
			v-if="showModelPanel"
			class="mx-6 mt-4 rounded-2xl border border-solid border-surface-5 bg-surface-2 p-4"
		>
			<AiProviderSettings compact />
		</div>

		<div ref="scrollBox" class="min-h-0 grow overflow-y-auto px-6 py-4">
			<div
				v-if="visibleHistory.length === 0"
				class="flex h-full flex-col items-center justify-center gap-2 text-center"
			>
				<BotIcon class="size-10 text-secondary" />
				<p class="m-0 text-lg font-semibold text-primary">
					{{ formatMessage(messages.emptyTitle) }}
				</p>
				<p class="m-0 max-w-xl text-sm text-secondary">
					{{ formatMessage(messages.emptyHint) }}
				</p>
				<div class="mt-2 flex max-w-xl flex-wrap justify-center gap-2">
					<Button
						v-for="suggestion in suggestions"
						:key="suggestion"
						size="sm"
						@click="() => send(suggestion)"
					>
						{{ suggestion }}
					</Button>
				</div>
			</div>

			<template v-else>
				<div
					v-for="(message, index) in visibleHistory"
					:key="index"
					class="mb-3 flex"
					:class="message.role === 'user' ? 'justify-end' : 'justify-start'"
				>
					<div
						class="ai-bubble max-w-[85%] rounded-2xl px-4 py-2.5"
						:class="message.role === 'user' ? 'ai-bubble-user' : 'ai-bubble-assistant'"
					>
						<p class="m-0 whitespace-pre-wrap break-words text-sm leading-relaxed">
							{{ message.content }}
						</p>
						<div v-if="message.actions?.length" class="mt-1.5 flex flex-wrap gap-1">
							<span v-for="action in message.actions" :key="action" class="ai-action-chip">
								<WrenchIcon class="size-3" />
								{{ actionName(action) }}
							</span>
						</div>
						<span
							v-if="message.role === 'assistant' && providerName(message.provider)"
							class="ai-provider-tag"
						>
							{{ providerName(message.provider) }}
						</span>
					</div>
				</div>
			</template>

			<div v-if="sending" class="mb-3 flex justify-start">
				<div class="ai-bubble ai-bubble-assistant rounded-2xl px-4 py-2.5">
					<span class="ai-typing">
						<span /><span /><span />
						{{ formatMessage(messages.thinking) }}
					</span>
				</div>
			</div>
			<div v-else-if="streaming" class="mb-3 flex justify-start">
				<div class="ai-bubble ai-bubble-assistant rounded-2xl px-4 py-2.5">
					<p class="m-0 whitespace-pre-wrap break-words text-sm leading-relaxed">
						{{ streaming }}
					</p>
				</div>
			</div>
		</div>

		<div class="shrink-0 px-6 pb-6">
			<p v-if="errorText" class="ai-error m-0 mb-2 rounded-xl px-3 py-2 text-sm">
				{{ errorText }}
			</p>
			<div
				class="ai-input-row flex items-end gap-2 rounded-3xl border border-solid border-surface-5 bg-surface-2 p-2"
			>
				<Input
					v-model="input"
					class="grow"
					:wrapper-class="'grow'"
					:disabled="sending"
					:placeholder="formatMessage(messages.placeholder)"
					@keydown.enter.prevent="() => send()"
				/>
				<Button color="brand" :disabled="sending || !input.trim()" @click="() => send()">
					<ArrowUpIcon />
				</Button>
			</div>
		</div>
	</div>
</template>

<style scoped>
.ai-bubble-user {
	background: color-mix(in srgb, var(--color-brand) 18%, var(--color-button-bg));
	border: 1px solid color-mix(in srgb, var(--color-brand) 30%, transparent);
	border-bottom-right-radius: 0.5rem;
}

.ai-bubble-assistant {
	background: var(--color-button-bg);
	border: 1px solid var(--surface-5);
	border-bottom-left-radius: 0.5rem;
}

.ai-action-chip {
	display: inline-flex;
	align-items: center;
	gap: 0.25rem;
	border-radius: 999px;
	background: color-mix(in srgb, var(--color-brand) 14%, transparent);
	color: var(--color-brand);
	font-size: 0.6875rem;
	padding: 0.1rem 0.5rem;
}

.ai-provider-tag {
	display: block;
	margin-top: 0.25rem;
	font-size: 0.6875rem;
	color: var(--color-secondary);
	opacity: 0.8;
}

.ai-error {
	border: 1px solid color-mix(in srgb, var(--color-red) 40%, transparent);
	background: color-mix(in srgb, var(--color-red) 12%, transparent);
	color: var(--color-red);
}

.ai-input-row {
	box-shadow: 0 8px 24px rgb(0 0 0 / 18%);
}

.ai-typing {
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
	color: var(--color-secondary);
	font-size: 0.8125rem;
}

.ai-typing span {
	width: 0.35rem;
	height: 0.35rem;
	border-radius: 999px;
	background: var(--color-brand);
	animation: ai-dot 1.2s infinite ease-in-out;
}

.ai-typing span:nth-child(2) {
	animation-delay: 0.15s;
}

.ai-typing span:nth-child(3) {
	animation-delay: 0.3s;
}

@keyframes ai-dot {
	0%,
	80%,
	100% {
		transform: translateY(0);
		opacity: 0.4;
	}
	40% {
		transform: translateY(-0.25rem);
		opacity: 1;
	}
}

@media (prefers-reduced-motion: reduce) {
	.ai-typing span {
		animation: none;
	}
}
</style>

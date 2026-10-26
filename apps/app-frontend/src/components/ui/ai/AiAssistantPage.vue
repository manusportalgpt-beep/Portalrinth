<script setup lang="ts">
import {
	ArrowUpIcon,
	ClipboardCopyIcon,
	ChevronDownIcon,
	FileIcon,
	PlusIcon,
	SparklesIcon,
	XIcon,
} from '@modrinth/assets'
import { Button, IconButton, Input, useVIntl } from '@modrinth/ui'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import AiProviderSettings from '@/components/ui/ai/AiProviderSettings.vue'
import {
	type AiMessage,
	aiComplete,
	aiHistory,
	aiSettings,
	clearAiHistory,
	providerById,
	pushAiMessage,
} from '@/helpers/ai-assistant'
import {
	attachFromPaths,
	type AttachedFile,
	formatSize,
	inboxSave,
	readLatestSession,
} from '@/helpers/ai-sandbox'

const { formatMessage } = useVIntl()

const messages = {
	heading: { id: 'app.ai.heading', defaultMessage: 'ИИ-Помощник' },
	description: {
		id: 'app.ai.description',
		defaultMessage:
			'Portalus — агент лаунчера: создаёт моды, шейдеры и ресурс-паки, ищет в интернете, собирает сборки, разбирает ваши файлы и помнит прошлые разговоры.',
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
	plus: { id: 'app.ai.plus', defaultMessage: 'Меню чата' },
	plusNewChat: { id: 'app.ai.plus.new-chat', defaultMessage: 'Новый чат' },
	plusPaste: { id: 'app.ai.plus.paste', defaultMessage: 'Вставить из буфера' },
	plusPasteEmpty: {
		id: 'app.ai.plus.paste-empty',
		defaultMessage: 'В буфере обмена нет текста.',
	},
	plusAttach: { id: 'app.ai.plus.attach', defaultMessage: 'Прикрепить файл' },
	attach: { id: 'app.ai.attach', defaultMessage: 'Прикрепить файлы' },
	attachEmpty: {
		id: 'app.ai.attach-empty',
		defaultMessage: 'Файл не выбран',
	},
	models: { id: 'app.ai.models', defaultMessage: 'Модель и ключ' },
	commands: { id: 'app.ai.activity.commands', defaultMessage: 'команд' },
	filesCreated: { id: 'app.ai.activity.created', defaultMessage: 'сгенерирован файл' },
	filesChanged: { id: 'app.ai.activity.changed', defaultMessage: 'изменён файл' },
	questionTitle: {
		id: 'app.ai.question.title',
		defaultMessage: 'Помощник ждёт вашего решения',
	},
	questionOwn: { id: 'app.ai.question.own', defaultMessage: 'Свой ответ…' },
	questionSend: { id: 'app.ai.question.send', defaultMessage: 'Ответить' },
	noVision: {
		id: 'app.ai.no-vision',
		defaultMessage: 'Эта модель не видит изображения.',
	},
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
const plusOpen = ref(false)
const modelsOpen = ref(false)
const scrollBox = ref<HTMLElement | null>(null)
const attachments = ref<AttachedFile[]>([])
const questionDraft = ref('')
let typeTimer: ReturnType<typeof setInterval> | undefined

const visibleHistory = computed(() => aiHistory.value.filter((m) => m.role !== 'note'))

const providerLabel = computed(
	() => providerById(aiSettings.value.provider)?.label ?? aiSettings.value.provider,
)

const modelChipLabel = computed(() => {
	const provider = providerById(aiSettings.value.provider)
	if (provider?.id === 'custom') {
		return aiSettings.value.customModel || 'Своя модель'
	}
	const stored = aiSettings.value.models[provider?.id ?? ''] ?? provider?.models[0]?.id ?? ''
	const label = provider?.models.find((m) => m.id === stored)?.label ?? stored
	const hasKey = !provider?.needsKey || Boolean(aiSettings.value.keys[provider.id])
	return `${providerLabel.value} · ${label}${hasKey ? '' : ' · без ключа'}`
})

const lastQuestion = computed(() => {
	for (let i = visibleHistory.value.length - 1; i >= 0; i--) {
		const message = visibleHistory.value[i] as AiMessage
		if (message.role === 'user') return null
		if (message.role === 'assistant' && message.question) return message.question
	}
	return null
})

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
		launcher_set_accent: 'сменил цвет акцента',
		launcher_set_background: 'поставил фон',
		launcher_search_mods: 'поискал моды в CF и MR',
		sandbox_list: 'посмотрел файлы песочницы',
		sandbox_read: 'прочитал файл',
		sandbox_write: 'записал файл',
		sandbox_delete: 'удалил файл',
		sandbox_pack: 'упаковал архив',
		sandbox_unpack: 'распаковал архив',
		memory_read: 'перечитал заметки',
		memory_write: 'записал заметку',
		session_list: 'перечитал прошлые сессии',
		session_read: 'перечитал сессию',
		ask_user: 'спросил вас',
		celebrate: 'отплясывает',
	}
	return map[tool] ?? tool
}

async function send(text?: string) {
	const message = (text ?? input.value).trim()
	if ((!message && attachments.value.length === 0) || sending.value) return
	errorText.value = ''
	input.value = ''
	const files = attachments.value
	attachments.value = []
	// A copy lands in the sandbox's inbox, so Portalus can return to
	// these files on any later turn - read, unpack, rework, delete.
	let inboxNote = ''
	if (files.length > 0) {
		try {
			const saved = await inboxSave(files)
			if (saved.length > 0) {
				inboxNote = `\n\n[файлы сохранены в песочницу: ${saved.join(', ')}]`
			}
		} catch {
			/* the chat copy below still carries text and previews */
		}
	}
	const attachmentNote = files
		.map((file) =>
			file.kind === 'text' && file.text
				? `\n\n[файл ${file.name}]:\n\`\`\`\n${file.text}\n\`\`\``
				: `\n\n[прикреплён файл: ${file.name}${file.size ? `, ${formatSize(file.size)}` : ''}]`,
		)
		.join('')
	pushAiMessage({
		role: 'user',
		content: message + attachmentNote + inboxNote,
		ts: Date.now(),
		attachments: files.length > 0 ? files : undefined,
	})
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
			images: files.filter((file) => file.kind === 'image'),
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
			activity: result.activity,
			question: result.question,
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

function togglePlus() {
	plusOpen.value = !plusOpen.value
}

function plusNewChat() {
	plusOpen.value = false
	clearChat()
}

async function plusPaste() {
	plusOpen.value = false
	if (sending.value) return
	let text = ''
	try {
		text = await navigator.clipboard.readText()
	} catch {
		text = ''
	}
	const trimmed = text.trim()
	if (!trimmed) {
		errorText.value = formatMessage(messages.plusPasteEmpty)
		return
	}
	const clipped = trimmed.length > 12000 ? `${trimmed.slice(0, 12000)}\n…` : trimmed
	await send(clipped)
}

async function plusAttach() {
	plusOpen.value = false
	try {
		const { open } = await import('@tauri-apps/plugin-dialog')
		const paths = await open({ multiple: true })
		if (!paths) return
		const list = typeof paths === 'string' ? [paths] : paths
		const files = await attachFromPaths(list)
		if (files.length === 0) {
			errorText.value = formatMessage(messages.attachEmpty)
			return
		}
		attachments.value = [...attachments.value, ...files]
	} catch {
		errorText.value = formatMessage(messages.attachEmpty)
	}
}

function removeAttachment(index: number) {
	attachments.value = attachments.value.filter((_, i) => i !== index)
}

function answerQuestion(answer: string) {
	if (sending.value) return
	const trimmed = answer.trim()
	if (!trimmed) return
	questionDraft.value = ''
	void send(trimmed)
}

function toggleModels() {
	modelsOpen.value = !modelsOpen.value
}

onMounted(async () => {
	scrollToBottom()
	// The chat itself lives in localStorage; the sessions folder is the
	// long-term memory. If the local copy is gone, the last session restores.
	if (aiHistory.value.length === 0) {
		const session = await readLatestSession()
		if (session?.messages?.length) {
			aiHistory.value = session.messages as AiMessage[]
		}
	}
})

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
		</div>

		<div ref="scrollBox" class="min-h-0 grow overflow-y-auto px-6 py-4">
			<div
				v-if="visibleHistory.length === 0"
				class="flex h-full flex-col items-center justify-center gap-2 text-center"
			>
				<SparklesIcon class="size-10 text-secondary" />
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
						<div v-if="message.attachments?.length" class="mb-2 flex flex-wrap gap-2">
							<template v-for="(file, fileIndex) in message.attachments" :key="fileIndex">
								<img
									v-if="file.kind === 'image' && file.dataUrl"
									:src="file.dataUrl"
									:alt="file.name"
									class="ai-attach-image"
								/>
								<span v-else class="ai-attach-chip">
									<FileIcon class="size-3.5 shrink-0" />
									{{ file.name }}
									<span v-if="file.size" class="text-secondary">{{ formatSize(file.size) }}</span>
								</span>
							</template>
						</div>
						<p class="m-0 whitespace-pre-wrap break-words text-sm leading-relaxed">
							{{ message.content }}
						</p>

						<div v-if="message.activity" class="ai-activity">
							<span v-if="message.activity.commands > 0" class="ai-activity-chip">
								⚙ {{ message.activity.commands }} {{ formatMessage(messages.commands) }}
							</span>
							<span
								v-for="file in message.activity.filesCreated"
								:key="`c-${file}`"
								class="ai-activity-chip ai-activity-created"
							>
								＋ {{ formatMessage(messages.filesCreated) }}: {{ file }}
							</span>
							<span
								v-for="change in message.activity.filesChanged"
								:key="`m-${change.path}`"
								class="ai-activity-chip ai-activity-changed"
							>
								{{ formatMessage(messages.filesChanged) }}: {{ change.path }}
								<span class="text-green">+{{ change.added }}</span>/<span class="text-red">
									−{{ change.removed }}</span
								>
							</span>
						</div>

						<div v-if="message.actions?.length" class="mt-1.5 flex flex-wrap gap-1">
							<span v-for="action in message.actions" :key="action" class="ai-action-chip">
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

				<div v-if="lastQuestion" class="mb-3 flex justify-start">
					<div class="ai-question-card rounded-2xl p-4">
						<p class="m-0 mb-2 text-sm font-semibold text-primary">
							{{ lastQuestion.text }}
						</p>
						<div class="flex flex-wrap gap-2">
							<Button
								v-for="option in lastQuestion.options"
								:key="option"
								size="sm"
								:disabled="sending"
								@click="() => answerQuestion(option)"
							>
								{{ option }}
							</Button>
						</div>
						<div class="mt-2 flex items-center gap-2">
							<Input
								v-model="questionDraft"
								:disabled="sending"
								:placeholder="formatMessage(messages.questionOwn)"
								class="max-w-xs grow"
								@keydown.enter.prevent="() => answerQuestion(questionDraft)"
							/>
							<Button
								color="brand"
								size="sm"
								:disabled="sending || !questionDraft.trim()"
								@click="() => answerQuestion(questionDraft)"
							>
								{{ formatMessage(messages.questionSend) }}
							</Button>
						</div>
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

			<div v-if="attachments.length > 0" class="mb-2 flex flex-wrap gap-2">
				<span v-for="(file, index) in attachments" :key="`${file.name}-${index}`" class="ai-attach-chip">
					<img
						v-if="file.kind === 'image' && file.dataUrl"
						:src="file.dataUrl"
						:alt="file.name"
						class="size-6 rounded object-cover"
					/>
					<FileIcon v-else class="size-3.5 shrink-0" />
					{{ file.name }}
					<span v-if="file.size" class="text-secondary">{{ formatSize(file.size) }}</span>
					<button
						class="ml-1 cursor-pointer border-none bg-transparent p-0 text-secondary hover:text-primary"
						@click="removeAttachment(index)"
					>
						<XIcon class="size-3.5" />
					</button>
				</span>
			</div>

			<div
				class="ai-input-row flex items-center gap-2 rounded-3xl border border-solid border-surface-5 bg-surface-2 p-2"
			>
				<div class="relative shrink-0">
					<IconButton
						v-tooltip="formatMessage(messages.plus)"
						:disabled="sending"
						:label="formatMessage(messages.plus)"
						@click="togglePlus"
					>
						<PlusIcon />
					</IconButton>
					<div
						v-if="plusOpen"
						class="fixed inset-0 z-10 cursor-default"
						@click="plusOpen = false"
					/>
					<div
						v-if="plusOpen"
						class="ai-menu absolute bottom-full left-0 z-20 mb-2 flex min-w-56 flex-col gap-1 rounded-xl border border-solid border-surface-5 bg-surface-2 p-1"
					>
						<button class="ai-menu-item" @click="plusNewChat">
							<PlusIcon class="size-4" />
							{{ formatMessage(messages.plusNewChat) }}
						</button>
						<button class="ai-menu-item" @click="plusAttach">
							<FileIcon class="size-4" />
							{{ formatMessage(messages.plusAttach) }}
						</button>
						<button class="ai-menu-item" @click="plusPaste">
							<ClipboardCopyIcon class="size-4" />
							{{ formatMessage(messages.plusPaste) }}
						</button>
					</div>
				</div>
				<Input
					v-model="input"
					class="grow"
					:wrapper-class="'grow'"
					:disabled="sending"
					:placeholder="formatMessage(messages.placeholder)"
					@keydown.enter.prevent="() => send()"
				/>
				<div class="relative shrink-0">
					<button class="ai-model-chip" :disabled="sending" @click="toggleModels">
						{{ modelChipLabel }}
						<ChevronDownIcon class="size-3.5 opacity-70" />
					</button>
					<div
						v-if="modelsOpen"
						class="fixed inset-0 z-10 cursor-default"
						@click="modelsOpen = false"
					/>
					<div
						v-if="modelsOpen"
						class="ai-menu absolute bottom-full right-0 z-20 mb-2 max-h-[26rem] w-[34rem] overflow-y-auto rounded-2xl border border-solid border-surface-5 bg-surface-2 p-4"
					>
						<p class="m-0 mb-3 text-sm font-semibold text-primary">
							{{ formatMessage(messages.models) }}
						</p>
						<AiProviderSettings compact />
					</div>
				</div>
				<Button
					color="brand"
					class="ai-send !rounded-full"
					:disabled="sending || (!input.trim() && attachments.length === 0)"
					@click="() => send()"
				>
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

.ai-menu {
	box-shadow: 0 8px 24px rgb(0 0 0 / 18%);
}

.ai-menu-item {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	border-radius: 0.5rem;
	padding: 0.45rem 0.75rem;
	font-size: 0.8125rem;
	color: var(--color-primary);
	text-align: left;
	cursor: pointer;
	background: transparent;
	border: none;
}

.ai-menu-item:hover {
	background: var(--color-button-bg);
}

.ai-model-chip {
	display: inline-flex;
	align-items: center;
	gap: 0.375rem;
	max-width: 16rem;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	border: 1px solid var(--surface-5);
	background: var(--color-button-bg);
	border-radius: 999px;
	padding: 0.45rem 0.8rem;
	font-size: 0.8125rem;
	color: var(--color-primary);
	cursor: pointer;
}

.ai-model-chip:hover {
	border-color: var(--color-brand);
}

.ai-model-chip:disabled {
	opacity: 0.6;
	cursor: default;
}

.ai-send {
	width: 2.75rem;
	height: 2.75rem;
	min-width: 2.75rem;
	padding: 0;
}

.ai-attach-image {
	max-height: 10rem;
	max-width: 16rem;
	border-radius: 0.75rem;
	border: 1px solid var(--surface-5);
	object-fit: cover;
}

.ai-attach-chip {
	display: inline-flex;
	align-items: center;
	gap: 0.375rem;
	border-radius: 0.625rem;
	border: 1px solid var(--surface-5);
	background: var(--color-button-bg);
	padding: 0.3rem 0.6rem;
	font-size: 0.75rem;
	color: var(--color-primary);
}

.ai-activity {
	display: flex;
	flex-wrap: wrap;
	gap: 0.375rem;
	margin-top: 0.5rem;
}

.ai-activity-chip {
	display: inline-flex;
	align-items: center;
	gap: 0.25rem;
	border-radius: 0.5rem;
	background: color-mix(in srgb, var(--color-secondary) 12%, transparent);
	color: var(--color-secondary);
	font-size: 0.6875rem;
	padding: 0.1rem 0.45rem;
}

.ai-activity-created {
	background: color-mix(in srgb, var(--color-green) 16%, transparent);
	color: var(--color-green);
}

.ai-activity-changed {
	background: color-mix(in srgb, var(--color-orange) 16%, transparent);
	color: var(--color-orange);
}

.ai-question-card {
	background: color-mix(in srgb, var(--color-brand) 10%, var(--color-button-bg));
	border: 1px solid color-mix(in srgb, var(--color-brand) 35%, transparent);
	max-width: 85%;
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

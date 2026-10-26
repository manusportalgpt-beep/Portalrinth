<script setup lang="ts">
import { ExternalIcon, EyeIcon, EyeOffIcon, KeyIcon } from '@modrinth/assets'
import { Button, DropdownSelect, Input, useVIntl } from '@modrinth/ui'
import { computed, ref } from 'vue'

import {
	AI_PROVIDERS,
	type AiProvider,
	aiSettings,
	chosenModel,
	saveAiSettings,
	testProvider,
} from '@/helpers/ai-assistant'

defineProps<{
	compact?: boolean
}>()

const { formatMessage } = useVIntl()
const messages = {
	provider: { id: 'app.ai.settings.provider', defaultMessage: 'Провайдер' },
	model: { id: 'app.ai.settings.model', defaultMessage: 'Модель' },
	key: { id: 'app.ai.settings.key', defaultMessage: 'API-ключ' },
	keyPlaceholder: {
		id: 'app.ai.settings.key.placeholder',
		defaultMessage: 'Вставьте API-ключ этого провайдера',
	},
	getKey: { id: 'app.ai.settings.getkey', defaultMessage: 'Получить ключ' },
	customBase: {
		id: 'app.ai.settings.custombase',
		defaultMessage: 'Адрес (OpenAI-совместимый)',
	},
	customModel: { id: 'app.ai.settings.custommodel', defaultMessage: 'Имя модели' },
	noteFree: {
		id: 'app.ai.settings.note.free',
		defaultMessage:
			'Бесплатно, без ключа. Если модель занята, лаунчер сам подхватит запасного провайдера.',
	},
	fallback: {
		id: 'app.ai.settings.fallback',
		defaultMessage:
			'Если у основного кончатся лимиты, ответ придёт от запасного провайдера без ключа.',
	},
	test: { id: 'app.ai.settings.test', defaultMessage: 'Проверить связь' },
	testRunning: {
		id: 'app.ai.settings.test.running',
		defaultMessage: 'Проверяю связь…',
	},
	testOk: {
		id: 'app.ai.settings.test.ok',
		defaultMessage: 'Связь есть — ИИ отвечает',
	},
	testFail: {
		id: 'app.ai.settings.test.fail',
		defaultMessage: 'Не отвечает',
	},
}

const showKey = ref(false)

const provider = computed<AiProvider>(
	() => AI_PROVIDERS.find((p) => p.id === aiSettings.value.provider) ?? AI_PROVIDERS[0],
)

const modelOptions = computed(() => {
	if (provider.value.id === 'custom') return []
	return provider.value.models.map((m) => m.label)
})

const modelLabelById = computed(() => {
	const map: Record<string, string> = {}
	for (const m of provider.value.models) map[m.id] = m.label
	return map
})

const currentModel = computed(() => {
	if (provider.value.id === 'custom') return aiSettings.value.customModel
	const id = chosenModel(aiSettings.value, provider.value.id)
	return modelLabelById.value[id] ?? id
})

function selectModelLabel(label: string) {
	const found = provider.value.models.find((m) => m.label === label)
	if (!found) return
	aiSettings.value.models[provider.value.id] = found.id
	saveAiSettings()
}

const keyValue = computed({
	get: () => aiSettings.value.keys[aiSettings.value.provider] ?? '',
	set: (value: string) => {
		aiSettings.value.keys[aiSettings.value.provider] = value
		saveAiSettings()
	},
})

const customBase = computed({
	get: () => aiSettings.value.customBaseUrl,
	set: (value: string) => {
		aiSettings.value.customBaseUrl = value
		saveAiSettings()
	},
})

const customModelName = computed({
	get: () => aiSettings.value.customModel,
	set: (value: string) => {
		aiSettings.value.customModel = value
		saveAiSettings()
	},
})

function openKeyPage() {
	if (provider.value.keyUrl) {
		window.open(provider.value.keyUrl, '_blank')
	}
}

const testState = ref<'idle' | 'running' | 'ok' | 'fail'>('idle')
const testResult = ref('')

async function runConnectionTest() {
	if (testState.value === 'running') return
	testState.value = 'running'
	testResult.value = ''
	try {
		testResult.value = await testProvider()
		testState.value = 'ok'
	} catch (error) {
		testResult.value = String((error as Error)?.message ?? error).slice(0, 240)
		testState.value = 'fail'
	}
}
</script>

<template>
	<div class="flex flex-col" :class="compact ? 'gap-3' : 'gap-4'">
		<div class="flex flex-col gap-1.5">
			<span class="text-sm font-semibold text-primary">{{ formatMessage(messages.provider) }}</span>
			<div class="flex flex-wrap gap-2">
				<button
					v-for="p in AI_PROVIDERS"
					:key="p.id"
					type="button"
					class="ai-provider-card"
					:class="{ 'ai-provider-card-active': p.id === aiSettings.provider }"
					@click="
						() => {
							aiSettings.provider = p.id
							saveAiSettings()
						}
					"
				>
					<span class="flex items-center gap-1.5">
						{{ p.label }}
						<span v-if="p.fromRussia" class="ai-badge ai-badge-rf">РФ</span>
						<span v-if="!p.needsKey" class="ai-badge ai-badge-free">free</span>
					</span>
				</button>
			</div>
		</div>

		<div class="grid gap-3" :class="compact ? '' : 'grid-cols-[1fr_1fr]'">
			<div
				v-if="provider.id !== 'custom' && provider.models.length > 0"
				class="flex flex-col gap-1.5"
			>
				<span class="text-sm font-semibold text-primary">{{ formatMessage(messages.model) }}</span>
				<DropdownSelect
					name="ai-model"
					:options="modelOptions"
					:model-value="currentModel"
					@change="(o) => selectModelLabel(String(o.option))"
				/>
			</div>
			<div v-if="provider.needsKey" class="flex flex-col gap-1.5">
				<span class="text-sm font-semibold text-primary">{{ formatMessage(messages.key) }}</span>
				<div class="flex gap-2">
					<Input
						v-model="keyValue"
						:type="showKey ? 'text' : 'password'"
						autocomplete="off"
						:placeholder="formatMessage(messages.keyPlaceholder)"
					/>
					<Button icon-only @click="() => (showKey = !showKey)">
						<EyeIcon v-if="showKey" />
						<EyeOffIcon v-else />
					</Button>
					<Button
						v-if="provider.keyUrl"
						v-tooltip="formatMessage(messages.getKey)"
						icon-only
						@click="openKeyPage"
					>
						<ExternalIcon />
					</Button>
				</div>
			</div>
		</div>

		<template v-if="provider.id === 'custom'">
			<div class="grid gap-3" :class="compact ? '' : 'grid-cols-[2fr_1fr]'">
				<div class="flex flex-col gap-1.5">
					<span class="text-sm font-semibold text-primary">
						{{ formatMessage(messages.customBase) }}
					</span>
					<Input
						v-model="customBase"
						autocomplete="off"
						placeholder="http://localhost:1234/v1/chat/completions"
					/>
				</div>
				<div class="flex flex-col gap-1.5">
					<span class="text-sm font-semibold text-primary">
						{{ formatMessage(messages.customModel) }}
					</span>
					<Input v-model="customModelName" autocomplete="off" placeholder="my-model" />
				</div>
			</div>
		</template>

		<p v-if="provider.id === 'pollinations'" class="m-0 text-sm text-secondary">
			{{ formatMessage(messages.noteFree) }}
		</p>
		<p v-else-if="provider.note" class="m-0 text-sm text-secondary">{{ provider.note }}</p>
		<div class="flex flex-col gap-1.5">
			<div class="flex items-center gap-2">
				<button
					type="button"
					class="ai-provider-card ai-test-button"
					:disabled="testState === 'running'"
					@click="runConnectionTest"
				>
					{{
						testState === 'running'
							? formatMessage(messages.testRunning)
							: formatMessage(messages.test)
					}}
				</button>
				<span
					v-if="testState === 'ok'"
					class="ai-test-dot ai-test-ok"
				>{{ testResult }} — {{ formatMessage(messages.testOk) }}</span>
				<span
					v-else-if="testState === 'fail'"
					class="ai-test-dot ai-test-fail"
				>{{ formatMessage(messages.testFail) }}: {{ testResult }}</span>
			</div>
		</div>
		<p class="m-0 flex items-center gap-1.5 text-sm text-secondary">
			<KeyIcon class="size-4 shrink-0" />
			{{ formatMessage(messages.fallback) }}
		</p>
	</div>
</template>

<style scoped>
.ai-provider-card {
	border: 1px solid var(--surface-5);
	background: var(--color-button-bg);
	border-radius: var(--radius-sm);
	padding: 0.4rem 0.7rem;
	cursor: pointer;
	font-size: 0.8125rem;
	color: var(--color-primary);
	transition:
		border-color 0.15s ease,
		background 0.15s ease,
		transform 0.1s ease;
}

.ai-provider-card:hover {
	border-color: var(--color-brand);
	transform: translateY(-1px);
}

.ai-provider-card-active {
	border-color: var(--color-brand);
	background: color-mix(in srgb, var(--color-brand) 12%, var(--color-button-bg));
}

.ai-badge {
	border-radius: 999px;
	font-size: 0.625rem;
	font-weight: 700;
	padding: 0.05rem 0.4rem;
	line-height: 1.4;
}

.ai-badge-rf {
	background: color-mix(in srgb, var(--color-blue) 22%, transparent);
	color: var(--color-blue);
}

.ai-badge-free {
	background: color-mix(in srgb, var(--color-green) 22%, transparent);
	color: var(--color-green);
}

.ai-test-button:disabled {
	opacity: 0.6;
	cursor: default;
}

.ai-test-dot {
	font-size: 0.75rem;
	line-height: 1.35;
	overflow-wrap: anywhere;
}

.ai-test-ok {
	color: var(--color-green);
}

.ai-test-fail {
	color: var(--color-red);
}
</style>

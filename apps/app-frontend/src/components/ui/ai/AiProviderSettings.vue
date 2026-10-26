<script setup lang="ts">
import { ExternalIcon, EyeIcon, EyeOffIcon, KeyIcon, XIcon } from '@modrinth/assets'
import { Button, DropdownSelect, Input, useVIntl } from '@modrinth/ui'
import { computed, onMounted, ref } from 'vue'

import {
	AI_IMAGE_PROVIDERS,
	AI_PROVIDERS,
	type AiProvider,
	aiSettings,
	bridgeInfo,
	bridgeStatus,
	bridgeToggling,
	chosenModel,
	imageProviderById,
	saveAiSettings,
	startBridge,
	stopBridge,
	testProvider,
} from '@/helpers/ai-assistant'

defineProps<{
	compact?: boolean
}>()

const { formatMessage } = useVIntl()
const messages = {
	workGroup: { id: 'app.ai.settings.group.work', defaultMessage: 'Для работы' },
	imageGroup: {
		id: 'app.ai.settings.group.image',
		defaultMessage: 'Для генерации изображений',
	},
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
	customModelAny: {
		id: 'app.ai.settings.custom-model-any',
		defaultMessage: 'Своя модель (id с сайта провайдера — там их намного больше):',
	},
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
	bridge: { id: 'app.ai.bridge', defaultMessage: 'Мост' },
	bridgeHint: {
		id: 'app.ai.bridge.hint',
		defaultMessage:
			'Мост поднимает локальную страницу: открой адрес в браузере на этом же компьютере, введи ключ — и общайся с Порталусом со страницы. Всё работает через лаунчер, без облака и бесплатно.',
	},
	bridgeStart: { id: 'app.ai.bridge.start', defaultMessage: 'Запустить' },
	bridgeStop: { id: 'app.ai.bridge.stop', defaultMessage: 'Остановить' },
	bridgeCopy: { id: 'app.ai.bridge.copy', defaultMessage: 'Скопировать адрес и ключ' },
	bridgeCopied: { id: 'app.ai.bridge.copied', defaultMessage: 'Скопировано!' },
	bridgeRunning: { id: 'app.ai.bridge.running', defaultMessage: 'Работает' },
	bridgeIdle: { id: 'app.ai.bridge.idle', defaultMessage: 'Выключен' },
	skills: { id: 'app.ai.skills', defaultMessage: 'Скиллы' },
	skillsHint: {
		id: 'app.ai.skills.hint',
		defaultMessage:
			'Скилл - постоянная инструкция для ИИ (что уметь и как себя вести). ИИ тоже может ставить их сам через <<skill_save|имя::описание>>.',
	},
	skillsEmpty: {
		id: 'app.ai.skills.empty',
		defaultMessage: 'Скиллов пока нет - добавь свой ниже.',
	},
	skillName: { id: 'app.ai.skills.name', defaultMessage: 'Название скилла' },
	skillText: {
		id: 'app.ai.skills.text',
		defaultMessage: 'Что уметь и как (инструкция)',
	},
	skillAdd: { id: 'app.ai.skills.add', defaultMessage: 'Установить скилл' },
}

const showKey = ref(false)
const showImageKey = ref(false)
const provider = computed<AiProvider>(
	() => AI_PROVIDERS.find((p) => p.id === aiSettings.value.provider) ?? AI_PROVIDERS[0],
)

const imageProvider = computed(
	() => imageProviderById(aiSettings.value.imageProvider) ?? AI_IMAGE_PROVIDERS[0],
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

const imageKeyValue = computed({
	get: () => aiSettings.value.imageKeys[imageProvider.value.id] ?? '',
	set: (value: string) => {
		aiSettings.value.imageKeys = {
			...aiSettings.value.imageKeys,
			[imageProvider.value.id]: value,
		}
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

/** Any model of the chosen provider, typed by hand - the catalogues here show
 * only a fraction of what each service actually serves. */
const overrideModel = computed({
	get: () => aiSettings.value.models[aiSettings.value.provider] ?? '',
	set: (value: string) => {
		const trimmed = value.trim()
		const models = { ...aiSettings.value.models }
		if (trimmed) models[aiSettings.value.provider] = trimmed
		else delete models[aiSettings.value.provider]
		saveAiSettings({ models })
	},
})

function openKeyPage(url?: string) {
	if (url) {
		window.open(url, '_blank')
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

// ---- Skills ---------------------------------------------------------------

const skills = computed(() => aiSettings.value.skills ?? [])
const newSkillName = ref('')
const newSkillText = ref('')

function addSkill() {
	const name = newSkillName.value.trim()
	const text = newSkillText.value.trim()
	if (!name || !text) return
	saveAiSettings({
		skills: [...skills.value, { id: `skill-${Date.now()}`, name, text, on: true }],
	})
	newSkillName.value = ''
	newSkillText.value = ''
}

function removeSkill(id: string) {
	saveAiSettings({ skills: skills.value.filter((skill) => skill.id !== id) })
}

function toggleSkill(id: string) {
	saveAiSettings({
		skills: skills.value.map((skill) => (skill.id === id ? { ...skill, on: !skill.on } : skill)),
	})
}

// ---- The bridge -----------------------------------------------------------

const bridgeCopied = ref(false)

async function toggleBridge() {
	if (bridgeToggling.value) return
	bridgeToggling.value = true
	try {
		if (bridgeInfo.value) {
			await stopBridge()
		} else {
			await startBridge()
		}
	} catch {
		/* the status dot simply stays off */
	} finally {
		bridgeToggling.value = false
	}
}

async function copyBridgeDetails() {
	const info = bridgeInfo.value
	if (!info) return
	try {
		await navigator.clipboard.writeText(`${info.url} — ключ: ${info.key}`)
		bridgeCopied.value = true
		setTimeout(() => {
			bridgeCopied.value = false
		}, 1500)
	} catch {
		/* the clipboard may refuse - the fields are visible anyway */
	}
}

onMounted(() => {
	void bridgeStatus().catch(() => {})
})
</script>

<template>
	<div class="flex flex-col" :class="compact ? 'gap-3' : 'gap-4'">
		<div class="flex flex-col gap-1.5">
			<span class="text-sm font-semibold text-primary">{{ formatMessage(messages.workGroup) }}</span>
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
				<p class="m-0 text-xs text-secondary">{{ formatMessage(messages.customModelAny) }}</p>
				<Input
					v-model="overrideModel"
					autocomplete="off"
					:placeholder="provider.models[0]?.id ?? 'model-id'"
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
						@click="() => openKeyPage(provider.keyUrl)"
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
		<p class="m-0 flex items-center gap-1.5 text-sm text-secondary">
			<KeyIcon class="size-4 shrink-0" />
			{{ formatMessage(messages.fallback) }}
		</p>

		<div class="flex flex-col gap-1.5">
			<span class="text-sm font-semibold text-primary">
				{{ formatMessage(messages.imageGroup) }}
			</span>
			<div class="flex flex-wrap gap-2">
				<button
					v-for="p in AI_IMAGE_PROVIDERS"
					:key="p.id"
					type="button"
					class="ai-provider-card"
					:class="{ 'ai-provider-card-active': p.id === aiSettings.imageProvider }"
					@click="
						() => {
							aiSettings.imageProvider = p.id
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
			<div v-if="imageProvider.needsKey" class="flex gap-2">
				<Input
					v-model="imageKeyValue"
					:type="showImageKey ? 'text' : 'password'"
					autocomplete="off"
					:placeholder="formatMessage(messages.keyPlaceholder)"
				/>
				<Button icon-only @click="() => (showImageKey = !showImageKey)">
					<EyeIcon v-if="showImageKey" />
					<EyeOffIcon v-else />
				</Button>
				<Button
					v-if="imageProvider.keyUrl"
					v-tooltip="formatMessage(messages.getKey)"
					icon-only
					@click="() => openKeyPage(imageProvider.keyUrl)"
				>
					<ExternalIcon />
				</Button>
			</div>
			<p v-if="imageProvider.note" class="m-0 text-xs text-secondary">
				{{ imageProvider.note }}
			</p>
		</div>

		<div class="flex flex-col gap-1.5">
			<div class="flex items-center gap-2">
				<button
					type="button"
					class="ai-provider-card ai-test-button"
					:disabled="testState === 'running'"
					@click="runConnectionTest"
				>
					{{
						testState === 'running' ? formatMessage(messages.testRunning) : formatMessage(messages.test)
					}}
				</button>
				<span v-if="testState === 'ok'" class="ai-test-dot ai-test-ok">
					{{ testResult }} — {{ formatMessage(messages.testOk) }}
				</span>
				<span v-else-if="testState === 'fail'" class="ai-test-dot ai-test-fail">
					{{ formatMessage(messages.testFail) }}: {{ testResult }}
				</span>
			</div>
		</div>

		<div class="ai-skill-section flex flex-col gap-1.5">
			<span class="text-sm font-semibold text-primary">{{ formatMessage(messages.skills) }}</span>
			<p v-if="skills.length === 0" class="m-0 text-sm text-secondary">
				{{ formatMessage(messages.skillsEmpty) }}
			</p>
			<div v-for="skill in skills" :key="skill.id" class="ai-skill-row">
				<label class="ai-skill-head">
					<input type="checkbox" :checked="skill.on" @change="() => toggleSkill(skill.id)" />
					<span class="text-sm font-medium text-primary">{{ skill.name }}</span>
				</label>
				<p class="ai-skill-text m-0">{{ skill.text }}</p>
				<button class="ai-skill-delete" aria-label="Удалить" @click="() => removeSkill(skill.id)">
					<XIcon class="size-3.5" />
				</button>
			</div>
			<div class="flex flex-col gap-1.5">
				<Input v-model="newSkillName" :placeholder="formatMessage(messages.skillName)" />
				<Input v-model="newSkillText" :placeholder="formatMessage(messages.skillText)" />
				<Button size="sm" :disabled="!newSkillName.trim() || !newSkillText.trim()" @click="addSkill">
					{{ formatMessage(messages.skillAdd) }}
				</Button>
			</div>
			<p class="m-0 text-xs leading-relaxed text-secondary">{{ formatMessage(messages.skillsHint) }}</p>
		</div>
		<div class="ai-bridge-section flex flex-col gap-1.5">
			<div class="flex items-center justify-between gap-2">
				<span class="flex items-center gap-1.5 text-sm font-semibold text-primary">
					<span
						class="size-2 rounded-full"
						:style="{
							background: bridgeInfo ? 'var(--color-green)' : 'var(--color-surface-5)',
						}"
					/>
					{{ formatMessage(messages.bridge) }}
					<span class="text-xs font-normal text-secondary">
						{{ bridgeInfo ? formatMessage(messages.bridgeRunning) : formatMessage(messages.bridgeIdle) }}
					</span>
				</span>
				<div class="flex gap-2">
					<Button v-if="bridgeInfo" size="sm" @click="copyBridgeDetails">
						{{ bridgeCopied ? formatMessage(messages.bridgeCopied) : formatMessage(messages.bridgeCopy) }}
					</Button>
					<Button
						size="sm"
						:color="bridgeInfo ? undefined : 'brand'"
						:disabled="bridgeToggling"
						@click="toggleBridge"
					>
						{{ bridgeInfo ? formatMessage(messages.bridgeStop) : formatMessage(messages.bridgeStart) }}
					</Button>
				</div>
			</div>
			<template v-if="bridgeInfo">
				<Input :model-value="bridgeInfo.url" readonly class="mb-1" />
				<Input :model-value="bridgeInfo.key" readonly />
			</template>
			<p class="m-0 text-xs leading-relaxed text-secondary">
				{{ formatMessage(messages.bridgeHint) }}
			</p>
		</div>
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

.ai-bridge-section {
	border-top: 1px solid var(--surface-5);
	padding-top: 0.75rem;
}
.ai-skill-section {
	border-top: 1px solid var(--surface-5);
	padding-top: 0.75rem;
}

.ai-skill-row {
	border: 1px solid var(--surface-5);
	border-radius: 0.625rem;
	background: var(--color-button-bg);
	padding: 0.5rem 0.625rem;
	position: relative;
}

.ai-skill-head {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	cursor: pointer;
}

.ai-skill-text {
	margin-top: 0.25rem;
	font-size: 0.75rem;
	line-height: 1.45;
	color: var(--color-secondary);
	white-space: pre-wrap;
	word-break: break-word;
}

.ai-skill-delete {
	position: absolute;
	top: 0.4rem;
	right: 0.4rem;
	border: none;
	background: transparent;
	color: var(--color-secondary);
	cursor: pointer;
	padding: 0.15rem;
	border-radius: 0.375rem;
}

.ai-skill-delete:hover {
	color: var(--color-red);
}
</style>

<template>
	<Transition name="ai-dock">
		<div v-if="visible" class="ai-dock-anchor" :style="{ left: `${anchorLeft}px` }">
			<div
				class="ai-dock"
				:class="{ 'ai-dock--open': open, 'ai-dock--busy': agentBusy }"
				role="region"
				aria-label="Порталус"
			>
				<!-- The pill: always there while Portalus has something going -->
				<button type="button" class="ai-dock-pill" :aria-expanded="open" @click="toggle">
					<span class="ai-dock-orb" :class="{ 'ai-dock-orb--busy': agentBusy }">
						<SparklesIcon class="size-3" />
					</span>
					<span class="ai-dock-name">Порталус</span>
					<span v-if="statusText" class="ai-dock-status" :class="{ 'ai-dock-shimmer': agentBusy }">
						{{ statusText }}
					</span>
					<span v-if="unread && !open" class="ai-dock-dot" />
					<ChevronDownIcon class="ai-dock-chevron size-3.5" :class="{ 'rotate-180': open }" />
				</button>

				<!-- The panel: the live run or the last reply, and a way to answer -->
				<div class="ai-dock-fold" :class="{ 'ai-dock-fold--open': open }">
					<div class="ai-dock-fold-inner" :inert="!open || undefined">
						<div class="ai-dock-body">
							<div ref="scroller" class="ai-dock-scroll">
								<AiSteps
									v-if="agentBusy && agentTurn.steps.length"
									:steps="agentTurn.steps"
									live
									:phase="phaseLabel"
									@open-link="openLink"
								/>
								<p v-if="agentBusy && agentStreaming" class="ai-dock-text">
									{{ agentStreaming }}<span class="ai-dock-caret" />
								</p>
								<p
									v-else-if="agentBusy && !agentTurn.steps.length"
									class="ai-dock-text ai-dock-muted"
								>
									<span class="ai-dock-shimmer">{{ phaseLabel }}…</span>
								</p>
								<template v-else-if="!agentBusy && lastReply">
									<p v-if="lastUser" class="ai-dock-you"><span>Ты:</span> {{ lastUser }}</p>
									<p class="ai-dock-text">{{ lastReply }}</p>
								</template>
								<p v-else-if="!agentBusy" class="ai-dock-text ai-dock-muted">
									Напиши, что сделать — я сделаю прямо здесь, без перехода в чат.
								</p>
							</div>
							<form class="ai-dock-input-row" @submit.prevent="reply">
								<input
									ref="input"
									v-model="draft"
									class="ai-dock-input"
									:placeholder="agentBusy ? 'Добавить к задаче…' : 'Попроси Порталуса…'"
									@keydown.esc.prevent="open = false"
								/>
								<button
									v-if="agentBusy"
									v-tooltip="'Остановить'"
									type="button"
									class="ai-dock-icon-btn ai-dock-stop"
									aria-label="Остановить"
									@click="stopAgentRun"
								>
									<StopCircleIcon class="size-4" />
								</button>
								<button
									v-tooltip="'Отправить'"
									type="submit"
									class="ai-dock-icon-btn ai-dock-send"
									:disabled="!draft.trim()"
									aria-label="Отправить"
								>
									<SendIcon class="size-4" />
								</button>
							</form>
							<div class="ai-dock-foot">
								<button type="button" class="ai-dock-link" @click="openChat">
									<ExternalIcon class="size-3.5" />
									Открыть чат
								</button>
								<button type="button" class="ai-dock-link" @click="dismiss">
									<XIcon class="size-3.5" />
									Скрыть
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</Transition>
</template>

<script setup lang="ts">
/**
 * Portalus's dock: a glass pill to the right of the title-bar clock that
 * stays while he works or has something to say, on every screen. Clicked it
 * unfolds into the live run (the same step timeline as the chat) or his last
 * reply, with an input that talks to him right here - the player never has
 * to go back to the chat to keep working with him.
 */
import {
	ChevronDownIcon,
	ExternalIcon,
	SendIcon,
	SparklesIcon,
	StopCircleIcon,
	XIcon,
} from '@modrinth/assets'
import { openUrl } from '@tauri-apps/plugin-opener'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AiSteps from '@/components/ui/ai/AiSteps.vue'
import {
	agentBusy,
	agentNavNotice,
	agentPhase,
	agentStreaming,
	agentTurn,
	aiHistory,
	sendAgentMessage,
	stopAgentRun,
} from '@/helpers/ai-assistant'

const route = useRoute()
const router = useRouter()
const open = ref(false)
const draft = ref('')
const dismissed = ref(false)
const unread = ref(false)
const input = ref<HTMLInputElement | null>(null)
const scroller = ref<HTMLElement | null>(null)

/** Shown off the chat page while there is a run, a fresh notice, or the
 * player opened it; "Скрыть" puts it away until Portalus has news again. */
const visible = computed(
	() =>
		route.path !== '/ai' &&
		!dismissed.value &&
		(agentBusy.value || agentNavNotice.value !== null || open.value),
)

const phaseLabel = computed(() =>
	agentPhase.value === 'working'
		? 'Работаю'
		: agentPhase.value === 'speaking'
			? 'Отвечаю'
			: 'Думаю',
)

const runningStep = computed(() =>
	[...agentTurn.value.steps].reverse().find((step) => step.status === 'running'),
)

const statusText = computed(() => {
	if (agentBusy.value) {
		const step = runningStep.value
		if (step?.kind === 'tool' && step.tool) return `${phaseLabel.value} · ${toolLabel(step.tool)}`
		return `${phaseLabel.value}…`
	}
	if (agentNavNotice.value) return 'готово'
	return ''
})

const TOOL_LABELS: Record<string, string> = {
	web_search: 'ищу в интернете',
	web_fetch: 'читаю страницу',
	fandom: 'читаю вики',
	launcher_search_mods: 'ищу моды',
	launcher_install: 'ставлю',
	install_modpack: 'ставлю модпак',
	create_instance: 'создаю сборку',
	launch_instance: 'запускаю игру',
	lan_publish: 'открываю мир',
	update_mods: 'обновляю моды',
	navigate: 'открываю экран',
	gen_image: 'рисую',
	sandbox_bash: 'выполняю команду',
	sandbox_write: 'пишу файл',
	instance_info: 'смотрю сборку',
}

function toolLabel(tool: string): string {
	return TOOL_LABELS[tool] ?? tool.replace(/_/g, ' ')
}

const lastAssistant = computed(() =>
	[...aiHistory.value].reverse().find((message) => message.role === 'assistant'),
)
const lastReply = computed(() =>
	(lastAssistant.value?.content ?? agentNavNotice.value?.text ?? '')
		.replace(/<<[^>]*>>/g, '')
		.replace(/```[\s\S]*?```/g, '[код — в чате]')
		.trim()
		.slice(0, 900),
)
const lastUser = computed(() => {
	const messages = aiHistory.value
	const index = lastAssistant.value ? messages.lastIndexOf(lastAssistant.value) : messages.length
	for (let i = index - 1; i >= 0; i--) {
		if (messages[i].role === 'user') return messages[i].content.split('\n')[0].slice(0, 120)
	}
	return ''
})

// News un-hides the dock and marks it unread.
watch(
	() => agentNavNotice.value?.at,
	(at) => {
		if (!at) return
		dismissed.value = false
		if (!open.value) unread.value = true
	},
)
watch(agentBusy, (busy) => {
	if (busy) dismissed.value = false
})
watch([() => agentTurn.value.steps.length, agentStreaming, open], () => {
	void nextTick(() => {
		const box = scroller.value
		if (box) box.scrollTop = box.scrollHeight
	})
})

function toggle() {
	open.value = !open.value
	if (open.value) {
		unread.value = false
		void nextTick(() => input.value?.focus())
	}
}

function reply() {
	const text = draft.value.trim()
	if (!text) return
	draft.value = ''
	// Straight to the agent: the player stays on this screen.
	void sendAgentMessage(text)
}

function dismiss() {
	open.value = false
	dismissed.value = true
	unread.value = false
	agentNavNotice.value = null
}

function openChat() {
	open.value = false
	agentNavNotice.value = null
	void router.push('/ai')
}

function openLink(url: string) {
	void openUrl(url).catch(() => window.open(url, '_blank'))
}

// Sits just right of the title-bar clock, so the time stays readable.
const anchorLeft = ref(0)
function place() {
	const clock = document.querySelector<HTMLElement>('[data-titlebar-clock]')
	const rect = clock?.getBoundingClientRect()
	anchorLeft.value = rect && rect.width > 0 ? rect.right + 10 : window.innerWidth / 2 + 64
}
let observer: ResizeObserver | undefined
onMounted(() => {
	place()
	window.addEventListener('resize', place)
	const clock = document.querySelector<HTMLElement>('[data-titlebar-clock]')
	if (clock && 'ResizeObserver' in window) {
		observer = new ResizeObserver(place)
		observer.observe(clock)
	}
})
watch(visible, (shown) => {
	if (shown) void nextTick(place)
})
onBeforeUnmount(() => {
	window.removeEventListener('resize', place)
	observer?.disconnect()
})
</script>

<style scoped>
.ai-dock-anchor {
	position: fixed;
	top: 0.3rem;
	z-index: 80;
	pointer-events: none;
}

.ai-dock {
	pointer-events: auto;
	display: flex;
	flex-direction: column;
	width: max-content;
	max-width: min(26rem, calc(100vw - 2rem));
	border-radius: 1.1rem;
	border: 1px solid color-mix(in srgb, var(--color-contrast) 14%, transparent);
	background: color-mix(in srgb, var(--color-raised-bg) 62%, transparent);
	backdrop-filter: blur(18px) saturate(1.3);
	-webkit-backdrop-filter: blur(18px) saturate(1.3);
	box-shadow:
		0 10px 32px rgb(0 0 0 / 28%),
		inset 0 1px 0 rgb(255 255 255 / 6%);
	overflow: hidden;
	transition:
		width 0.35s cubic-bezier(0.2, 0.8, 0.2, 1),
		border-radius 0.3s ease,
		background-color 0.25s ease,
		box-shadow 0.25s ease;
}

.ai-dock--open {
	width: min(26rem, calc(100vw - 2rem));
	border-radius: 1.1rem;
	background: color-mix(in srgb, var(--color-raised-bg) 78%, transparent);
}

.ai-dock--busy {
	box-shadow:
		0 10px 32px rgb(0 0 0 / 28%),
		0 0 0 1px color-mix(in srgb, var(--color-brand) 35%, transparent),
		0 0 22px color-mix(in srgb, var(--color-brand) 22%, transparent);
}

.ai-dock-pill {
	display: flex;
	align-items: center;
	gap: 0.45rem;
	min-width: 0;
	padding: 0.3rem 0.6rem 0.3rem 0.35rem;
	border: none;
	background: transparent;
	color: var(--color-contrast);
	font: inherit;
	font-size: 0.75rem;
	cursor: pointer;
	text-align: left;
}

.ai-dock-orb {
	position: relative;
	display: grid;
	place-items: center;
	width: 1.35rem;
	height: 1.35rem;
	flex-shrink: 0;
	border-radius: 999px;
	color: #fff;
	background: radial-gradient(
		circle at 30% 30%,
		color-mix(in srgb, var(--color-brand) 70%, #fff),
		var(--color-brand)
	);
	box-shadow: 0 0 10px color-mix(in srgb, var(--color-brand) 55%, transparent);
}

.ai-dock-orb--busy::after {
	content: '';
	position: absolute;
	inset: -3px;
	border-radius: inherit;
	border: 2px solid transparent;
	border-top-color: var(--color-brand);
	animation: ai-dock-spin 0.9s linear infinite;
}

.ai-dock-name {
	font-weight: 700;
	flex-shrink: 0;
}

.ai-dock-status {
	min-width: 0;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
	color: var(--color-secondary);
	max-width: 14rem;
}

.ai-dock-dot {
	width: 0.45rem;
	height: 0.45rem;
	flex-shrink: 0;
	border-radius: 999px;
	background: var(--color-brand);
	box-shadow: 0 0 8px var(--color-brand);
	animation: ai-dock-pulse 1.6s ease-in-out infinite;
}

.ai-dock-chevron {
	flex-shrink: 0;
	margin-left: auto;
	color: var(--color-secondary);
	transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.ai-dock-fold {
	display: grid;
	grid-template-rows: 0fr;
	transition: grid-template-rows 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.ai-dock-fold--open {
	grid-template-rows: 1fr;
}

.ai-dock-fold-inner {
	min-height: 0;
	overflow: hidden;
}

.ai-dock-body {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
	padding: 0.15rem 0.6rem 0.55rem;
	border-top: 1px solid color-mix(in srgb, var(--color-contrast) 8%, transparent);
}

.ai-dock-scroll {
	max-height: min(22rem, 50vh);
	overflow-y: auto;
	padding-top: 0.4rem;
	scrollbar-width: thin;
}

.ai-dock-text {
	margin: 0;
	white-space: pre-wrap;
	word-break: break-word;
	font-size: 0.8125rem;
	line-height: 1.5;
	color: var(--color-contrast);
}

.ai-dock-muted {
	color: var(--color-secondary);
}

.ai-dock-you {
	margin: 0 0 0.35rem;
	font-size: 0.75rem;
	color: var(--color-secondary);
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.ai-dock-you span {
	font-weight: 700;
}

.ai-dock-caret {
	display: inline-block;
	width: 2px;
	height: 1em;
	margin-left: 2px;
	vertical-align: text-bottom;
	background: var(--color-brand);
	animation: ai-dock-blink 1s steps(2) infinite;
}

.ai-dock-input-row {
	display: flex;
	align-items: center;
	gap: 0.35rem;
	padding: 0.2rem 0.2rem 0.2rem 0.65rem;
	border-radius: 0.8rem;
	border: 1px solid color-mix(in srgb, var(--color-contrast) 12%, transparent);
	background: color-mix(in srgb, var(--color-bg) 55%, transparent);
	transition: border-color 0.2s ease;
}

.ai-dock-input-row:focus-within {
	border-color: color-mix(in srgb, var(--color-brand) 60%, transparent);
}

.ai-dock-input {
	flex: 1;
	min-width: 0;
	border: none;
	outline: none;
	background: transparent;
	color: var(--color-contrast);
	font: inherit;
	font-size: 0.8125rem;
	padding: 0.3rem 0;
	box-shadow: none;
}

.ai-dock-icon-btn {
	display: grid;
	place-items: center;
	width: 1.9rem;
	height: 1.9rem;
	flex-shrink: 0;
	padding: 0;
	border: none;
	border-radius: 0.6rem;
	cursor: pointer;
	transition:
		background-color 0.18s ease,
		transform 0.18s ease,
		opacity 0.18s ease;
}

.ai-dock-send {
	background: var(--color-brand);
	color: var(--color-accent-contrast, #fff);
}

.ai-dock-send:disabled {
	opacity: 0.4;
	cursor: default;
}

.ai-dock-send:not(:disabled):hover {
	transform: translateY(-1px);
}

.ai-dock-stop {
	background: color-mix(in srgb, var(--color-red) 18%, transparent);
	color: var(--color-red);
}

.ai-dock-foot {
	display: flex;
	justify-content: space-between;
}

.ai-dock-link {
	display: inline-flex;
	align-items: center;
	gap: 0.3rem;
	padding: 0.2rem 0.4rem;
	border: none;
	border-radius: 0.5rem;
	background: transparent;
	color: var(--color-secondary);
	font: inherit;
	font-size: 0.6875rem;
	cursor: pointer;
	transition:
		background-color 0.18s ease,
		color 0.18s ease;
}

.ai-dock-link:hover {
	background: color-mix(in srgb, var(--color-contrast) 8%, transparent);
	color: var(--color-contrast);
}

.ai-dock-shimmer {
	background: linear-gradient(
		90deg,
		var(--color-secondary) 0%,
		var(--color-contrast) 50%,
		var(--color-secondary) 100%
	);
	background-size: 200% 100%;
	-webkit-background-clip: text;
	background-clip: text;
	color: transparent;
	animation: ai-dock-shimmer 1.8s linear infinite;
}

.ai-dock-enter-active,
.ai-dock-leave-active {
	transition:
		opacity 0.3s ease,
		transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.ai-dock-enter-from,
.ai-dock-leave-to {
	opacity: 0;
	transform: translateY(-8px) scale(0.96);
}

@keyframes ai-dock-spin {
	to {
		transform: rotate(360deg);
	}
}

@keyframes ai-dock-pulse {
	50% {
		opacity: 0.45;
		transform: scale(0.8);
	}
}

@keyframes ai-dock-blink {
	50% {
		opacity: 0;
	}
}

@keyframes ai-dock-shimmer {
	to {
		background-position: -200% 0;
	}
}

@media (prefers-reduced-motion: reduce) {
	.ai-dock,
	.ai-dock-fold,
	.ai-dock-chevron {
		transition: none;
	}

	.ai-dock-orb--busy::after,
	.ai-dock-shimmer,
	.ai-dock-dot {
		animation: none;
	}
}
</style>

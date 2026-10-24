<script setup lang="ts">
/**
 * Publishing a world, shown as it happens.
 *
 * Opening a world to people who are not on the same network goes through a
 * few round trips - the world's port, the account, the relay's address, the
 * tunnel - and somebody pressing the button deserves to see each of them,
 * what it talks to, and, when one of them does not work, which one it was and
 * why. Each step is held on screen for a moment even when it is over in an
 * instant, so that the picture can be followed rather than flashed past.
 */
import {
	CheckIcon,
	CloudIcon,
	CopyIcon,
	PlugIcon,
	RefreshCwIcon,
	ServerIcon,
	UserKeyIcon,
	UsersIcon,
	WorldIcon,
	XIcon,
} from '@modrinth/assets'
import { Avatar, Button, defineMessages, NewModal, useVIntl } from '@modrinth/ui'
import type { Component } from 'vue'
import { computed, onBeforeUnmount, ref, useTemplateRef } from 'vue'

import type { LanPublishStep, LanRelayInfo } from '@/helpers/lan'
import { get_lan_publish_progress } from '@/helpers/lan'

import { lanAddress } from './use-lan-relay'

const props = defineProps<{
	/** Publishes a copy's world; what it resolves with is the published world. */
	start: (processUuid: string) => Promise<LanRelayInfo>
}>()

const emit = defineEmits<{
	copy: [address: string]
}>()

const { formatMessage } = useVIntl()

const messages = defineMessages({
	header: { id: 'app.lan.flow.header', defaultMessage: 'Opening the world to friends' },
	nodeBuild: { id: 'app.lan.flow.node.build', defaultMessage: 'Your instance' },
	nodeRelay: { id: 'app.lan.flow.node.relay', defaultMessage: 'Relay' },
	nodeFriends: { id: 'app.lan.flow.node.friends', defaultMessage: 'Friends' },
	explain: {
		id: 'app.lan.flow.explain',
		defaultMessage:
			'Your world stays on this computer. The relay only passes the connection along, so friends can join from anywhere without opening ports.',
	},
	worldTitle: { id: 'app.lan.flow.world.title', defaultMessage: 'Finding the world' },
	worldDescription: {
		id: 'app.lan.flow.world.description',
		defaultMessage: 'The world opened to LAN in Minecraft',
	},
	accountTitle: { id: 'app.lan.flow.account.title', defaultMessage: 'Checking the account' },
	accountDescription: {
		id: 'app.lan.flow.account.description',
		defaultMessage: 'The relay is shown who is hosting, and hands out a token',
	},
	sessionTitle: { id: 'app.lan.flow.session.title', defaultMessage: 'Getting an address' },
	sessionDescription: {
		id: 'app.lan.flow.session.description',
		defaultMessage: 'The relay reserves a public address for the world',
	},
	tunnelTitle: { id: 'app.lan.flow.tunnel.title', defaultMessage: 'Opening the tunnel' },
	tunnelDescription: {
		id: 'app.lan.flow.tunnel.description',
		defaultMessage: 'A connection players will come through',
	},
	doneTitle: { id: 'app.lan.flow.done.title', defaultMessage: 'The world is open' },
	doneDescription: {
		id: 'app.lan.flow.done.description',
		defaultMessage: 'Give this address to your friends: they add it as a server in Minecraft.',
	},
	failedTitle: {
		id: 'app.lan.flow.failed.title',
		defaultMessage: 'Stopped at "{step}"',
	},
	failedWorld: {
		id: 'app.lan.flow.failed.world',
		defaultMessage: 'The world is no longer open to LAN. Open it in the game again and retry.',
	},
	failedAccount: {
		id: 'app.lan.flow.failed.account',
		defaultMessage:
			'The relay did not accept the account. It needs a Microsoft or Ely.by account; signing in again usually helps.',
	},
	failedSession: {
		id: 'app.lan.flow.failed.session',
		defaultMessage: 'The relay did not give out an address. It may be busy; try again in a minute.',
	},
	failedTunnel: {
		id: 'app.lan.flow.failed.tunnel',
		defaultMessage:
			'The tunnel could not be opened. Check the internet connection and that a firewall lets the launcher out.',
	},
	details: { id: 'app.lan.flow.details', defaultMessage: 'Details' },
	retry: { id: 'app.lan.flow.retry', defaultMessage: 'Try again' },
	close: { id: 'app.lan.flow.close', defaultMessage: 'Close' },
	done: { id: 'app.lan.flow.done', defaultMessage: 'Done' },
	copy: { id: 'app.lan.flow.copy', defaultMessage: 'Copy' },
})

/** How long each step stays on screen at the least, so it can be read. */
const STEP_DWELL_MS = 700
const POLL_MS = 150

const STEP_ORDER: Exclude<LanPublishStep, 'done'>[] = ['world', 'account', 'session', 'tunnel']

const modal = useTemplateRef<InstanceType<typeof NewModal>>('modal')
const relay = ref<LanRelayInfo | null>(null)
const iconUrl = ref<string | null>(null)
/** The step the backend is on; `STEP_ORDER.length` once it is published. */
const actualIndex = ref(0)
/** The step drawn, which follows `actualIndex` no faster than one per dwell. */
const shownIndex = ref(0)
const failedIndex = ref<number | null>(null)
const errorText = ref<string | null>(null)
const relayHost = ref('uprojects.site')
const address = ref<string | null>(null)
const finished = ref(false)

let pollTimer: ReturnType<typeof setInterval> | null = null
let stepTimer: ReturnType<typeof setInterval> | null = null
let attempt = 0

const failedShown = computed(
	() => failedIndex.value !== null && shownIndex.value >= failedIndex.value,
)
const doneShown = computed(() => finished.value && shownIndex.value >= STEP_ORDER.length)

const steps = computed(() => {
	const port = relay.value?.local_port
	const info: Record<
		(typeof STEP_ORDER)[number],
		{ icon: Component; title: string; description: string; api: string }
	> = {
		world: {
			icon: WorldIcon,
			title: formatMessage(messages.worldTitle),
			description: formatMessage(messages.worldDescription),
			api: port ? `localhost:${port}` : 'localhost',
		},
		account: {
			icon: UserKeyIcon,
			title: formatMessage(messages.accountTitle),
			description: formatMessage(messages.accountDescription),
			api: `POST ${relayHost.value}/client/api/messenger/session`,
		},
		session: {
			icon: ServerIcon,
			title: formatMessage(messages.sessionTitle),
			description: formatMessage(messages.sessionDescription),
			api: `POST ${relayHost.value}/client/api/relay/sessions`,
		},
		tunnel: {
			icon: PlugIcon,
			title: formatMessage(messages.tunnelTitle),
			description: formatMessage(messages.tunnelDescription),
			api: 'TCP · HOST <session>',
		},
	}
	return STEP_ORDER.map((key, index) => ({
		key,
		...info[key],
		status:
			failedShown.value && index === failedIndex.value
				? ('failed' as const)
				: index < shownIndex.value
					? ('done' as const)
					: index === shownIndex.value && !failedShown.value
						? ('active' as const)
						: ('waiting' as const),
	}))
})

const failureHint = computed(() => {
	if (failedIndex.value === null) return ''
	const key = STEP_ORDER[failedIndex.value]
	return formatMessage(
		{
			world: messages.failedWorld,
			account: messages.failedAccount,
			session: messages.failedSession,
			tunnel: messages.failedTunnel,
		}[key],
	)
})
const failedStepTitle = computed(() =>
	failedIndex.value === null ? '' : steps.value[failedIndex.value].title,
)

/**
 * Which part of the picture at the top is lit: the way to the relay while the
 * launcher talks to it, the way on to friends once the tunnel is up.
 */
const firstLink = computed(() => {
	if (failedShown.value && (failedIndex.value ?? 0) <= 2) return 'failed'
	if (shownIndex.value > 2) return 'done'
	return 'active'
})
const secondLink = computed(() => {
	if (failedShown.value && failedIndex.value === 3) return 'failed'
	if (doneShown.value) return 'done'
	if (shownIndex.value === 3 && !failedShown.value) return 'active'
	return 'waiting'
})

function stopTimers() {
	if (pollTimer) clearInterval(pollTimer)
	if (stepTimer) clearInterval(stepTimer)
	pollTimer = null
	stepTimer = null
}

function indexOf(step: LanPublishStep) {
	return step === 'done' ? STEP_ORDER.length : STEP_ORDER.indexOf(step)
}

async function poll(uuid: string, current: number) {
	const progress = await get_lan_publish_progress(uuid).catch(() => null)
	if (!progress || current !== attempt) return
	relayHost.value = progress.relay_host || relayHost.value
	actualIndex.value = Math.max(actualIndex.value, indexOf(progress.step))
}

async function run() {
	const current = relay.value
	if (!current) return
	stopTimers()
	attempt += 1
	const thisAttempt = attempt
	actualIndex.value = 0
	shownIndex.value = 0
	failedIndex.value = null
	errorText.value = null
	address.value = null
	finished.value = false

	pollTimer = setInterval(() => void poll(current.process_uuid, thisAttempt), POLL_MS)
	stepTimer = setInterval(() => {
		const target = failedIndex.value ?? actualIndex.value
		if (shownIndex.value < target) shownIndex.value += 1
		if (
			(finished.value && shownIndex.value >= STEP_ORDER.length) ||
			(failedIndex.value !== null && shownIndex.value >= failedIndex.value)
		) {
			stopTimers()
		}
	}, STEP_DWELL_MS)

	try {
		const published = await props.start(current.process_uuid)
		if (thisAttempt !== attempt) return
		address.value = lanAddress(published)
		actualIndex.value = STEP_ORDER.length
		finished.value = true
	} catch (error) {
		if (thisAttempt !== attempt) return
		const progress = await get_lan_publish_progress(current.process_uuid).catch(() => null)
		const step = progress?.failed ? progress.step : STEP_ORDER[actualIndex.value]
		failedIndex.value = Math.min(indexOf(step), STEP_ORDER.length - 1)
		actualIndex.value = failedIndex.value
		errorText.value =
			progress?.error ??
			(error instanceof Error ? error.message : typeof error === 'string' ? error : null)
	}
}

function open(target: LanRelayInfo, icon: string | null) {
	relay.value = target
	iconUrl.value = icon
	modal.value?.show()
	void run()
}

function onHide() {
	attempt += 1
	stopTimers()
}

function copy() {
	if (address.value) emit('copy', address.value)
}

onBeforeUnmount(stopTimers)

defineExpose({ open })
</script>

<template>
	<NewModal ref="modal" :header="formatMessage(messages.header)" :on-hide="onHide">
		<div class="flex w-[34rem] max-w-full flex-col gap-5">
			<!--
				How it works, in one picture: the instance on this computer, the
				relay in the middle, and friends on the other side, with the
				connection moving along the way as each part of it comes up.
			-->
			<div class="lan-flow-diagram">
				<div class="lan-flow-node">
					<div class="lan-flow-node-icon">
						<Avatar :src="iconUrl" :tint-by="relay?.instance_id" alt="" size="2.5rem" no-shadow />
					</div>
					<span class="lan-flow-node-label">{{ formatMessage(messages.nodeBuild) }}</span>
					<span class="lan-flow-node-sub">{{ relay?.instance_name }}</span>
				</div>
				<div class="lan-flow-link" :data-state="firstLink">
					<span class="lan-flow-packet" />
					<span class="lan-flow-packet" />
					<span class="lan-flow-packet" />
				</div>
				<div class="lan-flow-node">
					<div class="lan-flow-node-icon" :class="{ lit: firstLink !== 'failed' }">
						<CloudIcon />
					</div>
					<span class="lan-flow-node-label">{{ formatMessage(messages.nodeRelay) }}</span>
					<span class="lan-flow-node-sub">{{ relayHost }}</span>
				</div>
				<div class="lan-flow-link" :data-state="secondLink">
					<span class="lan-flow-packet" />
					<span class="lan-flow-packet" />
					<span class="lan-flow-packet" />
				</div>
				<div class="lan-flow-node">
					<div class="lan-flow-node-icon" :class="{ lit: doneShown }">
						<UsersIcon />
					</div>
					<span class="lan-flow-node-label">{{ formatMessage(messages.nodeFriends) }}</span>
					<span class="lan-flow-node-sub">Minecraft</span>
				</div>
			</div>

			<p class="m-0 text-sm text-secondary">{{ formatMessage(messages.explain) }}</p>

			<ol class="m-0 flex list-none flex-col p-0">
				<li
					v-for="(step, index) in steps"
					:key="step.key"
					class="lan-flow-step"
					:data-state="step.status"
				>
					<div class="lan-flow-step-rail">
						<div class="lan-flow-step-badge">
							<CheckIcon v-if="step.status === 'done'" />
							<XIcon v-else-if="step.status === 'failed'" />
							<component :is="step.icon" v-else />
						</div>
						<div v-if="index < steps.length - 1" class="lan-flow-step-line" />
					</div>
					<div class="flex min-w-0 flex-col gap-0.5 pb-4">
						<span class="font-semibold text-contrast">{{ step.title }}</span>
						<span class="text-sm text-secondary">{{ step.description }}</span>
						<code class="lan-flow-step-api">{{ step.api }}</code>
					</div>
				</li>
			</ol>

			<Transition name="lan-flow-result" mode="out-in">
				<div v-if="doneShown" key="done" class="lan-flow-result lan-flow-result--done">
					<div class="lan-flow-check">
						<CheckIcon />
					</div>
					<div class="flex min-w-0 flex-1 flex-col gap-2">
						<span class="font-semibold text-contrast">{{ formatMessage(messages.doneTitle) }}</span>
						<span class="text-sm text-secondary">{{
							formatMessage(messages.doneDescription)
						}}</span>
						<div
							v-if="address"
							class="flex items-center gap-2 rounded-lg border border-solid border-surface-5 bg-surface-2 px-3 py-2"
						>
							<span class="truncate font-mono text-sm text-contrast">{{ address }}</span>
							<Button size="sm" type="quiet" class="ml-auto shrink-0" @click="copy">
								<CopyIcon />
								{{ formatMessage(messages.copy) }}
							</Button>
						</div>
					</div>
				</div>
				<div v-else-if="failedShown" key="failed" class="lan-flow-result lan-flow-result--failed">
					<div class="lan-flow-cross">
						<XIcon />
					</div>
					<div class="flex min-w-0 flex-1 flex-col gap-1">
						<span class="font-semibold text-contrast">
							{{ formatMessage(messages.failedTitle, { step: failedStepTitle }) }}
						</span>
						<span class="text-sm text-secondary">{{ failureHint }}</span>
						<span v-if="errorText" class="break-words text-xs text-secondary">
							{{ formatMessage(messages.details) }}: {{ errorText }}
						</span>
					</div>
				</div>
			</Transition>

			<div class="flex justify-end gap-2">
				<template v-if="failedShown">
					<Button type="outlined" @click="modal?.hide()">
						<XIcon />
						{{ formatMessage(messages.close) }}
					</Button>
					<Button type="colored" color="brand" @click="run">
						<RefreshCwIcon />
						{{ formatMessage(messages.retry) }}
					</Button>
				</template>
				<Button v-else-if="doneShown" type="colored" color="brand" @click="modal?.hide()">
					<CheckIcon />
					{{ formatMessage(messages.done) }}
				</Button>
			</div>
		</div>
	</NewModal>
</template>

<style scoped lang="scss">
.lan-flow-diagram {
	display: grid;
	grid-template-columns: auto 1fr auto 1fr auto;
	align-items: start;
	gap: 0.5rem;
	padding: 1rem;
	border-radius: var(--radius-lg, 0.75rem);
	border: 1px solid var(--surface-5);
	background: var(--surface-2);
}

.lan-flow-node {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.25rem;
	width: 6.5rem;
	text-align: center;
}

.lan-flow-node-icon {
	display: grid;
	place-items: center;
	width: 3rem;
	height: 3rem;
	border-radius: 1rem;
	background: var(--surface-4);
	color: var(--color-secondary);
	transition:
		background-color 0.3s ease,
		color 0.3s ease,
		box-shadow 0.3s ease;

	svg {
		width: 1.5rem;
		height: 1.5rem;
	}

	&.lit {
		color: var(--color-brand);
		background: var(--color-brand-highlight);
		box-shadow: 0 0 0 4px var(--color-brand-highlight);
	}
}

.lan-flow-node-label {
	font-size: 0.875rem;
	font-weight: 600;
	color: var(--color-contrast);
}

.lan-flow-node-sub {
	max-width: 100%;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 0.75rem;
	color: var(--color-secondary);
}

/* The way between two parts, and the connection moving along it. */
.lan-flow-link {
	position: relative;
	height: 4px;
	margin-top: 1.4rem;
	border-radius: 999px;
	background: var(--surface-5);
	overflow: hidden;

	&::after {
		content: '';
		position: absolute;
		right: -2px;
		top: 50%;
		width: 0;
		height: 0;
		transform: translateY(-50%);
		border-style: solid;
		border-width: 5px 0 5px 7px;
		border-color: transparent transparent transparent var(--surface-5);
	}

	.lan-flow-packet {
		position: absolute;
		top: 0;
		left: -12%;
		width: 12%;
		height: 100%;
		border-radius: 999px;
		background: var(--color-brand);
		opacity: 0;
	}

	&[data-state='active'] .lan-flow-packet {
		animation: lan-flow-packet 1.6s linear infinite;

		&:nth-child(2) {
			animation-delay: 0.53s;
		}

		&:nth-child(3) {
			animation-delay: 1.06s;
		}
	}

	&[data-state='done'] {
		background: var(--color-brand);

		&::after {
			border-left-color: var(--color-brand);
		}
	}

	&[data-state='failed'] {
		background: var(--color-red);

		&::after {
			border-left-color: var(--color-red);
		}
	}
}

@keyframes lan-flow-packet {
	0% {
		left: -12%;
		opacity: 0;
	}
	15% {
		opacity: 1;
	}
	85% {
		opacity: 1;
	}
	100% {
		left: 100%;
		opacity: 0;
	}
}

.lan-flow-step {
	display: flex;
	gap: 0.75rem;
	transition: opacity 0.3s ease;

	&[data-state='waiting'] {
		opacity: 0.5;
	}
}

.lan-flow-step-rail {
	display: flex;
	flex-direction: column;
	align-items: center;
}

.lan-flow-step-badge {
	position: relative;
	display: grid;
	place-items: center;
	flex-shrink: 0;
	width: 2rem;
	height: 2rem;
	border-radius: 999px;
	background: var(--surface-4);
	color: var(--color-secondary);
	transition:
		background-color 0.3s ease,
		color 0.3s ease;

	svg {
		width: 1rem;
		height: 1rem;
	}

	[data-state='active'] & {
		color: var(--color-brand);
		background: var(--color-brand-highlight);

		&::after {
			content: '';
			position: absolute;
			inset: -3px;
			border-radius: 999px;
			border: 2px solid transparent;
			border-top-color: var(--color-brand);
			animation: lan-flow-spin 0.9s linear infinite;
		}
	}

	[data-state='done'] & {
		color: var(--color-accent-contrast, #000);
		background: var(--color-brand);
		animation: lan-flow-pop 0.35s ease;
	}

	[data-state='failed'] & {
		color: #fff;
		background: var(--color-red);
		animation: lan-flow-shake 0.4s ease;
	}
}

/* The arrow down to the next step, which fills in as the step is passed. */
.lan-flow-step-line {
	position: relative;
	flex: 1;
	width: 2px;
	min-height: 1rem;
	margin: 0.25rem 0;
	background: var(--surface-5);
	overflow: hidden;

	&::before {
		content: '';
		position: absolute;
		inset: 0;
		background: var(--color-brand);
		transform: scaleY(0);
		transform-origin: top;
		transition: transform 0.5s ease;
	}

	[data-state='done'] &::before {
		transform: scaleY(1);
	}

	[data-state='active'] &::after {
		content: '';
		position: absolute;
		left: 0;
		width: 100%;
		height: 40%;
		background: var(--color-brand);
		animation: lan-flow-drop 1.1s ease-in infinite;
	}
}

.lan-flow-step-api {
	align-self: flex-start;
	max-width: 100%;
	margin-top: 0.25rem;
	padding: 0.125rem 0.5rem;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	border-radius: 0.375rem;
	background: var(--surface-2);
	border: 1px solid var(--surface-5);
	font-size: 0.75rem;
	color: var(--color-secondary);
}

.lan-flow-result {
	display: flex;
	align-items: flex-start;
	gap: 0.75rem;
	padding: 1rem;
	border-radius: var(--radius-lg, 0.75rem);
	border: 1px solid var(--surface-5);
	background: var(--surface-2);

	&--done {
		border-color: var(--color-brand);
	}

	&--failed {
		border-color: var(--color-red);
	}
}

.lan-flow-check,
.lan-flow-cross {
	display: grid;
	place-items: center;
	flex-shrink: 0;
	width: 2.5rem;
	height: 2.5rem;
	border-radius: 999px;

	svg {
		width: 1.25rem;
		height: 1.25rem;
		stroke-width: 3;
	}
}

.lan-flow-check {
	color: var(--color-accent-contrast, #000);
	background: var(--color-brand);
	animation: lan-flow-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.lan-flow-cross {
	color: #fff;
	background: var(--color-red);
	animation: lan-flow-shake 0.4s ease;
}

.lan-flow-result-enter-active,
.lan-flow-result-leave-active {
	transition:
		opacity 0.25s ease,
		transform 0.25s ease;
}

.lan-flow-result-enter-from,
.lan-flow-result-leave-to {
	opacity: 0;
	transform: translateY(0.5rem);
}

@keyframes lan-flow-spin {
	to {
		transform: rotate(360deg);
	}
}

@keyframes lan-flow-pop {
	0% {
		transform: scale(0.6);
	}
	60% {
		transform: scale(1.12);
	}
	100% {
		transform: scale(1);
	}
}

@keyframes lan-flow-shake {
	0%,
	100% {
		transform: translateX(0);
	}
	25% {
		transform: translateX(-3px);
	}
	75% {
		transform: translateX(3px);
	}
}

@keyframes lan-flow-drop {
	0% {
		top: -40%;
	}
	100% {
		top: 100%;
	}
}

@media (prefers-reduced-motion) {
	.lan-flow-packet,
	.lan-flow-step-badge,
	.lan-flow-step-badge::after,
	.lan-flow-step-line::after,
	.lan-flow-check,
	.lan-flow-cross {
		animation: none !important;
	}
}
</style>

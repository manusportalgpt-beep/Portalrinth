<script setup lang="ts">
import { CheckIcon, HistoryIcon, PlusIcon, TrashIcon, XIcon } from '@modrinth/assets'
import { Button, Checkbox, defineMessages, Toggle, useVIntl } from '@modrinth/ui'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import {
	type InstanceNoteTask,
	read_instance_note,
	write_instance_note,
} from '@/helpers/portalrinth-notes'
import {
	format_playtime,
	type PlaytimeDay,
	type PlaytimeSession,
	read_live_fps,
	read_playtime_days,
	read_playtime_sessions,
} from '@/helpers/portalrinth-playtime'

import { injectInstancePage } from '../instance-context'

const instancePage = injectInstancePage()
const { formatMessage } = useVIntl()
const instance = computed(() => instancePage.instance.value!)

const messages = defineMessages({
	placeholder: {
		id: 'app.instance.notes.placeholder',
		defaultMessage: 'Например: не забыть включить шейдеры и зайти на сервер…',
	},
	note: { id: 'app.instance.notes.note', defaultMessage: 'Заметка' },
	tasks: { id: 'app.instance.notes.tasks', defaultMessage: 'Задачи' },
	taskPlaceholder: { id: 'app.instance.notes.task-placeholder', defaultMessage: 'Новая задача' },
	addTask: { id: 'app.instance.notes.add-task', defaultMessage: 'Добавить' },
	removeTask: { id: 'app.instance.notes.remove-task', defaultMessage: 'Удалить задачу' },
	clearDone: { id: 'app.instance.notes.clear-done', defaultMessage: 'Убрать выполненные' },
	noTasks: { id: 'app.instance.notes.no-tasks', defaultMessage: 'Задач нет' },
	remind: { id: 'app.instance.notes.remind', defaultMessage: 'Показывать перед запуском' },
	saving: { id: 'app.instance.notes.saving', defaultMessage: 'Сохраняю…' },
	saved: { id: 'app.instance.notes.saved', defaultMessage: 'Сохранено' },
	chars: { id: 'app.instance.notes.chars', defaultMessage: '{count} симв.' },
	clearNote: { id: 'app.instance.notes.clear', defaultMessage: 'Очистить' },
	playtime: { id: 'app.instance.info.playtime', defaultMessage: 'Время игры' },
	playtimeLast: { id: 'app.instance.info.playtime.last', defaultMessage: 'Последняя игра' },
	playtimeTotal: { id: 'app.instance.info.playtime.total', defaultMessage: 'Всего' },
	playtimeEmpty: {
		id: 'app.instance.info.playtime.empty',
		defaultMessage: 'Пока нет данных — запустите игру, и здесь появится график по дням',
	},
	sessionsTitle: {
		id: 'app.instance.info.sessions',
		defaultMessage: 'Последние игры',
	},
	fpsLive: { id: 'app.instance.info.fps.live', defaultMessage: 'Сейчас' },
	fpsRange: { id: 'app.instance.info.fps.range', defaultMessage: '{min}–{max} FPS' },
})

const text = ref('')
const tasks = ref<InstanceNoteTask[]>([])
const remind = ref(true)
const updatedAt = ref(0)
const pending = ref(false)
const newTask = ref('')
const editingId = ref('')
let saveTimer: ReturnType<typeof setTimeout> | undefined
let loadedId = ''

const doneCount = computed(() => tasks.value.filter((task) => task.done).length)
const savedLabel = computed(() => {
	if (pending.value) return formatMessage(messages.saving)
	if (!updatedAt.value) return ''
	const time = new Date(updatedAt.value).toLocaleString(undefined, {
		day: 'numeric',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit',
	})
	return `${formatMessage(messages.saved)} · ${time}`
})

function load(id: string) {
	const note = read_instance_note(id)
	loadedId = id
	text.value = note.text
	tasks.value = note.tasks
	remind.value = !note.neverRemind
	updatedAt.value = note.updatedAt
	pending.value = false
}

function flush() {
	if (saveTimer) clearTimeout(saveTimer)
	saveTimer = undefined
	if (!pending.value || !loadedId) return
	const note = write_instance_note(loadedId, {
		text: text.value,
		tasks: tasks.value.filter((task) => task.text.trim()),
		neverRemind: !remind.value,
	})
	updatedAt.value = note.updatedAt
	pending.value = false
}

function scheduleSave(delay = 600) {
	pending.value = true
	if (saveTimer) clearTimeout(saveTimer)
	saveTimer = setTimeout(flush, delay)
}

watch(
	() => instance.value?.id,
	(id) => {
		flush()
		if (id) load(id)
	},
	{ immediate: true },
)

function addTask() {
	const value = newTask.value.trim()
	if (!value) return
	tasks.value = [...tasks.value, { id: crypto.randomUUID(), text: value, done: false }]
	newTask.value = ''
	scheduleSave(0)
}

function setDone(task: InstanceNoteTask, done: boolean) {
	task.done = done
	scheduleSave(0)
}

function removeTask(id: string) {
	tasks.value = tasks.value.filter((task) => task.id !== id)
	scheduleSave(0)
}

function clearDone() {
	tasks.value = tasks.value.filter((task) => !task.done)
	scheduleSave(0)
}

function finishEdit(task: InstanceNoteTask) {
	editingId.value = ''
	if (!task.text.trim()) removeTask(task.id)
	else scheduleSave(0)
}

function setRemind(value: boolean) {
	remind.value = value
	scheduleSave(0)
}

function clearNote() {
	text.value = ''
	scheduleSave(0)
}

/*
 * The playtime graph and the frame statistics: the ledger lives in
 * localStorage and the live frame counters in memory, so they are re-read
 * every couple of seconds while the tab is open - a running game banks a
 * minute every minute, and the bars creep up on their own.
 */
const historyTick = ref(0)
let graphTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
	graphTimer = setInterval(() => historyTick.value++, 2_000)
})
onBeforeUnmount(() => {
	if (graphTimer) clearInterval(graphTimer)
	graphTimer = undefined
	flush()
})

const graphDays = computed<PlaytimeDay[]>(() => {
	const id = instance.value?.id
	if (!id) return []
	return read_playtime_days(id, 14, historyTick.value)
})
const hasPlaytimeData = computed(() => graphDays.value.some((day) => day.seconds > 0))
const totalPlaytimeSeconds = computed(() => {
	const current = instance.value
	if (!current) return 0
	return Number(current.submitted_time_played ?? 0) + Number(current.recent_time_played ?? 0)
})
const lastPlayedLabel = computed(() => {
	const raw = instance.value?.last_played
	if (!raw) return null
	const date = new Date(raw)
	if (Number.isNaN(date.getTime())) return null
	return date.toLocaleString(undefined, {
		day: 'numeric',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit',
	})
})

/* The latest closed sessions, shaped for the info plate: when they ran and
 * what their frames did, for as long as the game's probe knew about them. */
const recentSessions = computed<PlaytimeSession[]>(() => {
	const id = instance.value?.id
	if (!id) return []
	return read_playtime_sessions(id, 4, historyTick.value)
})

function sessionTimeLabel(session: PlaytimeSession): string {
	const format = { hour: '2-digit', minute: '2-digit' } as const
	const start = new Date(session.start)
	const end = new Date(session.end)
	const sameDay = start.toDateString() === end.toDateString()
	const begin = start.toLocaleString(undefined, {
		day: 'numeric',
		month: 'short',
		...format,
	})
	return sameDay
		? `${begin}–${end.toLocaleTimeString(undefined, format)}`
		: `${begin}–${end.toLocaleString(undefined, format)}`
}

function sessionDurationLabel(session: PlaytimeSession): string {
	return format_playtime(Math.max(0, Math.round((session.end - session.start) / 1000)))
}

/* The frame counters of the session that is still running, or null. */
const liveFps = computed(() => {
	// The tick keeps this reactive: every couple of seconds the live counters
	// are read again while the tab is open.
	void historyTick.value
	const id = instance.value?.id
	if (!id) return null
	return read_live_fps(id)
})

onBeforeUnmount(flush)
</script>

<template>
	<div class="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
		<div class="flex shrink-0 items-center justify-end gap-1.5">
			<span class="flex items-center gap-1.5 text-sm text-secondary">
				<CheckIcon v-if="savedLabel && !pending" class="size-4 text-green" />
				{{ savedLabel }}
			</span>
		</div>
		<div class="grid min-h-0 flex-1 gap-4 overflow-hidden lg:grid-cols-[minmax(0,1fr)_20rem]">
			<!-- The note itself: the only thing that scrolls here is the note,
			     its scrollbar sits on the black input panel, not on the page. -->
			<section class="flex min-h-0 flex-col gap-2 rounded-2xl bg-surface-3 p-4">
				<div class="flex items-center justify-between gap-2">
					<h2 class="m-0 text-base font-bold text-contrast">{{ formatMessage(messages.note) }}</h2>
					<button
						v-if="text"
						v-tooltip="formatMessage(messages.clearNote)"
						class="flex size-7 items-center justify-center rounded-full border-0 bg-transparent text-secondary hover:bg-button-bg hover:text-contrast"
						@click="clearNote"
					>
						<XIcon class="size-4" />
					</button>
				</div>
				<textarea
					v-model="text"
					class="min-h-0 w-full grow resize-none overflow-y-auto rounded-xl border-0 bg-surface-4 p-3 text-sm leading-6 text-contrast outline-none placeholder:text-secondary focus:outline-none"
					:placeholder="formatMessage(messages.placeholder)"
					@input="scheduleSave()"
					@blur="flush"
				/>
				<footer class="flex shrink-0 flex-wrap items-center justify-between gap-2">
					<span class="text-xs text-secondary">
						{{ formatMessage(messages.chars, { count: text.length }) }}
					</span>
					<label class="flex cursor-pointer items-center gap-2 text-sm font-semibold text-contrast">
						<Toggle :model-value="remind" @update:model-value="setRemind" />
						{{ formatMessage(messages.remind) }}
					</label>
				</footer>
			</section>
			<section class="flex min-h-0 flex-col gap-3 rounded-2xl bg-surface-3 p-4">
				<div class="flex items-center justify-between gap-2">
					<h2 class="m-0 text-base font-bold text-contrast">{{ formatMessage(messages.tasks) }}</h2>
					<span v-if="tasks.length" class="text-sm font-semibold text-secondary">
						{{ doneCount }} / {{ tasks.length }}
					</span>
				</div>
				<div v-if="tasks.length" class="h-1 shrink-0 overflow-hidden rounded-full bg-surface-5">
					<div
						class="h-full rounded-full bg-brand transition-[width] duration-300"
						:style="{ width: `${(doneCount / tasks.length) * 100}%` }"
					/>
				</div>
				<div class="min-h-0 flex-1 overflow-y-auto">
					<TransitionGroup
						tag="ul"
						name="note-task"
						class="relative m-0 flex list-none flex-col gap-1 p-0"
					>
						<li
							v-for="task in tasks"
							:key="task.id"
							class="group flex items-start gap-2 rounded-xl px-2 py-1.5 hover:bg-surface-4"
						>
							<Checkbox
								class="mt-0.5 shrink-0"
								:model-value="task.done"
								:description="task.text"
								@update:model-value="(value) => setDone(task, value)"
							/>
							<input
								v-if="editingId === task.id"
								v-model="task.text"
								class="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-contrast outline-none"
								@input="pending = true"
								@keydown.enter="finishEdit(task)"
								@blur="finishEdit(task)"
							/>
							<span
								v-else
								class="min-w-0 flex-1 cursor-text break-words text-sm"
								:class="task.done ? 'text-secondary line-through' : 'text-contrast'"
								@dblclick="editingId = task.id"
							>
								{{ task.text }}
							</span>
							<button
								v-tooltip="formatMessage(messages.removeTask)"
								class="flex size-6 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-secondary opacity-0 hover:text-red group-hover:opacity-100 focus-visible:opacity-100"
								@click="removeTask(task.id)"
							>
								<TrashIcon class="size-3.5" />
							</button>
						</li>
					</TransitionGroup>
					<p v-if="!tasks.length" class="m-0 text-sm text-secondary">
						{{ formatMessage(messages.noTasks) }}
					</p>
				</div>
				<form class="flex shrink-0 items-center gap-2" @submit.prevent="addTask">
					<input
						v-model="newTask"
						class="h-9 min-w-0 flex-1 rounded-xl border-0 bg-surface-4 px-3 text-sm text-contrast outline-none placeholder:text-secondary"
						:placeholder="formatMessage(messages.taskPlaceholder)"
					/>
					<Button
						v-tooltip="formatMessage(messages.addTask)"
						icon-only
						:disabled="!newTask.trim()"
						@click="addTask"
					>
						<PlusIcon />
					</Button>
				</form>
				<Button v-if="doneCount" transparent class="shrink-0 self-start" @click="clearDone">
					{{ formatMessage(messages.clearDone) }}
				</Button>
			</section>
		</div>
		<!-- The playtime plate: a fortnight of dots, the last game, the grand total. -->
		<section class="shrink-0 rounded-2xl bg-surface-3 p-4">
			<div class="mb-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
				<h2 class="m-0 flex items-center gap-2 text-base font-bold text-contrast">
					<HistoryIcon class="size-4 text-brand" />
					{{ formatMessage(messages.playtime) }}
				</h2>
				<div class="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-secondary">
					<span v-if="lastPlayedLabel">
						<span class="font-semibold text-contrast"
							>{{ formatMessage(messages.playtimeLast) }}:</span
						>
						{{ lastPlayedLabel }}
					</span>
					<span>
						<span class="font-semibold text-contrast"
							>{{ formatMessage(messages.playtimeTotal) }}:</span
						>
						{{ format_playtime(totalPlaytimeSeconds) }}
					</span>
				</div>
			</div>
			<template v-if="graphDays.length">
				<div class="relative h-28">
					<div class="absolute inset-x-0 top-1/2 h-px bg-surface-5/60" />
					<div class="absolute inset-x-0 bottom-0 h-px bg-surface-5" />
					<div class="absolute inset-0 flex items-end gap-[3px]">
						<div
							v-for="(day, index) in graphDays"
							:key="day.date"
							class="group relative h-full min-w-0 flex-1"
						>
							<div
								v-tooltip="day.tooltip"
								class="w-full rounded-t-md transition-[height,filter] duration-300 group-hover:brightness-125"
								:class="
									day.seconds > 0
										? index === graphDays.length - 1
											? 'bg-gradient-to-t from-brand/70 via-brand to-brand brightness-110'
											: 'bg-gradient-to-t from-brand/40 via-brand/80 to-brand'
										: 'bg-surface-5/50'
								"
								:style="{ height: `${day.pct}%` }"
							/>
						</div>
					</div>
				</div>
				<div class="mt-1.5 flex gap-[3px] text-[10px] leading-none text-secondary">
					<span v-for="day in graphDays" :key="day.date" class="min-w-0 flex-1 text-center">
						{{ day.label }}
					</span>
				</div>
				<p v-if="!hasPlaytimeData" class="mb-0 mt-2 text-sm text-secondary">
					{{ formatMessage(messages.playtimeEmpty) }}
				</p>
			</template>
		</section>

		<section v-if="liveFps || recentSessions.length" class="shrink-0 rounded-2xl bg-surface-3 p-4">
			<div class="mb-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
				<h2 class="m-0 text-base font-bold text-contrast">
					{{ formatMessage(messages.sessionsTitle) }}
				</h2>
				<span
					v-if="liveFps"
					class="flex items-center gap-2 rounded-full bg-surface-5 px-3 py-1 text-sm"
				>
					<span class="relative flex size-2">
						<span
							class="absolute inline-flex size-2 animate-ping rounded-full bg-brand opacity-60 motion-reduce:animate-none"
						/>
						<span class="relative inline-flex size-2 rounded-full bg-brand" />
					</span>
					{{ formatMessage(messages.fpsLive) }}:
					<span class="font-semibold tabular-nums text-contrast">{{ liveFps.max }} FPS</span>
					<span class="tabular-nums text-secondary">
						{{ formatMessage(messages.fpsRange, { min: liveFps.min, max: liveFps.max }) }}
					</span>
				</span>
			</div>
			<ul class="m-0 flex list-none flex-col gap-1 p-0">
				<li
					v-for="session in recentSessions"
					:key="session.start"
					class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-2 py-1.5 text-sm text-secondary hover:bg-surface-4"
				>
					<span class="text-contrast">{{ sessionTimeLabel(session) }}</span>
					<span class="tabular-nums">{{ sessionDurationLabel(session) }}</span>
					<span
						v-if="session.minFps !== undefined && session.maxFps !== undefined"
						class="ml-auto rounded-full bg-surface-5 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-contrast"
					>
						{{ formatMessage(messages.fpsRange, { min: session.minFps, max: session.maxFps }) }}
					</span>
				</li>
			</ul>
		</section>
	</div>
</template>

<style scoped>
.note-task-move,
.note-task-enter-active,
.note-task-leave-active {
	transition:
		transform 0.2s ease,
		opacity 0.2s ease;
}

.note-task-enter-from,
.note-task-leave-to {
	opacity: 0;
	transform: translateX(-0.5rem);
}

.note-task-leave-active {
	position: absolute;
}

@media (prefers-reduced-motion: reduce) {
	.note-task-move,
	.note-task-enter-active,
	.note-task-leave-active {
		transition: none;
	}
}
</style>

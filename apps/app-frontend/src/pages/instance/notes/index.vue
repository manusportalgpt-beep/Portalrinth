<script setup lang="ts">
import { CheckIcon, PlusIcon, TrashIcon, XIcon } from '@modrinth/assets'
import { Button, Checkbox, defineMessages, Toggle, useVIntl } from '@modrinth/ui'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import {
	type InstanceNoteTask,
	read_instance_note,
	write_instance_note,
} from '@/helpers/portalrinth-notes'

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

onBeforeUnmount(flush)
</script>

<template>
	<div class="flex min-h-0 flex-col gap-4">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<label class="flex cursor-pointer items-center gap-2 text-sm font-semibold text-contrast">
				<Toggle :model-value="remind" @update:model-value="setRemind" />
				{{ formatMessage(messages.remind) }}
			</label>
			<span class="flex items-center gap-1.5 text-sm text-secondary">
				<CheckIcon v-if="savedLabel && !pending" class="size-4 text-green" />
				{{ savedLabel }}
			</span>
		</div>
		<div class="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
			<section class="flex min-h-[18rem] flex-col gap-2 rounded-2xl bg-surface-3 p-4">
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
					class="min-h-[14rem] w-full grow resize-y border-0 bg-transparent p-0 text-sm leading-6 text-contrast outline-none placeholder:text-secondary focus:outline-none"
					:placeholder="formatMessage(messages.placeholder)"
					@input="scheduleSave()"
					@blur="flush"
				/>
				<span class="self-end text-xs text-secondary">
					{{ formatMessage(messages.chars, { count: text.length }) }}
				</span>
			</section>
			<section class="flex min-h-[18rem] flex-col gap-3 rounded-2xl bg-surface-3 p-4">
				<div class="flex items-center justify-between gap-2">
					<h2 class="m-0 text-base font-bold text-contrast">{{ formatMessage(messages.tasks) }}</h2>
					<span v-if="tasks.length" class="text-sm font-semibold text-secondary">
						{{ doneCount }} / {{ tasks.length }}
					</span>
				</div>
				<div v-if="tasks.length" class="h-1 overflow-hidden rounded-full bg-surface-5">
					<div
						class="h-full rounded-full bg-brand transition-[width] duration-300"
						:style="{ width: `${(doneCount / tasks.length) * 100}%` }"
					/>
				</div>
				<TransitionGroup tag="ul" name="note-task" class="relative m-0 flex list-none flex-col gap-1 p-0">
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
				<form class="mt-auto flex items-center gap-2" @submit.prevent="addTask">
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
				<Button v-if="doneCount" transparent class="self-start" @click="clearDone">
					{{ formatMessage(messages.clearDone) }}
				</Button>
			</section>
		</div>
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

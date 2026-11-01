/**
 * A short note pinned to a build: what the player wants to remember before
 * playing it - plans, server addresses, a to-do. Kept in localStorage (it
 * is interface data, not game files). When the game launches and the note
 * is not empty, it pops up in the middle of the screen - unless the player
 * asked, once and for all, to never see it again.
 */
import { portalrinthFeatures } from './portalrinth-features'

export interface InstanceNoteTask {
	id: string
	text: string
	done: boolean
}

export interface InstanceNote {
	text: string
	neverRemind: boolean
	tasks: InstanceNoteTask[]
	updatedAt: number
}

const PREFIX = 'portalrinth-instance-notes:'

function keyOf(instanceId: string): string {
	return `${PREFIX}${instanceId}`
}

export function read_instance_note(instanceId: string): InstanceNote {
	try {
		const raw = localStorage.getItem(keyOf(instanceId))
		if (raw) {
			const parsed = JSON.parse(raw) as Partial<InstanceNote>
			return {
				text: typeof parsed.text === 'string' ? parsed.text : '',
				neverRemind: parsed.neverRemind === true,
				tasks: Array.isArray(parsed.tasks)
					? parsed.tasks
							.filter((task) => task && typeof task.text === 'string')
							.map((task) => ({
								id: typeof task.id === 'string' ? task.id : crypto.randomUUID(),
								text: task.text,
								done: task.done === true,
							}))
					: [],
				updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
			}
		}
	} catch {
		/* a broken note is the same as no note */
	}
	return { text: '', neverRemind: false, tasks: [], updatedAt: 0 }
}

export function write_instance_note(instanceId: string, patch: Partial<InstanceNote>): InstanceNote {
	const note = { ...read_instance_note(instanceId), ...patch, updatedAt: Date.now() }
	try {
		localStorage.setItem(keyOf(instanceId), JSON.stringify(note))
	} catch {
		/* a full quota should never take the note down */
	}
	return note
}

export function open_instance_tasks(instanceId: string): InstanceNoteTask[] {
	return read_instance_note(instanceId).tasks.filter((task) => !task.done && task.text.trim())
}

export function read_instance_notes(instanceId: string): string {
	return read_instance_note(instanceId).text
}

export function write_instance_notes(instanceId: string, text: string): void {
	write_instance_note(instanceId, { text })
}

export function never_remind_instance_notes(instanceId: string): void {
	const note = read_instance_note(instanceId)
	try {
		localStorage.setItem(keyOf(instanceId), JSON.stringify({ ...note, neverRemind: true }))
	} catch {
		/* best effort: a full quota keeps the note, the popup just stays */
	}
}

/** Builds whose note was muted with «Больше не напоминать». */
export function muted_instance_notes(): string[] {
	const ids: string[] = []
	try {
		for (let index = 0; index < localStorage.length; index++) {
			const key = localStorage.key(index)
			if (!key?.startsWith(PREFIX)) continue
			const id = key.slice(PREFIX.length)
			if (read_instance_note(id).neverRemind) ids.push(id)
		}
	} catch {
		/* no storage - nothing is muted */
	}
	return ids
}

/** Brings every muted note back: they pop up before launch again. */
export function unmute_all_instance_notes(): number {
	const ids = muted_instance_notes()
	for (const id of ids) {
		const note = read_instance_note(id)
		try {
			localStorage.setItem(keyOf(id), JSON.stringify({ ...note, neverRemind: false }))
		} catch {
			/* best effort */
		}
	}
	return ids.length
}

/** Whether launching this build should pop the note up. */
export function should_show_instance_notes(instanceId: string): boolean {
	if (!portalrinthFeatures.value.notesPopup) return false
	const note = read_instance_note(instanceId)
	if (note.neverRemind) return false
	return note.text.trim().length > 0 || note.tasks.some((task) => !task.done && task.text.trim())
}

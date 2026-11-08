import { ref } from 'vue'

export interface ReplaceSourceItem {
	name: string
	type: string
	path: string
}

/**
 * Module-scoped, like the drag state: the «Заменить файл» mode has to survive
 * walking into another instance's Files tab, where this layout mounts anew.
 */
const active = ref(false)
const sources = ref<ReplaceSourceItem[]>([])
/** Row paths marked as replacement targets, in the order they were marked. */
const targets = ref<string[]>([])
/** The instance the sources were picked in. */
const sourceInstanceId = ref<string | null>(null)

export function useFileReplaceState() {
	return {
		active,
		sources,
		targets,
		sourceInstanceId,
		targetNumber: (path: string) => {
			const index = targets.value.indexOf(path)
			return index === -1 ? undefined : index + 1
		},
	}
}

export function armFileReplace(items: ReplaceSourceItem[], instanceId: string) {
	sources.value = [...items]
	sourceInstanceId.value = instanceId
	targets.value = []
	active.value = true
}

export function cancelFileReplace() {
	active.value = false
	sources.value = []
	targets.value = []
	sourceInstanceId.value = null
}

/** Swaps a source one slot up or down, renumbering it on the action bar. */
export function renumberFileReplaceSource(index: number, direction: -1 | 1) {
	const to = index + direction
	if (index < 0 || to < 0 || to >= sources.value.length) return
	const next = [...sources.value]
	;[next[index], next[to]] = [next[to], next[index]]
	sources.value = next
}

export function isFileReplaceTargetMarked(path: string) {
	return targets.value.includes(path)
}

/** Marks a row as the next replacement target; returns its 1-based number. */
export function markFileReplaceTarget(path: string) {
	if (!targets.value.includes(path)) targets.value = [...targets.value, path]
	return targets.value.indexOf(path) + 1
}

export function unmarkFileReplaceTarget(path: string) {
	targets.value = targets.value.filter((target) => target !== path)
}

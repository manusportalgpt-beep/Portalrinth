/**
 * A queue of exactly one irreversible deed waiting for the player's click.
 * When a tool refuses to delete without a confirmation, it parks the whole
 * action here; the moment the player answers the question (the «Да, удалить»
 * button or the same words typed in), the parked action runs itself - no
 * model round stands between the click and the deed, so an answer like
 * «Хорошо, удаляю» with nothing behind it can never happen again.
 */
export interface PendingConfirm {
	/** The question the player is answering (shown in the chat as a card). */
	question: string
	/** The option that lets the deed happen. */
	confirmOption: string
	/** The option that calls the whole thing off. */
	cancelOption: string
	/** Runs the parked action (or the polite refusal) for the chosen answer. */
	run: (answer: string) => Promise<string>
}

let pending: PendingConfirm | null = null

/** Parks an action; a newer question always replaces an older one. */
export function setPendingConfirm(item: PendingConfirm): void {
	pending = item
}

/** Forgets the parked action without running it. */
export function clearPendingConfirm(): void {
	pending = null
}

const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * Consumes the parked action when the player's words answer it: the exact
 * option (button click) or a short «да»/«отмена» in free text. Any other
 * message drops the parked action - the player moved on, and a stale
 * delete must never fire on words that were not an answer.
 */
export function takePendingConfirm(answer: string): PendingConfirm | null {
	if (!pending) return null
	const said = normalize(answer)
	const item = pending
	pending = null
	if (
		said === normalize(item.confirmOption) ||
		said === normalize(item.cancelOption) ||
		/^(да|давай|ага|ок(?:ей)?|yes|y)(?![a-zа-яё])[.!]?$/.test(said)
	) {
		return item
	}
	return null
}

/** True when the answer is the cancel option (or a short «нет»). */
export function isCancelAnswer(answer: string, item: PendingConfirm): boolean {
	const said = normalize(answer)
	return (
		said === normalize(item.cancelOption) ||
		/^(нет|не надо|не нужно|отмена|неа|no|n)(?![a-zа-яё])[.!]?$/.test(said)
	)
}

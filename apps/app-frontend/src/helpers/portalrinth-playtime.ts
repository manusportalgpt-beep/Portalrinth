/**
 * How long the player sat in a build, day by day. The backend only knows the
 * grand total (submitted + recent seconds) and the last launch instant, so the
 * launcher keeps its own per-day ledger in localStorage: every launch opens a
 * session, a minute-tick moves the elapsed time into today's bucket while the
 * game runs, and the "finished" event closes the session. Interface data, not
 * game files - hence localStorage, like the build notes.
 */

export interface PlaytimeDay {
	date: string
	label: string
	tooltip: string
	seconds: number
	pct: number
}

interface PlaytimeStore {
	days: Record<string, number>
	session?: { start: number; flushed: number }
}

const PREFIX = 'portalrinth-instance-playtime:'
const DAY_MS = 86_400_000
/** Nothing counts after this much unaccounted time (a killed launcher, a sleeping clock). */
const MAX_CHUNK_SECONDS = 24 * 60 * 60
/** Days kept in the ledger; the graph shows a fortnight. */
const KEEP_DAYS = 30

function keyOf(instanceId: string): string {
	return `${PREFIX}${instanceId}`
}

function dayKeyOf(timestamp: number): string {
	const date = new Date(timestamp)
	const month = String(date.getMonth() + 1).padStart(2, '0')
	const day = String(date.getDate()).padStart(2, '0')
	return `${date.getFullYear()}-${month}-${day}`
}

function readStore(instanceId: string): PlaytimeStore {
	try {
		const raw = localStorage.getItem(keyOf(instanceId))
		if (raw) {
			const parsed = JSON.parse(raw) as Partial<PlaytimeStore>
			return {
				days: parsed.days && typeof parsed.days === 'object' ? (parsed.days as Record<string, number>) : {},
				session:
					parsed.session && typeof parsed.session.start === 'number' && typeof parsed.session.flushed === 'number'
						? { start: parsed.session.start, flushed: parsed.session.flushed }
						: undefined,
			}
		}
	} catch {
		/* a broken ledger is the same as an empty one */
	}
	return { days: {} }
}

function writeStore(instanceId: string, store: PlaytimeStore): void {
	// The ledger only needs the recent past; older buckets go overboard.
	const cutoff = dayKeyOf(Date.now() - KEEP_DAYS * DAY_MS)
	store.days = Object.fromEntries(
		Object.entries(store.days).filter(([key]) => key >= cutoff),
	)
	try {
		localStorage.setItem(keyOf(instanceId), JSON.stringify(store))
	} catch {
		/* a full quota must not take the launcher down */
	}
}

/** Move the time since the last flush into today's bucket. */
function flushChunk(instanceId: string, store: PlaytimeStore): void {
	if (!store.session) return
	const now = Date.now()
	let deltaSeconds = Math.floor((now - store.session.flushed) / 1000)
	if (deltaSeconds <= 0) return
	if (deltaSeconds > MAX_CHUNK_SECONDS) deltaSeconds = MAX_CHUNK_SECONDS
	const key = dayKeyOf(store.session.flushed + deltaSeconds * 1000 - 1)
	store.days[key] = (store.days[key] ?? 0) + deltaSeconds
	store.session.flushed += deltaSeconds * 1000
}

/**
 * The launcher was (re)started: a session left open by a previous run has no
 * reliable elapsed time any more, so its unflushed remainder is discarded and
 * the session is closed. Running play still counts through the backend's own
 * recent_time_played total.
 */
export function cleanup_stale_playtime_sessions(): void {
	try {
		for (let index = 0; index < localStorage.length; index++) {
			const key = localStorage.key(index)
			if (!key?.startsWith(PREFIX)) continue
			const instanceId = key.slice(PREFIX.length)
			const store = readStore(instanceId)
			if (!store.session) continue
			store.session = undefined
			writeStore(instanceId, store)
		}
	} catch {
		/* no storage - nothing to clean */
	}
}

/** The game launched: open a session for this build. */
export function note_playtime_launched(instanceId: string): void {
	if (!instanceId) return
	const store = readStore(instanceId)
	store.session = { start: Date.now(), flushed: Date.now() }
	writeStore(instanceId, store)
}

/** A minute tick while the game runs: bank the elapsed minute. */
export function note_playtime_tick(instanceId: string): void {
	if (!instanceId) return
	const store = readStore(instanceId)
	if (!store.session) return
	flushChunk(instanceId, store)
	writeStore(instanceId, store)
}

/** The game finished: bank the rest and close the session. */
export function note_playtime_finished(instanceId: string): void {
	if (!instanceId) return
	const store = readStore(instanceId)
	if (!store.session) return
	flushChunk(instanceId, store)
	store.session = undefined
	writeStore(instanceId, store)
}

/** The last two weeks of the ledger, oldest first, shaped for the graph. */
export function read_playtime_days(instanceId: string, days = 14, tick = 0): PlaytimeDay[] {
	void tick
	const result: PlaytimeDay[] = []
	try {
		const store = readStore(instanceId)
		const now = Date.now()
		let maxSeconds = 0
		const raw: { date: string; seconds: number }[] = []
		for (let offset = days - 1; offset >= 0; offset--) {
			const key = dayKeyOf(now - offset * DAY_MS)
			const seconds = Math.max(0, Math.round(store.days[key] ?? 0))
			if (seconds > maxSeconds) maxSeconds = seconds
			raw.push({ date: key, seconds })
		}
		// A floor of half an hour keeps quiet days from collapsing onto the floor line.
		const scale = Math.max(maxSeconds, 30 * 60)
		for (const { date, seconds } of raw) {
			const dateObj = new Date(`${date}T12:00:00`)
			const label = `${dateObj.getDate()}.${String(dateObj.getMonth() + 1).padStart(2, '0')}`
			const longDate = dateObj.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
			result.push({
				date,
				label,
				tooltip: seconds > 0 ? `${longDate} · ${format_playtime(seconds)}` : `${longDate} · 0 мин`,
				seconds,
				pct: seconds > 0 ? Math.max(4, Math.round((seconds / scale) * 100)) : 0,
			})
		}
	} catch {
		/* no storage - an empty fortnight */
	}
	return result
}

/** «2 ч 5 мин», «38 мин», «<1 мин». */
export function format_playtime(seconds: number): string {
	const whole = Math.max(0, Math.round(seconds))
	const hours = Math.floor(whole / 3600)
	const minutes = Math.floor((whole % 3600) / 60)
	if (hours && minutes) return `${hours} ч ${minutes} мин`
	if (hours) return `${hours} ч`
	if (minutes) return `${minutes} мин`
	return whole > 0 ? '<1 мин' : '0 мин'
}

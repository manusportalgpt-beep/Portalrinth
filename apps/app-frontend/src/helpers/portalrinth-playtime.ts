/**
 * How long the player sat in a build, day by day. The backend only knows the
 * grand total (submitted + recent seconds) and the last launch instant, so the
 * launcher keeps its own per-day ledger in localStorage: every launch opens a
 * session, a minute-tick moves the elapsed time into today's bucket while the
 * game runs, and the "finished" event closes the session. Interface data, not
 * game files - hence localStorage, like the build notes.
 *
 * Alongside the time, each session remembers its slowest and its fastest
 * second of frames. The game's agent counts every rendered frame and reports
 * a five-second summary; those reports arrive as fps_report events and are
 * folded into the running session here. While no report has come (an older
 * game, a launcher without the probe) the FPS side of a session is simply
 * unknown, not zero.
 */

export interface PlaytimeDay {
	date: string
	label: string
	tooltip: string
	seconds: number
	pct: number
}

/** One closed game session: when it ran, and the frames it managed. */
export interface PlaytimeSession {
	start: number
	end: number
	/** The slowest one-second frame rate of the session, when known. */
	minFps?: number
	/** The fastest one-second frame rate of the session, when known. */
	maxFps?: number
}

interface PlaytimeStore {
	days: Record<string, number>
	session?: { start: number; flushed: number }
	sessions?: PlaytimeSession[]
}

const PREFIX = 'portalrinth-instance-playtime:'
const DAY_MS = 86_400_000
/** Nothing counts after this much unaccounted time (a killed launcher, a sleeping clock). */
const MAX_CHUNK_SECONDS = 24 * 60 * 60
/** Days kept in the ledger; the graph shows a fortnight. */
const KEEP_DAYS = 30
/** Closed sessions kept per build; the info plate lists them all, scrolling. */
export const KEEP_SESSIONS = 20

/**
 * The frame reports of the session that is running right now, per build. In
 * memory only: a session that is still running has nothing to store yet, and
 * the launcher restarting simply forgets it.
 */
const liveFps = new Map<string, { min: number; max: number }>()

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
			const sessions = Array.isArray(parsed.sessions) ? (parsed.sessions as PlaytimeSession[]) : []
			return {
				days:
					parsed.days && typeof parsed.days === 'object'
						? (parsed.days as Record<string, number>)
						: {},
				session:
					parsed.session &&
					typeof parsed.session.start === 'number' &&
					typeof parsed.session.flushed === 'number'
						? { start: parsed.session.start, flushed: parsed.session.flushed }
						: undefined,
				sessions: sessions
					.filter((item) => typeof item?.start === 'number' && typeof item?.end === 'number')
					.slice(-KEEP_SESSIONS),
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
	store.days = Object.fromEntries(Object.entries(store.days).filter(([key]) => key >= cutoff))
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

/** The game launched: open a session for this build, frames reset. */
export function note_playtime_launched(instanceId: string): void {
	if (!instanceId) return
	liveFps.delete(instanceId)
	const store = readStore(instanceId)
	store.session = { start: Date.now(), flushed: Date.now() }
	writeStore(instanceId, store)
}

/**
 * A five-second frame report from the game's agent, folded into the running
 * session: the launcher keeps the extremes, the report's own minimum only
 * ever deepens them.
 */
export function note_fps_report(instanceId: string, min: number, max: number): void {
	if (!instanceId) return
	const current = liveFps.get(instanceId)
	liveFps.set(instanceId, {
		min: current ? Math.min(current.min, min) : min,
		max: current ? Math.max(current.max, max) : max,
	})
}

/** The frame extremes of the session that is running right now, when known. */
export function read_live_fps(instanceId: string): { min: number; max: number } | null {
	return liveFps.get(instanceId) ?? null
}

/** A minute tick while the game runs: bank the elapsed minute. */
export function note_playtime_tick(instanceId: string): void {
	if (!instanceId) return
	const store = readStore(instanceId)
	if (!store.session) return
	flushChunk(instanceId, store)
	writeStore(instanceId, store)
}

/** The game finished: bank the rest, remember the frames, close the session. */
export function note_playtime_finished(instanceId: string): void {
	if (!instanceId) return
	const store = readStore(instanceId)
	if (!store.session) return
	flushChunk(instanceId, store)
	const fps = liveFps.get(instanceId)
	liveFps.delete(instanceId)
	const session: PlaytimeSession = { start: store.session.start, end: Date.now() }
	if (fps && fps.min >= 0) {
		session.minFps = fps.min
		session.maxFps = fps.max
	}
	store.sessions = [...(store.sessions ?? []), session].slice(-KEEP_SESSIONS)
	store.session = undefined
	writeStore(instanceId, store)
}

/** The latest closed sessions of a build, newest first. */
export function read_playtime_sessions(instanceId: string, limit = 5, tick = 0): PlaytimeSession[] {
	void tick
	try {
		return [...(readStore(instanceId).sessions ?? [])].reverse().slice(0, limit)
	} catch {
		return []
	}
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

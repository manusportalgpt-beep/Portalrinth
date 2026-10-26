/**
 * The assistant's own corner of the disk: a sandbox folder it may read and
 * write freely (excluding executables - those it simply cannot make), and a
 * sessions folder where every conversation is kept, so nothing it learned is
 * lost when the launcher closes.
 *
 * Everything goes through plugin-fs, whose permissions the launcher narrows
 * to these folders plus the usual user directories - the assistant has no
 * way to spell a path outside them.
 */
import * as fs from '@tauri-apps/plugin-fs'
import { invoke } from '@tauri-apps/api/core'
import { appDataDir } from '@tauri-apps/api/path'
import { ref } from 'vue'

const SANDBOX_DIR = 'portalrinth-sandbox'
const SESSIONS_DIR = 'ai-sessions'

let rootPromise: Promise<string> | null = null

function root(): Promise<string> {
	if (!rootPromise) {
		rootPromise = appDataDir().then((base) => joinPath(base, SANDBOX_DIR))
	}
	return rootPromise
}

function sessionsRoot(): Promise<string> {
	return appDataDir().then((base) => joinPath(base, SESSIONS_DIR))
}

/** Windows-safe join that never reaches for the platform's own path API. */
function joinPath(base: string, ...parts: string[]): string {
	const separator = base.includes('\\') ? '\\' : '/'
	let result = base.replace(/[\\/]+$/, '')
	for (const part of parts) {
		result += separator + part
	}
	return result
}

/** Resolves a sandbox-relative path, refusing anything that climbs out. */
async function resolveIn(rel: string, base: Promise<string>): Promise<string> {
	const rootPath = await base
	const parts = String(rel || '')
		.replace(/\\/g, '/')
		.split('/')
		.filter((part) => part.length > 0 && part !== '.')
	if (parts.includes('..')) throw new Error('Путь не может выходить из песочницы')
	return parts.length === 0 ? rootPath : joinPath(rootPath, ...parts)
}

// ---- Per-turn activity -----------------------------------------------------

export interface FileChange {
	path: string
	added: number
	removed: number
}

export interface SandboxStats {
	commands: number
	filesCreated: string[]
	filesChanged: FileChange[]
}

const stats = ref<SandboxStats>({ commands: 0, filesCreated: [], filesChanged: [] })

/** Fresh counters for a new assistant turn. */
export function resetSandboxStats(): void {
	stats.value = { commands: 0, filesCreated: [], filesChanged: [] }
}

export function sandboxStatsSnapshot(): SandboxStats {
	return {
		commands: stats.value.commands,
		filesCreated: [...stats.value.filesCreated],
		filesChanged: stats.value.filesChanged.map((change) => ({ ...change })),
	}
}

function countCommand(): void {
	stats.value = { ...stats.value, commands: stats.value.commands + 1 }
}

// ---- Known contents, for +/- diffs -----------------------------------------

const knownContents = new Map<string, string>()

function countLines(text: string): number {
	return text.length === 0 ? 0 : text.split('\n').length
}

function diffLines(before: string, after: string): { added: number; removed: number } {
	const oldLines = before.split('\n')
	const newLines = after.split('\n')
	const oldSet = new Map<string, number>()
	for (const line of oldLines) oldSet.set(line, (oldSet.get(line) ?? 0) + 1)
	let added = 0
	for (const line of newLines) {
		const left = oldSet.get(line) ?? 0
		if (left > 0) oldSet.set(line, left - 1)
		else added++
	}
	let removed = 0
	for (const left of oldSet.values()) removed += left
	return { added, removed }
}

// ---- The tools themselves --------------------------------------------------

export async function sandboxList(rel = ''): Promise<string> {
	countCommand()
	const dir = await resolveIn(rel, root())
	await fs.mkdir(dir, { recursive: true }).catch(() => {})
	const entries = await fs.readDir(dir)
	if (entries.length === 0) return 'Песочница: папка пуста'
	const lines = entries
		.sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory))
		.map((entry) =>
			entry.isDirectory
				? `${entry.name}/`
				: `${entry.name} (${entry.size ?? 0} байт)`,
		)
	return `Песочница ${rel || '/'}:\n${lines.join('\n')}`
}

export async function sandboxRead(rel: string): Promise<string> {
	countCommand()
	const path = await resolveIn(rel, root())
	const text = await fs.readTextFile(path)
	knownContents.set(norm(rel), text)
	return text.length > 16000 ? `${text.slice(0, 16000)}\n…(обрезано)` : text
}

function norm(rel: string): string {
	return String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase()
}

/**
 * Writes a text file into the sandbox. Executables cannot be produced here:
 * the tools only ever write text, so whatever the assistant builds is data
 * or code the launcher itself displays.
 */
export async function sandboxWrite(rel: string, content: string): Promise<string> {
	countCommand()
	const path = await resolveIn(rel, root())
	await fs.mkdir(path.slice(0, Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))), {
		recursive: true,
	}).catch(() => {})
	const key = norm(rel)
	const before = knownContents.get(key)
	if (before === undefined) {
		try {
			knownContents.set(key, await fs.readTextFile(path))
		} catch {
			knownContents.set(key, '')
		}
	}
	const previous = knownContents.get(key) ?? ''
	await fs.writeTextFile(path, content)
	knownContents.set(key, content)
	const { added, removed } = diffLines(previous, content)
	const created = previous === ''
	if (created) {
		if (!stats.value.filesCreated.includes(rel)) {
			stats.value = {
				...stats.value,
				filesCreated: [...stats.value.filesCreated, rel],
			}
		}
	} else if (added > 0 || removed > 0) {
		const existing = stats.value.filesChanged.find((change) => change.path === rel)
		const change = { path: rel, added, removed }
		stats.value = {
			...stats.value,
			filesChanged: existing
				? stats.value.filesChanged.map((c) => (c.path === rel ? change : c))
				: [...stats.value.filesChanged, change],
		}
	}
	const verb = created
		? `сгенерирован файл ${rel} (${countLines(content)} строк)`
		: `изменён файл ${rel} (+${added}/−${removed})`
	return verb
}

/** Binary writes come straight from downloads (e.g. a background picture). */
export async function sandboxWriteBinary(rel: string, bytes: Uint8Array): Promise<string> {
	countCommand()
	const path = await resolveIn(rel, root())
	await fs.writeFile(path, bytes)
	knownContents.delete(norm(rel))
	return path
}

export async function sandboxDelete(rel: string): Promise<string> {
	countCommand()
	const path = await resolveIn(rel, root())
	await fs.remove(path, { recursive: true })
	knownContents.delete(norm(rel))
	return `удалено: ${rel}`
}

// ---- The built-in archiver -------------------------------------------------

const ARCHIVE_EXTENSIONS = /\.(zip|jar|7z)$/i

/**
 * Packs files or folders of the sandbox into an archive. The format follows
 * the destination's extension - .zip, .jar (a zip by another name, so the
 * assistant can ship a working mod) or .7z, handled by the built-in 7-zip.
 */
export async function sandboxPack(sources: string[], archiveRel: string): Promise<string> {
	countCommand()
	const trimmed = sources.map((source) => source.trim()).filter(Boolean)
	if (!archiveRel.trim() || !ARCHIVE_EXTENSIONS.test(archiveRel.trim())) {
		return 'Имя архива должно заканчиваться на .zip, .jar или .7z'
	}
	if (trimmed.length === 0) return 'Укажите, что упаковать'
	const archivePath = await resolveIn(archiveRel, root())
	const absolute: string[] = []
	for (const source of trimmed) {
		absolute.push(await resolveIn(source, root()))
	}
	try {
		return await invoke('plugin:portalrinth-archiver|archiver_pack', {
			sources: absolute,
			dest: archivePath,
		})
	} catch (error) {
		return `Архив не получился: ${String(error).slice(0, 300)}`
	}
}

/** Unpacks an archive of the sandbox into a folder of the sandbox. */
export async function sandboxUnpack(archiveRel: string, destRel: string): Promise<string> {
	countCommand()
	const archive = archiveRel.trim()
	if (!archive) return 'Укажите архив'
	if (!ARCHIVE_EXTENSIONS.test(archive)) {
		return 'Умею распаковывать только .zip, .jar и .7z'
	}
	const dest = destRel.trim() || archive.replace(ARCHIVE_EXTENSIONS, '')
	const archivePath = await resolveIn(archive, root())
	const destPath = await resolveIn(dest, root())
	try {
		return await invoke('plugin:portalrinth-archiver|archiver_unpack', {
			archive: archivePath,
			destDir: destPath,
		})
	} catch (error) {
		return `Распаковка не удалась: ${String(error).slice(0, 300)}`
	}
}

// ---- The inbox -------------------------------------------------------------

const FORBIDDEN_ATTACHMENTS = /\.(exe|msi|bat|cmd|com|scr|sh|dll|so|apk|app|ps1|vbs|jar\.exe)$/i

/**
 * Copies the files the player attached into the sandbox's inbox folder, so
 * the assistant can read, unpack and rework them on every later turn - not
 * just the moment they arrived. Executables stay out, as everywhere else.
 */
export async function inboxSave(files: AttachedFile[]): Promise<string[]> {
	const saved: string[] = []
	const skipped: string[] = []
	for (const file of files) {
		if (!file.path) continue
		if (FORBIDDEN_ATTACHMENTS.test(file.name)) {
			skipped.push(file.name)
			continue
		}
		const base = file.name.replace(/[^\p{L}\p{N}._ -]/gu, '_').replace(/\s+/g, ' ').trim()
		if (!base) continue
		const dot = base.lastIndexOf('.')
		const stem = dot > 0 ? base.slice(0, dot) : base
		const extension = dot > 0 ? base.slice(dot) : ''
		let rel = `inbox/${base}`
		let counter = 2
		while (await pathExists(rel)) {
			rel = `inbox/${stem} (${counter})${extension}`
			counter++
		}
		try {
			const bytes = await fs.readFile(file.path)
			await sandboxWriteBinary(rel, bytes)
			saved.push(rel)
		} catch {
			/* outside the file scope or unreadable - the chat copy is still there */
		}
	}
	if (skipped.length > 0) {
		saved.push(`(пропущены исполняемые файлы: ${skipped.join(', ')})`)
	}
	return saved
}

async function pathExists(rel: string): Promise<boolean> {
	try {
		return await fs.exists(await resolveIn(rel, root()))
	} catch {
		return false
	}
}

// ---- Sessions --------------------------------------------------------------

export interface StoredSession {
	id: string
	started: number
	updated: number
	messages: unknown[]
}

export const currentSessionId = ref<string>(
	`session-${new Date().toISOString().replace(/[:.]/g, '-')}`,
)

export function startNewSession(): void {
	currentSessionId.value = `session-${new Date().toISOString().replace(/[:.]/g, '-')}`
}

let saveTimer: ReturnType<typeof setTimeout> | undefined

/** Persists the conversation into the sessions folder, debounced. */
export function saveSession(messages: unknown[]): void {
	clearTimeout(saveTimer)
	saveTimer = setTimeout(async () => {
		try {
			const dir = await sessionsRoot()
			await fs.mkdir(dir, { recursive: true }).catch(() => {})
			const session: StoredSession = {
				id: currentSessionId.value,
				started: Date.now(),
				updated: Date.now(),
				messages,
			}
			await fs.writeTextFile(
				joinPath(dir, `${currentSessionId.value}.json`),
				JSON.stringify(session, null, '\t'),
			)
		} catch {
			/* a lost save is never worth a crash */
		}
	}, 800)
}

export async function readLatestSession(): Promise<StoredSession | null> {
	try {
		const dir = await sessionsRoot()
		const entries = (await fs.readDir(dir))
			.filter((entry) => entry.name?.endsWith('.json'))
			.sort((a, b) => (b.name ?? '').localeCompare(a.name ?? ''))
		if (entries.length === 0) return null
		const text = await fs.readTextFile(joinPath(dir, entries[0].name ?? ''))
		return JSON.parse(text) as StoredSession
	} catch {
		return null
	}
}

export async function readSessionsOverview(limit = 8): Promise<string> {
	try {
		const dir = await sessionsRoot()
		const entries = (await fs.readDir(dir))
			.filter((entry) => entry.name?.endsWith('.json'))
			.sort((a, b) => (b.name ?? '').localeCompare(a.name ?? ''))
			.slice(0, limit)
		if (entries.length === 0) return 'Прошлых сессий пока нет'
		const lines: string[] = []
		for (const entry of entries) {
			try {
				const session = JSON.parse(
					await fs.readTextFile(joinPath(dir, entry.name ?? '')),
				) as StoredSession
				const firstUser = session.messages?.find(
					(message) =>
						typeof message === 'object' &&
						message !== null &&
						(message as { role?: string }).role === 'user',
				) as { content?: string } | undefined
				lines.push(
					`${session.id}: ${session.messages?.length ?? 0} сообщений; началось с «${(firstUser?.content ?? '').slice(0, 80)}»`,
				)
			} catch {
				lines.push(`${entry.name}: файл повреждён`)
			}
		}
		return lines.join('\n')
	} catch {
		return 'Прошлых сессий пока нет'
	}
}

/** Marks the current conversation read on disk and opens a fresh one. */
export function forgetSessions(): void {
	startNewSession()
}

// ---- Attached files --------------------------------------------------------

export interface AttachedFile {
	name: string
	size: number
	/** 'image' previews inline and can be sent to a vision model. */
	kind: 'image' | 'text' | 'file'
	dataUrl?: string
	text?: string
	/** Where the file came from, so the inbox can copy it into the sandbox. */
	path?: string
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']
const TEXT_EXTENSIONS = [
	'txt', 'log', 'json', 'js', 'ts', 'vue', 'css', 'scss', 'html', 'md', 'py',
	'java', 'kt', 'gradle', 'toml', 'yaml', 'yml', 'cfg', 'ini', 'csv', 'mcmeta',
]

export async function attachFromPaths(paths: string[]): Promise<AttachedFile[]> {
	const attached: AttachedFile[] = []
	for (const path of paths) {
		const name = path.split(/[\\/]/).pop() ?? path
		const extension = (name.split('.').pop() ?? '').toLowerCase()
		try {
			const info = await fs.stat(path)
			const size = info.size ?? 0
			if (IMAGE_EXTENSIONS.includes(extension)) {
				const bytes = await fs.readFile(path)
				attached.push({
					name,
					size,
					kind: 'image',
					path,
					dataUrl: `data:image/${extension === 'jpg' ? 'jpeg' : extension};base64,${bytesToBase64(bytes)}`,
				})
			} else if (TEXT_EXTENSIONS.includes(extension) || size < 200000) {
				const text = await fs.readTextFile(path)
				attached.push({
					name,
					size,
					kind: 'text',
					path,
					text: text.length > 12000 ? `${text.slice(0, 12000)}\n…` : text,
				})
			} else {
				attached.push({ name, size, kind: 'file', path })
			}
		} catch (error) {
			attached.push({ name, size: 0, kind: 'file' })
			void error
		}
	}
	return attached
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = ''
	const chunk = 0x8000
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
	}
	return btoa(binary)
}

export function formatSize(size: number): string {
	if (size < 1024) return `${size} Б`
	if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} КБ`
	return `${(size / 1024 / 1024).toFixed(1)} МБ`
}

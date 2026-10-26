/**
 * Sound in the launcher: a playlist of one's own music, and the sound of a
 * background video.
 *
 * Tracks are copied into a folder next to the app database (no hard cap - a
 * gentle warning comes when the folder grows past five gigabytes), so a
 * playlist outlives the files it was made from. What the interface needs to
 * know about a track - its title, its artist, its cover, how long it is - is
 * read once, when it is added, and kept on this computer with the order and
 * the settings below, as they only say how this launcher sounds.
 *
 * There is one player for the whole window. The title bar's sound button and
 * Settings → Sound both drive it; neither owns it.
 */
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { computed, reactive, ref, shallowRef, watch } from 'vue'

import { proxiedFetch } from './proxy-fetch'
import { bytesToBase64 } from './ai-sandbox'

export const MUSIC_EXTENSIONS = ['mp3', 'ogg', 'oga', 'opus', 'wav', 'flac', 'm4a', 'aac', 'webm']

export type MusicSort = 'added' | 'duration' | 'alpha' | 'random' | 'custom'
export type MusicRepeat = 'off' | 'all' | 'one'

export interface MusicTrack {
	id: string
	extension: string
	size: number
	title: string
	artist: string
	/** Seconds; 0 until it is known. */
	duration: number
	/** A small JPEG of the cover, when the file has one. */
	cover: string | null
	addedAt: number
}

export interface AudioSettings {
	musicEnabled: boolean
	/** The little sounds the launcher itself makes; off, it keeps quiet. */
	effectsEnabled: boolean
	effectsVolume: number
	/** The little sounds the launcher itself makes; off, it keeps quiet. */
	effectsEnabled: boolean
	effectsVolume: number
	/** Whether the bars that move with the beat are drawn. */
	visualizer: boolean
	musicVolume: number
	videoSound: boolean
	videoVolume: number
	sort: MusicSort
	repeat: MusicRepeat
	/** The order one put the tracks in by hand; what `custom` plays. */
	customOrder: string[]
	/** The order `random` plays, drawn once when it is chosen. */
	shuffledOrder: string[]
}

const SETTINGS_KEY = 'portalrinth.audio.settings'
const TRACKS_KEY = 'portalrinth.audio.tracks'

const DEFAULT_SETTINGS: AudioSettings = {
	musicEnabled: false,
	effectsEnabled: false,
	effectsVolume: 50,
	effectsEnabled: false,
	effectsVolume: 50,
	visualizer: true,
	musicVolume: 60,
	videoSound: false,
	videoVolume: 60,
	sort: 'added',
	repeat: 'all',
	customOrder: [],
	shuffledOrder: [],
}

function readJson<T>(key: string, fallback: T): T {
	try {
		const raw = localStorage.getItem(key)
		return raw ? (JSON.parse(raw) as T) : fallback
	} catch {
		return fallback
	}
}

function writeJson(key: string, value: unknown) {
	try {
		localStorage.setItem(key, JSON.stringify(value))
	} catch {
		// Not kept, but still in effect until the window is closed.
	}
}

export const audioSettings = reactive<AudioSettings>({
	...DEFAULT_SETTINGS,
	...readJson<Partial<AudioSettings>>(SETTINGS_KEY, {}),
})
watch(audioSettings, () => writeJson(SETTINGS_KEY, audioSettings), { deep: true })

export const musicTracks = ref<MusicTrack[]>(readJson<MusicTrack[]>(TRACKS_KEY, []))
watch(musicTracks, () => writeJson(TRACKS_KEY, musicTracks.value), { deep: true })

function shuffle(ids: string[]): string[] {
	const result = [...ids]
	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1))
		;[result[i], result[j]] = [result[j], result[i]]
	}
	return result
}

/** Follows a kept order, putting tracks it does not know at the end. */
function byOrder(tracks: MusicTrack[], order: string[]): MusicTrack[] {
	const position = new Map(order.map((id, index) => [id, index]))
	return [...tracks].sort(
		(a, b) => (position.get(a.id) ?? Infinity) - (position.get(b.id) ?? Infinity),
	)
}

/** The tracks in the order they play. */
export const playlist = computed<MusicTrack[]>(() => {
	const tracks = musicTracks.value
	switch (audioSettings.sort) {
		case 'duration':
			return [...tracks].sort((a, b) => b.duration - a.duration)
		case 'alpha':
			return [...tracks].sort((a, b) =>
				a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }),
			)
		case 'random':
			return byOrder(tracks, audioSettings.shuffledOrder)
		case 'custom':
			return byOrder(tracks, audioSettings.customOrder)
		default:
			return [...tracks].sort((a, b) => a.addedAt - b.addedAt)
	}
})

export function setMusicSort(sort: Exclude<MusicSort, 'custom'>) {
	if (sort === 'random') audioSettings.shuffledOrder = shuffle(musicTracks.value.map((t) => t.id))
	audioSettings.sort = sort
}

/** Keeps an order put together by hand; from then on that is what plays. */
export function setCustomOrder(ids: string[]) {
	audioSettings.customOrder = [...ids]
	audioSettings.sort = 'custom'
}

/* ---------- reading a file once it is added ---------- */

function decodeText(bytes: Uint8Array, encoding: number): string {
	const label = encoding === 1 || encoding === 2 ? 'utf-16' : encoding === 3 ? 'utf-8' : 'latin1'
	try {
		return new TextDecoder(label).decode(bytes).replace(/\0+$/g, '').replace(/\0/g, ' ').trim()
	} catch {
		return ''
	}
}

/** Title, artist and cover from an ID3v2 tag - what mp3s mostly carry. */
function readId3(bytes: Uint8Array): { title?: string; artist?: string; cover?: Blob } {
	if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return {}
	const version = bytes[3]
	const syncsafe = (offset: number) =>
		(bytes[offset] << 21) | (bytes[offset + 1] << 14) | (bytes[offset + 2] << 7) | bytes[offset + 3]
	const end = Math.min(bytes.length, 10 + syncsafe(6))
	const result: { title?: string; artist?: string; cover?: Blob } = {}
	let offset = 10
	if (bytes[5] & 0x40)
		offset +=
			version === 4
				? syncsafe(10)
				: 4 + new DataView(bytes.buffer, bytes.byteOffset + 10, 4).getUint32(0)
	while (offset + 10 <= end) {
		const id = String.fromCharCode(...bytes.subarray(offset, offset + 4))
		if (!/^[A-Z0-9]{4}$/.test(id)) break
		const size =
			version === 4
				? syncsafe(offset + 4)
				: new DataView(bytes.buffer, bytes.byteOffset + offset + 4, 4).getUint32(0)
		const body = bytes.subarray(offset + 10, Math.min(end, offset + 10 + size))
		if ((id === 'TIT2' || id === 'TPE1') && body.length > 1) {
			const text = decodeText(body.subarray(1), body[0])
			if (id === 'TIT2') result.title = text
			else result.artist = text
		} else if (id === 'APIC' && body.length > 4 && !result.cover) {
			const encoding = body[0]
			let i = 1
			const mimeEnd = body.indexOf(0, i)
			const mime = decodeText(body.subarray(i, mimeEnd), 0) || 'image/jpeg'
			i = mimeEnd + 2 // the terminator, then the picture type
			const wide = encoding === 1 || encoding === 2
			while (i < body.length) {
				if (wide ? body[i] === 0 && body[i + 1] === 0 : body[i] === 0) break
				i += wide ? 2 : 1
			}
			i += wide ? 2 : 1
			if (i < body.length) result.cover = new Blob([body.slice(i)], { type: mime })
		}
		offset += 10 + size
	}
	return result
}

async function smallCover(blob: Blob): Promise<string | null> {
	try {
		const bitmap = await createImageBitmap(blob)
		const size = 128
		const canvas = document.createElement('canvas')
		canvas.width = size
		canvas.height = size
		const context = canvas.getContext('2d')
		if (!context) return null
		const scale = Math.max(size / bitmap.width, size / bitmap.height)
		const width = bitmap.width * scale
		const height = bitmap.height * scale
		context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height)
		bitmap.close()
		return canvas.toDataURL('image/jpeg', 0.82)
	} catch {
		return null
	}
}

function durationOf(url: string): Promise<number> {
	return new Promise((resolve) => {
		const probe = new Audio()
		probe.preload = 'metadata'
		probe.onloadedmetadata = () => resolve(Number.isFinite(probe.duration) ? probe.duration : 0)
		probe.onerror = () => resolve(0)
		probe.src = url
	})
}

async function trackBytes(id: string): Promise<ArrayBuffer> {
	return await invoke<ArrayBuffer>('plugin:portalrinth-music|music_get', { id })
}

const MIME: Record<string, string> = {
	mp3: 'audio/mpeg',
	ogg: 'audio/ogg',
	oga: 'audio/ogg',
	opus: 'audio/ogg',
	wav: 'audio/wav',
	flac: 'audio/flac',
	m4a: 'audio/mp4',
	aac: 'audio/aac',
	webm: 'audio/webm',
}

interface AddedFile {
	id: string
	extension: string
	size: number
	name: string
}

/** Copies a downloaded track into the launcher's folder and reads its tags. */
async function registerTrack(
	bytes: Uint8Array,
	extension: string,
	fallbackName: string,
	addedAt: number,
): Promise<MusicTrack> {
	const file = await invoke<AddedFile>('plugin:portalrinth-music|music_add_bytes', {
		bytesBase64: bytesToBase64(bytes),
		extension,
	})
	const tags = readId3(bytes.subarray(0, Math.min(bytes.length, 16 * 1024 * 1024)))
	const url = URL.createObjectURL(new Blob([bytes], { type: MIME[file.extension] }))
	const duration = await durationOf(url)
	URL.revokeObjectURL(url)
	const track: MusicTrack = {
		id: file.id,
		extension: file.extension,
		size: file.size,
		title: tags.title || fallbackName,
		artist: tags.artist || '',
		duration,
		cover: tags.cover ? await smallCover(tags.cover) : null,
		addedAt,
	}
	musicTracks.value = [...musicTracks.value, track]
	if (audioSettings.sort === 'custom') audioSettings.customOrder.push(track.id)
	if (audioSettings.sort === 'random') audioSettings.shuffledOrder.push(track.id)
	return track
}

/** Asks for files and adds them to the playlist. Returns how many were added. */
export async function addMusicFiles(): Promise<number> {
	const picked = await open({
		multiple: true,
		filters: [{ name: 'Audio', extensions: MUSIC_EXTENSIONS }],
	})
	const paths = Array.isArray(picked) ? picked : typeof picked === 'string' ? [picked] : []
	let added = 0
	for (const path of paths) {
		const file = await invoke<AddedFile>('plugin:portalrinth-music|music_add', { path })
		const bytes = new Uint8Array(await trackBytes(file.id))
		const tags = readId3(bytes.subarray(0, Math.min(bytes.length, 16 * 1024 * 1024)))
		const url = URL.createObjectURL(new Blob([bytes], { type: MIME[file.extension] }))
		const duration = await durationOf(url)
		URL.revokeObjectURL(url)
		const track: MusicTrack = {
			id: file.id,
			extension: file.extension,
			size: file.size,
			title: tags.title || file.name,
			artist: tags.artist || '',
			duration,
			cover: tags.cover ? await smallCover(tags.cover) : null,
			addedAt: Date.now() + added,
		}
		musicTracks.value = [...musicTracks.value, track]
		if (audioSettings.sort === 'custom') audioSettings.customOrder.push(track.id)
		if (audioSettings.sort === 'random') audioSettings.shuffledOrder.push(track.id)
		added++
	}
	await refreshMusicUsage()
	return added
}

/** Sniffs an audio format off the file's first bytes - the honest way to
 * know what a link carries when its name says nothing. */
function sniffExtension(bytes: Uint8Array, fromName: string): string {
	const fromUrl = (fromName.split('?')[0].split('.').pop() ?? '').toLowerCase()
	if (MUSIC_EXTENSIONS.includes(fromUrl)) return fromUrl
	if (bytes.length > 12) {
		const ascii = (offset: number, text: string) =>
			String.fromCharCode(...bytes.subarray(offset, offset + text.length)) === text
		if (ascii(0, 'ID3')) return 'mp3'
		if (ascii(0, 'OggS')) return 'ogg'
		if (ascii(0, 'fLaC')) return 'flac'
		if (ascii(0, 'RIFF')) return 'wav'
		if (ascii(4, 'ftyp')) return 'm4a'
		if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return 'mp3'
	}
	return ''
}

/** Downloads a track by a direct link - a CDN of a music site, a cloud, a
 * radio dump - and puts it in the playlist. */
export async function addMusicFromUrl(url: string): Promise<MusicTrack> {
	const response = await proxiedFetch(url, { signal: AbortSignal.timeout(180000) })
	if (!response.ok) throw new Error(`HTTP ${response.status}`)
	const bytes = new Uint8Array(await response.arrayBuffer())
	if (bytes.length < 2048) throw new Error('файл пустой или не аудио')
	if (bytes.length > 200 * 1024 * 1024) throw new Error('файл больше 200 МБ')
	let name = 'трек'
	try {
		name = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '') || name
	} catch {
		/* a relative or odd URL keeps the plain name */
	}
	const extension = sniffExtension(bytes, name)
	if (!extension) throw new Error('не похоже на аудио (mp3, ogg, flac, wav, m4a)')
	const track = await registerTrack(bytes, extension, name.replace(/\.[a-z0-9]+$/i, ''), Date.now())
	await refreshMusicUsage()
	return track
}

export async function removeMusicTrack(id: string): Promise<void> {
	if (player.trackId === id) stopMusic()
	await invoke('plugin:portalrinth-music|music_remove', { id })
	musicTracks.value = musicTracks.value.filter((track) => track.id !== id)
	audioSettings.customOrder = audioSettings.customOrder.filter((kept) => kept !== id)
	audioSettings.shuffledOrder = audioSettings.shuffledOrder.filter((kept) => kept !== id)
	await refreshMusicUsage()
}

/** `limit` is not a cap - it is where the friendly "this is getting heavy"
 * warning starts (5 GB), so huge playlists are a choice, not a wall. */
export const MUSIC_WARN_BYTES = 5 * 1024 * 1024 * 1024
export const musicUsage = ref({ used: 0, limit: MUSIC_WARN_BYTES })
export async function refreshMusicUsage(): Promise<void> {
	musicUsage.value = await invoke('plugin:portalrinth-music|music_usage')
}

/** Drops tracks whose files are gone from the folder. */
export async function reconcileMusic(): Promise<void> {
	const present = new Set(await invoke<string[]>('plugin:portalrinth-music|music_list'))
	if (musicTracks.value.some((track) => !present.has(track.id))) {
		musicTracks.value = musicTracks.value.filter((track) => present.has(track.id))
	}
}

/* ---------- the player ---------- */

export const player = reactive({
	trackId: null as string | null,
	playing: false,
	currentTime: 0,
	duration: 0,
	loading: false,
})

export const currentTrack = computed(
	() => musicTracks.value.find((track) => track.id === player.trackId) ?? null,
)

let audio: HTMLAudioElement | null = null
let audioUrl: string | null = null
let context: AudioContext | null = null
/** What the bars are drawn from; null until something has played. */
export const analyser = shallowRef<AnalyserNode | null>(null)

function element(): HTMLAudioElement {
	if (audio) return audio
	audio = new Audio()
	audio.preload = 'auto'
	audio.volume = audioSettings.musicVolume / 100
	audio.addEventListener('timeupdate', () => {
		player.currentTime = audio?.currentTime ?? 0
	})
	audio.addEventListener('loadedmetadata', () => {
		player.duration = Number.isFinite(audio?.duration) ? (audio?.duration ?? 0) : 0
	})
	audio.addEventListener('play', () => (player.playing = true))
	audio.addEventListener('pause', () => (player.playing = false))
	audio.addEventListener('ended', () => void onEnded())
	return audio
}

function connectAnalyser(media: HTMLAudioElement) {
	if (context) {
		void context.resume().catch(() => {})
		return
	}
	try {
		context = new AudioContext()
		const source = context.createMediaElementSource(media)
		const node = context.createAnalyser()
		node.fftSize = 128
		node.smoothingTimeConstant = 0.78
		source.connect(node)
		node.connect(context.destination)
		analyser.value = node
	} catch {
		context = null
	}
}

/** A webview may refuse to start sound before the window has been clicked. */
let waitingForGesture = false
function playWhenAllowed(media: HTMLAudioElement) {
	media.play().catch(() => {
		if (waitingForGesture) return
		waitingForGesture = true
		const retry = () => {
			waitingForGesture = false
			window.removeEventListener('pointerdown', retry, true)
			window.removeEventListener('keydown', retry, true)
			if (player.trackId && audioSettings.musicEnabled) {
				connectAnalyser(media)
				void media.play().catch(() => {})
			}
		}
		window.addEventListener('pointerdown', retry, true)
		window.addEventListener('keydown', retry, true)
	})
}

export async function playTrack(id: string): Promise<void> {
	const track = musicTracks.value.find((candidate) => candidate.id === id)
	if (!track) return
	const media = element()
	player.loading = true
	player.trackId = id
	player.currentTime = 0
	player.duration = track.duration
	try {
		const bytes = await trackBytes(id)
		if (player.trackId !== id) return
		if (!bytes.byteLength) {
			await reconcileMusic()
			return
		}
		if (audioUrl) URL.revokeObjectURL(audioUrl)
		audioUrl = URL.createObjectURL(new Blob([bytes], { type: MIME[track.extension] }))
		media.src = audioUrl
		media.loop = audioSettings.repeat === 'one'
		connectAnalyser(media)
		playWhenAllowed(media)
	} finally {
		player.loading = false
	}
}

export function toggleMusic(): void {
	if (!player.trackId) {
		const first = playlist.value[0]
		if (first) void playTrack(first.id)
		return
	}
	const media = element()
	if (media.paused) {
		connectAnalyser(media)
		playWhenAllowed(media)
	} else media.pause()
}

export function stopMusic(): void {
	audio?.pause()
	if (audio) audio.removeAttribute('src')
	if (audioUrl) URL.revokeObjectURL(audioUrl)
	audioUrl = null
	player.trackId = null
	player.playing = false
	player.currentTime = 0
}

function step(direction: 1 | -1, wrap: boolean): MusicTrack | null {
	const list = playlist.value
	if (!list.length) return null
	const index = list.findIndex((track) => track.id === player.trackId)
	const next = index + direction
	if (next >= 0 && next < list.length) return list[next]
	return wrap ? list[(next + list.length) % list.length] : null
}

export function nextTrack(): void {
	const next = step(1, true)
	if (next) void playTrack(next.id)
}

export function previousTrack(): void {
	// Back to the start of this one first, as a player does, unless it has only just begun.
	if (audio && audio.currentTime > 3) {
		audio.currentTime = 0
		return
	}
	const previous = step(-1, true)
	if (previous) void playTrack(previous.id)
}

async function onEnded() {
	if (audioSettings.repeat === 'one' && player.trackId) {
		await playTrack(player.trackId)
		return
	}
	const next = step(1, audioSettings.repeat === 'all')
	if (next) await playTrack(next.id)
	else player.playing = false
}

export function seekMusic(seconds: number): void {
	if (!audio) return
	audio.currentTime = Math.max(0, Math.min(seconds, player.duration || seconds))
	player.currentTime = audio.currentTime
}

export function cycleRepeat(): void {
	audioSettings.repeat =
		audioSettings.repeat === 'off' ? 'all' : audioSettings.repeat === 'all' ? 'one' : 'off'
}

watch(
	() => audioSettings.musicVolume,
	(volume) => {
		if (audio) audio.volume = Math.min(1, Math.max(0, volume / 100))
	},
)
watch(
	() => audioSettings.repeat,
	(repeat) => {
		if (audio) audio.loop = repeat === 'one'
	},
)
watch(
	() => audioSettings.musicEnabled,
	(enabled) => {
		if (!enabled) stopMusic()
		else if (!player.trackId && playlist.value.length) void playTrack(playlist.value[0].id)
	},
)

/** Starts the playlist when the window opens, if music is on. */
export async function startMusic(): Promise<void> {
	try {
		await reconcileMusic()
	} catch {
		// The folder could not be read; the list stays as it was.
	}
	if (audioSettings.musicEnabled && !player.trackId && playlist.value.length) {
		await playTrack(playlist.value[0].id)
	}
}

export function formatTrackTime(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
	const total = Math.floor(seconds)
	const hours = Math.floor(total / 3600)
	const minutes = Math.floor((total % 3600) / 60)
	const rest = String(total % 60).padStart(2, '0')
	return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`
}

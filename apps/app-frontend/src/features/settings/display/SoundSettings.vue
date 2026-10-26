<template>
	<div class="flex flex-col gap-6">
		<section class="flex flex-col gap-6">
			<div class="flex items-center justify-between gap-4">
				<div class="min-w-0">
					<h2 id="sound-music-label" class="m-0 text-lg font-semibold text-contrast">
						{{ formatMessage(messages.musicTitle) }}
					</h2>
					<p class="m-0 mt-1 text-secondary">{{ formatMessage(messages.musicDescription) }}</p>
				</div>
				<Toggle
					id="sound-music"
					v-model="audioSettings.musicEnabled"
					aria-labelledby="sound-music-label"
				/>
			</div>
			<template v-if="audioSettings.musicEnabled">
				<div class="flex items-center justify-between gap-4">
					<div class="min-w-0">
						<h3 id="sound-visualizer-label" class="m-0 text-lg font-semibold text-contrast">
							{{ formatMessage(messages.visualizerTitle) }}
						</h3>
						<p class="m-0 mt-1 text-secondary">
							{{ formatMessage(messages.visualizerDescription) }}
						</p>
					</div>
					<Toggle
						id="sound-visualizer"
						v-model="audioSettings.visualizer"
						aria-labelledby="sound-visualizer-label"
					/>
				</div>
				<div class="flex flex-col gap-2.5">
					<h3 class="m-0 text-lg font-semibold text-contrast">
						{{ formatMessage(messages.musicVolume) }}
					</h3>
					<Slider
						id="sound-music-volume"
						v-model="audioSettings.musicVolume"
						:aria-label="formatMessage(messages.musicVolume)"
						:min="0"
						:max="100"
						:step="1"
						unit="%"
					/>
				</div>
			</template>
		</section>

		<section class="flex flex-col gap-6 border-0 border-t border-solid border-divider pt-6">
			<div class="flex items-center justify-between gap-4">
				<div class="min-w-0">
					<h2 id="sound-video-label" class="m-0 text-lg font-semibold text-contrast">
						{{ formatMessage(messages.videoTitle) }}
					</h2>
					<p class="m-0 mt-1 text-secondary">{{ formatMessage(messages.videoDescription) }}</p>
				</div>
				<Toggle
					id="sound-video"
					v-model="audioSettings.videoSound"
					aria-labelledby="sound-video-label"
				/>
			</div>
			<div v-if="audioSettings.videoSound" class="flex flex-col gap-2.5">
				<h3 class="m-0 text-lg font-semibold text-contrast">
					{{ formatMessage(messages.videoVolume) }}
				</h3>
				<Slider
					id="sound-video-volume"
					v-model="audioSettings.videoVolume"
					:aria-label="formatMessage(messages.videoVolume)"
					:min="0"
					:max="100"
					:step="1"
					unit="%"
				/>
			</div>
		</section>

		<section class="flex flex-col gap-6 border-0 border-t border-solid border-divider pt-6">
			<div class="flex items-center justify-between gap-4">
				<div class="min-w-0">
					<h2 id="sound-effects-label" class="m-0 text-lg font-semibold text-contrast">
						{{ formatMessage(messages.effectsTitle) }}
					</h2>
					<p class="m-0 mt-1 text-secondary">{{ formatMessage(messages.effectsDescription) }}</p>
				</div>
				<Toggle
					id="sound-effects"
					v-model="audioSettings.effectsEnabled"
					aria-labelledby="sound-effects-label"
				/>
			</div>
			<div v-if="audioSettings.effectsEnabled" class="flex flex-col gap-2.5">
				<h3 class="m-0 text-lg font-semibold text-contrast">
					{{ formatMessage(messages.effectsVolume) }}
				</h3>
				<Slider
					id="sound-effects-volume"
					v-model="audioSettings.effectsVolume"
					:aria-label="formatMessage(messages.effectsVolume)"
					:min="0"
					:max="100"
					:step="1"
					unit="%"
				/>
			</div>
		</section>

		<section class="flex flex-col gap-6 border-0 border-t border-solid border-divider pt-6">
			<div class="flex items-center justify-between gap-4">
				<div class="min-w-0">
					<h2 id="sound-effects-label" class="m-0 text-lg font-semibold text-contrast">
						{{ formatMessage(messages.effectsTitle) }}
					</h2>
					<p class="m-0 mt-1 text-secondary">{{ formatMessage(messages.effectsDescription) }}</p>
				</div>
				<Toggle
					id="sound-effects"
					v-model="audioSettings.effectsEnabled"
					aria-labelledby="sound-effects-label"
				/>
			</div>
			<div v-if="audioSettings.effectsEnabled" class="flex flex-col gap-2.5">
				<h3 class="m-0 text-lg font-semibold text-contrast">
					{{ formatMessage(messages.effectsVolume) }}
				</h3>
				<Slider
					id="sound-effects-volume"
					v-model="audioSettings.effectsVolume"
					:aria-label="formatMessage(messages.effectsVolume)"
					:min="0"
					:max="100"
					:step="1"
					unit="%"
				/>
			</div>
		</section>

		<section class="flex flex-col gap-4 border-0 border-t border-solid border-divider pt-6">
			<div class="flex flex-wrap items-start justify-between gap-4">
				<div class="min-w-0">
					<h2 class="m-0 text-lg font-semibold text-contrast">
						{{ formatMessage(messages.playlistTitle) }}
					</h2>
					<p class="m-0 mt-1 text-secondary">
						{{
							formatMessage(messages.playlistUsage, {
								used: formatSize(musicUsage.used),
							})
						}}
					</p>
					<p
						v-if="musicUsage.used > musicUsage.limit"
						class="m-0 mt-1 text-sm font-semibold text-orange"
					>
						{{
							formatMessage(messages.playlistHeavy, {
								used: formatSize(musicUsage.used),
							})
						}}
					</p>
				</div>
				<Button type="colored" color="brand" :disabled="adding" @click="add">
					<SpinnerIcon v-if="adding" class="animate-spin" aria-hidden="true" />
					<PlusIcon v-else aria-hidden="true" />
					{{ formatMessage(messages.addMusic) }}
				</Button>
			</div>

			<div class="flex flex-wrap items-center gap-2.5">
				<span id="sound-sort-label" class="font-semibold text-contrast">
					{{ formatMessage(messages.sortTitle) }}
				</span>
				<Combobox
					:model-value="audioSettings.sort"
					:options="sortOptions"
					:display-value="sortLabel"
					listbox
					show-chevron
					class="w-64"
					aria-labelledby="sound-sort-label"
					@update:model-value="onSort"
				/>
			</div>

			<div class="flex flex-col gap-2 rounded-2xl bg-surface-2 p-4">
				<span class="font-semibold text-contrast">
					{{ formatMessage(messages.onlineTitle) }}
				</span>
				<div class="flex flex-wrap items-center gap-2">
					<Input
						v-model="onlineQuery"
						:placeholder="formatMessage(messages.onlineSearchPlaceholder)"
						class="w-72"
						@keydown.enter="searchOnline"
					/>
					<Button :disabled="!onlineQuery.trim()" @click="searchOnline">
						<SearchIcon class="size-4" aria-hidden="true" />
						{{ formatMessage(messages.onlineSearch) }}
					</Button>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<Input
						v-model="onlineUrl"
						:placeholder="formatMessage(messages.onlineUrlPlaceholder)"
						class="min-w-64 grow"
					/>
					<Button
						type="colored"
						color="brand"
						:disabled="addingUrl || !onlineUrl.trim()"
						@click="addByUrl"
					>
						<SpinnerIcon v-if="addingUrl" class="animate-spin" aria-hidden="true" />
						{{ formatMessage(messages.onlineAdd) }}
					</Button>
				</div>
				<p class="m-0 text-xs leading-relaxed text-secondary">
					{{ formatMessage(messages.onlineHint) }}
				</p>
				<p v-if="urlMessage" class="m-0 text-xs font-semibold" :class="urlOk ? 'text-green' : 'text-red'">
					{{ urlMessage }}
				</p>
			</div>

			<p v-if="!rows.length" class="m-0 rounded-2xl bg-surface-2 p-4 text-secondary">
				{{ formatMessage(messages.empty) }}
			</p>
			<TransitionGroup
				v-else
				ref="list"
				tag="ul"
				name="playlist-row"
				class="relative m-0 flex list-none flex-col gap-1.5 p-0"
			>
				<li
					v-for="track in rows"
					:key="track.id"
					:data-id="track.id"
					class="playlist-row flex items-center gap-3 rounded-2xl bg-surface-2 p-2 pr-3"
					:class="{
						'is-dragging': dragging === track.id,
						'is-current': player.trackId === track.id,
					}"
				>
					<button
						v-tooltip="formatMessage(messages.dragHandle)"
						class="drag-handle grid size-6 shrink-0 cursor-grab place-items-center border-0 bg-transparent p-0"
						:aria-label="formatMessage(messages.dragHandle)"
						@pointerdown="startDrag($event, track.id)"
						@keydown.up.prevent="moveByKey(track.id, -1)"
						@keydown.down.prevent="moveByKey(track.id, 1)"
					>
						<span class="drag-square" />
					</button>
					<button
						class="group relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl border-0 bg-surface-4 p-0 text-secondary"
						:aria-label="formatMessage(messages.playTrack)"
						@click="playOrToggle(track.id)"
					>
						<img
							v-if="track.cover"
							:src="track.cover"
							alt=""
							class="size-full object-cover"
							draggable="false"
						/>
						<MusicIcon v-else class="size-5" />
						<span
							class="absolute inset-0 grid place-items-center bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100"
							:class="{ '!opacity-100': player.trackId === track.id && player.playing }"
						>
							<PauseIcon v-if="player.trackId === track.id && player.playing" class="size-5" />
							<PlayIcon v-else class="size-5" />
						</span>
					</button>
					<div class="flex min-w-0 flex-1 flex-col">
						<span
							class="truncate font-semibold"
							:class="player.trackId === track.id ? 'text-brand' : 'text-contrast'"
						>
							{{ track.title }}
						</span>
						<span class="truncate text-sm text-secondary">
							{{ track.artist || formatMessage(messages.unknownArtist) }}
						</span>
					</div>
					<span class="shrink-0 text-sm tabular-nums text-secondary">
						{{ formatTrackTime(track.duration) }}
					</span>
					<IconButton
						v-tooltip="formatMessage(messages.remove)"
						type="quiet"
						color="red"
						:label="formatMessage(messages.remove)"
						@click="remove(track.id)"
					>
						<TrashIcon />
					</IconButton>
				</li>
			</TransitionGroup>
		</section>
	</div>
</template>

<script setup lang="ts">
/**
 * Settings → Sound: the music that plays in the launcher, and whether a
 * background video is heard.
 *
 * The playlist is reordered by the filled square at the left of a row: held,
 * the row lifts and the others make way for it as it moves. Letting go keeps
 * that order and switches the sorting to "Arranged", which only arranging
 * picks.
 */
import {
	MusicIcon,
	PauseIcon,
	PlayIcon,
	PlusIcon,
	SearchIcon,
	SpinnerIcon,
	TrashIcon,
} from '@modrinth/assets'
import {
	Input,
	Button,
	Combobox,
	type ComboboxOption,
	defineMessages,
	IconButton,
	injectNotificationManager,
	Slider,
	Toggle,
	useVIntl,
} from '@modrinth/ui'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import {
	addMusicFiles,
	addMusicFromUrl,
	audioSettings,
	formatTrackTime,
	type MusicSort,
	type MusicTrack,
	musicUsage,
	player,
	playlist,
	playTrack,
	refreshMusicUsage,
	removeMusicTrack,
	setCustomOrder,
	setMusicSort,
	toggleMusic,
} from '@/helpers/portalrinth-audio'

const { formatMessage } = useVIntl()
const { handleError } = injectNotificationManager()

const messages = defineMessages({
	musicTitle: { id: 'app.settings.sound.music', defaultMessage: 'Music' },
	effectsTitle: { id: 'app.settings.sound.effects', defaultMessage: 'Launcher sounds' },
	effectsDescription: {
		id: 'app.settings.sound.effects-description',
		defaultMessage:
			'A tick on a press, and a chime when a mod, a skin or Java has finished installing.',
	},
	effectsVolume: { id: 'app.settings.sound.effects-volume', defaultMessage: 'Effects volume' },
	effectsTitle: { id: 'app.settings.sound.effects', defaultMessage: 'Launcher sounds' },
	effectsDescription: {
		id: 'app.settings.sound.effects-description',
		defaultMessage:
			'A tick on a press, and a chime when a mod, a skin or Java has finished installing.',
	},
	effectsVolume: { id: 'app.settings.sound.effects-volume', defaultMessage: 'Effects volume' },
	musicDescription: {
		id: 'app.settings.sound.music-description',
		defaultMessage:
			'Plays your playlist in the launcher. Volume and the player are under the sound button in the title bar.',
	},
	visualizerTitle: { id: 'app.settings.sound.visualizer', defaultMessage: 'Draw the beat' },
	visualizerDescription: {
		id: 'app.settings.sound.visualizer-description',
		defaultMessage: 'Bars in the player that move with the music.',
	},
	musicVolume: { id: 'app.settings.sound.music-volume', defaultMessage: 'Music volume' },
	videoTitle: { id: 'app.settings.sound.video', defaultMessage: 'Background video sound' },
	videoDescription: {
		id: 'app.settings.sound.video-description',
		defaultMessage: 'Plays the sound of a video set as the background. Off, it plays silently.',
	},
	videoVolume: { id: 'app.settings.sound.video-volume', defaultMessage: 'Video volume' },
	playlistTitle: { id: 'app.settings.sound.playlist', defaultMessage: 'Playlist' },
	playlistUsage: {
		id: 'app.settings.sound.playlist-usage',
		defaultMessage:
			'Tracks are copied into the launcher, so they stay after the original is deleted. Taken: {used} — no limit.',
	},
	playlistHeavy: {
		id: 'app.settings.sound.playlist-heavy',
		defaultMessage:
			'The playlist already takes up a lot of space ({used}) — you might want to remove something.',
	},
	addMusic: { id: 'app.settings.sound.add', defaultMessage: 'Add music' },
	onlineTitle: {
		id: 'app.settings.sound.online.title',
		defaultMessage: 'Music from the internet',
	},
	onlineSearchPlaceholder: {
		id: 'app.settings.sound.online.search-placeholder',
		defaultMessage: 'Artist or track name…',
	},
	onlineSearch: {
		id: 'app.settings.sound.online.search',
		defaultMessage: 'Search on LightAudio',
	},
	onlineUrlPlaceholder: {
		id: 'app.settings.sound.online.url-placeholder',
		defaultMessage: 'Direct link to a track (https://…/track.mp3)',
	},
	onlineAdd: { id: 'app.settings.sound.online.add', defaultMessage: 'Download' },
	onlineHint: {
		id: 'app.settings.sound.online.hint',
		defaultMessage:
			'Search opens on web.ligaudio.ru in your browser (the site checks that a real browser is visiting). Copy the direct link to the file from its player, paste it here, and the track downloads into the playlist. Portalus can do the same: ask it to “download a track by the link …”.',
	},
	urlOk: { id: 'app.settings.sound.online.url-ok', defaultMessage: 'Track downloaded into the playlist' },
	urlFail: { id: 'app.settings.sound.online.url-fail', defaultMessage: 'Could not add' },
	sortTitle: { id: 'app.settings.sound.sort', defaultMessage: 'Order' },
	sortAdded: { id: 'app.settings.sound.sort-added', defaultMessage: 'By date added' },
	sortDuration: {
		id: 'app.settings.sound.sort-duration',
		defaultMessage: 'By length, longest first',
	},
	sortAlpha: { id: 'app.settings.sound.sort-alpha', defaultMessage: 'By name' },
	sortRandom: { id: 'app.settings.sound.sort-random', defaultMessage: 'Shuffled' },
	sortCustom: { id: 'app.settings.sound.sort-custom', defaultMessage: 'As arranged' },
	empty: {
		id: 'app.settings.sound.empty',
		defaultMessage: 'No music yet. Add your own files to make a playlist.',
	},
	dragHandle: {
		id: 'app.settings.sound.drag',
		defaultMessage: 'Hold and drag to move',
	},
	playTrack: { id: 'app.settings.sound.play-track', defaultMessage: 'Play' },
	unknownArtist: { id: 'app.sound.unknown-artist', defaultMessage: 'Unknown artist' },
	remove: { id: 'app.settings.sound.remove', defaultMessage: 'Remove from playlist' },
	gigabytes: { id: 'app.settings.sound.gigabytes', defaultMessage: '{value} GB' },
	megabytes: { id: 'app.settings.sound.megabytes', defaultMessage: '{value} MB' },
})

function formatSize(bytes: number): string {
	if (bytes >= 1024 ** 3) {
		return formatMessage(messages.gigabytes, {
			value: (bytes / 1024 ** 3).toLocaleString(undefined, { maximumFractionDigits: 2 }),
		})
	}
	return formatMessage(messages.megabytes, {
		value: (bytes / 1024 ** 2).toLocaleString(undefined, { maximumFractionDigits: 1 }),
	})
}

/* "As arranged" is where dragging lands; it is shown, never picked. */
const sortOptions = computed<ComboboxOption<MusicSort>[]>(() => [
	{ value: 'added', label: formatMessage(messages.sortAdded) },
	{ value: 'duration', label: formatMessage(messages.sortDuration) },
	{ value: 'alpha', label: formatMessage(messages.sortAlpha) },
	{ value: 'random', label: formatMessage(messages.sortRandom) },
	{ value: 'custom', label: formatMessage(messages.sortCustom), disabled: true },
])
const sortLabel = computed(
	() => sortOptions.value.find((option) => option.value === audioSettings.sort)?.label,
)
function onSort(sort: MusicSort | undefined) {
	if (sort && sort !== 'custom') setMusicSort(sort)
}

const adding = ref(false)
async function add() {
	adding.value = true
	try {
		await addMusicFiles()
	} catch (error) {
		handleError(error as Error)
	} finally {
		adding.value = false
	}
}

// ---- Music from the internet -----------------------------------------------

const onlineQuery = ref('')
const onlineUrl = ref('')
const addingUrl = ref(false)
const urlMessage = ref('')
const urlOk = ref(false)

/** Opens the LightAudio search in the system browser: the site greets robots
 * with a check only a real browser passes, so the search lives there. */
async function searchOnline() {
	const query = onlineQuery.value.trim()
	if (!query) return
	try {
		const { openUrl } = await import('@tauri-apps/plugin-opener')
		await openUrl(`https://web.ligaudio.ru/search?q=${encodeURIComponent(query)}`)
	} catch {
		window.open(`https://web.ligaudio.ru/search?q=${encodeURIComponent(query)}`, '_blank')
	}
}

/** Downloads a track by its direct link straight into the playlist. */
async function addByUrl() {
	const url = onlineUrl.value.trim()
	if (!url || addingUrl.value) return
	addingUrl.value = true
	urlMessage.value = ''
	try {
		const track = await addMusicFromUrl(url)
		urlOk.value = true
		urlMessage.value = `${formatMessage(messages.urlOk)}: ${track.title}`
		onlineUrl.value = ''
	} catch (error) {
		urlOk.value = false
		urlMessage.value = `${formatMessage(messages.urlFail)}: ${String((error as Error)?.message ?? error).slice(0, 160)}`
	} finally {
		addingUrl.value = false
	}
}

async function remove(id: string) {
	try {
		await removeMusicTrack(id)
	} catch (error) {
		handleError(error as Error)
	}
}

function playOrToggle(id: string) {
	if (player.trackId === id) toggleMusic()
	else void playTrack(id)
}

/* ---------- arranging ---------- */

/** The order while a row is held; the playlist's otherwise. */
const draft = ref<MusicTrack[] | null>(null)
const rows = computed(() => draft.value ?? playlist.value)
const dragging = ref<string | null>(null)
const list = ref<{ $el: HTMLElement } | null>(null)

function startDrag(event: PointerEvent, id: string) {
	if (event.button !== 0) return
	event.preventDefault()
	draft.value = [...playlist.value]
	dragging.value = id
	window.addEventListener('pointermove', onDragMove)
	window.addEventListener('pointerup', endDrag, { once: true })
	window.addEventListener('pointercancel', endDrag, { once: true })
	document.body.style.cursor = 'grabbing'
}

function onDragMove(event: PointerEvent) {
	const id = dragging.value
	const element = list.value?.$el
	if (!id || !element || !draft.value) return
	const others = [...element.querySelectorAll<HTMLElement>('li[data-id]')].filter(
		(row) => row.dataset.id !== id,
	)
	// The row goes before the first one whose middle the pointer is above.
	let target = others.length
	for (let i = 0; i < others.length; i++) {
		const rect = others[i].getBoundingClientRect()
		if (event.clientY < rect.top + rect.height / 2) {
			target = i
			break
		}
	}
	const order = draft.value.filter((track) => track.id !== id)
	const held = draft.value.find((track) => track.id === id)
	if (!held) return
	order.splice(target, 0, held)
	if (order.some((track, index) => track.id !== draft.value?.[index]?.id)) draft.value = order
}

function endDrag() {
	window.removeEventListener('pointermove', onDragMove)
	window.removeEventListener('pointerup', endDrag)
	window.removeEventListener('pointercancel', endDrag)
	document.body.style.cursor = ''
	const order = draft.value
	const before = playlist.value.map((track) => track.id).join()
	if (order && order.map((track) => track.id).join() !== before) {
		setCustomOrder(order.map((track) => track.id))
	}
	draft.value = null
	dragging.value = null
}

/** The same, from the keyboard: arrows on a focused handle. */
function moveByKey(id: string, direction: -1 | 1) {
	const order = [...playlist.value]
	const index = order.findIndex((track) => track.id === id)
	const target = index + direction
	if (index < 0 || target < 0 || target >= order.length) return
	;[order[index], order[target]] = [order[target], order[index]]
	setCustomOrder(order.map((track) => track.id))
}

onMounted(() => {
	refreshMusicUsage().catch(() => {})
})
onBeforeUnmount(() => {
	if (dragging.value) endDrag()
})
</script>

<style scoped>
.drag-square {
	display: block;
	width: 0.75rem;
	height: 0.75rem;
	border-radius: 0.2rem;
	background: var(--color-secondary);
	transition:
		transform 0.15s ease,
		background-color 0.15s ease;
}

.drag-handle:hover .drag-square,
.drag-handle:focus-visible .drag-square {
	background: var(--color-brand);
	transform: scale(1.15);
}

.playlist-row {
	transition:
		transform 0.18s ease,
		box-shadow 0.18s ease,
		background-color 0.18s ease;
}

.playlist-row.is-current {
	background: color-mix(in srgb, var(--color-brand) 12%, var(--surface-2));
}

.playlist-row.is-dragging {
	position: relative;
	z-index: 1;
	transform: scale(1.02);
	box-shadow: 0 10px 28px rgb(0 0 0 / 35%);
	background: var(--surface-3);
}

.playlist-row.is-dragging .drag-square {
	background: var(--color-brand);
}

.playlist-row-move {
	transition: transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.playlist-row-enter-active,
.playlist-row-leave-active {
	transition:
		opacity 0.2s ease,
		transform 0.2s ease;
}

.playlist-row-enter-from,
.playlist-row-leave-to {
	opacity: 0;
	transform: translateY(-0.25rem);
}

.playlist-row-leave-active {
	position: absolute;
	width: 100%;
}

@media (prefers-reduced-motion: reduce) {
	.playlist-row,
	.playlist-row-move,
	.playlist-row-enter-active,
	.playlist-row-leave-active {
		transition: none;
	}
}
</style>

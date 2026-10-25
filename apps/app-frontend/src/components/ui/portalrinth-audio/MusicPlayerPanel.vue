<template>
	<div class="flex w-[22rem] flex-col gap-3 p-1">
		<div class="flex items-center gap-3">
			<div
				class="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface-4 text-secondary"
			>
				<img
					v-if="currentTrack?.cover"
					:src="currentTrack.cover"
					alt=""
					class="size-full object-cover"
					draggable="false"
				/>
				<MusicIcon v-else class="size-6" />
			</div>
			<div class="flex min-w-0 flex-1 flex-col">
				<span class="truncate text-base font-bold text-contrast">
					{{ currentTrack?.title ?? formatMessage(messages.nothingPlaying) }}
				</span>
				<span class="truncate text-sm text-secondary">
					{{ currentTrack?.artist || formatMessage(messages.unknownArtist) }}
				</span>
			</div>
			<div v-if="audioSettings.visualizer" class="h-9 w-20 shrink-0">
				<MusicVisualizer :bars="9" />
			</div>
		</div>

		<div class="flex flex-col gap-1">
			<div class="flex justify-between text-xs tabular-nums text-secondary">
				<span>{{ formatTrackTime(scrubbing ?? player.currentTime) }}</span>
				<span>{{ formatTrackTime(player.duration) }}</span>
			</div>
			<input
				class="portalrinth-range"
				type="range"
				min="0"
				:max="Math.max(player.duration, 0.01)"
				step="0.1"
				:value="scrubbing ?? player.currentTime"
				:style="{ '--progress': `${progress}%` }"
				:aria-label="formatMessage(messages.seek)"
				:disabled="!player.trackId"
				@input="scrubbing = Number(($event.target as HTMLInputElement).value)"
				@change="finishScrub"
			/>
		</div>

		<div class="flex items-center justify-between gap-2">
			<div class="flex items-center gap-1">
				<IconButton
					v-tooltip="formatMessage(messages.previous)"
					type="quiet"
					:label="formatMessage(messages.previous)"
					:disabled="!playlist.length"
					@click="previousTrack"
				>
					<SkipBackIcon />
				</IconButton>
				<button
					v-tooltip="formatMessage(player.playing ? messages.pause : messages.play)"
					class="portalrinth-gradient-fill grid size-10 place-items-center rounded-full border-0 bg-brand text-[var(--color-accent-contrast)] transition-transform active:scale-95"
					:aria-label="formatMessage(player.playing ? messages.pause : messages.play)"
					:disabled="!playlist.length"
					@click="toggleMusic"
				>
					<PauseIcon v-if="player.playing" class="size-5" />
					<PlayIcon v-else class="size-5 translate-x-px" />
				</button>
				<IconButton
					v-tooltip="formatMessage(messages.next)"
					type="quiet"
					:label="formatMessage(messages.next)"
					:disabled="!playlist.length"
					@click="nextTrack"
				>
					<SkipForwardIcon />
				</IconButton>
				<IconButton
					v-tooltip="repeatLabel"
					type="quiet"
					:color="audioSettings.repeat === 'off' ? undefined : 'brand'"
					:label="repeatLabel"
					@click="cycleRepeat"
				>
					<Repeat1Icon v-if="audioSettings.repeat === 'one'" />
					<RepeatIcon v-else :class="{ 'opacity-50': audioSettings.repeat === 'off' }" />
				</IconButton>
			</div>
			<VolumeControl
				v-model="audioSettings.musicVolume"
				:label="formatMessage(messages.musicVolume)"
				class="w-28"
			/>
		</div>
	</div>
</template>

<script setup lang="ts">
import {
	MusicIcon,
	PauseIcon,
	PlayIcon,
	Repeat1Icon,
	RepeatIcon,
	SkipBackIcon,
	SkipForwardIcon,
} from '@modrinth/assets'
import { defineMessages, IconButton, useVIntl } from '@modrinth/ui'
import { computed, ref } from 'vue'

import MusicVisualizer from '@/components/ui/portalrinth-audio/MusicVisualizer.vue'
import VolumeControl from '@/components/ui/portalrinth-audio/VolumeControl.vue'
import {
	audioSettings,
	currentTrack,
	cycleRepeat,
	formatTrackTime,
	nextTrack,
	player,
	playlist,
	previousTrack,
	seekMusic,
	toggleMusic,
} from '@/helpers/portalrinth-audio'

const { formatMessage } = useVIntl()

const messages = defineMessages({
	nothingPlaying: { id: 'app.sound.nothing-playing', defaultMessage: 'Nothing is playing' },
	unknownArtist: { id: 'app.sound.unknown-artist', defaultMessage: 'Unknown artist' },
	seek: { id: 'app.sound.seek', defaultMessage: 'Position in the track' },
	previous: { id: 'app.sound.previous', defaultMessage: 'Previous' },
	next: { id: 'app.sound.next', defaultMessage: 'Next' },
	play: { id: 'app.sound.play', defaultMessage: 'Play' },
	pause: { id: 'app.sound.pause', defaultMessage: 'Pause' },
	repeatOff: { id: 'app.sound.repeat-off', defaultMessage: 'Repeat is off' },
	repeatAll: { id: 'app.sound.repeat-all', defaultMessage: 'Repeating the playlist' },
	repeatOne: { id: 'app.sound.repeat-one', defaultMessage: 'Repeating this track' },
	musicVolume: { id: 'app.sound.music-volume', defaultMessage: 'Music volume' },
})

/** Where the thumb is being dragged to; the track jumps there once it is let go. */
const scrubbing = ref<number | null>(null)

const progress = computed(() => {
	const at = scrubbing.value ?? player.currentTime
	return player.duration ? Math.min(100, (at / player.duration) * 100) : 0
})

const repeatLabel = computed(() =>
	formatMessage(
		audioSettings.repeat === 'one'
			? messages.repeatOne
			: audioSettings.repeat === 'all'
				? messages.repeatAll
				: messages.repeatOff,
	),
)

function finishScrub() {
	if (scrubbing.value !== null) seekMusic(scrubbing.value)
	scrubbing.value = null
}
</script>

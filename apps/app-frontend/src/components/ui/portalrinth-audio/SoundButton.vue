<template>
	<FloatingMenu
		v-if="visible"
		placement="bottom-end"
		panel-class="!p-3 portalrinth-audio-panel"
	>
		<IconButton
			v-tooltip="formatMessage(messages.sound)"
			type="quiet"
			:color="player.playing ? 'brand' : undefined"
			:label="formatMessage(messages.sound)"
		>
			<Volume2Icon />
		</IconButton>
		<template #popper>
			<div class="flex flex-col gap-3">
				<MusicPlayerPanel v-if="musicOn" />
				<div
					v-if="videoOn"
					class="flex w-[22rem] flex-col gap-1.5 p-1"
					:class="{ 'border-0 border-t border-solid border-surface-5 pt-3': musicOn }"
				>
					<span class="text-sm font-semibold text-contrast">
						{{ formatMessage(messages.videoVolume) }}
					</span>
					<VolumeControl
						v-model="audioSettings.videoVolume"
						:label="formatMessage(messages.videoVolume)"
					/>
				</div>
			</div>
		</template>
	</FloatingMenu>
</template>

<script setup lang="ts">
/**
 * The title bar's sound button, next to the running instances. There only
 * when something in the launcher makes a sound: the playlist, or a background
 * video with its sound on.
 */
import { Volume2Icon } from '@modrinth/assets'
import { defineMessages, FloatingMenu, IconButton, useVIntl } from '@modrinth/ui'
import { computed } from 'vue'

import MusicPlayerPanel from '@/components/ui/portalrinth-audio/MusicPlayerPanel.vue'
import VolumeControl from '@/components/ui/portalrinth-audio/VolumeControl.vue'
import { audioSettings, musicTracks, player } from '@/helpers/portalrinth-audio'
import { backgroundIsVideo, backgroundUrl } from '@/helpers/portalrinth-background'

const { formatMessage } = useVIntl()

const messages = defineMessages({
	sound: { id: 'app.sound.button', defaultMessage: 'Sound' },
	videoVolume: { id: 'app.sound.video-volume', defaultMessage: 'Background video volume' },
})

const musicOn = computed(() => audioSettings.musicEnabled && musicTracks.value.length > 0)
const videoOn = computed(
	() => audioSettings.videoSound && Boolean(backgroundUrl.value) && backgroundIsVideo.value,
)
const visible = computed(() => musicOn.value || videoOn.value)
</script>

<style>
/* The sound panel is glass: it shows a hint of what is behind it, so it sits
   in the interface instead of floating above it as a grey slab. */
.portalrinth-audio-panel {
	background: color-mix(in srgb, var(--color-raised-bg, var(--color-button-bg)) 72%, transparent) !important;
	backdrop-filter: blur(16px) saturate(1.15);
	-webkit-backdrop-filter: blur(16px) saturate(1.15);
	border: 1px solid rgb(255 255 255 / 6%);
	box-shadow: 0 12px 32px rgb(0 0 0 / 35%);
}
</style>

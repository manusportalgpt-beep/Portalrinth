<script setup lang="ts">
/** The background picture, under the accent in Appearance. */
import { ImageIcon, TrashIcon } from '@modrinth/assets'
import {
	Button,
	defineMessages,
	injectNotificationManager,
	Slider,
	Toggle,
	useVIntl,
} from '@modrinth/ui'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { onMounted, onUnmounted, ref } from 'vue'

import {
	backgroundBlur,
	backgroundDim,
	backgroundIsVideo,
	backgroundUrl,
	chooseBackground,
	clearBackground,
	isBackgroundFile,
	pageShade,
	saveBackgroundBlur,
	saveBackgroundDim,
	savePageShade,
	setBackgroundFromPath,
} from '@/helpers/portalrinth-background'

const { formatMessage } = useVIntl()
const { handleError } = injectNotificationManager()

const messages = defineMessages({
	title: { id: 'portalrinth.settings.background.title', defaultMessage: 'Background picture' },
	description: {
		id: 'portalrinth.settings.background.description',
		defaultMessage:
			'A picture behind the launcher, showing through its frame and, a little, through the cards on a page.',
	},
	choose: { id: 'portalrinth.settings.background.choose', defaultMessage: 'Choose picture' },
	change: { id: 'portalrinth.settings.background.change', defaultMessage: 'Change picture' },
	remove: { id: 'portalrinth.settings.background.remove', defaultMessage: 'Remove' },
	dropHint: {
		id: 'portalrinth.settings.background.drop-hint',
		defaultMessage: 'Or drop a picture onto the window.',
	},
	dropHere: { id: 'portalrinth.settings.background.drop-here', defaultMessage: 'Drop it here' },
	blurTitle: {
		id: 'portalrinth.settings.background.blur.title',
		defaultMessage: 'Blur the picture',
	},
	blurDescription: {
		id: 'portalrinth.settings.background.blur.description',
		defaultMessage: 'Softens it, so it stays behind what is in front of it.',
	},
	dimTitle: {
		id: 'portalrinth.settings.background.dim.title',
		defaultMessage: 'Darken the picture',
	},
	dimDescription: {
		id: 'portalrinth.settings.background.dim.description',
		defaultMessage: 'For a bright or busy picture, so what is over it stays easy to read.',
	},
	shadeTitle: {
		id: 'portalrinth.settings.background.page-shade.title',
		defaultMessage: 'Darken the page',
	},
	shadeDescription: {
		id: 'portalrinth.settings.background.page-shade.description',
		defaultMessage:
			'How much darker the middle of the window is than the panels: 0 is the same as the panels, 100 is solid.',
	},
})

const busy = ref(false)

async function run(action: () => Promise<unknown>) {
	busy.value = true
	try {
		await action()
	} catch (error) {
		handleError(error as Error)
	} finally {
		busy.value = false
	}
}

/** True while a picture is dragged over the window, so the preview can say where it goes. */
const dragging = ref(false)
let unlistenDrop: (() => void) | undefined
let unmounted = false

onMounted(() => {
	void getCurrentWebview()
		.onDragDropEvent((event) => {
			const { payload } = event
			if (payload.type === 'leave') {
				dragging.value = false
				return
			}
			if (payload.type === 'enter') {
				dragging.value = payload.paths.some(isBackgroundFile)
				return
			}
			if (payload.type !== 'drop') return
			dragging.value = false
			const picture = payload.paths.find(isBackgroundFile)
			if (picture) void run(() => setBackgroundFromPath(picture))
		})
		.then((unlisten) => {
			if (unmounted) unlisten()
			else unlistenDrop = unlisten
		})
		.catch(handleError)
})

/** The darkening shows as the slider moves; it is saved once it rests. */
let saveDimTimer: ReturnType<typeof setTimeout> | undefined
function setDim(value: number) {
	backgroundDim.value = value
	clearTimeout(saveDimTimer)
	saveDimTimer = setTimeout(() => run(() => saveBackgroundDim(value)), 400)
}

onUnmounted(() => {
	unmounted = true
	unlistenDrop?.()
	clearTimeout(saveDimTimer)
})
</script>

<template>
	<div class="mt-6 flex flex-col gap-3">
		<div>
			<h2 class="m-0 text-lg font-semibold text-contrast">{{ formatMessage(messages.title) }}</h2>
			<p class="m-0 mt-1 text-secondary">{{ formatMessage(messages.description) }}</p>
		</div>
		<div class="flex flex-wrap items-center gap-4">
			<div
				class="relative aspect-video w-48 shrink-0 overflow-hidden rounded-xl border border-solid bg-surface-2 bg-cover bg-center transition-colors"
				:class="[
					dragging ? 'border-brand' : 'border-surface-5',
					{ 'grid place-items-center text-secondary': !backgroundUrl || dragging },
				]"
				:style="
					backgroundUrl && !backgroundIsVideo
						? { backgroundImage: `url(${backgroundUrl})` }
						: undefined
				"
			>
				<!-- A video is shown by playing it, not by a still of it. -->
				<video
					v-if="backgroundUrl && backgroundIsVideo"
					class="absolute inset-0 size-full object-cover"
					:src="backgroundUrl"
					autoplay
					loop
					muted
					playsinline
				/>
				<span
					v-if="dragging"
					class="absolute inset-0 grid place-items-center bg-black/60 text-sm font-semibold text-contrast"
				>
					{{ formatMessage(messages.dropHere) }}
				</span>
				<ImageIcon v-else-if="!backgroundUrl" class="size-8" />
			</div>
			<div class="flex flex-col gap-2">
				<div class="flex flex-wrap gap-2">
					<Button :disabled="busy" @click="run(chooseBackground)">
						<ImageIcon />
						{{ formatMessage(backgroundUrl ? messages.change : messages.choose) }}
					</Button>
					<Button v-if="backgroundUrl" type="quiet" :disabled="busy" @click="run(clearBackground)">
						<TrashIcon />
						{{ formatMessage(messages.remove) }}
					</Button>
				</div>
				<p class="m-0 text-sm text-secondary">{{ formatMessage(messages.dropHint) }}</p>
			</div>
		</div>
		<template v-if="backgroundUrl">
			<div class="flex items-center justify-between gap-4">
				<div class="min-w-0">
					<h3 id="background-blur-label" class="m-0 text-lg font-semibold text-contrast">
						{{ formatMessage(messages.blurTitle) }}
					</h3>
					<p class="m-0 mt-1 text-secondary">{{ formatMessage(messages.blurDescription) }}</p>
				</div>
				<Toggle
					id="background-blur"
					:model-value="backgroundBlur"
					aria-labelledby="background-blur-label"
					@update:model-value="(value: boolean) => run(() => saveBackgroundBlur(value))"
				/>
			</div>
			<div class="flex flex-col gap-2.5">
				<div>
					<h3 class="m-0 text-lg font-semibold text-contrast">
						{{ formatMessage(messages.dimTitle) }}
					</h3>
					<p class="m-0 mt-1 text-secondary">{{ formatMessage(messages.dimDescription) }}</p>
				</div>
				<Slider
					id="background-dim"
					:model-value="backgroundDim"
					:aria-label="formatMessage(messages.dimTitle)"
					:min="0"
					:max="80"
					:step="5"
					unit="%"
					@update:model-value="setDim"
				/>
			</div>
			<div class="flex flex-col gap-2.5">
				<div>
					<h3 class="m-0 text-lg font-semibold text-contrast">
						{{ formatMessage(messages.shadeTitle) }}
					</h3>
					<p class="m-0 mt-1 text-secondary">{{ formatMessage(messages.shadeDescription) }}</p>
				</div>
				<Slider
					id="background-page-shade"
					:model-value="pageShade"
					:aria-label="formatMessage(messages.shadeTitle)"
					:min="0"
					:max="100"
					:step="5"
					unit="%"
					@update:model-value="savePageShade"
				/>
			</div>
		</template>
	</div>
</template>

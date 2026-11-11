<template>
	<div class="gallery">
		<Card v-for="(image, index) in filteredGallery" :key="image.url" class="gallery-item">
			<!-- Videos play right in the card: the image viewer is built
                             for pictures, a native player needs no modal. -->
			<video
				v-if="isVideo(image)"
				:src="image.raw_url ?? image.url"
				controls
				preload="metadata"
				playsinline
				class="gallery-video"
			/>
			<a v-else @click="expandImage(image, index)">
				<img :src="image.url" :alt="image.title" class="gallery-image" />
			</a>
			<div class="gallery-body">
				<h3>{{ image.title }}</h3>
				{{ image.description }}
			</div>
			<!-- CurseForge screenshots carry no date. -->
			<span v-if="image.created" class="gallery-time">
				<CalendarIcon />
				{{ formatDate(new Date(image.created)) }}
			</span>
		</Card>
	</div>
	<ImageViewerEditor
		ref="galleryViewer"
		:items="galleryViewerItems"
		editor="disabled"
		@navigate="trackGalleryNavigation"
	>
		<template #actions="{ item }">
			<Button
				type="quiet"
				class="!w-9 !rounded-full !p-0"
				aria-label="Open image in new tab"
				@click="openUrl(item.src)"
			>
				<ExternalIcon aria-hidden="true" />
			</Button>
		</template>
	</ImageViewerEditor>
</template>

<script setup>
import { CalendarIcon, ExternalIcon } from '@modrinth/assets'
import { Button, Card, ImageViewerEditor, useFormatDateTime } from '@modrinth/ui'
import { openUrl } from '@tauri-apps/plugin-opener'
import { computed, ref } from 'vue'

import { trackEvent } from '@/helpers/analytics'

const MC_SERVER_BANNER_NAME = '__mc_server_banner__'

const formatDate = useFormatDateTime({
        year: 'numeric',
        month: 'long',
        day: 'numeric',
})

const props = defineProps({
        project: {
                type: Object,
                default: () => ({}),
        },
})

const filteredGallery = computed(
        () => props.project.gallery?.filter((img) => img.title !== MC_SERVER_BANNER_NAME) ?? [],
)

const VIDEO_URL_RE = /\.(mp4|webm|m4v|mov|ogv|mkv)(\?|#|$)/i

/** Gallery entries that are really video files render as players, not as
    broken images; CurseForge's media can be mp4/webm just as well. */
const isVideo = (image: { url?: string; raw_url?: string; type?: string }) =>
        (typeof image.type === 'string' && image.type.startsWith('video')) ||
        VIDEO_URL_RE.test(image.raw_url ?? image.url ?? '')

// The image viewer only understands pictures: videos keep out of its list.
const galleryViewer = ref()
const galleryViewerItems = computed(() =>
        filteredGallery.value
                .map((image, index) => ({ image, index }))
                .filter(({ image }) => !isVideo(image))
                .map(({ image, index }) => ({
                        id: image.url,
                        src: image.raw_url ?? 'https://cdn.modrinth.com/placeholder-banner.svg',
                        alt: image.title || 'Gallery image',
                        title: image.title,
                        description: image.description,
                        _galleryIndex: index,
                })),
)

const expandImage = (item, index) => {
        const position = galleryViewerItems.value.findIndex((viewerItem) => viewerItem._galleryIndex === index)
        if (position === -1) return
        galleryViewer.value?.show(position)
        trackEvent('GalleryImageExpand', {
                project_id: props.project.id,
                url: item.url,
        })
}

function trackGalleryNavigation(item, _index, direction) {
        trackEvent(direction === 'next' ? 'GalleryImageNext' : 'GalleryImagePrevious', {
                project_id: props.project.id,
                url: item.id,
        })
}
</script>

<style scoped lang="scss">
.gallery {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
	width: 100%;
	gap: 1rem;
}

.gallery-item {
	padding: 0;
	overflow: hidden;
	margin: 0;
	display: flex;
	flex-direction: column;

	.gallery-image {
		width: 100%;
		aspect-ratio: 2/1;
		object-fit: cover;
		object-position: center;
	}

	.gallery-video {
		width: 100%;
		aspect-ratio: 2/1;
		object-fit: contain;
		background: var(--color-raised-bg);
	}

	.gallery-body {
		flex-grow: 1;
		padding: 1rem;
	}

	.gallery-time {
		padding: 0 1rem 1rem;
		vertical-align: center;
	}
}
</style>

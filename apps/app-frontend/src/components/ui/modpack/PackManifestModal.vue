<script setup lang="ts">
/**
 * What a modpack file contains, shown before anything is installed.
 *
 * The list is long - a big pack is several hundred entries - and the questions
 * a person actually has about it are "what is in here", "which of these are
 * only resource packs", "what does this one do" and "I do not want that one".
 * So: split by class, searchable, each row carrying what is known about it, and
 * two ways to take something out.
 *
 * Nothing is written here. The modal says what would be installed and what
 * would not, and the caller decides; pretending it had already installed half
 * the pack would be a lie with a spinner on it.
 */
import { BoxIcon, CogIcon, DownloadIcon, EyeOffIcon, GlobeIcon } from '@modrinth/assets'
import { Button, defineMessages, IconButton, Input, Toggle, useVIntl } from '@modrinth/ui'
import { computed, ref, watch } from 'vue'

import ModalWrapper from '@/components/ui/modal/ModalWrapper.vue'
import {
	PACK_ENTRY_KINDS,
	type PackEntryKind,
	type PackManifest,
	type PackManifestEntry,
	readPackManifest,
} from '@/helpers/pack-manifest'

const props = defineProps<{
	/** The archive to read when the modal opens on its own. */
	path: string
}>()

const emit = defineEmits<{
	(event: 'hide'): void
	(event: 'confirm', kept: PackManifestEntry[]): void
}>()

const { formatMessage } = useVIntl()

const messages = defineMessages({
	title: { id: 'pack-manifest.title', defaultMessage: 'What is in this modpack' },
	reading: { id: 'pack-manifest.reading', defaultMessage: 'Reading the manifest' },
	search: {
		id: 'pack-manifest.search',
		defaultMessage: 'Search by name, author or version',
	},
	searchLabel: { id: 'pack-manifest.search-label', defaultMessage: 'Search the contents' },
	empty: { id: 'pack-manifest.empty', defaultMessage: 'Nothing in this pack matches.' },
	all: { id: 'pack-manifest.all', defaultMessage: 'All' },
	mod: { id: 'pack-manifest.kind.mod', defaultMessage: 'Mods' },
	resourcePack: { id: 'pack-manifest.kind.resource-pack', defaultMessage: 'Resource packs' },
	dataPack: { id: 'pack-manifest.kind.data-pack', defaultMessage: 'Data packs' },
	shader: { id: 'pack-manifest.kind.shader', defaultMessage: 'Shaders' },
	other: { id: 'pack-manifest.kind.other', defaultMessage: 'Other files' },
	enable: { id: 'pack-manifest.enable', defaultMessage: 'Install this' },
	installAll: { id: 'pack-manifest.install-all', defaultMessage: 'Install all' },
	installNone: { id: 'pack-manifest.install-none', defaultMessage: 'Install none' },
	remove: { id: 'pack-manifest.remove', defaultMessage: 'Remove' },
	openPage: { id: 'pack-manifest.open-page', defaultMessage: 'Open the project page' },
	confirm: { id: 'pack-manifest.confirm', defaultMessage: 'Install the selected' },
	cancel: { id: 'pack-manifest.cancel', defaultMessage: 'Cancel' },
	counts: {
		id: 'pack-manifest.counts',
		defaultMessage: '{kept} of {total} would be installed',
	},
})

const modal = ref()
const archivePath = ref(props.path)

/** Opened with the file to read, rather than only ever the one it was built with. */
function show(path: string) {
	archivePath.value = path
	modal.value?.show()
}

defineExpose({ show })

const manifest = ref<PackManifest | null>(null)
const reading = ref(true)
const failure = ref<string | null>(null)
const words = ref('')
/** `all` means every class at once, which is what the list starts on. */
const classFilter = ref<PackEntryKind | 'all'>('all')

async function read() {
	if (!archivePath.value) return
	reading.value = true
	failure.value = null
	try {
		manifest.value = await readPackManifest(archivePath.value)
	} catch (error) {
		manifest.value = null
		failure.value = error instanceof Error ? error.message : String(error)
	} finally {
		reading.value = false
	}
}

watch(archivePath, read, { immediate: true })

const counts = computed(() => {
	const tally: Record<string, number> = {}
	for (const entry of manifest.value?.entries ?? []) {
		tally[entry.kind] = (tally[entry.kind] ?? 0) + 1
	}
	return tally
})

const kept = computed(() => (manifest.value?.entries ?? []).filter((entry) => entry.enabled).length)
const total = computed(() => manifest.value?.entries.length ?? 0)

const labelOf = (kind: PackEntryKind) =>
	formatMessage(
		kind === 'mod'
			? messages.mod
			: kind === 'resource_pack'
				? messages.resourcePack
				: kind === 'data_pack'
					? messages.dataPack
					: kind === 'shader'
						? messages.shader
						: messages.other,
	)

function matching(entries: PackManifestEntry[], kind: PackEntryKind | 'all') {
	const needle = words.value.trim().toLowerCase()
	return entries.filter((entry) => {
		if (kind !== 'all' && entry.kind !== kind) return false
		if (!needle) return true
		return [entry.title, entry.author, entry.version, entry.path, entry.description]
			.filter(Boolean)
			.some((field) => String(field).toLowerCase().includes(needle))
	})
}

/**
 * The classes worth drawing, and only those actually in the pack: an empty
 * section is a heading with nothing under it.
 */
const sections = computed(() =>
	PACK_ENTRY_KINDS.filter((kind) => (counts.value[kind] ?? 0) > 0)
		.map((kind) => ({ kind, entries: matching(manifest.value?.entries ?? [], kind) }))
		.filter((section) => section.entries.length > 0),
)

function setAll(enabled: boolean) {
	for (const entry of manifest.value?.entries ?? []) entry.enabled = enabled
}

function remove(entry: PackManifestEntry) {
	if (!manifest.value) return
	manifest.value.entries = manifest.value.entries.filter((other) => other !== entry)
}

function openExternally(url: string) {
	window.open(url, '_blank', 'noopener')
}
</script>

<template>
	<ModalWrapper ref="modal" :header="formatMessage(messages.title)">
		<div class="flex min-w-[26rem] flex-col gap-3">
			<p v-if="reading" class="m-0 text-sm text-secondary">
				{{ formatMessage(messages.reading) }}
			</p>
			<p v-else-if="failure" class="m-0 text-sm text-red-500">{{ failure }}</p>

			<template v-else-if="manifest">
				<p class="m-0 text-sm text-secondary">
					<strong class="text-contrast">{{ manifest.name ?? archivePath }}</strong>
					<template v-if="manifest.game_version">
						<span> - {{ manifest.game_version }}</span>
					</template>
					<template v-if="manifest.loader">
						<span> - {{ manifest.loader }} {{ manifest.loader_version ?? '' }} </span>
					</template>
					<template v-if="manifest.version">
						<span>- {{ manifest.version }}</span>
					</template>
				</p>
				<p v-if="manifest.summary" class="m-0 text-sm text-secondary">
					{{ manifest.summary }}
				</p>

				<div class="flex flex-wrap items-center gap-2">
					<Input
						v-model="words"
						:icon="BoxIcon"
						type="text"
						:placeholder="formatMessage(messages.search)"
						:label="formatMessage(messages.searchLabel)"
						clearable
						wrapper-class="w-full min-w-[16rem]"
					/>

					<div class="flex gap-1 rounded-lg bg-surface-3 p-1">
						<Button color="secondary" size="sm" @click="classFilter = 'all'">
							{{ formatMessage(messages.all) }}
						</Button>
						<Button
							v-for="kind in PACK_ENTRY_KINDS.filter((kind) => (counts[kind] ?? 0) > 0)"
							:key="kind"
							:color="classFilter === kind ? 'brand' : 'secondary'"
							size="sm"
							@click="classFilter = kind"
						>
							{{ labelOf(kind) }} ({{ counts[kind] }})
						</Button>
					</div>
				</div>

				<div class="flex items-center gap-2">
					<span class="text-sm text-secondary">
						{{ formatMessage(messages.counts, { kept, total }) }}
					</span>
					<Button class="ml-auto" size="sm" @click="setAll(true)">
						{{ formatMessage(messages.installAll) }}
					</Button>
					<Button size="sm" @click="setAll(false)">
						{{ formatMessage(messages.installNone) }}
					</Button>
				</div>

				<div class="flex max-h-[24rem] flex-col gap-4 overflow-y-auto pr-1">
					<section v-for="section in sections" :key="section.kind">
						<h3 class="m-0 mb-1 text-sm font-semibold text-contrast">
							{{ labelOf(section.kind) }}
							<span class="text-secondary">({{ section.entries.length }})</span>
						</h3>

						<div
							v-for="entry in section.entries"
							:key="`${entry.source}-${entry.id}-${entry.path}`"
							class="flex items-center gap-3 rounded-lg border border-surface-5 bg-surface-2 p-2"
						>
							<img
								v-if="entry.icon_url"
								:src="entry.icon_url"
								:alt="entry.title"
								class="h-10 w-10 shrink-0 rounded"
							/>
							<CogIcon v-else class="h-10 w-10 shrink-0 text-contrast" />

							<div class="flex min-w-0 flex-1 flex-col">
								<strong class="truncate text-contrast">{{ entry.title }}</strong>
								<span class="truncate text-xs text-secondary">
									<template v-if="entry.author">
										<span>{{ entry.author }}</span>
									</template>
									<template v-if="entry.version">
										<span> - {{ entry.version }}</span>
									</template>
									<template v-else-if="entry.path">
										<span>- {{ entry.path }}</span>
									</template>
								</span>
							</div>

							<IconButton
								v-if="entry.website_url"
								v-tooltip="formatMessage(messages.openPage)"
								:label="formatMessage(messages.openPage)"
								@click="openExternally(entry.website_url)"
							>
								<GlobeIcon />
							</IconButton>
							<IconButton
								v-tooltip="formatMessage(messages.remove)"
								:label="formatMessage(messages.remove)"
								@click="remove(entry)"
							>
								<EyeOffIcon />
							</IconButton>
							<Toggle
								:model-value="entry.enabled"
								:label="formatMessage(messages.enable)"
								@update:model-value="entry.enabled = $event"
							/>
						</div>
					</section>

					<p v-if="!sections.length" class="m-0 text-sm text-secondary">
						{{ formatMessage(messages.empty) }}
					</p>
				</div>
			</template>

			<div class="flex items-center gap-2">
				<Button size="sm" @click="emit('hide')">
					{{ formatMessage(messages.cancel) }}
				</Button>
				<Button
					color="green"
					:disabled="reading || !manifest"
					@click="
						emit(
							'confirm',
							(manifest?.entries ?? []).filter((entry) => entry.enabled),
						)
					"
				>
					<DownloadIcon />
					{{ formatMessage(messages.confirm) }}
				</Button>
			</div>
		</div>
	</ModalWrapper>
</template>

<template>
	<div class="flex flex-col gap-3">
		<div class="flex flex-wrap items-start justify-between gap-4">
			<div class="min-w-0">
				<h3 class="m-0 text-lg font-semibold text-contrast">
					{{ formatMessage(messages.title) }}
				</h3>
				<p class="m-0 mt-1 text-secondary">
					{{ formatMessage(messages.description, { max: MAX_THEMES }) }}
				</p>
			</div>
			<Button type="outlined" :disabled="busy" @click="openSave">
				<SaveIcon aria-hidden="true" />
				{{ formatMessage(messages.save) }}
			</Button>
		</div>

		<div v-if="savedThemes.length" class="grid grid-cols-2 gap-2 sm:grid-cols-4">
			<div
				v-for="theme in savedThemes"
				:key="theme.id"
				class="theme-plaque group relative flex min-w-0 items-center gap-2.5 overflow-hidden rounded-2xl border border-solid border-surface-5 bg-surface-2 p-2.5 pb-3.5"
			>
				<button
					class="absolute inset-0 z-0 cursor-pointer border-0 bg-transparent p-0"
					:aria-label="formatMessage(messages.apply, { name: theme.name })"
					:disabled="busy"
					@click="apply(theme)"
				/>
				<ThemeIcon :icon="theme.icon" class="pointer-events-none relative" />
				<span
					class="pointer-events-none relative min-w-0 flex-1 truncate font-semibold text-contrast"
				>
					{{ theme.name }}
				</span>
				<IconButton
					v-tooltip="formatMessage(messages.remove)"
					class="relative z-[1] opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
					type="quiet"
					size="sm"
					color="red"
					:label="formatMessage(messages.remove)"
					@click="remove(theme.id)"
				>
					<TrashIcon />
				</IconButton>
				<span
					class="pointer-events-none absolute inset-x-0 bottom-0 h-1"
					:style="{ background: accentSwatch(theme) }"
				/>
			</div>
		</div>

		<NewModal ref="modal" :header="formatMessage(messages.modalHeader)">
			<div class="flex w-[28rem] max-w-full flex-col gap-4">
				<div class="flex flex-col gap-2">
					<label for="theme-name" class="text-lg font-semibold text-contrast">
						{{ formatMessage(messages.nameLabel) }}
						<span class="text-brand-red">*</span>
					</label>
					<Input
						id="theme-name"
						v-model="name"
						:maxlength="32"
						:placeholder="formatMessage(messages.namePlaceholder)"
						autocomplete="off"
					/>
				</div>
				<div class="flex flex-col gap-2">
					<span class="text-lg font-semibold text-contrast">
						{{ formatMessage(messages.iconLabel) }}
					</span>
					<div class="flex flex-wrap gap-2">
						<button
							v-for="option in THEME_ICONS"
							:key="option"
							class="icon-choice"
							:class="{ 'is-selected': icon === option }"
							:aria-label="option"
							:aria-pressed="icon === option"
							@click="icon = option"
						>
							<ThemeIcon :icon="option" />
						</button>
						<button
							v-tooltip="formatMessage(messages.ownIcon)"
							class="icon-choice"
							:class="{ 'is-selected': icon.startsWith('data:') }"
							:aria-label="formatMessage(messages.ownIcon)"
							@click="pickIcon"
						>
							<ThemeIcon v-if="icon.startsWith('data:')" :icon="icon" />
							<UploadIcon v-else class="size-5" />
						</button>
					</div>
				</div>
				<div
					v-if="full"
					class="flex flex-col gap-2 rounded-2xl border border-solid border-orange bg-surface-2 p-3"
				>
					<p class="m-0 font-semibold text-contrast">
						{{ formatMessage(messages.fullTitle, { max: MAX_THEMES }) }}
					</p>
					<p class="m-0 text-secondary">{{ formatMessage(messages.fullDescription) }}</p>
					<div class="grid grid-cols-2 gap-1.5">
						<button
							v-for="theme in savedThemes"
							:key="theme.id"
							class="replace-choice flex min-w-0 items-center gap-2 rounded-xl p-2 text-left"
							:class="{ 'is-selected': replace === theme.id }"
							:aria-pressed="replace === theme.id"
							@click="replace = theme.id"
						>
							<ThemeIcon :icon="theme.icon" />
							<span class="truncate text-contrast">{{ theme.name }}</span>
						</button>
					</div>
				</div>
				<div class="flex justify-end gap-2">
					<Button type="outlined" @click="modal?.hide()">
						<XIcon aria-hidden="true" />
						{{ formatMessage(commonMessages.cancelButton) }}
					</Button>
					<Button
						type="colored"
						color="brand"
						:disabled="busy || !name.trim() || (full && !replace)"
						@click="submit"
					>
						<SpinnerIcon v-if="busy" class="animate-spin" aria-hidden="true" />
						<SaveIcon v-else aria-hidden="true" />
						{{ formatMessage(full ? messages.replace : messages.save) }}
					</Button>
				</div>
			</div>
		</NewModal>
	</div>
</template>

<script setup lang="ts">
/**
 * Themes, under the background's settings: the background and the accent as
 * they are now, kept under a name and an icon, eight at most. Choosing a
 * plaque puts its theme back.
 */
import { SaveIcon, SpinnerIcon, TrashIcon, UploadIcon, XIcon } from '@modrinth/assets'
import {
	Button,
	commonMessages,
	defineMessages,
	IconButton,
	injectNotificationManager,
	Input,
	NewModal,
	useVIntl,
} from '@modrinth/ui'
import { computed, ref } from 'vue'

import { CUSTOM_ACCENT_ID, findAccentPreset, parseAccentGradient } from '@/composables/use-accent'
import ThemeIcon from '@/features/settings/display/PortalrinthThemeIcon.vue'
import {
	applyThemeBackground,
	chooseThemeIcon,
	deleteTheme,
	MAX_THEMES,
	type SavedTheme,
	savedThemes,
	saveTheme,
	THEME_ICONS,
	type ThemeAccent,
} from '@/helpers/portalrinth-themes'

const props = defineProps<{ accent: ThemeAccent }>()
const emit = defineEmits<{ applyAccent: [accent: ThemeAccent] }>()

const { formatMessage } = useVIntl()
const { handleError, addNotification } = injectNotificationManager()

const messages = defineMessages({
	title: { id: 'portalrinth.settings.themes.title', defaultMessage: 'Themes' },
	description: {
		id: 'portalrinth.settings.themes.description',
		defaultMessage:
			'Keep the background and the accent as they are now under a name, and put them back with one click. Up to {max}.',
	},
	save: { id: 'portalrinth.settings.themes.save', defaultMessage: 'Save theme' },
	replace: { id: 'portalrinth.settings.themes.replace', defaultMessage: 'Replace' },
	apply: { id: 'portalrinth.settings.themes.apply', defaultMessage: 'Apply theme {name}' },
	remove: { id: 'portalrinth.settings.themes.remove', defaultMessage: 'Delete theme' },
	modalHeader: { id: 'portalrinth.settings.themes.modal-header', defaultMessage: 'Save theme' },
	nameLabel: { id: 'portalrinth.settings.themes.name', defaultMessage: 'Name' },
	namePlaceholder: {
		id: 'portalrinth.settings.themes.name-placeholder',
		defaultMessage: 'For example, Night city',
	},
	iconLabel: { id: 'portalrinth.settings.themes.icon', defaultMessage: 'Icon' },
	ownIcon: { id: 'portalrinth.settings.themes.own-icon', defaultMessage: 'Your own picture' },
	fullTitle: {
		id: 'portalrinth.settings.themes.full-title',
		defaultMessage: 'There are already {max} themes',
	},
	fullDescription: {
		id: 'portalrinth.settings.themes.full-description',
		defaultMessage: 'No more can be kept. Choose the theme the new one will replace.',
	},
	saved: { id: 'portalrinth.settings.themes.saved', defaultMessage: 'Theme saved' },
})

const modal = ref<InstanceType<typeof NewModal> | null>(null)
const name = ref('')
const icon = ref<string>(THEME_ICONS[0])
const replace = ref<string | null>(null)
const busy = ref(false)
const full = computed(() => savedThemes.value.length >= MAX_THEMES)

function openSave(event?: MouseEvent) {
	name.value = ''
	icon.value = THEME_ICONS[0]
	replace.value = null
	modal.value?.show(event)
}

async function pickIcon() {
	try {
		const picked = await chooseThemeIcon()
		if (picked) icon.value = picked
	} catch (error) {
		handleError(error as Error)
	}
}

async function submit() {
	busy.value = true
	try {
		const theme = await saveTheme(
			name.value,
			icon.value,
			props.accent,
			full.value ? (replace.value ?? undefined) : undefined,
		)
		modal.value?.hide()
		addNotification({ title: formatMessage(messages.saved), text: theme.name, type: 'success' })
	} catch (error) {
		handleError(error as Error)
	} finally {
		busy.value = false
	}
}

async function apply(theme: SavedTheme) {
	busy.value = true
	try {
		await applyThemeBackground(theme)
		emit('applyAccent', theme.accent)
	} catch (error) {
		handleError(error as Error)
	} finally {
		busy.value = false
	}
}

async function remove(id: string) {
	try {
		await deleteTheme(id)
	} catch (error) {
		handleError(error as Error)
	}
}

/** A strip in the theme's accent, its gradient when it has one. */
function accentSwatch(theme: SavedTheme): string {
	const gradient = parseAccentGradient(theme.accent.color)
	if (theme.accent.preset === CUSTOM_ACCENT_ID) {
		return gradient ? `linear-gradient(90deg, ${gradient.stops.join(', ')})` : theme.accent.color
	}
	return findAccentPreset(theme.accent.preset)?.dark ?? 'var(--color-brand)'
}
</script>

<style scoped>
.theme-plaque {
	transition:
		border-color 0.15s ease,
		transform 0.15s ease;
}

.theme-plaque:hover {
	border-color: var(--color-brand);
}

.theme-plaque:active {
	transform: scale(0.98);
}

.icon-choice {
	display: grid;
	place-items: center;
	width: 2.75rem;
	height: 2.75rem;
	padding: 0;
	border: 2px solid transparent;
	border-radius: 0.75rem;
	background: var(--surface-4);
	color: var(--color-base);
	cursor: pointer;
	transition: border-color 0.15s ease;
}

.icon-choice:hover {
	border-color: var(--surface-5);
}

.icon-choice.is-selected,
.replace-choice.is-selected {
	border-color: var(--color-brand);
}

.replace-choice {
	border: 2px solid transparent;
	background: var(--surface-4);
	cursor: pointer;
}
</style>

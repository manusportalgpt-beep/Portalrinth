<template>
	<NewModal ref="modal" :header="formatMessage(messages.createHeader)">
		<div class="flex w-[32rem] max-w-full flex-col gap-4">
			<div class="flex items-center gap-4">
				<Avatar :src="iconPreview" size="5rem" :tint-by="name || undefined" />
				<div class="flex flex-col gap-2">
					<span class="text-lg font-semibold text-contrast">
						{{ formatMessage(messages.iconLabel) }}
					</span>
					<div class="flex flex-wrap gap-2">
						<Button @click="iconInput?.click()">
							<UploadIcon aria-hidden="true" />
							{{ formatMessage(messages.chooseIcon) }}
						</Button>
						<Button v-if="icon" type="quiet" @click="clearIcon">
							<TrashIcon aria-hidden="true" />
							{{ formatMessage(messages.removeIcon) }}
						</Button>
					</div>
					<input
						ref="iconInput"
						type="file"
						class="hidden"
						accept="image/png,image/jpeg,image/webp,image/gif"
						@change="onIconPicked"
					/>
				</div>
			</div>
			<div class="flex flex-col gap-2">
				<label for="pc-name" class="text-lg font-semibold text-contrast">
					{{ formatMessage(messages.nameLabel) }}
					<span class="text-brand-red">*</span>
				</label>
				<Input
					id="pc-name"
					v-model="name"
					:maxlength="64"
					:placeholder="formatMessage(messages.namePlaceholder)"
					autocomplete="off"
				/>
			</div>
			<div class="flex flex-col gap-2">
				<label for="pc-slug" class="flex flex-col gap-1">
					<span class="text-lg font-semibold text-contrast">
						{{ formatMessage(messages.urlLabel) }}
						<span class="text-brand-red">*</span>
					</span>
					<span>{{ formatMessage(messages.urlHint) }}</span>
				</label>
				<div class="slug-field">
					<span class="slug-prefix">modrinth.com/{{ projectType }}/</span>
					<input
						id="pc-slug"
						v-model="slug"
						class="slug-input"
						maxlength="64"
						autocomplete="off"
						spellcheck="false"
						@input="slugTouched = true"
					/>
				</div>
			</div>
			<div class="flex flex-col gap-2">
				<span class="text-lg font-semibold text-contrast">
					{{ formatMessage(messages.typeLabel) }}
				</span>
				<Chips
					v-model="projectType"
					:items="projectTypes"
					:format-label="typeLabel"
					:capitalize="false"
				/>
			</div>
			<div class="flex flex-col gap-2">
				<span class="flex flex-col gap-1">
					<span class="text-lg font-semibold text-contrast">
						{{ formatMessage(messages.visibilityLabel) }}
					</span>
					<span>{{ formatMessage(messages.visibilityHint) }}</span>
				</span>
				<Chips
					v-model="visibility"
					:items="visibilities"
					:format-label="statusLabel"
					:capitalize="false"
				/>
			</div>
			<div class="flex flex-col gap-2">
				<label for="pc-summary" class="flex flex-col gap-1">
					<span class="text-lg font-semibold text-contrast">
						{{ formatMessage(messages.summaryLabel) }}
						<span class="text-brand-red">*</span>
					</span>
					<span>{{ formatMessage(messages.summaryHint) }}</span>
				</label>
				<Textarea
					id="pc-summary"
					v-model="summary"
					:maxlength="256"
					:placeholder="formatMessage(messages.summaryPlaceholder)"
				/>
			</div>
			<div class="flex justify-end gap-2">
				<Button type="outlined" @click="hide">
					<XIcon aria-hidden="true" />
					{{ formatMessage(messages.cancel) }}
				</Button>
				<Button :disabled="submitting || !valid" type="colored" color="brand" @click="submit">
					<SpinnerIcon v-if="submitting" class="animate-spin" aria-hidden="true" />
					<PlusIcon v-else aria-hidden="true" />
					{{ formatMessage(submitting ? messages.creating : messages.create) }}
				</Button>
			</div>
		</div>
	</NewModal>
</template>

<script setup lang="ts">
import { PlusIcon, SpinnerIcon, TrashIcon, UploadIcon, XIcon } from '@modrinth/assets'
import {
	Avatar,
	Button,
	Chips,
	injectNotificationManager,
	Input,
	NewModal,
	Textarea,
	useVIntl,
} from '@modrinth/ui'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import {
	createProject,
	type CreatorProject,
	type CreatorProjectType,
	slugify,
} from '@/helpers/modrinth-creator'
import { creatorMessages as messages, useCreatorLabels } from '@/pages/dashboard/creator-messages'

const { formatMessage } = useVIntl()
const { handleError, addNotification } = injectNotificationManager()
const { typeLabel, statusLabel } = useCreatorLabels()

const emit = defineEmits<{ created: [CreatorProject] }>()

const projectTypes: CreatorProjectType[] = [
	'mod',
	'modpack',
	'resourcepack',
	'shader',
	'datapack',
	'plugin',
]
const visibilities = ['approved', 'unlisted', 'private'] as const

const modal = ref<InstanceType<typeof NewModal>>()
const iconInput = ref<HTMLInputElement>()
const name = ref('')
const slug = ref('')
const slugTouched = ref(false)
const summary = ref('')
const projectType = ref<CreatorProjectType>('mod')
const visibility = ref<(typeof visibilities)[number]>('approved')
const icon = ref<File | null>(null)
const iconPreview = ref<string | undefined>()
const submitting = ref(false)

watch(name, (value) => {
	if (!slugTouched.value) slug.value = slugify(value)
})

const valid = computed(
	() =>
		name.value.trim().length >= 3 &&
		/^[\w!@$().+,"'-]{3,64}$/.test(slug.value) &&
		summary.value.trim().length >= 3,
)

function clearIcon() {
	if (iconPreview.value) URL.revokeObjectURL(iconPreview.value)
	icon.value = null
	iconPreview.value = undefined
	if (iconInput.value) iconInput.value.value = ''
}

function onIconPicked(event: Event) {
	const file = (event.target as HTMLInputElement).files?.[0]
	if (!file) return
	clearIcon()
	icon.value = file
	iconPreview.value = URL.createObjectURL(file)
}

onBeforeUnmount(clearIcon)

function show(event?: MouseEvent) {
	name.value = ''
	slug.value = ''
	slugTouched.value = false
	summary.value = ''
	projectType.value = 'mod'
	visibility.value = 'approved'
	submitting.value = false
	clearIcon()
	modal.value?.show(event)
}

function hide() {
	modal.value?.hide()
}

async function submit() {
	if (!valid.value) return
	submitting.value = true
	try {
		const project = await createProject({
			title: name.value.trim(),
			slug: slug.value,
			description: summary.value.trim(),
			project_type: projectType.value,
			visibility: visibility.value,
			icon: icon.value,
		})
		emit('created', project)
		addNotification({
			title: formatMessage(messages.created),
			text: formatMessage(messages.createdDetail, { name: project.title }),
			type: 'success',
		})
		hide()
	} catch (error) {
		handleError(error as Error)
	} finally {
		submitting.value = false
	}
}

defineExpose({ show, hide })
</script>

<style scoped lang="scss">
.slug-field {
	display: flex;
	align-items: center;
	min-height: 2.5rem;
	border-radius: var(--radius-md);
	background-color: var(--color-button-bg);
	overflow: hidden;
	outline: 2px solid transparent;
	transition: outline-color 0.15s ease;

	&:focus-within {
		outline-color: var(--color-brand);
	}
}

.slug-prefix {
	padding-left: 0.75rem;
	color: var(--color-secondary);
	white-space: nowrap;
	user-select: none;
}

.slug-input {
	flex: 1;
	min-width: 0;
	height: 2.5rem;
	padding: 0 0.75rem 0 0;
	border: none;
	background: transparent;
	color: var(--color-contrast);
	font: inherit;
	outline: none;
	box-shadow: none;
}
</style>

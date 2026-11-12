<template>
	<NewModal
		ref="modal"
		:header="formatMessage(messages.header)"
		max-width="480px"
		width="100%"
		actions-divider
	>
		<div class="flex w-full flex-col gap-4">
			<div class="flex flex-col gap-2">
				<label for="hosting-create-name" class="text-lg font-semibold text-contrast">
					{{ formatMessage(messages.name) }}
				</label>
				<Input
					id="hosting-create-name"
					v-model="name"
					:maxlength="48"
					:placeholder="formatMessage(messages.namePlaceholder)"
					autocomplete="off"
					:disabled="creating"
					@keyup.enter="submit"
				/>
			</div>

			<div class="flex flex-col gap-2">
				<span class="text-lg font-semibold text-contrast">
					{{ formatMessage(messages.software) }}
				</span>
				<div class="grid grid-cols-3 gap-2">
					<button
						v-for="option in HOSTED_SOFTWARE"
						:key="option"
						type="button"
						class="hosting-software"
						:class="{ 'is-active': software === option }"
						:disabled="creating"
						@click="software = option"
					>
						{{ softwareLabels[option] }}
					</button>
				</div>
			</div>

			<div class="flex flex-col gap-2">
				<span class="text-lg font-semibold text-contrast">
					{{ formatMessage(messages.version) }}
				</span>
				<Combobox
					v-model="version"
					:options="versionOptions"
					:disabled="creating || versionsQuery.isPending.value"
					:placeholder="
						versionsQuery.isPending.value
							? formatMessage(messages.versionsLoading)
							: formatMessage(messages.versionPlaceholder)
					"
					searchable
				/>
				<span v-if="versionsQuery.isError.value" class="text-sm text-brand-red">
					{{ formatMessage(messages.versionsFailed) }}
				</span>
			</div>
		</div>

		<template #actions>
			<div class="flex justify-end gap-2">
				<Button :disabled="creating" type="outlined" @click="hide">
					<XIcon aria-hidden="true" />
					{{ formatMessage(commonMessages.cancelButton) }}
				</Button>
				<Button
					:disabled="creating || !name.trim() || !version"
					type="colored"
					color="brand"
					@click="submit"
				>
					<SpinnerIcon v-if="creating" class="animate-spin" aria-hidden="true" />
					<PlusIcon v-else aria-hidden="true" />
					{{ formatMessage(messages.create) }}
				</Button>
			</div>
		</template>
	</NewModal>
</template>

<script setup lang="ts">
import { PlusIcon, SpinnerIcon, XIcon } from '@modrinth/assets'
import {
	Button,
	Combobox,
	type ComboboxOption,
	commonMessages,
	defineMessages,
	injectNotificationManager,
	Input,
	NewModal,
	useVIntl,
} from '@modrinth/ui'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, ref, watch } from 'vue'

import {
	HOSTED_SOFTWARE,
	type HostedServerView,
	type HostedSoftware,
	hosting_create,
	hosting_versions,
} from '@/helpers/hosting'

import { softwareLabels } from './messages'
import { hostedServersKey } from './queries'

const { formatMessage } = useVIntl()
const { handleError } = injectNotificationManager()
const queryClient = useQueryClient()

const emit = defineEmits<{ created: [HostedServerView] }>()

const messages = defineMessages({
	header: { id: 'app.server-hosting.create.header', defaultMessage: 'New server' },
	name: { id: 'app.server-hosting.create.name', defaultMessage: 'Name' },
	namePlaceholder: {
		id: 'app.server-hosting.create.name-placeholder',
		defaultMessage: 'My server',
	},
	software: { id: 'app.server-hosting.create.software', defaultMessage: 'Core' },
	version: { id: 'app.server-hosting.create.version', defaultMessage: 'Minecraft version' },
	versionPlaceholder: {
		id: 'app.server-hosting.create.version-placeholder',
		defaultMessage: 'Choose a version',
	},
	versionsLoading: {
		id: 'app.server-hosting.create.versions-loading',
		defaultMessage: 'Loading versions…',
	},
	versionsFailed: {
		id: 'app.server-hosting.create.versions-failed',
		defaultMessage: 'Failed to load versions for this core',
	},
	create: { id: 'app.server-hosting.create.submit', defaultMessage: 'Create' },
})

const modal = ref<InstanceType<typeof NewModal>>()
const name = ref('')
const software = ref<HostedSoftware>('paper')
const version = ref<string>()
const creating = ref(false)
const opened = ref(false)

const versionsQuery = useQuery({
	queryKey: computed(() => ['server-hosting', 'versions', software.value] as const),
	queryFn: () => hosting_versions(software.value),
	enabled: opened,
	staleTime: 10 * 60 * 1000,
})

const versionOptions = computed<ComboboxOption<string>[]>(() =>
	(versionsQuery.data.value ?? []).map((value) => ({ value, label: value })),
)

watch(
	() => versionsQuery.data.value,
	(list) => {
		if (list && (!version.value || !list.includes(version.value))) version.value = list[0]
	},
)

watch(software, () => {
	version.value = versionsQuery.data.value?.[0]
})

function show(event?: MouseEvent) {
	name.value = ''
	creating.value = false
	opened.value = true
	modal.value?.show(event)
}

function hide() {
	modal.value?.hide()
}

async function submit() {
	if (creating.value || !name.value.trim() || !version.value) return
	creating.value = true
	try {
		const server = await hosting_create(name.value.trim(), software.value, version.value)
		await queryClient.invalidateQueries({ queryKey: hostedServersKey })
		hide()
		emit('created', server)
	} catch (error) {
		handleError(error as Error)
	} finally {
		creating.value = false
	}
}

defineExpose({ show, hide })
</script>

<style scoped lang="scss">
.hosting-software {
	padding: 0.5rem 0.75rem;
	border-radius: var(--radius-md, 0.5rem);
	border: 1px solid var(--surface-5);
	background: var(--surface-3);
	color: var(--color-secondary);
	font-weight: 600;
	cursor: pointer;
	transition:
		border-color 0.15s ease,
		color 0.15s ease,
		background-color 0.15s ease;

	&:hover:not(:disabled) {
		color: var(--color-contrast);
	}

	&.is-active {
		border-color: var(--color-brand);
		background: var(--color-brand-highlight);
		color: var(--color-brand);
	}

	&:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}
}
</style>

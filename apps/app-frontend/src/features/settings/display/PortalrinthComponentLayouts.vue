<template>
	<div class="mt-6 flex flex-col gap-3">
		<div>
			<h2 class="m-0 text-lg font-semibold text-contrast">
				{{ formatMessage(messages.title) }}
			</h2>
			<p class="m-0 mt-1 text-secondary">
				{{ formatMessage(messages.description) }}
			</p>
		</div>
		<div>
			<ButtonStyled>
				<button type="button" @click="open">
					<LayoutGridIcon />
					{{ formatMessage(messages.button) }}
				</button>
			</ButtonStyled>
		</div>

		<NewModal ref="modal" :header="formatMessage(messages.modalHeader)">
			<div class="flex w-[44rem] max-w-full flex-col gap-5">
				<p class="m-0 text-secondary">{{ formatMessage(messages.modalDescription) }}</p>
				<section
					v-for="page in LAYOUT_PAGES"
					:key="page"
					class="flex flex-col gap-2.5"
					role="radiogroup"
					:aria-label="formatMessage(pageMessages[page])"
				>
					<h3 class="m-0 text-base font-semibold text-contrast">
						{{ formatMessage(pageMessages[page]) }}
					</h3>
					<div class="grid grid-cols-2 gap-3">
						<button
							v-for="option in LAYOUT_OPTIONS"
							:key="option"
							type="button"
							role="radio"
							class="layout-option"
							:class="{ 'layout-option--selected': componentLayouts[page] === option }"
							:aria-checked="componentLayouts[page] === option"
							@click="setComponentLayout(page, option)"
						>
							<span class="layout-option__preview" aria-hidden="true">
								<span v-if="option === 'list' && page !== 'skins'" class="preview-list">
									<span v-for="n in 4" :key="n" />
								</span>
								<span v-else-if="option === 'list'" class="preview-grid preview-grid--compact">
									<span v-for="n in 8" :key="n" />
								</span>
								<span v-else class="preview-grid">
									<span v-for="n in 4" :key="n" />
								</span>
							</span>
							<span class="layout-option__label">
								<span class="layout-option__radio" />
								<span class="truncate">{{ optionLabel(page, option) }}</span>
							</span>
						</button>
					</div>
				</section>
			</div>
		</NewModal>
	</div>
</template>

<script setup lang="ts">
import { LayoutGridIcon } from '@modrinth/assets'
import { ButtonStyled, defineMessages, NewModal, useVIntl } from '@modrinth/ui'
import { ref } from 'vue'

import {
	type ComponentLayout,
	componentLayouts,
	LAYOUT_PAGES,
	type LayoutPage,
	setComponentLayout,
} from '@/helpers/portalrinth-layouts.ts'

const LAYOUT_OPTIONS: ComponentLayout[] = ['list', 'grid']

const { formatMessage } = useVIntl()

const modal = ref<InstanceType<typeof NewModal> | null>(null)

function open(event: MouseEvent) {
	modal.value?.show(event)
}

function optionLabel(page: LayoutPage, option: ComponentLayout): string {
	if (page === 'skins') {
		return formatMessage(option === 'list' ? messages.compact : messages.large)
	}
	return formatMessage(option === 'list' ? messages.list : messages.grid)
}

const messages = defineMessages({
	title: {
		id: 'app.settings.layouts.title',
		defaultMessage: 'Components',
	},
	description: {
		id: 'app.settings.layouts.description',
		defaultMessage: 'Choose how projects, profiles and skins are laid out on each page.',
	},
	button: {
		id: 'app.settings.layouts.button',
		defaultMessage: 'Components',
	},
	modalHeader: {
		id: 'app.settings.layouts.modal-header',
		defaultMessage: 'Page layouts',
	},
	modalDescription: {
		id: 'app.settings.layouts.modal-description',
		defaultMessage: 'Select the layout for each page with projects.',
	},
	list: {
		id: 'app.settings.layouts.list',
		defaultMessage: 'List',
	},
	grid: {
		id: 'app.settings.layouts.grid',
		defaultMessage: 'Grid',
	},
	compact: {
		id: 'app.settings.layouts.compact',
		defaultMessage: 'Compact',
	},
	large: {
		id: 'app.settings.layouts.large',
		defaultMessage: 'Large',
	},
})

const pageMessages = defineMessages({
	mod: { id: 'app.settings.layouts.page.mod', defaultMessage: 'Mods page' },
	plugin: { id: 'app.settings.layouts.page.plugin', defaultMessage: 'Plugins page' },
	datapack: { id: 'app.settings.layouts.page.datapack', defaultMessage: 'Data packs page' },
	shader: { id: 'app.settings.layouts.page.shader', defaultMessage: 'Shaders page' },
	resourcepack: {
		id: 'app.settings.layouts.page.resourcepack',
		defaultMessage: 'Resource packs page',
	},
	modpack: { id: 'app.settings.layouts.page.modpack', defaultMessage: 'Modpacks page' },
	server: { id: 'app.settings.layouts.page.server', defaultMessage: 'Servers page' },
	user: { id: 'app.settings.layouts.page.user', defaultMessage: 'User pages' },
	skins: { id: 'app.settings.layouts.page.skins', defaultMessage: 'Skins page' },
})
</script>

<style scoped lang="scss">
.layout-option {
	display: flex;
	flex-direction: column;
	min-width: 0;
	padding: 0;
	overflow: hidden;
	border: 1px solid var(--color-button-border, var(--surface-5));
	border-radius: var(--radius-lg);
	background-color: var(--color-button-bg);
	color: var(--color-secondary);
	font: inherit;
	text-align: left;
	cursor: pointer;
	transition:
		border-color 150ms ease,
		box-shadow 150ms ease;

	&:hover {
		border-color: var(--color-brand);
	}

	&:focus-visible {
		outline: 2px solid var(--color-brand);
		outline-offset: 2px;
	}
}

.layout-option__preview {
	display: grid;
	place-items: center;
	height: 6rem;
	background-color: color-mix(in srgb, var(--color-bg) 70%, black);
}

.layout-option__label {
	display: flex;
	align-items: center;
	gap: 0.6rem;
	min-width: 0;
	padding: 0.65rem 0.9rem;
	font-weight: 500;
}

.layout-option__radio {
	width: 0.85rem;
	height: 0.85rem;
	flex-shrink: 0;
	border: 2px solid currentColor;
	border-radius: 999px;
	box-sizing: border-box;
}

.preview-list {
	display: flex;
	flex-direction: column;
	gap: 0.3rem;
	width: 7rem;

	span {
		height: 0.75rem;
		border-radius: 999px;
	}
}

.preview-grid {
	display: grid;
	grid-template-columns: repeat(2, 3.25rem);
	gap: 0.3rem;

	span {
		height: 2rem;
		border-radius: 0.5rem;
	}
}

.preview-grid--compact {
	grid-template-columns: repeat(4, 1.6rem);

	span {
		height: 2rem;
		border-radius: 0.35rem;
	}
}

.preview-list span,
.preview-grid span {
	box-sizing: border-box;
	border: 1.5px solid transparent;
	background-color: var(--color-button-bg);
	transition:
		background-color 150ms ease,
		border-color 150ms ease;
}

.layout-option--selected {
	border-color: var(--color-brand);
	box-shadow: 0 0 0 1px var(--color-brand);
	color: var(--color-contrast);

	.layout-option__radio {
		border-color: var(--color-brand);
		background: radial-gradient(circle, var(--color-brand) 40%, transparent 45%);
	}

	.preview-list span,
	.preview-grid span {
		border-color: var(--color-brand);
		background-color: var(--color-brand-highlight);
	}
}
</style>

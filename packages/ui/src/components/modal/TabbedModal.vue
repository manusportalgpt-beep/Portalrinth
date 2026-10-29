<script lang="ts"></script>

<script setup lang="ts">
import { RightArrowIcon } from '@modrinth/assets'
import { useElementSize } from '@vueuse/core'
import { type Component, type ComponentPublicInstance, computed, nextTick, ref, watch } from 'vue'

import { defineMessage, type MessageDescriptor, useVIntl } from '../../composables/i18n'
import { useScrollIndicator } from '../../composables/scroll-indicator'
import { truncatedTooltip } from '../../utils/truncate'
import LoadingIndicator from '../base/LoadingIndicator.vue'
import NewModal from './NewModal.vue'
export interface Tab {
	name: MessageDescriptor
	category?: MessageDescriptor
	icon: Component
	content?: Component
	href?: string
	badge?: MessageDescriptor
	shown?: boolean
}

defineSlots<{
	title?(): unknown
	'sidebar-header'?(): unknown
	footer?(): unknown
	content?(props: { tab: Tab | undefined; index: number }): unknown
	'floating-action-bar'?(): unknown
}>()

const { formatMessage } = useVIntl()

const props = withDefaults(
	defineProps<{
		tabs: Tab[]
		header?: string
		maxWidth?: string
		width?: string
		closable?: boolean
		onHide?: () => void
		onAfterHide?: () => void
		onShow?: () => void
		beforeHide?: () => boolean
		beforeTabChange?: (fromIndex: number, toIndex: number) => boolean
		hideTabSelection?: boolean
		filterQuery?: string
		floatingActionBarShown?: boolean
		disableClose?: boolean
	}>(),
	{
		header: undefined,
		maxWidth: undefined,
		width: undefined,
		closable: true,
		onHide: undefined,
		onAfterHide: undefined,
		onShow: undefined,
		beforeHide: undefined,
		beforeTabChange: undefined,
		hideTabSelection: false,
		filterQuery: undefined,
		floatingActionBarShown: false,
		disableClose: false,
	},
)

const visibleTabs = computed(() => props.tabs.filter((tab) => tab.shown !== false))

const noResultsMessage = defineMessage({
	id: 'app.settings.search.no-results',
	defaultMessage: 'No matches',
})

// A search over the sidebar's own entries - tab names and category headers.
// The pane keeps showing the selected tab even when the filter hides it:
// the search narrows the menu, not the window itself.
const filteredTabs = computed(() => {
	const query = props.filterQuery?.trim().toLowerCase() ?? ''
	if (!query) return visibleTabs.value
	return visibleTabs.value.filter(
		(tab) =>
			formatMessage(tab.name).toLowerCase().includes(query) ||
			(tab.category && formatMessage(tab.category).toLowerCase().includes(query)),
	)
})

const selectedTabObject = computed(() => visibleTabs.value[selectedTab.value])

const selectedTab = ref(0)
const tabLabelRefs = ref<Record<number, HTMLElement | null>>({})

function setTabLabelRef(index: number, element: Element | ComponentPublicInstance | null) {
	tabLabelRefs.value[index] = element instanceof HTMLElement ? element : null
}

function tabLabelTooltip(index: number, label: string) {
	return truncatedTooltip(tabLabelRefs.value[index], label)
}

const scrollContainer = ref<HTMLElement | null>(null)
const { showTopFade, showBottomFade, checkScrollState, forceCheck } =
	useScrollIndicator(scrollContainer)

const floatingActionBarContainer = ref<HTMLElement | null>(null)
const { height: floatingActionBarHeight } = useElementSize(floatingActionBarContainer)
const contentBottomPadding = computed(() =>
	props.floatingActionBarShown ? `calc(${floatingActionBarHeight.value}px + 2.25rem)` : '1.5rem',
)

watch(contentBottomPadding, () => forceCheck(), { flush: 'post' })

const sidebarScrollContainer = ref<HTMLElement | null>(null)
const {
	showTopFade: showSidebarTopFade,
	showBottomFade: showSidebarBottomFade,
	checkScrollState: checkSidebarScrollState,
} = useScrollIndicator(sidebarScrollContainer)

const modal = ref<InstanceType<typeof NewModal> | null>(null)

function setTab(index: number) {
	if (index === selectedTab.value && !props.hideTabSelection) return
	if (props.beforeTabChange?.(selectedTab.value, index) === false) return
	selectedTab.value = index
	nextTick(() => forceCheck())
}

function show(event?: MouseEvent) {
	modal.value?.show(event)
	nextTick(() => {
		if (props.hideTabSelection) return
		tabLabelRefs.value[selectedTab.value]?.parentElement?.scrollIntoView({
			behavior: 'instant',
			block: 'nearest',
			inline: 'nearest',
		})
		checkSidebarScrollState()
	})
}

function hide(): boolean {
	return modal.value?.hide() ?? false
}

function startsCategory(tabs: Tab[], index: number) {
	const category = tabs[index]?.category
	return !!category && category.id !== tabs[index - 1]?.category?.id
}

defineExpose({ show, hide, selectedTab, setTab })
</script>
<template>
	<NewModal
		ref="modal"
		:header="header"
		:max-width="maxWidth"
		:width="width"
		:closable="closable"
		:on-hide="onHide"
		:on-after-hide="onAfterHide"
		:on-show="onShow"
		:before-hide="beforeHide"
		:disable-close="disableClose"
		class="!rounded-[20px] !bg-surface-3"
		no-padding
	>
		<template v-if="$slots.title" #title>
			<slot name="title" />
		</template>
		<div class="grid h-[min(65vh,640px)] min-h-0 grid-cols-[250px_minmax(0,1fr)] overflow-hidden">
			<div class="relative flex min-h-0 min-w-0 flex-col gap-2 bg-surface-3 p-4">
				<div
					aria-hidden="true"
					class="pointer-events-none absolute inset-y-0 right-0 border-0 border-r border-solid border-surface-5"
				/>
				<slot name="sidebar-header" />

				<div class="relative min-h-0 flex-1">
					<Transition
						enter-active-class="transition-all duration-200 ease-out"
						enter-from-class="opacity-0 max-h-0"
						enter-to-class="opacity-100 max-h-4"
						leave-active-class="transition-all duration-200 ease-in"
						leave-from-class="opacity-100 max-h-4"
						leave-to-class="opacity-0 max-h-0"
					>
						<div
							v-if="showSidebarTopFade"
							class="pointer-events-none absolute left-0 right-0 top-0 z-10 h-4 bg-gradient-to-b from-surface-3 to-transparent"
						/>
					</Transition>

					<div
						ref="sidebarScrollContainer"
						class="tabbed-modal-scrollbar -mr-3 flex h-full flex-col gap-1 overflow-y-auto overscroll-contain pr-3"
						@scroll="checkSidebarScrollState"
					>
						<template v-for="(tab, index) in filteredTabs" :key="index">
							<div
								v-if="startsCategory(filteredTabs, index) && tab.category"
								class="shrink-0 truncate pb-1.5 text-sm font-extrabold uppercase leading-5 text-secondary"
								:class="{ 'mt-3': index > 0 }"
							>
								{{ formatMessage(tab.category) }}
							</div>
							<component
								:is="tab.href ? 'a' : 'button'"
								:href="tab.href ?? undefined"
								:target="tab.href ? '_blank' : undefined"
								:rel="tab.href ? 'noopener noreferrer' : undefined"
								:class="`flex min-w-0 shrink-0 gap-2 items-center text-left rounded-[14px] px-4 py-2.5 border-none text-base leading-5 font-semibold cursor-pointer active:scale-[0.97] transition-all no-underline ${!tab.href && !hideTabSelection && selectedTabObject === tab ? 'bg-[color-mix(in_srgb,var(--color-brand)_30%,transparent)] text-brand' : 'bg-transparent text-primary hover:bg-surface-4 hover:text-contrast'}`"
								@click="!tab.href && setTab(visibleTabs.indexOf(tab))"
							>
								<component :is="tab.icon" class="size-5 flex-shrink-0" />
								<span
									:ref="(element) => setTabLabelRef(index, element)"
									v-tooltip="tabLabelTooltip(index, formatMessage(tab.name))"
									class="min-w-0 flex-1 truncate"
								>
									{{ formatMessage(tab.name) }}
								</span>
								<span
									v-if="tab.badge"
									class="shrink-0 rounded-full px-1.5 py-0.5 text-xs font-bold bg-brand-highlight text-brand"
								>
									{{ formatMessage(tab.badge) }}
								</span>
								<RightArrowIcon v-if="tab.href" class="ml-auto size-4 shrink-0" />
							</component>
						</template>
						<div v-if="filteredTabs.length === 0" class="px-4 py-2 text-sm text-secondary">
							{{ formatMessage(noResultsMessage) }}
						</div>
					</div>

					<Transition
						enter-active-class="transition-all duration-200 ease-out"
						enter-from-class="opacity-0 max-h-0"
						enter-to-class="opacity-100 max-h-14"
						leave-active-class="transition-all duration-200 ease-in"
						leave-from-class="opacity-100 max-h-14"
						leave-to-class="opacity-0 max-h-0"
					>
						<div
							v-if="showSidebarBottomFade"
							class="pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-14 bg-gradient-to-t from-surface-3 via-surface-3 via-20% to-transparent"
						/>
					</Transition>
				</div>

				<slot name="footer" />
			</div>
			<div class="relative min-h-0 min-w-0 bg-surface-2">
				<Transition
					enter-active-class="transition-all duration-200 ease-out"
					enter-from-class="opacity-0 max-h-0"
					enter-to-class="opacity-100 max-h-4"
					leave-active-class="transition-all duration-200 ease-in"
					leave-from-class="opacity-100 max-h-4"
					leave-to-class="opacity-0 max-h-0"
				>
					<div
						v-if="showTopFade"
						class="pointer-events-none absolute left-0 right-0 top-0 z-10 h-4 bg-gradient-to-b from-surface-2 to-transparent"
					/>
				</Transition>

				<div
					ref="scrollContainer"
					class="tabbed-modal-scrollbar absolute inset-0 overflow-y-auto overscroll-contain"
					@scroll="checkScrollState"
				>
					<div
						class="flow-root min-h-full px-6 pt-6"
						:style="{ paddingBottom: contentBottomPadding }"
					>
						<slot name="content" :tab="selectedTabObject" :index="selectedTab">
							<Suspense>
								<component :is="selectedTabObject?.content" v-if="selectedTabObject?.content" />
								<template #fallback>
									<LoadingIndicator class="py-2" />
								</template>
							</Suspense>
						</slot>
					</div>
				</div>

				<Transition
					enter-active-class="transition-all duration-200 ease-out"
					enter-from-class="opacity-0 max-h-0"
					enter-to-class="opacity-100 max-h-14"
					leave-active-class="transition-all duration-200 ease-in"
					leave-from-class="opacity-100 max-h-14"
					leave-to-class="opacity-0 max-h-0"
				>
					<div
						v-if="showBottomFade"
						class="pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-14 bg-gradient-to-t from-surface-2 to-transparent"
					/>
				</Transition>

				<div
					ref="floatingActionBarContainer"
					class="pointer-events-none absolute bottom-3 left-6 right-6 z-20"
				>
					<div class="pointer-events-auto">
						<slot name="floating-action-bar" />
					</div>
				</div>
			</div>
		</div>
	</NewModal>
</template>

<style scoped>
.tabbed-modal-scrollbar {
	scrollbar-color: var(--surface-5) transparent;
	scrollbar-width: thin;
}

.tabbed-modal-scrollbar::-webkit-scrollbar {
	width: 4px;
	height: 4px;
}

.tabbed-modal-scrollbar::-webkit-scrollbar-thumb {
	border-radius: 8px;
	background: var(--surface-5);
}
</style>

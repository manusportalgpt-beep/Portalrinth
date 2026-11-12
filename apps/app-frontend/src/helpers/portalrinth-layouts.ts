import { ref, watch } from 'vue'

export type ComponentLayout = 'list' | 'grid'

export const LAYOUT_PAGES = [
	'mod',
	'plugin',
	'datapack',
	'shader',
	'resourcepack',
	'modpack',
	'server',
	'user',
	'skins',
] as const

export type LayoutPage = (typeof LAYOUT_PAGES)[number]

const LAYOUTS_KEY = 'portalrinth-component-layouts'

const DEFAULT_LAYOUTS: Record<LayoutPage, ComponentLayout> = {
	mod: 'list',
	plugin: 'list',
	datapack: 'list',
	shader: 'list',
	resourcepack: 'list',
	modpack: 'list',
	server: 'list',
	user: 'list',
	skins: 'grid',
}

function readLayouts(): Record<LayoutPage, ComponentLayout> {
	const layouts = { ...DEFAULT_LAYOUTS }
	try {
		const raw = localStorage.getItem(LAYOUTS_KEY)
		const saved = raw ? JSON.parse(raw) : {}
		for (const page of LAYOUT_PAGES) {
			if (saved?.[page] === 'list' || saved?.[page] === 'grid') {
				layouts[page] = saved[page]
			}
		}
	} catch {
		/* a broken blob falls back to the defaults */
	}
	return layouts
}

export const componentLayouts = ref<Record<LayoutPage, ComponentLayout>>(readLayouts())

watch(
	componentLayouts,
	(value) => {
		try {
			localStorage.setItem(LAYOUTS_KEY, JSON.stringify(value))
		} catch {
			/* a full quota should not break the pages */
		}
	},
	{ deep: true },
)

export function layoutFor(page: string | undefined): ComponentLayout {
	if (page && (LAYOUT_PAGES as readonly string[]).includes(page)) {
		return componentLayouts.value[page as LayoutPage]
	}
	return 'list'
}

export function setComponentLayout(page: LayoutPage, layout: ComponentLayout): void {
	componentLayouts.value = { ...componentLayouts.value, [page]: layout }
}

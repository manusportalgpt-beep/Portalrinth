/**
 * Which service draws the 3D previews of skins, chosen in the settings'
 * Resources tab ("Сервис-скинов"). One service works at a time, everywhere
 * previews are shown - the grid, the viewer and the similar-skins row all
 * ask the same one - so two looks never mix in one page.
 *
 * The choice is kept in localStorage: it is a pure interface preference, and
 * the launcher's own settings file belongs to the app's schema.
 */
import { ref } from 'vue'

import { labySkinRenderUrl, minotarBodyUrl } from './laby-skins'

export type SkinRenderService = 'laby' | 'crafty' | 'mcskin' | 'minotar'

const STORAGE_KEY = 'portalrinth-skin-render-service'

function storedService(): SkinRenderService {
	try {
		const value = localStorage.getItem(STORAGE_KEY)
		if (value === 'laby' || value === 'crafty' || value === 'mcskin' || value === 'minotar')
			return value
	} catch {
		// Nowhere to read the choice from - the default stands.
	}
	return 'laby'
}

const service = ref<SkinRenderService>(storedService())

/** The service previews come from right now, reactive. */
export function useSkinRenderService() {
	return service
}

export function setSkinRenderService(value: SkinRenderService): void {
	service.value = value
	try {
		localStorage.setItem(STORAGE_KEY, value)
	} catch {
		// Without storage the choice holds until the app is closed.
	}
}

/**
 * The preview render of a skin, by its texture hash, as the chosen service
 * draws it. Laby.net renders its own library's hashes natively. Crafty.gg
 * takes texture hashes too, but only knows the ones Mojang itself indexed.
 * mcskin.me renders players by name or UUID and has no render for a bare
 * texture hash at all - `null` tells the caller to draw the skin itself,
 * which the local canvas render is there for.
 */
export function skinRenderUrl(hash: string, width = 270, height = 514): string | null {
	switch (service.value) {
		case 'laby':
			return labySkinRenderUrl(hash, width, height)
		case 'crafty':
			return `https://render.crafty.gg/3d/full/${hash}?width=${width}&height=${height}`
		case 'mcskin':
			return null
		case 'minotar':
			return minotarBodyUrl(hash, height)
	}
}

import { invoke } from '@tauri-apps/api/core'
import { ref } from 'vue'

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

/**
 * Why the launcher could not start, if it could not.
 *
 * The splash shows it. Without it the splash draws nothing and the window is
 * black, and nothing can be reported about a black window.
 */
export const startupError = ref<string | null>(null)

/** The splash's cube, decoded before anybody can see it arrive late. */
async function decodeSplashImage(splash: Element) {
	const value = getComputedStyle(splash).getPropertyValue('--splash-cube-image')
	const url = value.match(/url\(["']?([^"')]+)["']?\)/)?.[1]
	if (!url) return
	const image = new Image()
	image.src = url
	await image.decode().catch(() => {})
}

/**
 * Any CSS colour as the three bytes the window takes. A tinted theme writes its
 * surfaces in oklch, which only the browser can be trusted to convert.
 */
function toRgb(color: string): number[] | null {
	const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
	if (!context) return null
	context.fillStyle = color
	context.fillRect(0, 0, 1, 1)
	const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data
	return alpha === 0 ? null : [red, green, blue]
}

/**
 * Shows the main window once the splash is ready to be seen: in the settings'
 * theme, with its cube decoded and its frame on screen, over a window
 * background already that colour. Every wait is capped, because a hidden
 * window may never run animation frames and a failed start must still open.
 */
export async function revealMainWindow() {
	const splash = document.querySelector('.splash-screen') ?? document.body
	const background = toRgb(getComputedStyle(splash).backgroundColor)
	await Promise.race([
		Promise.all([
			decodeSplashImage(splash),
			nextFrame(),
			nextFrame(),
		]),
		wait(150),
	])
	await invoke('show_window', { background })
}

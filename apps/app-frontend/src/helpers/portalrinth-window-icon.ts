/**
 * The desktop's own copy of the mark, painted in the accent.
 *
 * An installed launcher pinned to the taskbar shows its shortcut's icon, not
 * the window's, so when "all icons in the accent" is on, the shortcuts that
 * start this very executable - pinned, in the Start menu, on the desktop - are
 * given the mark drawn in the accent, written out as an `.ico` of its own. The
 * mark ships as a picture rather than a path, so the recolouring goes through
 * a canvas: the artwork is drawn once and worn as a stencil, everything it
 * covers becoming the accent and everything it leaves transparent staying so.
 *
 * A gradient accent hands over its first colour - the one `accentBaseColor`
 * boils the run down to - because a small picture can hold one colour.
 *
 * Off, or with the theme's own accent, the shortcuts are pointed back at the
 * icon the app was installed with. Failures are silent by design: an icon is
 * not worth an error dialog.
 *
 * Whether the painting is wanted is read straight from the storage the
 * accent's composable writes, rather than imported from it - the composable is
 * the caller here, and importing it back would be a circle.
 */
import { invoke } from '@tauri-apps/api/core'

import markUrl from '@/assets/portalrinth-icon.png'

/** The sizes the shell picks from for a shortcut, from a list row to a tile. */
const SHORTCUT_SIZES = [16, 24, 32, 48, 64, 128, 256]

let mark: HTMLImageElement | null = null

function loadMark(): Promise<HTMLImageElement> {
	if (mark) return Promise.resolve(mark)
	return new Promise((resolve, reject) => {
		const image = new window.Image()
		image.onload = () => {
			mark = image
			resolve(image)
		}
		image.onerror = () => {
			reject(new Error('Failed to load the mark for recolouring'))
		}
		image.src = markUrl
	})
}

/** The mark as a silhouette in one colour, at one size, as PNG bytes. */
async function tintedPng(color: string, size: number): Promise<number[]> {
	const source = await loadMark()
	const canvas = document.createElement('canvas')
	canvas.width = size
	canvas.height = size
	const context = canvas.getContext('2d')
	if (!context) throw new Error('No 2D context to paint the icon on')
	context.drawImage(source, 0, 0, size, size)
	context.globalCompositeOperation = 'source-in'
	context.fillStyle = color
	context.fillRect(0, 0, size, size)
	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
	if (!blob) throw new Error('Failed to encode the icon')
	return Array.from(new Uint8Array(await blob.arrayBuffer()))
}

/** What was last written to the shell, so a repeated ask does no work. */
let lastKey: string | null = null

/**
 * Repaints this executable's shortcuts in the accent, or points them back at
 * the executable's own icon. `key` names the icon file, so a new colour is a
 * new path: the shell caches icons by path and would keep drawing the old one
 * from a file rewritten in place. Only shortcuts whose target is this
 * executable are touched; a development build is a different executable, so it
 * leaves an installed launcher's shortcuts alone.
 */
export async function paintWindowIcon(color: string, isDefault = false): Promise<void> {
	let painted = false
	try {
		painted = localStorage.getItem('portalrinth-icons-accent') === 'true'
	} catch {
		// No storage: the interface keeps its colours, and the shortcut its own.
	}
	const key =
		painted && !isDefault && color
			? color.replace(/[^0-9a-z]/gi, '').toLowerCase() || 'accent'
			: 'default'
	if (key === lastKey) return
	lastKey = key
	try {
		if (key === 'default') {
			await invoke('plugin:window-icon|paint_shortcut_icons', { key: 'default', images: [] })
			await invoke('plugin:window-icon|sync_taskbar_icon')
			return
		}
		const images = await Promise.all(
			SHORTCUT_SIZES.map(async (size) => ({ size, png: await tintedPng(color, size) })),
		)
		await invoke('plugin:window-icon|paint_shortcut_icons', { key, images })
	} catch (error) {
		lastKey = null
		console.warn('Failed to repaint the shortcut icons:', error)
	}
}

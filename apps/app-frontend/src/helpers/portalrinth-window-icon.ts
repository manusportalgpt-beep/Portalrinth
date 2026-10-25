/**
 * The window's icon used to be painted in the accent colour at runtime.
 *
 * It no longer is, and the reason is the reason this file still exists rather
 * than being deleted:
 *
 * Drawing it meant redrawing the old mark over whatever the launcher was
 * installed with, so the app's own icon could never be seen - not in the window,
 * not in the taskbar, not on the pinned shortcut. It was replaced the moment the
 * window opened, which is exactly the symptom of an icon that "never changes".
 *
 * Recolouring also has to go through a canvas, so what reached the shell was a
 * raster scaled up to whatever size it wanted, and that is where the blur came
 * from. The icon that ships with the app is drawn at every size it is needed at.
 *
 * An accent still colours the interface. It no longer repaints the app's face.
 *
 * Shortcuts painted by a version that still did keep pointing at the painted
 * file, though, and show that old picture - or none, once the file is gone -
 * until something points them back. So once per run they are pointed back at
 * the executable's own icon, and the window's taskbar slot is given it too.
 */
import { invoke } from '@tauri-apps/api/core'

let restored = false

/** Kept so the function still has the shape its callers expect. */
export async function paintWindowIcon(_color: string, _default = false): Promise<void> {
	void _color
	void _default
	if (restored) return
	restored = true
	try {
		await invoke('plugin:window-icon|paint_shortcut_icons', { key: 'default', images: [] })
		await invoke('plugin:window-icon|sync_taskbar_icon')
	} catch {
		// Not having a shortcut to fix is not a failure.
	}
}

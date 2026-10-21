import { invoke } from '@tauri-apps/api/core'

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
*/

/**
* Puts the app's own icon where the shell reads it.
*
* The window icon and the taskbar's copy of it are the same picture, but the
* taskbar keeps a second slot of its own, and the shortcuts that start this
* executable keep a third: each holds whatever it was given when the launcher
* was installed, which for an install that predates the app's own mark is the
* old one. A shortcut is repointed at the executable, and the executable is
* where the mark that ships lives.
*
* An empty list of images is what asks for that: the backend then points the
* shortcuts at the executable's own icon instead of writing a recoloured file
* of its own. Nothing is rasterised here, so there is nothing to blur.
*/
export async function paintWindowIcon(_color: string, _default = false): Promise<void> {
	void _color
	void _default

	try {
		await invoke('plugin:window-icon|paint_shortcut_icons', {
			key: 'app',
			images: [],
		})
	} catch (error) {
		// The shortcuts keep whatever icon they had. That is not worth a
		// message on every accent change.
		console.warn('Could not repoint the shortcuts at the app icon:', error)
	}

	try {
		// The taskbar's copy is a slot of its own, and only the copy keeps the
		// taskbar button and Alt-Tab showing the same mark as the window.
		await invoke('plugin:window-icon|sync_taskbar_icon')
	} catch (error) {
		console.warn('Could not sync the taskbar icon:', error)
	}
}

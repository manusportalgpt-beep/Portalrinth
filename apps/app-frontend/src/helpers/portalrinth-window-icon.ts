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

/** Kept so the function still has the shape its callers expect. */
export async function paintWindowIcon(_color: string, _default = false): Promise<void> {
	void _color
	void _default
}

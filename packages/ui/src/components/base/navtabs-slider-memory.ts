export interface NavTabsSliderSnapshot {
	left: number
	top: number
	right: number
	bottom: number
}

/**
 * Geometry of the active pill, remembered while one Discover tab bar
 * unmounts and its sibling mounts a moment later (Browse <-> Skin Browse,
 * or the server tab toggling the source-picker slot). A mounting bar
 * starts the pill here and slides it to the active tab, so a page swap
 * still reads as one pill travelling instead of one fading in.
 */
export const navTabsSliderMemory: { snapshot: NavTabsSliderSnapshot | null } = {
	snapshot: null,
}

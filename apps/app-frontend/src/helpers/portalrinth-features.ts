/**
 * Portalrinth's own toggleable desktop features: the built-in search
 * window, the title-bar clock and the weather button. Everything the
 * player can switch off lives in one localStorage blob behind one
 * reactive ref, so the title bar and the settings read the same truth.
 */
import { ref, watch } from 'vue'

export interface PortalrinthFeatures {
        /** The search button that opens DuckDuckGo in a launcher window. */
        search: boolean
        /** The clock at the top center of the title bar. */
        clock: boolean
        /** The weather button next to the sound button. */
        weather: boolean
        /** AI links open in the launcher's own browser window (off = system browser). */
        aiLinksWindow: boolean
}

const FEATURES_KEY = 'portalrinth-features'

const DEFAULT_FEATURES: PortalrinthFeatures = {
        search: true,
        clock: true,
        weather: true,
        aiLinksWindow: false,
}

function readFeatures(): PortalrinthFeatures {
        try {
                const raw = localStorage.getItem(FEATURES_KEY)
                if (!raw) return { ...DEFAULT_FEATURES }
                return { ...DEFAULT_FEATURES, ...JSON.parse(raw) }
        } catch {
                return { ...DEFAULT_FEATURES }
        }
}

export const portalrinthFeatures = ref<PortalrinthFeatures>(readFeatures())

watch(
        portalrinthFeatures,
        (value) => {
                try {
                        localStorage.setItem(FEATURES_KEY, JSON.stringify(value))
                } catch {
                        /* a full quota should never take the widgets down */
                }
        },
        { deep: true },
)

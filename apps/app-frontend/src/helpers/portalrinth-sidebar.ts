/**
 * Whether the right-hand panel is folded to its rail.
 *
 * It is here rather than in one component because two things need to know:
 * the panel itself, and the pages that need to offer what the panel was
 * carrying - the filters, which go with it when it is folded.
 */
import { ref } from 'vue'

export const sidebarCollapsed = ref(false)

import { ref } from 'vue'

/**
 * How far the title-bar clock (and Portalus beside it) is pushed right to
 * make room for a long breadcrumb trail. The trail reports what it needs in
 * breadcrumbs.vue; when the path shortens again the number returns to zero
 * and everything slides back home. The Portalus chip anchors to the clock's
 * edge, so shifting one shifts both.
 */
export const titlebarClockShift = ref(0)

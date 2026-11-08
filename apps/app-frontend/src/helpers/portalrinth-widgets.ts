/**
 * Helpers for the title-bar widgets: the clock at the top center. The
 * weather that used to live beside it is gone - the widget was removed
 * for good, along with its geolocators and stations.
 */

/** Which part of the day it is, for the clock's icon. */
export type TimeOfDay = 'sunrise' | 'day' | 'sunset' | 'night'

export function timeOfDay(date: Date): TimeOfDay {
	const hour = date.getHours()
	if (hour >= 5 && hour < 9) return 'sunrise'
	if (hour >= 9 && hour < 18) return 'day'
	if (hour >= 18 && hour < 21) return 'sunset'
	return 'night'
}

/** HH:MM in the system's own timezone - the clock shows what the PC shows. */
export function systemTime(date: Date): string {
	return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

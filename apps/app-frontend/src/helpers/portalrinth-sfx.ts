/**
 * The launcher's own little sounds, made here rather than fetched: a
 * tick for a press, a two-note chime for something finished. They stay
 * silent until they are switched on in Settings → Sound, and their
 * volume is that section's to set.
 */
import { audioSettings } from './portalrinth-audio'

type Effect = 'click' | 'success'

let context: AudioContext | null = null

function audioContext(): AudioContext | null {
	if (context) return context
	try {
		context = new AudioContext()
	} catch {
		context = null
	}
	return context
}

/** One tone: a note that rises at once and fades the rest of the way. */
function tone(
	ctx: AudioContext,
	at: number,
	frequency: number,
	length: number,
	gain: number,
): void {
	try {
		const oscillator = ctx.createOscillator()
		const envelope = ctx.createGain()
		oscillator.type = 'sine'
		oscillator.frequency.value = frequency
		envelope.gain.setValueAtTime(0, at)
		envelope.gain.linearRampToValueAtTime(gain, at + 0.012)
		envelope.gain.exponentialRampToValueAtTime(0.0001, at + length)
		oscillator.connect(envelope)
		envelope.connect(ctx.destination)
		oscillator.start(at)
		oscillator.stop(at + length + 0.05)
	} catch {
		// A sound that would not be made is not worth stopping for.
	}
}

/** Plays one of the launcher's sounds, at the volume set for them. */
export function playSoundEffect(effect: Effect): void {
	if (!audioSettings.effectsEnabled) return
	const ctx = audioContext()
	if (!ctx) return
	if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
	const volume = Math.min(1, Math.max(0, audioSettings.effectsVolume / 100)) * 0.35
	const now = ctx.currentTime
	if (effect === 'click') {
		tone(ctx, now, 720, 0.07, volume)
	} else {
		// Something finished well: the chime climbs a fifth.
		tone(ctx, now, 523.25, 0.22, volume)
		tone(ctx, now + 0.09, 784, 0.3, volume)
	}
}

let installed = false

/**
 * Listens for presses on the interface's own buttons - the frame every
 * button of the kit is drawn in marks itself for exactly this - and
 * plays the tick for them, once. Installed at startup; the sounds
 * themselves stay silent while they are switched off.
 */
export function installSoundEffects(): void {
	if (installed) return
	installed = true
	document.addEventListener(
		'click',
		(event) => {
			const target = event.target as HTMLElement | null
			if (target?.closest?.('[data-button]')) playSoundEffect('click')
		},
		true,
	)
}

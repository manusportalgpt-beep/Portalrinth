function showBootError(error) {
	const message = document.querySelector('.boot-error')
	const progress = document.querySelector('.boot-progress')
	if (!message || !progress) return
	message.textContent = error instanceof Error ? error.message : String(error)
	message.hidden = false
	progress.hidden = true
}

window.addEventListener('error', (event) => {
	if (event.target === window) showBootError(event.error ?? event.message)
})
window.addEventListener('unhandledrejection', (event) => showBootError(event.reason))

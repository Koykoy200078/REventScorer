/**
 * Keyboard stepping for a segmented score rail (a radio group). Arrow keys move one step and stop
 * at either end instead of wrapping, so a judge never jumps from the maximum to the minimum.
 * Returns the new index, or null when the key is not one the rail handles (let it through).
 * `index` is -1 when nothing is selected yet.
 */
export function nextRailIndex(index: number, key: string, count: number): number | null {
	if (count <= 0) return null
	const last = count - 1
	switch (key) {
		case 'ArrowRight':
		case 'ArrowUp':
			return index < 0 ? 0 : Math.min(index + 1, last)
		case 'ArrowLeft':
		case 'ArrowDown':
			return index < 0 ? 0 : Math.max(index - 1, 0)
		case 'Home':
			return 0
		case 'End':
			return last
		default:
			return null
	}
}

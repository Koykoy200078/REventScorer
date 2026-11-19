/** The preset chips every judge mockup in docs/designs shows, as percentages of the maximum. */
export const PRESET_PERCENTS = [0, 50, 75, 90, 100] as const

/**
 * Rounds to 2 decimals, never above `max`. The judge's score inputs use step 0.01, so a value with
 * more than 2 decimals would make the browser block Save (B44); presets must always be enterable.
 */
function round2(value: number, max: number): number {
	const rounded = Math.round(value * 100) / 100
	return rounded > max ? Math.floor(value * 100) / 100 : rounded
}

/** The score each preset chip enters for a sub-criterion worth `max` points. */
export function presetValues(max: number): number[] {
	if (!Number.isFinite(max) || max <= 0) return []
	return PRESET_PERCENTS.map((percent) => round2((max * percent) / 100, max))
}

/** Which preset chip a score matches (so a typed 9 of 10 lights the 90% chip), or -1. */
export function presetIndexOf(score: number, max: number): number {
	if (!Number.isFinite(score)) return -1
	const rounded = Math.round(score * 100) / 100
	return presetValues(max).findIndex((value) => value === rounded)
}

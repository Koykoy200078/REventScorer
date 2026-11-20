import { PRESET_PERCENTS, presetValues } from '@/lib/ui/presets'

/**
 * Batch Fill and Reset on the judge page (Stage 5 Task 5, spec §5). Values come from presetValues
 * (2 decimals at most, never above the maximum), so every one passes the inputs' step=0.01 (B44).
 * The direct-rating view has no rail (owner).
 */

/** BR-1 (Unified) / BR-2 (Group only) / BR-3 (Individual only). */
export type BatchRailVariant = 'unified' | 'group' | 'individual'
export type BatchPercent = 90 | 75 | 50

/** Ruling R8: BR-3 keeps its drawn 50% button. */
export function batchPercentsFor(variant: BatchRailVariant): readonly BatchPercent[] {
	return variant === 'individual' ? [90, 75, 50] : [90, 75]
}

/** The cells a batch changes: the cells on screen, minus locked cells and cells with no maximum. */
export function batchScope(shownIds: string[], maxBySubId: ReadonlyMap<string, number>, locked: ReadonlySet<string>): string[] {
	return shownIds.filter((id) => !locked.has(id) && (maxBySubId.get(id) ?? 0) > 0)
}

export function batchFillRow(inputRow: Record<string, string>, scope: string[], maxBySubId: ReadonlyMap<string, number>, percent: BatchPercent): Record<string, string> {
	const index = PRESET_PERCENTS.indexOf(percent)
	const next = { ...inputRow }
	for (const id of scope) next[id] = String(presetValues(maxBySubId.get(id) ?? 0)[index])
	return next
}

/** Each scope cell back to '0' (the 0% chip: not scored). */
export function resetRow(inputRow: Record<string, string>, scope: string[]): Record<string, string> {
	const next = { ...inputRow }
	for (const id of scope) next[id] = '0'
	return next
}

/** How many scope cells hold an entered value (a finite number above 0). */
export function countEntered(inputRow: Record<string, string>, scope: string[]): number {
	return scope.filter((id) => {
		const value = Number.parseFloat(inputRow[id] ?? '')
		return Number.isFinite(value) && value > 0
	}).length
}

export function resetConfirmText(scopeLabel: string, count: number): string {
	return `Reset the ${count} entered ${count === 1 ? 'score' : 'scores'} shown for ${scopeLabel} to 0 (not scored)? Nothing is sent until you press Save.`
}

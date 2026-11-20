import { parseAndClampScore, round } from '@/lib/judge/score-input'
import type { EventSubCriterion } from '@/lib/types'

/**
 * Cell sums, entry statuses, the auto-advance rule and the Save label (Stage 5 Task 5, spec §4.1,
 * §2.1 and §7.3). `inputRow` is a contestant's row of raw input strings (scores[contestantId]). The
 * sums are the old form's (activeContestantTotal, maxPossibleScore, scoredFieldCount): values are
 * clamped to each cell's maximum, and 0 is never "entered", because the server stores only values
 * above 0.
 */

/** Whether a typed value counts as entered: a finite number above 0. */
export function isEnteredValue(raw: string | undefined): boolean {
	const parsedValue = Number.parseFloat(raw ?? '')
	return Number.isFinite(parsedValue) && parsedValue > 0
}

export function cellTotals(cells: EventSubCriterion[], inputRow?: Record<string, string>): { score: number; max: number } {
	return {
		score: round(cells.reduce((sum, cell) => sum + parseAndClampScore(inputRow?.[cell.id] ?? '0', cell.maxScore), 0)),
		max: round(cells.reduce((sum, cell) => sum + Number(cell.maxScore), 0)),
	}
}

/** score as a percent of max, rounded to 3 decimals (shown with 1); null when max is 0. */
export function percentOf(score: number, max: number): number | null {
	return max > 0 ? round((score / max) * 100) : null
}

export function enteredCount(cells: EventSubCriterion[], inputRow?: Record<string, string>): { entered: number; total: number } {
	return { entered: cells.filter((cell) => isEnteredValue(inputRow?.[cell.id] ?? '0')).length, total: cells.length }
}

export type MemberStatus = 'scored' | 'partial' | 'not-started'

/** From the inputs, never from saves. Locked cells (an admin-provided NOAT) are not counted. */
export function memberStatus(cells: EventSubCriterion[], inputRow?: Record<string, string>, locked: ReadonlySet<string> = new Set()): MemberStatus {
	const counted = cells.filter((cell) => !locked.has(cell.id))
	const entered = counted.filter((cell) => isEnteredValue(inputRow?.[cell.id])).length
	if (entered > 0 && entered === counted.length) return 'scored'
	return entered > 0 ? 'partial' : 'not-started'
}

export type RosterStatus = 'none' | 'draft' | 'scored' | 'queued'

/** A roster entry's status, as the old roster chips worked it out: queued > scored > draft > none. */
export function rosterStatus(f: { queued: boolean; saved: boolean; hasDraft: boolean }): RosterStatus {
	return f.queued ? 'queued' : f.saved ? 'scored' : f.hasDraft ? 'draft' : 'none'
}

/** Where a successful or queued save moves the page: the next entry, unless admin edit mode is on
 * or this is the last entry (null: the page stays). */
export function advanceTarget(activeIndex: number, count: number, adminEditMode: boolean): number | null {
	const nextIndex = activeIndex + 1
	return !adminEditMode && nextIndex < count ? nextIndex : null
}

export interface SaveLabel {
	/** The whole label (also the button's title). */
	text: string
	/** The entry the label names: the next one for "Submit & next", else the current one. */
	name: string
	/** "({k} of {n})" for "Submit & next", where k is the next entry's position. */
	position?: string
}

/** The Save button's text (owner, 2026-11-20): "Submit & next: {next} ({k} of {n})" exactly when a
 * save moves on (advanceTarget), "Save {current} scores" otherwise, "Saving {current}..." while
 * saving. Null with no active entry. */
export function saveButtonLabel(f: { names: string[]; activeIndex: number; adminEditMode: boolean; isSaving: boolean }): SaveLabel | null {
	const current = f.names[f.activeIndex]
	if (current === undefined) return null
	if (f.isSaving) return { text: `Saving ${current}...`, name: current }
	const next = advanceTarget(f.activeIndex, f.names.length, f.adminEditMode)
	if (next === null) return { text: `Save ${current} scores`, name: current }
	const position = `(${next + 1} of ${f.names.length})`
	return { text: `Submit & next: ${f.names[next]} ${position}`, name: f.names[next], position }
}

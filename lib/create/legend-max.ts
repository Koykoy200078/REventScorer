// Create Scorer Event, design 2026-11-26-create-rubric-legend (owner: "Lock to legend"): while the Rubric Legend is
// on, every subcriterion's max is the legend's top score. Each row keeps its own typed max underneath, never
// overwritten, so turning the legend off gives it back. A pure module: the form runs everything it shows (totals,
// preview) and sends through withLegendMaxes.

import { normalizeRubricLegend } from '@/lib/rubric-legend'

export type LegendLock = { on: boolean; top: number }

/** The highest score of the legend as the server will store it (no valid item: the default legend, top 4). */
export function legendTopScore(legend: Array<{ score: number; label: string }>): number {
	return normalizeRubricLegend(legend)[0]?.score ?? 0
}

export function effectiveMaxScore(ownMax: string, lock: LegendLock): string {
	return lock.on ? String(lock.top) : ownMax
}

/** Copies of the criteria whose subcriteria carry the max that counts; the criteria themselves are not changed. */
export function withLegendMaxes<T extends { subCriteria: Array<{ maxScore: string }> }>(criteria: T[], lock: LegendLock): T[] {
	if (!lock.on) {
		return criteria
	}
	return criteria.map((criterion) => ({
		...criterion,
		subCriteria: criterion.subCriteria.map((subCriterion) => ({ ...subCriterion, maxScore: effectiveMaxScore(subCriterion.maxScore, lock) })),
	}))
}

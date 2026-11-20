import type { ContestantCells, JudgeLayout } from '@/lib/judge/layout'

/**
 * The check Save runs on the active contestant's cells before its confirm (Stage 5 Task 5, ruling
 * R2): the browser checks only the cells on screen, so a cell of another view or examinee with more
 * than 2 decimals would otherwise reach the server. The predicate is injected so the order and the
 * skipping rules can be tested without a browser.
 */

/** The cells in the order they are checked: the group cells, then the examinees in tab order; the
 * direct fields for a direct rating. */
export function stepCheckOrder(cells: ContestantCells, layout: JudgeLayout, directFieldIds: string[]): string[] {
	if (layout === 'direct') return [...directFieldIds]
	return [...cells.groupBlocks.flatMap((block) => block.cells.map((cell) => cell.subCriterion.id)), ...cells.examinees.flatMap((examinee) => examinee.cells.map((cell) => cell.subCriterion.id))]
}

/** The first cell in `order` whose typed value the predicate rejects; locked cells are skipped. */
export function firstStepMismatch(order: string[], inputRow: Record<string, string>, locked: ReadonlySet<string>, isMismatch: (raw: string, subCriterionId: string) => boolean): string | null {
	for (const subCriterionId of order) {
		if (locked.has(subCriterionId)) continue
		const raw = inputRow[subCriterionId]
		if (raw === undefined || raw === '') continue
		if (isMismatch(raw, subCriterionId)) return subCriterionId
	}
	return null
}

/** The browser's own verdict on a value for a score cell (type=number, min 0, step 0.01, max): a
 * detached input with the same attributes. Client only: false where there is no document. */
export function browserStepMismatch(raw: string, max: number): boolean {
	if (typeof document === 'undefined') return false
	const probe = document.createElement('input')
	probe.type = 'number'
	probe.min = '0'
	probe.step = '0.01'
	probe.max = String(max)
	probe.value = raw
	return !probe.validity.valid
}

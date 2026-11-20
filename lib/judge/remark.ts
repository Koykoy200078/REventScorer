import type { JudgeContestantDetails } from '@/lib/types'

/**
 * Section C, the additional remark (Stage 5 Task 5, spec §6). The 2,000 limit is counted, never
 * enforced: the server trims and keeps the first 2,000 characters (lib/storage-db.ts), so the
 * field has no maxLength.
 */

export const REMARK_LIMIT = 2000

export function remarkLength(value: string): number {
	return value.trim().length
}

export function isOverLimit(value: string): boolean {
	return remarkLength(value) > REMARK_LIMIT
}

/** The hint under the remark, true in every case (critique B3): a save whose three detail fields are
 * all empty sends no details, and the server keeps the old ones (B45). */
export function remarkHint(f: { entryName: string; current: { strand: string; remark: string; additionalInfo: string }; stored?: JudgeContestantDetails }): { tone: 'muted' | 'warning'; text: string } {
	if (isOverLimit(f.current.additionalInfo)) {
		return { tone: 'warning', text: 'Only the first 2,000 characters are kept when you save.' }
	}
	const allEmpty = f.current.strand.trim() === '' && f.current.remark.trim() === '' && f.current.additionalInfo.trim() === ''
	if (allEmpty && (f.stored?.additionalInfo ?? '').trim() !== '') {
		return { tone: 'warning', text: `The remark saved earlier for ${f.entryName} stays: an empty remark is not sent when you press Save.` }
	}
	return { tone: 'muted', text: `A remark typed here is saved with ${f.entryName}'s scores when you press Save.` }
}

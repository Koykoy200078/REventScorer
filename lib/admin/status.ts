// An entry's scoring status in the admin console (spec R47, Stage 5 Task 7 step 2): how many of the judges assigned to
// it have saved it.

import type { JudgeBreakdown } from '@/lib/types'

export type EntryStatusKind = 'complete' | 'in-progress' | 'pending' | 'no-judge'

export interface EntryStatus {
	kind: EntryStatusKind
	saved: number
	assigned: number
}

// saved = the assigned judges whose compiled totals hold the entry (a judge's totals hold only the entries they saved). A
// judge who saved the entry but is no longer assigned is not counted here.
export function entryStatus(contestantId: string, assignedJudgeIds: string[], judgeBreakdown: Array<Pick<JudgeBreakdown, 'judgeId' | 'totalsByContestant'>>): EntryStatus {
	const assigned = new Set(assignedJudgeIds)
	const saved = judgeBreakdown.filter((judge) => assigned.has(judge.judgeId) && Object.prototype.hasOwnProperty.call(judge.totalsByContestant, contestantId)).length
	const count = assigned.size

	if (count === 0) {
		return { kind: 'no-judge', saved: 0, assigned: 0 }
	}

	return { kind: saved >= count ? 'complete' : saved > 0 ? 'in-progress' : 'pending', saved, assigned: count }
}

export function entryStatusLabel(status: EntryStatus): string {
	switch (status.kind) {
		case 'complete':
			return 'All judges saved'
		case 'in-progress':
			return `${status.saved} / ${status.assigned} judges saved`
		case 'pending':
			return 'No scores yet'
		case 'no-judge':
			return 'No judge assigned'
	}
}

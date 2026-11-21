// The Score Audit Matrix's per-entry breakdown dialog (spec R51, Stage 5 Task 7 step 2).

import type { EventCompiledResults, EventScorer } from '@/lib/types'

export interface BreakdownRow {
	judgeId: string
	judgeName: string
	// The judge's total for the entry; null when the judge has not scored it.
	total: number | null
	// false for a judge whose score counts but who is no longer assigned ("(not assigned)").
	assigned: boolean
}

// The assigned judges and every judge whose score counts (perJudgeTotals), in the event's judge order.
export function breakdownRows(event: Pick<EventScorer, 'judges'>, result: Pick<EventCompiledResults['rankings'][number], 'perJudgeTotals'>, assignedJudgeIds: string[]): BreakdownRow[] {
	const assigned = new Set(assignedJudgeIds)
	const totals = result.perJudgeTotals ?? {}

	return event.judges
		.filter((judge) => assigned.has(judge.id) || Object.prototype.hasOwnProperty.call(totals, judge.id))
		.map((judge) => {
			const total = totals[judge.id]
			return { judgeId: judge.id, judgeName: judge.name, total: typeof total === 'number' && Number.isFinite(total) ? total : null, assigned: assigned.has(judge.id) }
		})
}

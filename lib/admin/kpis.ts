// The Live Scoring Dashboard's KPI cards (spec 2.1, Stage 5 Task 7 step 2).

import { scoringKind } from '@/lib/admin/formula'
import type { ProgramLabel } from '@/lib/admin/program'
import { entryStatus } from '@/lib/admin/status'
import type { EventCompiledResults, EventScorer } from '@/lib/types'

export interface AdminKpis {
	entries: number
	// Every entry is a group (a missing entry type is a group): the card says "Groups".
	allGroups: boolean
	byProgram: Record<ProgramLabel, number>
	judges: number
	judgesWithSaves: number
	complete: number
	inProgress: number
	pending: number
	noJudge: number
	percentComplete: number
	// Raw points (standard events) or the 100-point rating (weighted and direct events).
	scale: { value: number; unit: 'raw' | 'rating' }
}

export function adminKpis(
	event: Pick<EventScorer, 'contestants' | 'judges'>,
	compiled: Pick<EventCompiledResults, 'hasWeightedScores' | 'maxPossibleScore' | 'rankings' | 'judgeBreakdown'>,
	programOf: (contestantId: string) => ProgramLabel | null,
	assignedOf: (contestantId: string) => string[],
): AdminKpis {
	const byProgram: Record<ProgramLabel, number> = { BSINT: 0, BSCS: 0 }
	const counts = { complete: 0, inProgress: 0, pending: 0, noJudge: 0 }

	for (const contestant of event.contestants) {
		const program = programOf(contestant.id)
		if (program) {
			byProgram[program] += 1
		}

		const status = entryStatus(contestant.id, assignedOf(contestant.id), compiled.judgeBreakdown)
		if (status.kind === 'complete') counts.complete += 1
		else if (status.kind === 'in-progress') counts.inProgress += 1
		else if (status.kind === 'pending') counts.pending += 1
		else counts.noJudge += 1
	}

	const judgeIds = new Set(event.judges.map((judge) => judge.id))
	const judgesWithSaves = compiled.judgeBreakdown.filter((judge) => judgeIds.has(judge.judgeId) && Object.keys(judge.totalsByContestant).length > 0).length
	const entries = event.contestants.length

	return {
		entries,
		allGroups: entries > 0 && event.contestants.every((contestant) => contestant.entryType !== 'individual'),
		byProgram,
		judges: event.judges.length,
		judgesWithSaves,
		...counts,
		percentComplete: entries > 0 ? (counts.complete * 100) / entries : 0,
		scale: scoringKind(compiled) === 'standard' ? { value: compiled.maxPossibleScore, unit: 'raw' } : { value: 100, unit: 'rating' },
	}
}

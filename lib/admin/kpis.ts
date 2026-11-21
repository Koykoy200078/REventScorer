// The Live Scoring Dashboard's KPI cards (spec 2.1, Stage 5 Task 7 step 2).

import { rankingScore } from '@/lib/admin/analytics'
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

export interface ProgramCohort {
	entries: number
	scored: number
	/** The mean final figure of the program's scored entries (judge count > 0); null when none is scored. */
	average: number | null
}

/** Per program: its entries (every entry with that program) and the mean final figure of the scored ones (spec 2.1). */
export function programCohorts(
	event: Pick<EventScorer, 'contestants'>,
	compiled: Pick<EventCompiledResults, 'hasWeightedScores' | 'rankings'>,
	programOf: (contestantId: string) => ProgramLabel | null,
): Record<ProgramLabel, ProgramCohort> {
	const weighted = scoringKind(compiled) === 'weighted'
	const cohorts: Record<ProgramLabel, ProgramCohort> = { BSINT: { entries: 0, scored: 0, average: null }, BSCS: { entries: 0, scored: 0, average: null } }
	for (const contestant of event.contestants) {
		const program = programOf(contestant.id)
		if (program) cohorts[program].entries += 1
	}
	for (const program of ['BSINT', 'BSCS'] as const) {
		const scores = compiled.rankings.filter((result) => result.judgeCount > 0 && programOf(result.contestantId) === program).map((result) => rankingScore(result, weighted))
		cohorts[program] = { ...cohorts[program], scored: scores.length, average: scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null }
	}
	return cohorts
}

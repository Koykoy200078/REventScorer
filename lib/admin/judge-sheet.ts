// Print Tabulation, a score sheet per judge (design 2026-11-27-judge-score-sheets; owner: "each judge signs their own
// sheet with only their scores", "By parent criterion"). A judge's sheet is read from the compiled results only: its
// figures are the subtotals compile added up into that judge's total, so the sheet and the Tabulation Sheet agree.

import { criterionMaxScore } from '@/lib/admin/analytics'
import { isMemberRowName } from '@/lib/member-rows'
import { directRatingFieldsForEvent } from '@/lib/scoring'
import type { EventCompiledResults, EventScorer, JudgeBreakdown } from '@/lib/types'

export type JudgeSheetColumn = { key: string; label: string; max: number | null }
export type JudgeSheetRow = { contestantId: string; contestantName: string; cells: number[]; total: number }
export type JudgeSheet = { judgeId: string; judgeName: string; columns: JudgeSheetColumn[]; totalLabel: 'Total' | 'Final Rating'; totalMax: number | null; rows: JudgeSheetRow[] }

type RatingPart = keyof NonNullable<JudgeBreakdown['directPartsByContestant']>[string]

const RATING_PARTS: Array<{ key: RatingPart; label: string }> = [
	{ key: 'aveGpa', label: 'AVE / GPA' },
	{ key: 'noat', label: 'NOAT' },
	{ key: 'interview', label: 'Interview' },
]

const round = (value: number) => Math.round(value * 1000) / 1000

// One column per parent criterion. A criterion of member rows counts each team's own members, so its maximum depends
// on the team's size and its heading shows none.
function criterionColumns(event: EventScorer): JudgeSheetColumn[] {
	return event.criteria.map((criterion) => ({
		key: criterion.id,
		label: criterion.name,
		max: criterion.subCriteria.some((subCriterion) => isMemberRowName(subCriterion.name)) ? null : round(criterionMaxScore(criterion)),
	}))
}

// The rating sheet's parts with the maxima compile counts them against. The interview counts each row once, as its
// part does: on an older rating sheet the five interview fields share one row.
function ratingColumns(event: EventScorer): JudgeSheetColumn[] {
	const maxima: Record<RatingPart, number> = { aveGpa: 0, noat: 0, interview: 0 }
	const interviewRowsSeen = new Set<string>()

	for (const field of directRatingFieldsForEvent(event).fields) {
		const max = Number(field.maxScore)
		if (!Number.isFinite(max) || max <= 0) {
			continue
		}
		if (field.key === 'aveGpa' || field.key === 'noat') {
			maxima[field.key] += max
		} else if (!interviewRowsSeen.has(field.subCriterionId)) {
			interviewRowsSeen.add(field.subCriterionId)
			maxima.interview += max
		}
	}

	return RATING_PARTS.map((part) => ({ key: part.key, label: part.label, max: round(maxima[part.key]) }))
}

/** A judge's sheet: the entries that judge's scores count for, in entry order; null when there is none. */
export function judgeSheet(event: EventScorer, compiled: EventCompiledResults, judgeId: string): JudgeSheet | null {
	const judge = compiled.judgeBreakdown.find((entry) => entry.judgeId === judgeId)
	if (!judge) {
		return null
	}

	const totals = judge.totalsByContestant
	const counted = event.contestants.filter((contestant) => Object.prototype.hasOwnProperty.call(totals, contestant.id))
	if (counted.length === 0) {
		return null
	}

	const ratingParts = judge.directPartsByContestant
	const columns = ratingParts ? ratingColumns(event) : criterionColumns(event)
	const rows = counted.map((contestant) => ({
		contestantId: contestant.id,
		contestantName: contestant.name,
		cells: columns.map((column) => (ratingParts ? (ratingParts[contestant.id]?.[column.key as RatingPart] ?? 0) : (judge.criterionTotalsByContestant?.[contestant.id]?.[column.key] ?? 0))),
		total: totals[contestant.id],
	}))
	const maxima = columns.map((column) => column.max)

	return {
		judgeId: judge.judgeId,
		judgeName: judge.judgeName,
		columns,
		totalLabel: ratingParts ? 'Final Rating' : 'Total',
		totalMax: ratingParts ? 100 : maxima.every((max): max is number => max !== null) ? round(maxima.reduce((sum, max) => sum + max, 0)) : null,
		rows,
	}
}

/** The judges with a sheet, in the event's judge order. */
export function judgesWithSheets(event: EventScorer, compiled: EventCompiledResults): string[] {
	return event.judges.filter((judge) => judgeSheet(event, compiled, judge.id) !== null).map((judge) => judge.id)
}

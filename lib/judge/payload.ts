import { buildContestantDetailsPayload } from '@/lib/judge/matrix'
import type { InputContestantDetailsMap, InputScoreMatrix } from '@/lib/judge/matrix'
import { applicableSubCriteriaForContestant } from '@/lib/judge/members'
import type { SubmitScoresRequestBody } from '@/lib/judge/score-queue'
import { parseAndClampScore, round } from '@/lib/judge/score-input'
import type { EventContestant, EventCriterion, ScoreMatrix } from '@/lib/types'

/**
 * The judge save's payload, moved verbatim out of submitScores (components/judge-scoring-form.tsx,
 * Stage 5 Task 5 Step 3). `criteria` are the migrated criteria the form scores, `rawCriteria` the
 * event's own (the legacy 3-field back-fill writes onto their ids).
 */

/** One contestant's row: 0 where a cell does not apply, else the typed value clamped and rounded to
 * 3 decimals; plus, for a migrated legacy 3-field event, the old keys the admin still reads. */
export function buildContestantRow(contestant: EventContestant, criteria: EventCriterion[], rawCriteria: EventCriterion[], scores: InputScoreMatrix): Record<string, number> {
	const row: Record<string, number> = {}

	for (const criterion of criteria) {
		const applicableSubCriterionIds = new Set(applicableSubCriteriaForContestant(criterion, contestant).map((subCriterion) => subCriterion.id))

		for (const subCriterion of criterion.subCriteria) {
			if (!applicableSubCriterionIds.has(subCriterion.id)) {
				row[subCriterion.id] = 0
				continue
			}

			const rawValue = scores[contestant.id]?.[subCriterion.id] ?? '0'
			row[subCriterion.id] = round(parseAndClampScore(rawValue, subCriterion.maxScore))
		}
	}

	// ADD BACKWARD COMPATIBILITY FIELDS FOR ADMIN DASHBOARD
	if (criteria.some((c) => c.id === 'legacy-migrated-criterion')) {
		const oldInterviewId = rawCriteria.flatMap((c) => c.subCriteria).find((sc) => !sc.name.toLowerCase().includes('ave') && !sc.name.toLowerCase().includes('gpa') && sc.name.toLowerCase() !== 'noat')?.id
		const oldAveId = rawCriteria.flatMap((c) => c.subCriteria).find((sc) => sc.name.toLowerCase().includes('ave') || sc.name.toLowerCase().includes('gpa'))?.id
		const oldNoatId = rawCriteria.flatMap((c) => c.subCriteria).find((sc) => sc.name.toLowerCase() === 'noat')?.id

		if (oldInterviewId) {
			const contentScore = row['legacy-migrated-interviewContent'] ?? 0
			const commScore = row['legacy-migrated-interviewComm'] ?? 0
			const persScore = row['legacy-migrated-interviewPers'] ?? 0
			const interestScore = row['legacy-migrated-interviewInterest'] ?? 0
			const specialScore = row['legacy-migrated-interviewSpecial'] ?? 0
			row[oldInterviewId] = round(contentScore + commScore + persScore + interestScore + specialScore)
		}

		if (oldAveId && row['legacy-migrated-aveGpa'] !== undefined) {
			row[oldAveId] = row['legacy-migrated-aveGpa']
		}

		if (oldNoatId && row['legacy-migrated-noat'] !== undefined) {
			row[oldNoatId] = row['legacy-migrated-noat']
		}
	}

	return row
}

/** Every contestant's row, in roster order: the `scores` of the save's body. */
export function buildScorePayload(contestants: EventContestant[], criteria: EventCriterion[], rawCriteria: EventCriterion[], scores: InputScoreMatrix): ScoreMatrix {
	const payload: ScoreMatrix = {}

	for (const contestant of contestants) {
		payload[contestant.id] = buildContestantRow(contestant, criteria, rawCriteria, scores)
	}

	return payload
}

/** The save's body. `contestantDetails` is added only when some contestant has details. */
export function buildSaveRequest(contestantId: string, scores: ScoreMatrix, contestantDetails: InputContestantDetailsMap): SubmitScoresRequestBody {
	const contestantDetailsPayload = buildContestantDetailsPayload(contestantDetails)

	return {
		scores,
		contestantId,
		...(Object.keys(contestantDetailsPayload).length > 0 ? { contestantDetails: contestantDetailsPayload } : {}),
	}
}

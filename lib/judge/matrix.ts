import type { EventContestant, EventCriterion, JudgeContestantDetailsMap, ScoreMatrix } from '@/lib/types'

export type InputScoreMatrix = Record<string, Record<string, string>>
export type InputContestantDetailsMap = Record<string, { strand: string; remark: string; additionalInfo: string }>

export function hasPositiveDraftScore(scores: InputScoreMatrix, contestantId: string, criteria: EventCriterion[], ignoredSubCriterionIds: Set<string> = new Set()): boolean {
	for (const criterion of criteria) {
		for (const subCriterion of criterion.subCriteria) {
			if (ignoredSubCriterionIds.has(subCriterion.id)) {
				continue
			}
			const rawValue = scores[contestantId]?.[subCriterion.id] ?? ''
			const parsedValue = Number.parseFloat(rawValue)
			if (Number.isFinite(parsedValue) && parsedValue > 0) {
				return true
			}
		}
	}

	return false
}

export function detectInitiallyScoredContestants(contestants: EventContestant[], criteria: EventCriterion[], existingScores?: ScoreMatrix, existingSavedContestantIds?: string[]): Set<string> {
	if (Array.isArray(existingSavedContestantIds) && existingSavedContestantIds.length > 0) {
		const validContestantIds = new Set(contestants.map((contestant) => contestant.id))
		const filteredSavedIds = existingSavedContestantIds.filter((contestantId) => validContestantIds.has(contestantId))
		return new Set(filteredSavedIds)
	}

	if (!existingScores) {
		return new Set<string>()
	}

	const initialScored = contestants
		.filter((contestant) => {
			for (const criterion of criteria) {
				for (const subCriterion of criterion.subCriteria) {
					const rawScore = existingScores[contestant.id]?.[subCriterion.id]
					if (typeof rawScore === 'number' && rawScore > 0) {
						return true
					}
				}
			}

			return false
		})
		.map((contestant) => contestant.id)

	return new Set(initialScored)
}

export function buildInputMatrix(contestants: EventContestant[], criteria: EventCriterion[], existingScores?: ScoreMatrix): InputScoreMatrix {
	const matrix: InputScoreMatrix = {}

	for (const contestant of contestants) {
		matrix[contestant.id] = {}

		for (const criterion of criteria) {
			for (const subCriterion of criterion.subCriteria) {
				const existingValue = existingScores?.[contestant.id]?.[subCriterion.id]
				matrix[contestant.id][subCriterion.id] = typeof existingValue === 'number' ? String(existingValue) : '0'
			}
		}
	}

	return matrix
}

export function buildInputContestantDetails(contestants: EventContestant[], existingContestantDetails?: JudgeContestantDetailsMap): InputContestantDetailsMap {
	const details: InputContestantDetailsMap = {}

	for (const contestant of contestants) {
		const existing = existingContestantDetails?.[contestant.id]

		details[contestant.id] = {
			strand: typeof existing?.strand === 'string' ? existing.strand : '',
			remark: typeof existing?.remark === 'string' ? existing.remark : '',
			additionalInfo: typeof existing?.additionalInfo === 'string' ? existing.additionalInfo : '',
		}
	}

	return details
}

export function buildContestantDetailsPayload(contestantDetails: InputContestantDetailsMap): JudgeContestantDetailsMap {
	const payload: JudgeContestantDetailsMap = {}

	for (const [contestantId, details] of Object.entries(contestantDetails)) {
		const strand = details.strand.trim()
		const remark = details.remark.trim()
		const additionalInfo = details.additionalInfo.trim()

		if (!strand && !remark && !additionalInfo) {
			continue
		}

		payload[contestantId] = {
			...(strand ? { strand } : {}),
			...(remark ? { remark } : {}),
			...(additionalInfo ? { additionalInfo } : {}),
		}
	}

	return payload
}

export function formatDate(iso: string): string {
	return new Intl.DateTimeFormat('en-US', {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(new Date(iso))
}

import { deriveDirectRatingConfigFromCriteria, detectDirectRatingScoreFields, normalizeDirectRatingConfig, resolveStrandAlignmentBonus } from '@/lib/direct-rating-config'
import type { CompiledContestantResult, EventCompiledResults, EventScorer, JudgeBreakdown, JudgeSubmission } from '@/lib/types'

function round(value: number): number {
	return Math.round(value * 1000) / 1000
}

function criterionMaxScore(criterion: EventScorer['criteria'][number]): number {
	const directMaxScore = Number(criterion.maxScore)

	if (Number.isFinite(directMaxScore) && directMaxScore > 0) {
		if (!isIndividualCriterion(criterion)) {
			return round(directMaxScore)
		}
	}

	if (!isIndividualCriterion(criterion)) {
		const computedMaxScore = criterion.subCriteria.reduce((sum, subCriterion) => {
			const subCriterionMaxScore = Number(subCriterion.maxScore)
			return sum + (Number.isFinite(subCriterionMaxScore) ? subCriterionMaxScore : 0)
		}, 0)
		return round(computedMaxScore)
	}

	const seenDisplayNames = new Set<string>()
	let computedMaxScore = 0

	for (const subCriterion of criterion.subCriteria) {
		const { memberLabel, displayName } = splitMemberCriterionName(subCriterion.name)
		const memberIndex = memberIndexFromLabel(memberLabel)
		const normalizedName = memberIndex ? displayName.trim() : subCriterion.name.trim()
		const key = normalizedName.toLowerCase()

		if (seenDisplayNames.has(key)) {
			continue
		}

		seenDisplayNames.add(key)
		const subCriterionMaxScore = Number(subCriterion.maxScore)
		computedMaxScore += Number.isFinite(subCriterionMaxScore) ? subCriterionMaxScore : 0
	}

	return round(computedMaxScore)
}

function isIndividualCriterion(criterion: EventScorer['criteria'][number]): boolean {
	if (criterion.name.trim().toLowerCase() === 'individual presentation') {
		return true
	}

	return criterion.subCriteria.some((subCriterion) => {
		const separatorIndex = subCriterion.name.indexOf(' - ')
		if (separatorIndex === -1) {
			return false
		}

		const memberLabel = subCriterion.name.slice(0, separatorIndex).trim()
		return /(\d+)\s*$/.test(memberLabel)
	})
}

function splitMemberCriterionName(name: string): { memberLabel: string; displayName: string } {
	const separatorIndex = name.indexOf(' - ')
	if (separatorIndex === -1) {
		return { memberLabel: 'Individual', displayName: name }
	}

	const memberLabel = name.slice(0, separatorIndex).trim()
	const displayName = name.slice(separatorIndex + 3).trim()
	return { memberLabel: memberLabel || 'Individual', displayName: displayName || name }
}

function memberIndexFromLabel(memberLabel: string): number | null {
	const match = memberLabel.match(/(\d+)\s*$/)
	if (!match) {
		return null
	}

	const index = Number.parseInt(match[1], 10)
	return Number.isFinite(index) && index > 0 ? index : null
}

function normalizedParticipants(contestant: EventScorer['contestants'][number]): string[] {
	if (!Array.isArray(contestant.participants)) {
		return []
	}

	return contestant.participants.map((participant) => participant.trim()).filter((participant) => participant.length > 0)
}

function defaultMemberCountForIndividualCriterion(criterion: EventScorer['criteria'][number]): number {
	let maxMemberCount = 0

	for (const subCriterion of criterion.subCriteria) {
		const memberIndex = memberIndexFromLabel(splitMemberCriterionName(subCriterion.name).memberLabel)
		if (memberIndex && memberIndex > maxMemberCount) {
			maxMemberCount = memberIndex
		}
	}

	return maxMemberCount > 0 ? maxMemberCount : 1
}

function allowedMemberCountForContestant(contestant: EventScorer['contestants'][number], defaultMemberCount: number): number {
	if (contestant.entryType === 'individual') {
		return 1
	}

	const participants = normalizedParticipants(contestant)
	return participants.length > 0 ? participants.length : defaultMemberCount
}

function resolvedMemberLabel(memberLabel: string, contestant: EventScorer['contestants'][number]): string {
	const participants = normalizedParticipants(contestant)
	if (participants.length === 0) {
		const memberIndex = memberIndexFromLabel(memberLabel)
		if (contestant.entryType === 'individual' && memberIndex === 1) {
			return contestant.name
		}

		return memberLabel
	}

	const memberIndex = memberIndexFromLabel(memberLabel)
	if (!memberIndex) {
		return memberLabel
	}

	const participantName = participants[memberIndex - 1]?.trim()
	return participantName && participantName.length > 0 ? participantName : memberLabel
}

type IndividualContestantConfig = {
	allowedSubCriterionIds: Set<string>
	maxScore: number
}

type DirectScoreField = ReturnType<typeof detectDirectRatingScoreFields>[number]

type IndividualParticipantConfig = {
	memberKey: string
	displayLabel: string
	subCriteria: EventScorer['criteria'][number]['subCriteria']
	maxScore: number
}

function buildIndividualContestantConfig(event: EventScorer, individualCriterionIds: Set<string>): Map<string, IndividualContestantConfig> {
	const configs = new Map<string, IndividualContestantConfig>()
	const individualCriteria = event.criteria.filter((criterion) => individualCriterionIds.has(criterion.id))

	for (const contestant of event.contestants) {
		let maxScore = 0
		const allowedSubCriterionIds = new Set<string>()

		for (const criterion of individualCriteria) {
			const allowedMemberCount = allowedMemberCountForContestant(contestant, defaultMemberCountForIndividualCriterion(criterion))

			for (const subCriterion of criterion.subCriteria) {
				const memberIndex = memberIndexFromLabel(splitMemberCriterionName(subCriterion.name).memberLabel)
				if (memberIndex && memberIndex > allowedMemberCount) {
					continue
				}

				allowedSubCriterionIds.add(subCriterion.id)
				const subCriterionMaxScore = Number(subCriterion.maxScore)
				maxScore += Number.isFinite(subCriterionMaxScore) ? subCriterionMaxScore : 0
			}
		}

		configs.set(contestant.id, {
			allowedSubCriterionIds,
			maxScore: round(maxScore),
		})
	}

	return configs
}

function buildIndividualParticipantConfig(event: EventScorer, individualCriterionIds: Set<string>): Map<string, IndividualParticipantConfig[]> {
	const configs = new Map<string, IndividualParticipantConfig[]>()
	const individualCriteria = event.criteria.filter((criterion) => individualCriterionIds.has(criterion.id))

	for (const contestant of event.contestants) {
		const groupedByMember = new Map<string, EventScorer['criteria'][number]['subCriteria']>()

		for (const criterion of individualCriteria) {
			const allowedMemberCount = allowedMemberCountForContestant(contestant, defaultMemberCountForIndividualCriterion(criterion))

			for (const subCriterion of criterion.subCriteria) {
				const { memberLabel } = splitMemberCriterionName(subCriterion.name)
				const memberIndex = memberIndexFromLabel(memberLabel)
				if (memberIndex && memberIndex > allowedMemberCount) {
					continue
				}

				const memberKey = memberLabel
				const existing = groupedByMember.get(memberKey)
				if (existing) {
					existing.push(subCriterion)
				} else {
					groupedByMember.set(memberKey, [subCriterion])
				}
			}
		}

		const members = Array.from(groupedByMember.entries())
			.sort(([leftKey], [rightKey]) => {
				const leftIndex = memberIndexFromLabel(leftKey)
				const rightIndex = memberIndexFromLabel(rightKey)

				if (leftIndex !== null && rightIndex !== null) {
					return leftIndex - rightIndex
				}

				if (leftIndex !== null) {
					return -1
				}

				if (rightIndex !== null) {
					return 1
				}

				return leftKey.localeCompare(rightKey)
			})
			.map(([memberKey, subCriteria]) => ({
				memberKey,
				displayLabel: resolvedMemberLabel(memberKey, contestant),
				subCriteria,
				maxScore: round(subCriteria.reduce((sum, subCriterion) => sum + (Number.isFinite(Number(subCriterion.maxScore)) ? Number(subCriterion.maxScore) : 0), 0)),
			}))

		configs.set(contestant.id, members)
	}

	return configs
}

function scoreJudgeSubmission(
	event: EventScorer,
	submission: JudgeSubmission,
	groupCriterionIds: Set<string>,
	individualCriterionIds: Set<string>,
	individualAllowedSubCriterionIdsByContestant: Map<string, Set<string>>,
): {
	totals: Record<string, number>
	groupTotals: Record<string, number>
	individualTotals: Record<string, number>
} {
	const totals = Object.fromEntries(event.contestants.map((contestant) => [contestant.id, 0]))
	const groupTotals = Object.fromEntries(event.contestants.map((contestant) => [contestant.id, 0]))
	const individualTotals = Object.fromEntries(event.contestants.map((contestant) => [contestant.id, 0]))

	for (const parentCriterion of event.criteria) {
		const isGroupCriterion = groupCriterionIds.has(parentCriterion.id)
		const isIndividualCriterion = individualCriterionIds.has(parentCriterion.id)

		for (const subCriterion of parentCriterion.subCriteria) {
			const maxScore = Number(subCriterion.maxScore)
			const validMaxScore = Number.isFinite(maxScore) && maxScore > 0 ? maxScore : 0

			for (const contestant of event.contestants) {
				if (isIndividualCriterion) {
					const allowedSubCriterionIds = individualAllowedSubCriterionIdsByContestant.get(contestant.id)
					if (allowedSubCriterionIds && !allowedSubCriterionIds.has(subCriterion.id)) {
						continue
					}
				}

				const rawScore = submission.scores[contestant.id]?.[subCriterion.id] ?? 0
				const clampedScore = Math.max(0, Math.min(rawScore, validMaxScore))
				totals[contestant.id] += clampedScore
				if (isGroupCriterion) groupTotals[contestant.id] += clampedScore
				if (isIndividualCriterion) individualTotals[contestant.id] += clampedScore
			}
		}
	}

	for (const contestantId of Object.keys(totals)) {
		totals[contestantId] = round(totals[contestantId])
		groupTotals[contestantId] = round(groupTotals[contestantId])
		individualTotals[contestantId] = round(individualTotals[contestantId])
	}

	return { totals, groupTotals, individualTotals }
}

function directFinalRatingComponentsFromSubmission(
	submission: JudgeSubmission,
	contestantId: string,
	directScoreFields: DirectScoreField[],
	interviewBonusPoints: number,
): { baseFinalRating: number; finalRating: number; appliedInterviewBonus: number } {
	if (directScoreFields.length === 0) {
		return {
			baseFinalRating: 0,
			finalRating: 0,
			appliedInterviewBonus: 0,
		}
	}

	const sanitizedInterviewBonus = Number.isFinite(interviewBonusPoints) && interviewBonusPoints > 0 ? interviewBonusPoints : 0
	let baseTotalPercentage = 0
	let finalTotalPercentage = 0
	let appliedInterviewBonus = 0

	for (const field of directScoreFields) {
		const rawScore = Number(submission.scores[contestantId]?.[field.subCriterionId] ?? 0)
		const maxScore = Number(field.maxScore)
		const validMaxScore = Number.isFinite(maxScore) && maxScore > 0 ? maxScore : 0
		const validScore = Number.isFinite(rawScore) && rawScore > 0 ? rawScore : 0
		const clampedScore = Math.max(0, Math.min(validScore, validMaxScore))

		if (validMaxScore <= 0) {
			continue
		}

		const adjustedScore =
			field.key === 'interview'
				? Math.min(validMaxScore, clampedScore + sanitizedInterviewBonus)
				: clampedScore

		if (field.key === 'interview') {
			appliedInterviewBonus = round(adjustedScore - clampedScore)
		}

		baseTotalPercentage += (clampedScore / validMaxScore) * 100
		finalTotalPercentage += (adjustedScore / validMaxScore) * 100
	}

	return {
		baseFinalRating: round(baseTotalPercentage / directScoreFields.length),
		finalRating: round(finalTotalPercentage / directScoreFields.length),
		appliedInterviewBonus,
	}
}

function hasPositiveScoreForContestant(submission: JudgeSubmission, contestantId: string): boolean {
	const contestantScores = submission.scores[contestantId]

	if (!contestantScores || typeof contestantScores !== 'object') {
		return false
	}

	for (const rawScore of Object.values(contestantScores)) {
		const numericScore = Number(rawScore)
		if (Number.isFinite(numericScore) && numericScore > 0) {
			return true
		}
	}

	return false
}

function savedContestantIdsForSubmission(event: EventScorer, submission: JudgeSubmission): Set<string> {
	const validContestantIds = new Set(event.contestants.map((contestant) => contestant.id))

	if (Array.isArray(submission.savedContestantIds) && submission.savedContestantIds.length > 0) {
		return new Set(submission.savedContestantIds.filter((contestantId) => validContestantIds.has(contestantId)))
	}

	// Backward compatibility for older submissions that do not yet track saved contestant IDs.
	const inferredSavedContestantIds = event.contestants.filter((contestant) => hasPositiveScoreForContestant(submission, contestant.id)).map((contestant) => contestant.id)

	return new Set(inferredSavedContestantIds)
}

function withRanks(sortedResults: CompiledContestantResult[], getScore: (result: CompiledContestantResult) => number): CompiledContestantResult[] {
	let lastScore: number | null = null
	let currentRank = 0

	return sortedResults.map((result, index) => {
		const score = getScore(result)
		if (lastScore === null || Math.abs(score - lastScore) > 0.0001) {
			currentRank = index + 1
			lastScore = score
		}

		return {
			...result,
			rank: currentRank,
		}
	})
}

export function compileEventResults(event: EventScorer): EventCompiledResults {
	const submittedByJudge = new Map(event.submissions.map((submission) => [submission.judgeId, submission]))
	const normalizeLabel = (value: string) => value.trim().toLowerCase()
	const derivedDirectRatingConfig = deriveDirectRatingConfigFromCriteria(event.criteria)
	const directRatingConfig = normalizeDirectRatingConfig(event.directRatingConfig, derivedDirectRatingConfig ?? undefined)
	const directScoreFields = detectDirectRatingScoreFields(event.criteria, directRatingConfig)
	const isDirectRatingEvent = directScoreFields.length > 0
	const maxPossibleScore = isDirectRatingEvent ? 100 : round(event.criteria.reduce((sum, criterion) => sum + criterionMaxScore(criterion), 0))
	const groupCriterionIds = new Set(event.criteria.filter((criterion) => normalizeLabel(criterion.name) === 'group presentation').map((criterion) => criterion.id))
	const individualCriterionIds = new Set(event.criteria.filter((criterion) => isIndividualCriterion(criterion)).map((criterion) => criterion.id))
	const hasFinalOralCriteria = groupCriterionIds.size > 0 && individualCriterionIds.size > 0
	const isFinalOralDefenseEvent = event.eventScoringType ? event.eventScoringType === 'final-oral-defense' : hasFinalOralCriteria
	const hasWeightedScores = !isDirectRatingEvent && isFinalOralDefenseEvent && hasFinalOralCriteria
	const groupMaxScore = hasWeightedScores ? round(event.criteria.filter((criterion) => groupCriterionIds.has(criterion.id)).reduce((sum, criterion) => sum + criterionMaxScore(criterion), 0)) : undefined
	const individualContestantConfigById = buildIndividualContestantConfig(event, individualCriterionIds)
	const individualParticipantConfigByContestantId = buildIndividualParticipantConfig(event, individualCriterionIds)
	const individualMaxScore = hasWeightedScores
		? (() => {
				const participantMaxScores = Array.from(individualParticipantConfigByContestantId.values())
					.flat()
					.map((config) => Number(config.maxScore))
					.filter((value) => Number.isFinite(value) && value > 0)

				if (participantMaxScores.length > 0) {
					return round(participantMaxScores.reduce((sum, value) => sum + value, 0) / participantMaxScores.length)
				}

				const contestantMaxScores = Array.from(individualContestantConfigById.values())
					.map((config) => Number(config.maxScore))
					.filter((value) => Number.isFinite(value) && value > 0)

				if (contestantMaxScores.length > 0) {
					return round(contestantMaxScores.reduce((sum, value) => sum + value, 0) / contestantMaxScores.length)
				}

				return undefined
			})()
		: undefined
	const individualAllowedSubCriterionIdsByContestant = new Map(Array.from(individualContestantConfigById.entries()).map(([contestantId, config]) => [contestantId, config.allowedSubCriterionIds]))

	const aggregateByContestant = new Map(
		event.contestants.map((contestant) => [
			contestant.id,
			{
				contestantId: contestant.id,
				contestantName: contestant.name,
				totalScore: 0,
				totalBaseFinalRating: 0,
				totalBonusPoints: 0,
				totalFinalRating: 0,
				groupTotalScore: 0,
				individualTotalScore: 0,
				judgeCount: 0,
				perJudgeTotals: {} as Record<string, number>,
				participantTotals: {} as Record<string, number>,
			},
		]),
	)

	const judgeBreakdown: JudgeBreakdown[] = []

	for (const judge of event.judges) {
		const submission = submittedByJudge.get(judge.id)

		if (!submission) {
			judgeBreakdown.push({
				judgeId: judge.id,
				judgeName: judge.name,
				submitted: false,
				totalsByContestant: {},
			})
			continue
		}

		const judgeTotals = scoreJudgeSubmission(event, submission, groupCriterionIds, individualCriterionIds, individualAllowedSubCriterionIdsByContestant)
		const savedContestantIds = savedContestantIdsForSubmission(event, submission)

		if (savedContestantIds.size === 0) {
			judgeBreakdown.push({
				judgeId: judge.id,
				judgeName: judge.name,
				submitted: false,
				totalsByContestant: {},
			})
			continue
		}

		const directComponentsByContestant = new Map<string, { baseFinalRating: number; bonusPoints: number; finalRating: number }>()
		if (isDirectRatingEvent) {
			for (const contestant of event.contestants) {
				if (!savedContestantIds.has(contestant.id)) {
					continue
				}

				const strand = submission.contestantDetails?.[contestant.id]?.strand ?? ''
				const bonusPoints = round(resolveStrandAlignmentBonus(strand, directRatingConfig).bonusPoints)
				const directRatingComponents = directFinalRatingComponentsFromSubmission(submission, contestant.id, directScoreFields, bonusPoints)

				directComponentsByContestant.set(contestant.id, {
					baseFinalRating: directRatingComponents.baseFinalRating,
					bonusPoints: directRatingComponents.appliedInterviewBonus,
					finalRating: directRatingComponents.finalRating,
				})
			}
		}

		const totalsByContestant = isDirectRatingEvent
			? Object.fromEntries(Array.from(directComponentsByContestant.entries()).map(([contestantId, components]) => [contestantId, components.finalRating]))
			: Object.fromEntries(Object.entries(judgeTotals.totals).filter(([contestantId]) => savedContestantIds.has(contestantId)))

		for (const contestant of event.contestants) {
			if (!savedContestantIds.has(contestant.id)) {
				continue
			}

			const aggregate = aggregateByContestant.get(contestant.id)
			if (!aggregate) {
				continue
			}

			const directComponents = directComponentsByContestant.get(contestant.id)
			const contestantJudgeTotal = isDirectRatingEvent ? (directComponents?.finalRating ?? 0) : (judgeTotals.totals[contestant.id] ?? 0)
			aggregate.totalScore += contestantJudgeTotal
			aggregate.totalBaseFinalRating += directComponents?.baseFinalRating ?? 0
			aggregate.totalBonusPoints += directComponents?.bonusPoints ?? 0
			aggregate.totalFinalRating += directComponents?.finalRating ?? 0
			aggregate.judgeCount += 1
			aggregate.perJudgeTotals[judge.id] = contestantJudgeTotal

			if (isDirectRatingEvent) {
				continue
			}

			aggregate.groupTotalScore += judgeTotals.groupTotals[contestant.id] ?? 0
			aggregate.individualTotalScore += judgeTotals.individualTotals[contestant.id] ?? 0

			const participantConfigs = individualParticipantConfigByContestantId.get(contestant.id) ?? []
			for (const participantConfig of participantConfigs) {
				const participantScore = participantConfig.subCriteria.reduce((sum, subCriterion) => {
					const rawScore = submission.scores[contestant.id]?.[subCriterion.id] ?? 0
					const maxScore = Number(subCriterion.maxScore)
					const validMaxScore = Number.isFinite(maxScore) && maxScore > 0 ? maxScore : 0
					return sum + Math.max(0, Math.min(rawScore, validMaxScore))
				}, 0)

				aggregate.participantTotals[participantConfig.memberKey] = round((aggregate.participantTotals[participantConfig.memberKey] ?? 0) + participantScore)
			}
		}

		judgeBreakdown.push({
			judgeId: judge.id,
			judgeName: judge.name,
			submitted: true,
			submittedAt: submission.submittedAt,
			totalsByContestant,
		})
	}

	const results: CompiledContestantResult[] = event.contestants
		.map((contestant) => {
			const aggregate = aggregateByContestant.get(contestant.id)
			const individualContestantConfig = individualContestantConfigById.get(contestant.id)

			if (!aggregate) {
				return {
					rank: 0,
					contestantId: contestant.id,
					contestantName: contestant.name,
					averageScore: 0,
					totalScore: 0,
					judgeCount: 0,
					perJudgeTotals: {},
				}
			}

			const averageScore = aggregate.judgeCount > 0 ? round(aggregate.totalScore / aggregate.judgeCount) : 0
			const baseFinalRating = aggregate.judgeCount > 0 ? round(aggregate.totalBaseFinalRating / aggregate.judgeCount) : 0
			const bonusPoints = aggregate.judgeCount > 0 ? round(aggregate.totalBonusPoints / aggregate.judgeCount) : 0
			const finalRating = aggregate.judgeCount > 0 ? round(aggregate.totalFinalRating / aggregate.judgeCount) : 0
			const groupAverageScore = aggregate.judgeCount > 0 ? round(aggregate.groupTotalScore / aggregate.judgeCount) : 0
			const individualAverageScore = aggregate.judgeCount > 0 ? round(aggregate.individualTotalScore / aggregate.judgeCount) : 0
			const participantConfigs = individualParticipantConfigByContestantId.get(contestant.id) ?? []
			const participantScores = participantConfigs.map((participantConfig) => {
				const accumulated = aggregate.participantTotals[participantConfig.memberKey] ?? 0
				const participantAverage = aggregate.judgeCount > 0 ? round(accumulated / aggregate.judgeCount) : 0
				const participantMax = Number(participantConfig.maxScore)
				const participantRating = hasWeightedScores && Number.isFinite(participantMax) && participantMax > 0 ? round((participantAverage / participantMax) * 100) : undefined

				return {
					participantLabel: participantConfig.displayLabel,
					averageScore: participantAverage,
					maxScore: participantConfig.maxScore,
					rating: participantRating,
				}
			})

			const participantAverageBase = participantScores.length > 0 ? round(participantScores.reduce((sum, participant) => sum + participant.averageScore, 0) / participantScores.length) : individualAverageScore
			const participantMaxBase = participantScores.length > 0 ? round(participantScores.reduce((sum, participant) => sum + participant.maxScore, 0) / participantScores.length) : round(Number(individualContestantConfig?.maxScore ?? 0))
			const effectiveGroupMaxScore = hasWeightedScores && groupMaxScore !== undefined && groupMaxScore > 0 ? groupMaxScore : undefined
			const effectiveIndividualMaxScore = hasWeightedScores ? (participantMaxBase > 0 ? participantMaxBase : individualMaxScore !== undefined && individualMaxScore > 0 ? individualMaxScore : undefined) : undefined
			const groupRating = effectiveGroupMaxScore !== undefined ? round((groupAverageScore / effectiveGroupMaxScore) * 100) : undefined
			const individualRating = effectiveIndividualMaxScore !== undefined ? round((participantAverageBase / effectiveIndividualMaxScore) * 100) : undefined
			const weightedScore = hasWeightedScores && aggregate.judgeCount > 0 && groupRating !== undefined && individualRating !== undefined ? round(groupRating * 0.6 + individualRating * 0.4) : undefined

			return {
				rank: 0,
				contestantId: contestant.id,
				contestantName: contestant.name,
				averageScore: isDirectRatingEvent ? finalRating : averageScore,
				finalRating: isDirectRatingEvent ? finalRating : undefined,
				baseFinalRating: isDirectRatingEvent ? baseFinalRating : undefined,
				bonusPoints: isDirectRatingEvent ? bonusPoints : undefined,
				groupAverageScore: hasWeightedScores ? groupAverageScore : undefined,
				individualAverageScore: hasWeightedScores ? individualAverageScore : undefined,
				groupRating,
				individualRating,
				weightedScore,
				totalScore: round(aggregate.totalScore),
				judgeCount: aggregate.judgeCount,
				perJudgeTotals: aggregate.perJudgeTotals,
				participantScores,
			}
		})
		.sort((left, right) => {
			const leftScore = isDirectRatingEvent ? (left.finalRating ?? left.averageScore) : hasWeightedScores ? (left.weightedScore ?? 0) : left.averageScore
			const rightScore = isDirectRatingEvent ? (right.finalRating ?? right.averageScore) : hasWeightedScores ? (right.weightedScore ?? 0) : right.averageScore
			if (rightScore !== leftScore) {
				return rightScore - leftScore
			}

			return left.contestantName.localeCompare(right.contestantName)
		})

	const submittedJudgeCount = judgeBreakdown.filter((judge) => judge.submitted).length
	const rankByScore = (result: CompiledContestantResult) => (isDirectRatingEvent ? (result.finalRating ?? result.averageScore) : hasWeightedScores ? (result.weightedScore ?? result.averageScore) : result.averageScore)

	return {
		maxPossibleScore,
		groupMaxScore,
		individualMaxScore,
		hasWeightedScores,
		submittedJudgeCount,
		totalJudgeCount: event.judges.length,
		rankings: withRanks(results, rankByScore),
		judgeBreakdown,
	}
}

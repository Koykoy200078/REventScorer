import type { CompiledContestantResult, EventCompiledResults, EventScorer, JudgeBreakdown, JudgeSubmission } from '@/lib/types'

function round(value: number): number {
	return Math.round(value * 1000) / 1000
}

function criterionMaxScore(criterion: EventScorer['criteria'][number]): number {
	const directMaxScore = Number(criterion.maxScore)

	if (Number.isFinite(directMaxScore) && directMaxScore > 0) {
		return round(directMaxScore)
	}

	const computedMaxScore = criterion.subCriteria.reduce((sum, subCriterion) => {
		const subCriterionMaxScore = Number(subCriterion.maxScore)
		return sum + (Number.isFinite(subCriterionMaxScore) ? subCriterionMaxScore : 0)
	}, 0)

	return round(computedMaxScore)
}

function scoreJudgeSubmission(event: EventScorer, submission: JudgeSubmission): Record<string, number> {
	const totals = Object.fromEntries(event.contestants.map((contestant) => [contestant.id, 0]))

	for (const parentCriterion of event.criteria) {
		for (const subCriterion of parentCriterion.subCriteria) {
			const maxScore = Number(subCriterion.maxScore)
			const validMaxScore = Number.isFinite(maxScore) && maxScore > 0 ? maxScore : 0

			for (const contestant of event.contestants) {
				const rawScore = submission.scores[contestant.id]?.[subCriterion.id] ?? 0
				const clampedScore = Math.max(0, Math.min(rawScore, validMaxScore))
				totals[contestant.id] += clampedScore
			}
		}
	}

	for (const contestantId of Object.keys(totals)) {
		totals[contestantId] = round(totals[contestantId])
	}

	return totals
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

function withRanks(sortedResults: CompiledContestantResult[]): CompiledContestantResult[] {
	let lastAverageScore: number | null = null
	let currentRank = 0

	return sortedResults.map((result, index) => {
		if (lastAverageScore === null || Math.abs(result.averageScore - lastAverageScore) > 0.0001) {
			currentRank = index + 1
			lastAverageScore = result.averageScore
		}

		return {
			...result,
			rank: currentRank,
		}
	})
}

export function compileEventResults(event: EventScorer): EventCompiledResults {
	const submittedByJudge = new Map(event.submissions.map((submission) => [submission.judgeId, submission]))
	const maxPossibleScore = round(event.criteria.reduce((sum, criterion) => sum + criterionMaxScore(criterion), 0))

	const aggregateByContestant = new Map(
		event.contestants.map((contestant) => [
			contestant.id,
			{
				contestantId: contestant.id,
				contestantName: contestant.name,
				totalScore: 0,
				judgeCount: 0,
				perJudgeTotals: {} as Record<string, number>,
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

		const judgeTotals = scoreJudgeSubmission(event, submission)
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

		const totalsByContestant = Object.fromEntries(Object.entries(judgeTotals).filter(([contestantId]) => savedContestantIds.has(contestantId)))

		for (const contestant of event.contestants) {
			if (!savedContestantIds.has(contestant.id)) {
				continue
			}

			const aggregate = aggregateByContestant.get(contestant.id)
			if (!aggregate) {
				continue
			}

			const contestantJudgeTotal = judgeTotals[contestant.id] ?? 0
			aggregate.totalScore += contestantJudgeTotal
			aggregate.judgeCount += 1
			aggregate.perJudgeTotals[judge.id] = contestantJudgeTotal
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

			return {
				rank: 0,
				contestantId: contestant.id,
				contestantName: contestant.name,
				averageScore,
				totalScore: round(aggregate.totalScore),
				judgeCount: aggregate.judgeCount,
				perJudgeTotals: aggregate.perJudgeTotals,
			}
		})
		.sort((left, right) => {
			if (right.averageScore !== left.averageScore) {
				return right.averageScore - left.averageScore
			}

			return left.contestantName.localeCompare(right.contestantName)
		})

	const submittedJudgeCount = judgeBreakdown.filter((judge) => judge.submitted).length

	return {
		maxPossibleScore,
		submittedJudgeCount,
		totalJudgeCount: event.judges.length,
		rankings: withRanks(results),
		judgeBreakdown,
	}
}

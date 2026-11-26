// Program, participant, section and sub-criterion analytics of the admin console. Moved verbatim from
// components/admin-live-dashboard.tsx (Stage 5 Task 7 step 1).

import { roundAnalytics } from '@/lib/admin/format'
import { deriveDirectRatingConfigFromCriteria, detectDirectRatingScoreFields, normalizeDirectRatingConfig } from '@/lib/direct-rating-config'
import { applyMasterNoat } from '@/lib/scoring'
import { assignedJudgeIdsForContestant } from '@/lib/admin/judges'
import { isSubCriterionApplicableToContestant, resolveMemberLabelForContestant, splitMemberCriterionName } from '@/lib/admin/members'
import { extractDynamicTeamName, type ProgramLabel, resolveProgramLabel } from '@/lib/admin/program'
import type { EventCompiledResults, EventContestant, EventCriterion, EventScorer } from '@/lib/types'

export interface ProgramTopTeam {
	program: ProgramLabel
	contestantId: string
	teamName: string
	contestantName: string
	// The overall rank in the event.
	rank: number
	// The competition rank within the program (1, 1, 3), Stage 5 Task 7 ruling R54.
	programRank: number
	score: number
	totalScore: number
	judgeCount: number
}

// Competition ranks (1, 1, 3) over entries already sorted best first: equal scores (within 0.0001) share a rank.
function competitionRanks<T>(sorted: T[], score: (entry: T) => number): number[] {
	const ranks: number[] = []
	sorted.forEach((entry, index) => {
		ranks.push(index > 0 && Math.abs(score(entry) - score(sorted[index - 1])) <= 0.0001 ? ranks[index - 1] : index + 1)
	})
	return ranks
}

export interface ProgramTopParticipant {
	program: ProgramLabel
	teamName: string
	contestantId: string
	contestantName: string
	participantLabel: string
	participantAverageScore: number
	participantMaxScore: number
	participantRating: number
	section: string
	rank: number
}

export interface SectionRankingEntry {
	contestantId: string
	contestantName: string
	program: ProgramLabel | null
	score: number
	totalScore: number
	rank: number
	judgeCount: number
}

export interface ProgramSubCriterionRankingEntry {
	program: ProgramLabel
	teamName: string
	contestantId: string
	contestantName: string
	participantLabel: string
	subCriterionName: string
	averageScore: number
	maxScore: number
	rating: number
	rank: number
}

export interface ProgramSubCriterionRankingGroup {
	program: ProgramLabel
	subCriterionKey: string
	subCriterionName: string
	entries: ProgramSubCriterionRankingEntry[]
}

export function rankingScore(result: EventCompiledResults['rankings'][number], _useWeighted: boolean): number {
	if (typeof result.finalRating === 'number' && Number.isFinite(result.finalRating)) {
		return result.finalRating
	}

	return _useWeighted ? (result.weightedScore ?? result.averageScore) : result.averageScore
}

export function criterionMaxScore(criterion: EventCriterion): number {
	const directMaxScore = Number(criterion.maxScore)

	if (Number.isFinite(directMaxScore) && directMaxScore > 0) {
		return directMaxScore
	}

	return criterion.subCriteria.reduce((sum, subCriterion) => {
		const subCriterionMaxScore = Number(subCriterion.maxScore)
		return sum + (Number.isFinite(subCriterionMaxScore) ? subCriterionMaxScore : 0)
	}, 0)
}

export function teamsByProgram(rankings: EventCompiledResults['rankings'], contestantsById: Map<string, EventContestant>, manualAssignments: Record<string, ProgramLabel | null>, useWeighted: boolean): Record<ProgramLabel, ProgramTopTeam[]> {
	const grouped: Record<ProgramLabel, ProgramTopTeam[]> = {
		BSINT: [],
		BSCS: [],
	}

	for (const result of rankings) {
		const manual = manualAssignments[result.contestantId]
		const contestant = contestantsById.get(result.contestantId)
		const detectedProgram = resolveProgramLabel(result.contestantName, contestant, manual)

		if (!detectedProgram) {
			continue
		}

		const score = rankingScore(result, useWeighted)
		if (!Number.isFinite(score) || score <= 0) {
			continue
		}

		grouped[detectedProgram].push({
			program: detectedProgram,
			contestantId: result.contestantId,
			teamName: extractDynamicTeamName(result.contestantName),
			contestantName: result.contestantName,
			rank: result.rank,
			programRank: 0,
			score,
			totalScore: result.totalScore,
			judgeCount: result.judgeCount,
		})
	}

	for (const program of ['BSINT', 'BSCS'] as const) {
		grouped[program].sort((a, b) => b.score - a.score)
		const ranks = competitionRanks(grouped[program], (team) => team.score)
		grouped[program] = grouped[program].map((team, index) => ({ ...team, programRank: ranks[index] }))
	}

	return grouped
}

export function participantAnalyticsScore(participant: NonNullable<EventCompiledResults['rankings'][number]['participantScores']>[number]): number {
	if (typeof participant.rating === 'number' && Number.isFinite(participant.rating)) {
		return participant.rating
	}

	if (!Number.isFinite(participant.maxScore) || participant.maxScore <= 0) {
		return 0
	}

	return (participant.averageScore / participant.maxScore) * 100
}

export function participantRankingsByProgram(rankings: EventCompiledResults['rankings'], contestantsById: Map<string, EventContestant>, manualAssignments: Record<string, ProgramLabel | null>): Record<ProgramLabel, ProgramTopParticipant[]> {
	const grouped: Record<ProgramLabel, ProgramTopParticipant[]> = {
		BSINT: [],
		BSCS: [],
	}

	for (const result of rankings) {
		const manual = manualAssignments[result.contestantId]
		const contestant = contestantsById.get(result.contestantId)
		const detectedProgram = resolveProgramLabel(result.contestantName, contestant, manual)

		if (!detectedProgram || !Array.isArray(result.participantScores) || result.participantScores.length === 0) {
			continue
		}

		for (const participant of result.participantScores) {
			const participantRating = participantAnalyticsScore(participant)
			if (!Number.isFinite(participantRating) || participantRating <= 0 || participant.averageScore <= 0) {
				continue
			}

			let section = 'N/A'
			if (contestant?.section) {
				const raw = contestant.section.trim()
				section = !/section/i.test(raw) && raw.length <= 3 ? `Section ${raw.toUpperCase()}` : raw
			} else {
				const strandStr = (result.directDetails?.strand || '').trim()
				if (strandStr) {
					const clean = strandStr.replace(/\b(BSCS|BSINT)\b/gi, '').trim()
					if (clean) {
						section = !/section/i.test(clean) && clean.length <= 3 ? `Section ${clean.toUpperCase()}` : clean
					}
				}
				if (section === 'N/A') {
					const nameMatch = result.contestantName.match(/\b(?:section\s+|-)?([A-Z])\b/i)
					if (nameMatch) {
						section = `Section ${nameMatch[1].toUpperCase()}`
					}
				}
			}

			grouped[detectedProgram].push({
				program: detectedProgram,
				teamName: extractDynamicTeamName(result.contestantName),
				contestantId: result.contestantId,
				contestantName: result.contestantName,
				participantLabel: participant.participantLabel,
				participantAverageScore: participant.averageScore,
				participantMaxScore: participant.maxScore,
				participantRating,
				section,
				rank: 0,
			})
		}
	}

	// One ranking per program with competition ranks; the section is a label only (owner, 2026-11-21).
	for (const program of ['BSINT', 'BSCS'] as const) {
		grouped[program].sort((left, right) => {
			if (right.participantRating !== left.participantRating) {
				return right.participantRating - left.participantRating
			}

			if (right.participantAverageScore !== left.participantAverageScore) {
				return right.participantAverageScore - left.participantAverageScore
			}

			if (left.contestantName !== right.contestantName) {
				return left.contestantName.localeCompare(right.contestantName)
			}

			return left.participantLabel.localeCompare(right.participantLabel)
		})

		const ranks = competitionRanks(grouped[program], (entry) => entry.participantRating)
		grouped[program] = grouped[program].map((entry, index) => ({ ...entry, rank: ranks[index] }))
	}

	return grouped
}

export function rankingsBySection(
	rankings: EventCompiledResults['rankings'],
	contestantsById: Map<string, EventContestant>,
	manualAssignments: Record<string, ProgramLabel | null>,
	useWeighted: boolean,
): Map<string, SectionRankingEntry[]> {
	const bySection = new Map<string, SectionRankingEntry[]>()

	for (const result of rankings) {
		const contestant = contestantsById.get(result.contestantId)
		const manual = manualAssignments[result.contestantId]
		const detectedProgram = resolveProgramLabel(result.contestantName, contestant, manual)

		// Resolve section
		let section = ''
		if (contestant?.section) {
			const raw = contestant.section.trim()
			section = !/section/i.test(raw) && raw.length <= 3 ? `Section ${raw.toUpperCase()}` : raw
		} else {
			const strandStr = (result.directDetails?.strand || '').trim()
			if (strandStr) {
				const clean = strandStr.replace(/\b(BSCS|BSINT)\b/gi, '').trim()
				if (clean) {
					section = !/section/i.test(clean) && clean.length <= 3 ? `Section ${clean.toUpperCase()}` : clean
				}
			}
			if (!section) {
				const nameMatch = result.contestantName.match(/\b(?:section\s+|-)?([A-Z])\b/i)
				if (nameMatch) {
					section = `Section ${nameMatch[1].toUpperCase()}`
				}
			}
		}

		if (!section) {
			continue
		}

		const score = rankingScore(result, useWeighted)
		if (!Number.isFinite(score) || score <= 0) {
			continue
		}

		if (!bySection.has(section)) {
			bySection.set(section, [])
		}

		bySection.get(section)!.push({
			contestantId: result.contestantId,
			contestantName: result.contestantName,
			program: detectedProgram,
			score,
			totalScore: result.totalScore,
			rank: 0,
			judgeCount: result.judgeCount,
		})
	}

	// Sort each section's entries by score descending and assign ranks
	for (const [, entries] of bySection) {
		entries.sort((a, b) => b.score - a.score)
		let currentRank = 0
		let lastScore: number | null = null
		for (let i = 0; i < entries.length; i++) {
			if (lastScore === null || Math.abs(entries[i].score - lastScore) > 0.0001) {
				currentRank = i + 1
				lastScore = entries[i].score
			}
			entries[i].rank = currentRank
		}
	}

	// Sort sections alphabetically
	return new Map([...bySection.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

export function hasPositiveScoreForContestant(submission: EventScorer['submissions'][number], contestantId: string): boolean {
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

export function savedContestantIdsForAnalytics(event: EventScorer, submission: EventScorer['submissions'][number]): Set<string> {
	const validContestantIds = new Set(event.contestants.map((contestant) => contestant.id))

	if (Array.isArray(submission.savedContestantIds) && submission.savedContestantIds.length > 0) {
		return new Set(submission.savedContestantIds.filter((contestantId) => validContestantIds.has(contestantId)))
	}

	// B56/B76 (owner 2026-11-26): a judge with no saved list left, as a save that took them off their only entry leaves
	// them, counts only entries they are still assigned to. No slots (or no judge on any slot) means every judge, as before.
	const inferredSavedContestantIds = event.contestants
		.filter((contestant) => assignedJudgeIdsForContestant(event, contestant.id).includes(submission.judgeId) && hasPositiveScoreForContestant(submission, contestant.id))
		.map((contestant) => contestant.id)

	return new Set(inferredSavedContestantIds)
}

export function subCriteriaRankingsByProgram(event: EventScorer, manualAssignments: Record<string, ProgramLabel | null>): Record<ProgramLabel, ProgramSubCriterionRankingGroup[]> {
	type SubCriterionAccumulator = {
		program: ProgramLabel
		teamName: string
		contestantId: string
		contestantName: string
		participantLabel: string
		subCriterionName: string
		totalScore: number
		maxScore: number
		judgeCount: number
	}

	const grouped: Record<ProgramLabel, Map<string, Map<string, SubCriterionAccumulator>>> = {
		BSINT: new Map(),
		BSCS: new Map(),
	}

	const subCriterionNamesByKey = new Map<string, string>()
	const subCriterionOrder = new Map<string, number>()
	let nextOrder = 0

	const criteriaForSubCriteriaRanking = event.criteria.filter((criterion) => Array.isArray(criterion.subCriteria) && criterion.subCriteria.length > 0)

	if (criteriaForSubCriteriaRanking.length === 0) {
		return {
			BSINT: [],
			BSCS: [],
		}
	}

	for (const criterion of criteriaForSubCriteriaRanking) {
		for (const subCriterion of criterion.subCriteria) {
			const { displayName } = splitMemberCriterionName(subCriterion.name)
			const subCriterionKey = `${criterion.id}::${displayName}`

			if (!subCriterionOrder.has(subCriterionKey)) {
				subCriterionOrder.set(subCriterionKey, nextOrder)
				nextOrder += 1
			}

			if (!subCriterionNamesByKey.has(subCriterionKey)) {
				subCriterionNamesByKey.set(subCriterionKey, displayName)
			}
		}
	}

	// Review F10 (D42): on direct-rating events the master NOAT counts here too, as in compile. Which entries a judge saved
	// is read from the stored submission, so a master value never makes an entry count.
	// Review round 3 H3: the NOAT field as compile reads it (with the event's rating-sheet config), so a master is clamped
	// to the same maximum as in the NOAT column.
	const directRatingConfig = normalizeDirectRatingConfig(event.directRatingConfig, deriveDirectRatingConfigFromCriteria(event.criteria) ?? undefined)
	const noatField = detectDirectRatingScoreFields(event.criteria, directRatingConfig).find((field) => field.key === 'noat')
	const noatSubCriterionId = noatField?.subCriterionId
	for (const storedSubmission of event.submissions) {
		const savedContestantIds = savedContestantIdsForAnalytics(event, storedSubmission)
		const submission = noatSubCriterionId ? applyMasterNoat(storedSubmission, event, noatSubCriterionId, noatField?.maxScore) : storedSubmission

		if (savedContestantIds.size === 0) {
			continue
		}

		for (const contestant of event.contestants) {
			if (!savedContestantIds.has(contestant.id)) {
				continue
			}

			const manual = manualAssignments[contestant.id]
			const program = resolveProgramLabel(contestant.name, contestant, manual)

			if (!program) {
				continue
			}

			for (const criterion of criteriaForSubCriteriaRanking) {
				for (const subCriterion of criterion.subCriteria) {
					if (!isSubCriterionApplicableToContestant(subCriterion.name, contestant, criterion)) {
						continue
					}

					const { memberLabel, displayName } = splitMemberCriterionName(subCriterion.name)
					const participantLabel = resolveMemberLabelForContestant(memberLabel, contestant)
					const subCriterionKey = `${criterion.id}::${displayName}`
					const entryKey = `${contestant.id}::${participantLabel}`

					const rawMaxScore = Number(subCriterion.maxScore)
					const maxScore = Number.isFinite(rawMaxScore) && rawMaxScore > 0 ? rawMaxScore : 0
					const rawScore = Number(submission.scores[contestant.id]?.[subCriterion.id] ?? 0)
					const clampedScore = Math.max(0, Math.min(rawScore, maxScore))

					let criterionGroupedByProgram = grouped[program].get(subCriterionKey)
					if (!criterionGroupedByProgram) {
						criterionGroupedByProgram = new Map<string, SubCriterionAccumulator>()
						grouped[program].set(subCriterionKey, criterionGroupedByProgram)
					}

					const existing = criterionGroupedByProgram.get(entryKey)
					if (existing) {
						existing.totalScore += clampedScore
						existing.judgeCount += 1
						existing.maxScore = Math.max(existing.maxScore, maxScore)
					} else {
						criterionGroupedByProgram.set(entryKey, {
							program,
							teamName: extractDynamicTeamName(contestant.name),
							contestantId: contestant.id,
							contestantName: contestant.name,
							participantLabel,
							subCriterionName: displayName,
							totalScore: clampedScore,
							maxScore,
							judgeCount: 1,
						})
					}
				}
			}
		}
	}

	const programGroups: Record<ProgramLabel, ProgramSubCriterionRankingGroup[]> = {
		BSINT: [],
		BSCS: [],
	}

	for (const program of ['BSINT', 'BSCS'] as const) {
		const groups = Array.from(grouped[program].entries())
			.map(([subCriterionKey, entriesByContestant]) => {
				const rankedEntries = Array.from(entriesByContestant.values())
					.map((entry) => {
						const averageScore = entry.judgeCount > 0 ? roundAnalytics(entry.totalScore / entry.judgeCount) : 0
						const rating = entry.maxScore > 0 ? roundAnalytics((averageScore / entry.maxScore) * 100) : 0

						return {
							program: entry.program,
							teamName: entry.teamName,
							contestantId: entry.contestantId,
							contestantName: entry.contestantName,
							participantLabel: entry.participantLabel,
							subCriterionName: entry.subCriterionName,
							averageScore,
							maxScore: entry.maxScore,
							rating,
							rank: 0,
						}
					})
					.filter((entry) => entry.averageScore > 0 && entry.rating > 0)
					.sort((left, right) => {
						if (right.rating !== left.rating) {
							return right.rating - left.rating
						}

						if (right.averageScore !== left.averageScore) {
							return right.averageScore - left.averageScore
						}

						if (left.contestantName !== right.contestantName) {
							return left.contestantName.localeCompare(right.contestantName)
						}

						return left.participantLabel.localeCompare(right.participantLabel)
					})

				let currentRank = 0
				let lastRating: number | null = null

				const entriesWithRank = rankedEntries.map((entry, index) => {
					if (lastRating === null || Math.abs(entry.rating - lastRating) > 0.0001) {
						currentRank = index + 1
						lastRating = entry.rating
					}

					return {
						...entry,
						rank: currentRank,
					}
				})

				return {
					program,
					subCriterionKey,
					subCriterionName: subCriterionNamesByKey.get(subCriterionKey) ?? subCriterionKey,
					entries: entriesWithRank,
				}
			})
			.filter((group) => group.entries.length > 0)

		groups.sort((left, right) => {
			const leftOrder = subCriterionOrder.get(left.subCriterionKey) ?? Number.MAX_SAFE_INTEGER
			const rightOrder = subCriterionOrder.get(right.subCriterionKey) ?? Number.MAX_SAFE_INTEGER
			return leftOrder - rightOrder
		})

		programGroups[program] = groups
	}

	return programGroups
}

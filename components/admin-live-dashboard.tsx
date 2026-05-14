'use client'

import Link from 'next/link'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { AdminScoreRealtimeUpdate, EventCompiledResults, EventContestant, EventCriterion, EventScorer } from '@/lib/types'

type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
type ProgramLabel = 'BSINT' | 'BSCS'

interface ProgramTopTeam {
	program: ProgramLabel
	teamName: string
	contestantName: string
	rank: number
	score: number
	totalScore: number
	judgeCount: number
}

interface ProgramTopParticipant {
	program: ProgramLabel
	teamName: string
	contestantId: string
	contestantName: string
	participantLabel: string
	participantAverageScore: number
	participantMaxScore: number
	participantRating: number
	rank: number
}

interface ProgramSubCriterionRankingEntry {
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

interface ProgramSubCriterionRankingGroup {
	program: ProgramLabel
	subCriterionKey: string
	subCriterionName: string
	entries: ProgramSubCriterionRankingEntry[]
}

interface AdminLiveDashboardProps {
	initialEvent: EventScorer
	initialCompiled: EventCompiledResults
	baseUrl: string
}

interface AdminEventResponse {
	event: EventScorer
	compiled: EventCompiledResults
	error?: string
}

function formatDate(iso: string): string {
	return new Intl.DateTimeFormat('en-US', {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(new Date(iso))
}

function formatScore(value: number): string {
	return value.toFixed(2)
}

function formatPercent(value: number): string {
	return `${value.toFixed(2)}%`
}

function rankingScore(result: EventCompiledResults['rankings'][number], _useWeighted: boolean): number {
	return _useWeighted ? (result.weightedScore ?? result.averageScore) : result.averageScore
}

function criterionMaxScore(criterion: EventCriterion): number {
	const directMaxScore = Number(criterion.maxScore)

	if (Number.isFinite(directMaxScore) && directMaxScore > 0) {
		return directMaxScore
	}

	return criterion.subCriteria.reduce((sum, subCriterion) => {
		const subCriterionMaxScore = Number(subCriterion.maxScore)
		return sum + (Number.isFinite(subCriterionMaxScore) ? subCriterionMaxScore : 0)
	}, 0)
}

function isIndividualPresentationCriterion(criterion: EventCriterion): boolean {
	return criterion.name.trim().toLowerCase() === 'individual presentation'
}

function splitMemberCriterionName(name: string): { memberLabel: string; displayName: string } {
	const normalizedName = name.trim()
	const separatorIndex = normalizedName.indexOf(' - ')
	if (separatorIndex === -1) {
		return { memberLabel: 'Individual', displayName: normalizedName || name }
	}

	const memberLabel = normalizedName.slice(0, separatorIndex).trim()
	const displayName = normalizedName.slice(separatorIndex + 3).trim()
	const isMemberLabel = /^member\s*\d+$/i.test(memberLabel) || /^individual(?:\s*\d+)?$/i.test(memberLabel)

	if (!isMemberLabel) {
		return {
			memberLabel: 'Individual',
			displayName: normalizedName || name,
		}
	}

	return {
		memberLabel: memberLabel || 'Individual',
		displayName: displayName || normalizedName || name,
	}
}

function memberIndexFromLabel(memberLabel: string): number | null {
	const match = memberLabel.match(/(\d+)\s*$/)
	if (!match) {
		return null
	}

	const index = Number.parseInt(match[1], 10)
	return Number.isFinite(index) && index > 0 ? index : null
}

function normalizedParticipants(contestant: EventContestant): string[] {
	if (!Array.isArray(contestant.participants)) {
		return []
	}

	return contestant.participants.map((participant) => participant.trim()).filter((participant) => participant.length > 0)
}

function defaultMemberCountFromSubCriteria(subCriteria: EventCriterion['subCriteria']): number {
	let maxMemberCount = 0

	for (const subCriterion of subCriteria) {
		const memberIndex = memberIndexFromLabel(splitMemberCriterionName(subCriterion.name).memberLabel)
		if (memberIndex && memberIndex > maxMemberCount) {
			maxMemberCount = memberIndex
		}
	}

	return maxMemberCount > 0 ? maxMemberCount : 1
}

function allowedMemberCountForContestant(contestant: EventContestant, subCriteria: EventCriterion['subCriteria']): number {
	if (contestant.entryType === 'individual') {
		return 1
	}

	const participants = normalizedParticipants(contestant)
	return participants.length > 0 ? participants.length : defaultMemberCountFromSubCriteria(subCriteria)
}

function isSubCriterionApplicableToContestant(subCriterionName: string, contestant: EventContestant, criterion: EventCriterion): boolean {
	const memberIndex = memberIndexFromLabel(splitMemberCriterionName(subCriterionName).memberLabel)
	if (!memberIndex) {
		return true
	}

	return memberIndex <= allowedMemberCountForContestant(contestant, criterion.subCriteria)
}

function resolveMemberLabelForContestant(memberLabel: string, contestant: EventContestant): string {
	const participants = normalizedParticipants(contestant)
	const memberIndex = memberIndexFromLabel(memberLabel)

	if (!memberIndex) {
		if (contestant.entryType === 'individual') {
			const trimmedName = contestant.name.trim()
			return trimmedName.length > 0 ? trimmedName : 'Individual'
		}

		return extractDynamicTeamName(contestant.name)
	}

	if (participants.length === 0) {
		if (contestant.entryType === 'individual' && memberIndex === 1) {
			return contestant.name
		}

		return memberLabel
	}

	const participantName = participants[memberIndex - 1]?.trim()
	return participantName && participantName.length > 0 ? participantName : memberLabel
}

function displaySubCriterionNameForContestant(subCriterionName: string, contestant: EventContestant): string {
	const { memberLabel, displayName } = splitMemberCriterionName(subCriterionName)
	const resolvedLabel = resolveMemberLabelForContestant(memberLabel, contestant)
	return `${resolvedLabel} - ${displayName}`
}

function connectionLabel(state: ConnectionState): string {
	if (state === 'connected') {
		return 'Live connected'
	}

	if (state === 'reconnecting') {
		return 'Reconnecting'
	}

	if (state === 'connecting') {
		return 'Connecting'
	}

	return 'Live offline'
}

function connectionBadgeClass(state: ConnectionState): string {
	if (state === 'connected') {
		return 'rounded-full border border-emerald-300 bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow-sm'
	}

	return 'rounded-full border border-rose-300 bg-rose-600 px-3 py-1 text-xs font-semibold text-white shadow-sm'
}

function detectProgramLabel(contestantName: string): ProgramLabel | null {
	const uppercaseName = contestantName.toUpperCase()

	if (/\bBSINT\b/.test(uppercaseName)) {
		return 'BSINT'
	}

	if (/\bBSCS\b/.test(uppercaseName)) {
		return 'BSCS'
	}

	return null
}

function extractDynamicTeamName(contestantName: string): string {
	const cleanedName = contestantName
		.replace(/\bBSINT\b|\bBSCS\b/gi, ' ')
		.replace(/[|_]+/g, ' ')
		.replace(/\s{2,}/g, ' ')
		.replace(/^[\s\-:|/\\]+|[\s\-:|/\\]+$/g, '')
		.trim()

	return cleanedName.length > 0 ? cleanedName : contestantName
}

function teamsByProgram(rankings: EventCompiledResults['rankings'], manualAssignments: Record<string, ProgramLabel | null>, useWeighted: boolean): Record<ProgramLabel, ProgramTopTeam[]> {
	const grouped: Record<ProgramLabel, ProgramTopTeam[]> = {
		BSINT: [],
		BSCS: [],
	}

	for (const result of rankings) {
		const manual = manualAssignments[result.contestantId]
		const detectedProgram = manual !== undefined ? manual : detectProgramLabel(result.contestantName)

		if (!detectedProgram) {
			continue
		}

		grouped[detectedProgram].push({
			program: detectedProgram,
			teamName: extractDynamicTeamName(result.contestantName),
			contestantName: result.contestantName,
			rank: result.rank,
			score: rankingScore(result, useWeighted),
			totalScore: result.totalScore,
			judgeCount: result.judgeCount,
		})
	}

	grouped.BSINT.sort((a, b) => b.score - a.score)
	grouped.BSCS.sort((a, b) => b.score - a.score)

	return grouped
}

function participantAnalyticsScore(participant: NonNullable<EventCompiledResults['rankings'][number]['participantScores']>[number]): number {
	if (typeof participant.rating === 'number' && Number.isFinite(participant.rating)) {
		return participant.rating
	}

	if (!Number.isFinite(participant.maxScore) || participant.maxScore <= 0) {
		return 0
	}

	return (participant.averageScore / participant.maxScore) * 100
}

function participantRankingsByProgram(rankings: EventCompiledResults['rankings'], manualAssignments: Record<string, ProgramLabel | null>): Record<ProgramLabel, ProgramTopParticipant[]> {
	const grouped: Record<ProgramLabel, ProgramTopParticipant[]> = {
		BSINT: [],
		BSCS: [],
	}

	for (const result of rankings) {
		const manual = manualAssignments[result.contestantId]
		const detectedProgram = manual !== undefined ? manual : detectProgramLabel(result.contestantName)

		if (!detectedProgram || !Array.isArray(result.participantScores) || result.participantScores.length === 0) {
			continue
		}

		for (const participant of result.participantScores) {
			grouped[detectedProgram].push({
				program: detectedProgram,
				teamName: extractDynamicTeamName(result.contestantName),
				contestantId: result.contestantId,
				contestantName: result.contestantName,
				participantLabel: participant.participantLabel,
				participantAverageScore: participant.averageScore,
				participantMaxScore: participant.maxScore,
				participantRating: participantAnalyticsScore(participant),
				rank: 0,
			})
		}
	}

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

		let currentRank = 0
		let lastScore: number | null = null

		grouped[program] = grouped[program].map((entry, index) => {
			if (lastScore === null || Math.abs(entry.participantRating - lastScore) > 0.0001) {
				currentRank = index + 1
				lastScore = entry.participantRating
			}

			return {
				...entry,
				rank: currentRank,
			}
		})
	}

	return grouped
}

function roundAnalytics(value: number): number {
	return Math.round(value * 1000) / 1000
}

function hasPositiveScoreForContestant(submission: EventScorer['submissions'][number], contestantId: string): boolean {
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

function savedContestantIdsForAnalytics(event: EventScorer, submission: EventScorer['submissions'][number]): Set<string> {
	const validContestantIds = new Set(event.contestants.map((contestant) => contestant.id))

	if (Array.isArray(submission.savedContestantIds) && submission.savedContestantIds.length > 0) {
		return new Set(submission.savedContestantIds.filter((contestantId) => validContestantIds.has(contestantId)))
	}

	const inferredSavedContestantIds = event.contestants.filter((contestant) => hasPositiveScoreForContestant(submission, contestant.id)).map((contestant) => contestant.id)

	return new Set(inferredSavedContestantIds)
}

function subCriteriaRankingsByProgram(event: EventScorer, manualAssignments: Record<string, ProgramLabel | null>): Record<ProgramLabel, ProgramSubCriterionRankingGroup[]> {
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

	for (const submission of event.submissions) {
		const savedContestantIds = savedContestantIdsForAnalytics(event, submission)

		if (savedContestantIds.size === 0) {
			continue
		}

		for (const contestant of event.contestants) {
			if (!savedContestantIds.has(contestant.id)) {
				continue
			}

			const manual = manualAssignments[contestant.id]
			const program = manual !== undefined ? manual : detectProgramLabel(contestant.name)

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
		const groups = Array.from(grouped[program].entries()).map(([subCriterionKey, entriesByContestant]) => {
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

		groups.sort((left, right) => {
			const leftOrder = subCriterionOrder.get(left.subCriterionKey) ?? Number.MAX_SAFE_INTEGER
			const rightOrder = subCriterionOrder.get(right.subCriterionKey) ?? Number.MAX_SAFE_INTEGER
			return leftOrder - rightOrder
		})

		programGroups[program] = groups
	}

	return programGroups
}

function assignedJudgeIdsForContestant(event: EventScorer, contestantId: string): string[] {
	if (!Array.isArray(event.presentationSlots) || event.presentationSlots.length === 0) {
		return event.judges.map((judge) => judge.id)
	}

	const hasAnyJudgeAssigned = event.presentationSlots.some((slot) => slot.judgeIds.length > 0)
	if (!hasAnyJudgeAssigned) {
		return event.judges.map((judge) => judge.id)
	}

	const slot = event.presentationSlots.find((candidate) => candidate.contestantId === contestantId)
	if (!slot) {
		return event.judges.map((judge) => judge.id)
	}

	return slot.judgeIds
}

function buildJudgeAssignmentDrafts(event: EventScorer): Record<string, string[]> {
	const drafts: Record<string, string[]> = {}

	for (const contestant of event.contestants) {
		drafts[contestant.id] = assignedJudgeIdsForContestant(event, contestant.id)
	}

	return drafts
}

function sameJudgeAssignments(left: string[], right: string[]): boolean {
	if (left.length !== right.length) {
		return false
	}

	const leftSet = new Set(left)
	return right.every((judgeId) => leftSet.has(judgeId))
}

export function AdminLiveDashboard({ initialEvent, initialCompiled, baseUrl }: AdminLiveDashboardProps) {
	const [event, setEvent] = useState(initialEvent)
	const [compiled, setCompiled] = useState(initialCompiled)
	const [connectionState, setConnectionState] = useState<ConnectionState>('connecting')
	const [lastSignalAt, setLastSignalAt] = useState<string | null>(null)
	const [refreshError, setRefreshError] = useState<string | null>(null)
	const [isRefreshing, setIsRefreshing] = useState(false)
	const [copiedLink, setCopiedLink] = useState<string | null>(null)
	const [manualAssignments, setManualAssignments] = useState<Record<string, ProgramLabel | null>>({})
	const [judgeAssignmentDrafts, setJudgeAssignmentDrafts] = useState<Record<string, string[]>>(() => buildJudgeAssignmentDrafts(initialEvent))
	const [editingJudgeAssignmentForContestantId, setEditingJudgeAssignmentForContestantId] = useState<string | null>(null)
	const [savingJudgeAssignmentForContestantId, setSavingJudgeAssignmentForContestantId] = useState<string | null>(null)
	const [showAllTeamAnalytics, setShowAllTeamAnalytics] = useState<Record<ProgramLabel, boolean>>({ BSINT: false, BSCS: false })
	const [showAllParticipantAnalytics, setShowAllParticipantAnalytics] = useState<Record<ProgramLabel, boolean>>({ BSINT: false, BSCS: false })
	const [showAllSubCriteriaAnalytics, setShowAllSubCriteriaAnalytics] = useState<Record<ProgramLabel, boolean>>({ BSINT: false, BSCS: false })
	const refreshInFlight = useRef(false)

	const useWeightedScores = Boolean(compiled.hasWeightedScores)
	const analyticsPreviewLimit = 3
	const compiledTableColumnCount = useWeightedScores ? 9 : 6
	const contestantsById = useMemo(() => new Map(event.contestants.map((contestant) => [contestant.id, contestant])), [event.contestants])
	const resolvedProgramByContestantId = useMemo(() => {
		const map = new Map<string, ProgramLabel | null>()

		for (const result of compiled.rankings) {
			const manual = manualAssignments[result.contestantId]
			const currentProgram = manual !== undefined ? manual : detectProgramLabel(result.contestantName)
			map.set(result.contestantId, currentProgram)
		}

		return map
	}, [compiled.rankings, manualAssignments])
	const allContestantsBSINT = useMemo(() => compiled.rankings.length > 0 && compiled.rankings.every((result) => resolvedProgramByContestantId.get(result.contestantId) === 'BSINT'), [compiled.rankings, resolvedProgramByContestantId])
	const allContestantsBSCS = useMemo(() => compiled.rankings.length > 0 && compiled.rankings.every((result) => resolvedProgramByContestantId.get(result.contestantId) === 'BSCS'), [compiled.rankings, resolvedProgramByContestantId])
	const winners = useMemo(() => compiled.rankings.slice(0, 3), [compiled.rankings])
	const analyticsByProgram = useMemo(() => teamsByProgram(compiled.rankings, manualAssignments, useWeightedScores), [compiled.rankings, manualAssignments, useWeightedScores])
	const participantAnalyticsByProgram = useMemo(() => participantRankingsByProgram(compiled.rankings, manualAssignments), [compiled.rankings, manualAssignments])
	const subCriteriaAnalyticsByProgram = useMemo(() => subCriteriaRankingsByProgram(event, manualAssignments), [event, manualAssignments])

	useEffect(() => {
		setJudgeAssignmentDrafts(buildJudgeAssignmentDrafts(event))
	}, [event])

	const copyLink = useCallback(async (value: string) => {
		try {
			if (navigator.clipboard && window.isSecureContext) {
				await navigator.clipboard.writeText(value)
			} else {
				const textArea = document.createElement('textarea')
				textArea.value = value
				textArea.style.position = 'fixed'
				textArea.style.left = '-999999px'
				textArea.style.top = '-999999px'
				document.body.appendChild(textArea)
				textArea.focus()
				textArea.select()
				const success = document.execCommand('copy')
				textArea.remove()
				if (!success) throw new Error('Copy command failed')
			}
			setCopiedLink(value)
			window.setTimeout(() => {
				setCopiedLink((currentValue) => (currentValue === value ? null : currentValue))
			}, 1800)
		} catch (err) {
			console.error('Clipboard copy failed:', err)
			setCopiedLink(null)
		}
	}, [])

	const refreshDashboard = useCallback(async () => {
		if (refreshInFlight.current) {
			return
		}

		refreshInFlight.current = true
		setIsRefreshing(true)
		setRefreshError(null)

		try {
			const response = await fetch(`/api/admin/events/${event.id}`, {
				cache: 'no-store',
			})

			const responseBody = (await response.json()) as AdminEventResponse

			if (!response.ok) {
				throw new Error(responseBody.error ?? 'Unable to refresh results.')
			}

			setEvent(responseBody.event)
			setCompiled(responseBody.compiled)
		} catch (error) {
			setRefreshError(error instanceof Error ? error.message : 'Unable to refresh results.')
		} finally {
			refreshInFlight.current = false
			setIsRefreshing(false)
		}
	}, [event.id])

	const setProgramForAllContestants = useCallback(
		(program: ProgramLabel | null) => {
			setManualAssignments((previous) => {
				const next = { ...previous }

				for (const result of compiled.rankings) {
					next[result.contestantId] = program
				}

				return next
			})
		},
		[compiled.rankings],
	)

	const toggleJudgeAssignment = useCallback(
		(contestantId: string, judgeId: string) => {
			setJudgeAssignmentDrafts((previous) => {
				const currentJudgeIds = previous[contestantId] ?? assignedJudgeIdsForContestant(event, contestantId)
				const nextJudgeIds = new Set(currentJudgeIds)

				if (nextJudgeIds.has(judgeId)) {
					if (nextJudgeIds.size === 1) {
						return previous
					}

					nextJudgeIds.delete(judgeId)
				} else {
					nextJudgeIds.add(judgeId)
				}

				return {
					...previous,
					[contestantId]: Array.from(nextJudgeIds),
				}
			})
		},
		[event],
	)

	const saveJudgeAssignment = useCallback(
		async (contestantId: string) => {
			const judgeIds = judgeAssignmentDrafts[contestantId] ?? assignedJudgeIdsForContestant(event, contestantId)

			if (judgeIds.length === 0) {
				setRefreshError('At least 1 judge must be assigned to each participant.')
				return
			}

			setSavingJudgeAssignmentForContestantId(contestantId)
			setRefreshError(null)

			try {
				const response = await fetch(`/api/admin/events/${event.id}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ contestantId, judgeIds }),
				})

				const responseBody = (await response.json()) as AdminEventResponse

				if (!response.ok) {
					throw new Error(responseBody.error ?? 'Unable to update judge assignment.')
				}

				setEvent(responseBody.event)
				setCompiled(responseBody.compiled)
				setEditingJudgeAssignmentForContestantId(null)
			} catch (error) {
				setRefreshError(error instanceof Error ? error.message : 'Unable to update judge assignment.')
			} finally {
				setSavingJudgeAssignmentForContestantId(null)
			}
		},
		[event, judgeAssignmentDrafts],
	)

	useEffect(() => {
		const eventId = event.id
		let socket: WebSocket | null = null
		let reconnectTimer: number | null = null
		let isDisposed = false

		const parsePort = (value: string | undefined, fallback: number) => {
			const parsed = Number.parseInt(value || '', 10)
			return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
		}

		const backendPort = parsePort(process.env.NEXT_PUBLIC_BACKEND_PORT, 3007)
		const backendHttpPort = parsePort(process.env.NEXT_PUBLIC_BACKEND_HTTP_PORT, backendPort)

		function buildSocketCandidates(): string[] {
			const host = window.location.hostname
			const isSecurePage = window.location.protocol === 'https:'
			const query = `?eventId=${encodeURIComponent(eventId)}`
			const path = `/ws/admin-scores${query}`

			const candidates: string[] = []
			const pushUnique = (url: string) => {
				if (!candidates.includes(url)) candidates.push(url)
			}

			if (isSecurePage) {
				pushUnique(`wss://${host}:${backendPort}${path}`)
				return candidates
			}

			const portCandidates = Array.from(new Set([backendHttpPort, backendPort]))

			// On HTTP pages, prefer the backend's plain HTTP listener first.
			for (const port of portCandidates) {
				pushUnique(`ws://${host}:${port}${path}`)
			}

			return candidates
		}

		function connectSocket() {
			if (isDisposed) {
				return
			}

			setConnectionState((current) => (current === 'connected' ? 'reconnecting' : 'connecting'))
			const candidates = buildSocketCandidates()

			const openCandidate = (index: number) => {
				if (isDisposed) {
					return
				}

				if (index >= candidates.length) {
					setConnectionState('reconnecting')
					reconnectTimer = window.setTimeout(connectSocket, 1700)
					return
				}

				const socketUrl = candidates[index]
				let opened = false
				let advanced = false

				const advance = () => {
					if (advanced || isDisposed) {
						return
					}
					advanced = true
					openCandidate(index + 1)
				}

				try {
					const currentSocket = new WebSocket(socketUrl)
					socket = currentSocket

					currentSocket.onopen = () => {
						if (isDisposed) {
							return
						}

						opened = true
						setConnectionState('connected')
					}

					currentSocket.onmessage = async (messageEvent) => {
						try {
							const decoded = JSON.parse(String(messageEvent.data)) as {
								type?: string
								data?: AdminScoreRealtimeUpdate
							}

							if (decoded.type !== 'score:update' || !decoded.data) {
								return
							}

							setLastSignalAt(decoded.data.submittedAt ?? new Date().toISOString())
							await refreshDashboard()
						} catch {
							// Ignore malformed websocket frames and keep session alive.
						}
					}

					currentSocket.onerror = () => {
						if (!opened) {
							try {
								currentSocket.close()
							} catch {
								// ignore close failures
							}
							advance()
							return
						}

						currentSocket.close()
					}

					currentSocket.onclose = () => {
						if (isDisposed) {
							return
						}

						if (!opened) {
							advance()
							return
						}

						setConnectionState('reconnecting')
						reconnectTimer = window.setTimeout(connectSocket, 1700)
					}
				} catch {
					advance()
				}
			}

			openCandidate(0)
		}

		connectSocket()

		return () => {
			isDisposed = true
			setConnectionState('disconnected')

			if (reconnectTimer !== null) {
				window.clearTimeout(reconnectTimer)
			}

			if (socket) {
				if (socket.readyState === WebSocket.CONNECTING) {
					socket.onopen = () => {
						if (socket) {
							socket.close()
						}
					}
				} else {
					socket.close()
				}
			}
		}
	}, [event.id, refreshDashboard])

	return (
		<>
			{/* SCREEN VIEW */}
			<div className='min-h-screen bg-transparent px-4 py-8 sm:px-8 print:hidden'>
				<div className='mx-auto w-full max-w-7xl space-y-6'>
					<header className='rounded-[30px] border border-[var(--border-soft)] bg-[var(--surface-strong)] p-6 shadow-[var(--shadow-soft)] backdrop-blur-xl sm:p-8'>
						<div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
							<div>
								<p className='text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]'>Admin Console</p>
								<h1 className='mt-2 text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl'>{event.title}</h1>
								{event.description ? <p className='mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]'>{event.description}</p> : null}
								<p className='mt-3 text-xs text-[var(--text-muted)]'>
									Created {formatDate(event.createdAt)}
									{event.createdBy ? ` by ${event.createdBy}` : ''}
								</p>
							</div>

							<div className='flex flex-wrap items-center gap-2 print:hidden'>
								<span className={connectionBadgeClass(connectionState)}>{connectionLabel(connectionState)}</span>
								{lastSignalAt ? <span className='rounded-full border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-1 text-xs text-[var(--text-secondary)]'>Last update {formatDate(lastSignalAt)}</span> : null}
								<button type='button' onClick={() => window.print()} className='rounded-full border border-[var(--border-strong)] bg-[var(--surface-muted)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface)]'>
									Print Results
								</button>
								{/* <button type='button' onClick={refreshDashboard} disabled={isRefreshing} className='rounded-full border border-[var(--border-strong)] bg-[var(--surface-muted)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-70'>
									{isRefreshing ? 'Refreshing...' : 'Refresh now'}
								</button> */}
								<Link href='/' className='inline-flex items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-muted)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface)]'>
									Back to Dashboard
								</Link>
							</div>
						</div>

						<div className='mt-5 grid gap-3 sm:grid-cols-4'>
							<div className='rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] p-3'>
								<p className='text-xs text-[var(--text-muted)]'>Contestants</p>
								<p className='text-xl font-semibold text-[var(--text-primary)]'>{event.contestants.length}</p>
							</div>
							<div className='rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] p-3'>
								<p className='text-xs text-[var(--text-muted)]'>Judges</p>
								<p className='text-xl font-semibold text-[var(--text-primary)]'>{event.judges.length}</p>
							</div>
							<div className='rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] p-3'>
								<p className='text-xs text-[var(--text-muted)]'>Submitted</p>
								<p className='text-xl font-semibold text-[var(--text-primary)]'>{compiled.submittedJudgeCount}</p>
							</div>
							<div className='rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] p-3'>
								<p className='text-xs text-[var(--text-muted)]'>{useWeightedScores ? 'Raw Score Scale' : 'Score Scale'}</p>
								<p className='text-xl font-semibold text-[var(--text-primary)]'>{formatScore(compiled.maxPossibleScore)}</p>
							</div>
						</div>
					</header>

					{refreshError ? <section className='rounded-2xl border border-rose-400/40 bg-rose-300/15 px-4 py-3 text-sm text-rose-100 dark:text-rose-200'>{refreshError}</section> : null}

					<section className='rounded-[28px] border border-[var(--border-soft)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)] sm:p-8'>
						<h2 className='text-xl font-semibold text-[var(--text-primary)]'>Winners</h2>
						<p className='mt-1 text-sm text-[var(--text-secondary)]'>{useWeightedScores ? 'Final Oral Defense is shown separately by Group and Individual scoring. Final Score = (Group Rating x 60%) + (Individual Rating x 40%).' : 'Final Score is computed as Total Score / Total Judges.'}</p>

						{winners.length > 0 ? (
							<div className='mt-4 grid gap-3 sm:grid-cols-3'>
								{winners.map((winner) => {
									const winnerContestant = contestantsById.get(winner.contestantId)
									const isIndividual = winnerContestant?.entryType === 'individual'

									return (
										<article key={winner.contestantId} className='rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] p-4'>
											<p className='text-xs uppercase tracking-wide text-[var(--text-muted)]'>Rank #{winner.rank}</p>
											<div className='mt-1 flex items-center gap-2'>
												<p className='text-lg font-semibold text-[var(--text-primary)]'>{winner.contestantName}</p>
												{isIndividual ? <span className='rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800'>Individual</span> : null}
											</div>
											{useWeightedScores ? (
												<>
													<p className='mt-2 text-sm text-[var(--text-secondary)]'>
														Final Score: <span className='font-semibold'>{formatScore(winner.weightedScore ?? winner.averageScore)}</span>
													</p>
													<p className='text-xs text-[var(--text-muted)]'>
														Group Avg: {formatScore(winner.groupAverageScore ?? 0)} · Individual Avg: {formatScore(winner.individualAverageScore ?? 0)}
													</p>
												</>
											) : (
												<p className='mt-2 text-sm text-[var(--text-secondary)]'>
													Average: <span className='font-semibold'>{formatScore(winner.averageScore)}</span>
												</p>
											)}
											<p className='text-xs text-[var(--text-muted)]'>Judges counted: {winner.judgeCount}</p>
										</article>
									)
								})}
							</div>
						) : (
							<p className='mt-3 text-sm text-[var(--text-secondary)]'>No contestant data available.</p>
						)}
					</section>

					<section className='rounded-[28px] border border-[var(--border-soft)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)] sm:p-8'>
						<h2 className='text-xl font-semibold text-[var(--text-primary)]'>Program Analytics</h2>
						<p className='mt-1 text-sm text-[var(--text-secondary)]'>Top teams and Individual Presentation participant rankings separated for BSINT and BSCS.</p>

						<div className='mt-4 grid gap-6 sm:grid-cols-2'>
							{(['BSINT', 'BSCS'] as ProgramLabel[]).map((program) => {
								const teams = analyticsByProgram[program]
								const participants = participantAnalyticsByProgram[program]
								const subCriteriaGroups = subCriteriaAnalyticsByProgram[program]
								const showAllTeams = showAllTeamAnalytics[program]
								const showAllParticipants = showAllParticipantAnalytics[program]
								const showAllSubCriteria = showAllSubCriteriaAnalytics[program]
								const visibleTeams = showAllTeams ? teams : teams.slice(0, analyticsPreviewLimit)
								const visibleParticipants = showAllParticipants ? participants : participants.slice(0, analyticsPreviewLimit)
								const hasSubCriteriaOverflow = subCriteriaGroups.some((group) => group.entries.length > analyticsPreviewLimit)

								return (
									<article key={program} className='rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] overflow-hidden'>
										<div className='p-4 border-b border-[var(--border-soft)] bg-[var(--surface)]'>
											<h3 className='text-lg font-bold uppercase tracking-wide text-[var(--text-primary)]'>{program} Rankings</h3>
										</div>

										<div className='p-4'>
											<div className='flex items-center justify-between gap-2'>
												<p className='text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]'>Team Rankings</p>
												{teams.length > analyticsPreviewLimit ? (
													<button type='button' onClick={() => setShowAllTeamAnalytics((previous) => ({ ...previous, [program]: !showAllTeams }))} className='rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1 text-[11px] font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-muted)]'>
														{showAllTeams ? 'Show Top 3' : 'View All'}
													</button>
												) : null}
											</div>
											{teams.length > 0 ? (
												<div className='mt-2 overflow-x-auto'>
													<table className='min-w-full text-sm text-left'>
														<thead className='bg-[var(--surface-muted)] text-[var(--text-secondary)]'>
															<tr>
																<th className='px-4 py-2 font-semibold'>Rank</th>
																<th className='px-4 py-2 font-semibold'>Team</th>
																<th className='px-4 py-2 font-semibold text-right'>Score</th>
															</tr>
														</thead>
														<tbody className='divide-y divide-[var(--border-soft)]'>
															{visibleTeams.map((team, idx) => (
																<tr key={team.contestantName} className={idx === 0 ? 'bg-[var(--surface)] font-medium' : ''}>
																	<td className='px-4 py-3'>
																		{idx === 0 && <span className='mr-1 inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-700 w-5 h-5 text-xs'>★</span>}#{idx + 1} <span className='text-[var(--text-muted)] text-xs ml-1'>(Overall #{team.rank})</span>
																	</td>
																	<td className='px-4 py-3'>
																		<div className='text-[var(--text-primary)]'>{team.teamName}</div>
																		<div className='text-[10px] text-[var(--text-muted)]'>{team.contestantName}</div>
																	</td>
																	<td className='px-4 py-3 text-right text-[var(--text-primary)]'>{formatScore(team.score)}</td>
																</tr>
															))}
														</tbody>
													</table>
												</div>
											) : (
												<div className='mt-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] p-3 text-center text-sm text-[var(--text-secondary)]'>No {program} teams found in Compiled Scores.</div>
											)}
										</div>

										<div className='border-t border-[var(--border-soft)] bg-[var(--surface)] p-4'>
											<div className='flex items-center justify-between gap-2'>
												<p className='text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]'>Individual Subcriteria Participant Rankings</p>
												{participants.length > analyticsPreviewLimit ? (
													<button type='button' onClick={() => setShowAllParticipantAnalytics((previous) => ({ ...previous, [program]: !showAllParticipants }))} className='rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1 text-[11px] font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-muted)]'>
														{showAllParticipants ? 'Show Top 3' : 'View All'}
													</button>
												) : null}
											</div>
											{participants.length > 0 ? (
												<div className='mt-2 overflow-x-auto'>
													<table className='min-w-full text-sm text-left'>
														<thead className='bg-[var(--surface-muted)] text-[var(--text-secondary)]'>
															<tr>
																<th className='px-4 py-2 font-semibold'>Rank</th>
																<th className='px-4 py-2 font-semibold'>Participant</th>
																<th className='px-4 py-2 font-semibold'>Team</th>
																<th className='px-4 py-2 font-semibold text-right'>Individual Score</th>
															</tr>
														</thead>
														<tbody className='divide-y divide-[var(--border-soft)]'>
															{visibleParticipants.map((participant, participantIndex) => (
																<tr key={`${participant.contestantId}-${participant.participantLabel}-${participantIndex}`} className={participantIndex === 0 ? 'bg-[var(--surface)] font-medium' : ''}>
																	<td className='px-4 py-3'>
																		{participant.rank === 1 && <span className='mr-1 inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-700 w-5 h-5 text-xs'>★</span>}#{participant.rank}
																	</td>
																	<td className='px-4 py-3'>
																		<div className='text-[var(--text-primary)]'>{participant.participantLabel}</div>
																		<div className='text-[10px] text-[var(--text-muted)]'>{participant.contestantName}</div>
																	</td>
																	<td className='px-4 py-3 text-[var(--text-primary)]'>{participant.teamName}</td>
																	<td className='px-4 py-3 text-right text-[var(--text-primary)]'>
																		{formatScore(participant.participantAverageScore)} / {formatScore(participant.participantMaxScore)} ({formatPercent(participant.participantRating)})
																	</td>
																</tr>
															))}
														</tbody>
													</table>
												</div>
											) : (
												<div className='mt-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-muted)] p-3 text-center text-sm text-[var(--text-secondary)]'>No participant subcriteria scores found for {program}.</div>
											)}
										</div>

										<div className='border-t border-[var(--border-soft)] bg-[var(--surface)] p-4'>
											<div className='flex items-center justify-between gap-2'>
												<p className='text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]'>Subcriteria Rankings (Per Subcriteria)</p>
												{hasSubCriteriaOverflow ? (
													<button type='button' onClick={() => setShowAllSubCriteriaAnalytics((previous) => ({ ...previous, [program]: !showAllSubCriteria }))} className='rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1 text-[11px] font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-muted)]'>
														{showAllSubCriteria ? 'Show Top 3' : 'View All'}
													</button>
												) : null}
											</div>
											{subCriteriaGroups.length > 0 ? (
												<div className='mt-3 space-y-3'>
													{subCriteriaGroups.map((group) => {
														const visibleEntries = showAllSubCriteria ? group.entries : group.entries.slice(0, analyticsPreviewLimit)

														return (
															<div key={`${program}-${group.subCriterionKey}`} className='rounded-lg border border-[var(--border-soft)] bg-[var(--surface-muted)] p-3'>
																<p className='text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]'>{group.subCriterionName}</p>
																<div className='mt-2 overflow-x-auto'>
																	<table className='min-w-full text-sm text-left'>
																		<thead className='bg-[var(--surface)] text-[var(--text-secondary)]'>
																			<tr>
																				<th className='px-3 py-2 font-semibold'>Rank</th>
																				<th className='px-3 py-2 font-semibold'>Participant</th>
																				<th className='px-3 py-2 font-semibold'>Team</th>
																				<th className='px-3 py-2 font-semibold text-right'>Subcriteria Score</th>
																			</tr>
																		</thead>
																		<tbody className='divide-y divide-[var(--border-soft)]'>
																			{visibleEntries.map((entry, entryIndex) => {
																				const entryContestant = contestantsById.get(entry.contestantId)
																				const teamLabel = entryContestant?.entryType === 'individual' ? 'N/A' : entry.teamName

																				return (
																					<tr key={`${group.subCriterionKey}-${entry.contestantId}-${entry.participantLabel}-${entryIndex}`} className={entryIndex === 0 ? 'bg-[var(--surface)] font-medium' : ''}>
																						<td className='px-3 py-2'>
																							{entry.rank === 1 && <span className='mr-1 inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-700 w-5 h-5 text-xs'>★</span>}#{entry.rank}
																						</td>
																						<td className='px-3 py-2'>
																							<div className='text-[var(--text-primary)]'>{entry.participantLabel}</div>
																							<div className='text-[10px] text-[var(--text-muted)]'>{entry.contestantName}</div>
																						</td>
																						<td className='px-3 py-2 text-[var(--text-primary)]'>{teamLabel}</td>
																						<td className='px-3 py-2 text-right text-[var(--text-primary)]'>
																							{formatScore(entry.averageScore)} / {formatScore(entry.maxScore)} ({formatPercent(entry.rating)})
																						</td>
																					</tr>
																				)
																			})}
																		</tbody>
																	</table>
																</div>
															</div>
														)
													})}
												</div>
											) : (
												<div className='mt-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-muted)] p-3 text-center text-sm text-[var(--text-secondary)]'>No subcriteria ranking data found for {program}.</div>
											)}
										</div>
									</article>
								)
							})}
						</div>
					</section>

					<section className='rounded-[28px] border border-[var(--border-soft)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)] sm:p-8'>
						<h2 className='text-xl font-semibold text-[var(--text-primary)]'>Compiled Scores</h2>
						{useWeightedScores ? <p className='mt-1 text-xs text-[var(--text-secondary)]'>Final Oral Defense only: Final Score = (Group Rating x 60%) + (Individual Rating x 40%). Group Rating = (Group Score / 110) x 100 and Individual Rating = (Individual Score / 36) x 100.</p> : null}
						<div className='mt-4 overflow-x-auto rounded-2xl border border-[var(--border-soft)]'>
							<table className='min-w-full border-collapse text-sm'>
								<thead>
									<tr className='bg-[var(--surface-muted)] text-left text-[var(--text-primary)]'>
										<th className='border-b border-[var(--border-soft)] px-3 py-3 font-semibold'>Rank</th>
										<th className='border-b border-[var(--border-soft)] px-3 py-3 font-semibold'>Contestant</th>
										<th className='border-b border-[var(--border-soft)] px-3 py-3 font-semibold'>
											<div className='flex flex-col gap-1'>
												<span>Program</span>
												<div className='flex items-center gap-3 text-[10px] font-normal text-[var(--text-secondary)]'>
													<label className='flex items-center gap-1 cursor-pointer'>
														<input type='checkbox' checked={allContestantsBSINT} onChange={(event) => setProgramForAllContestants(event.target.checked ? 'BSINT' : null)} className='rounded border-[var(--border-strong)] text-emerald-600 focus:ring-emerald-500 cursor-pointer' />
														All BSINT
													</label>
													<label className='flex items-center gap-1 cursor-pointer'>
														<input type='checkbox' checked={allContestantsBSCS} onChange={(event) => setProgramForAllContestants(event.target.checked ? 'BSCS' : null)} className='rounded border-[var(--border-strong)] text-emerald-600 focus:ring-emerald-500 cursor-pointer' />
														All BSCS
													</label>
												</div>
											</div>
										</th>
										{useWeightedScores ? (
											<>
												<th className='border-b border-[var(--border-soft)] px-3 py-3 font-semibold'>Group Score</th>
												<th className='border-b border-[var(--border-soft)] px-3 py-3 font-semibold'>Group Rating</th>
												<th className='border-b border-[var(--border-soft)] px-3 py-3 font-semibold'>Individual Score</th>
												<th className='border-b border-[var(--border-soft)] px-3 py-3 font-semibold'>Individual Rating</th>
												<th className='border-b border-[var(--border-soft)] px-3 py-3 font-semibold'>Final Score</th>
											</>
										) : (
											<>
												<th className='border-b border-[var(--border-soft)] px-3 py-3 font-semibold'>Average Score</th>
												<th className='border-b border-[var(--border-soft)] px-3 py-3 font-semibold'>Total Score</th>
											</>
										)}
										<th className='border-b border-[var(--border-soft)] px-3 py-3 font-semibold'>Judges Counted</th>
									</tr>
								</thead>
								<tbody>
									{compiled.rankings.map((result, index) => {
										const currentProgram = resolvedProgramByContestantId.get(result.contestantId) ?? null
										const rowContestant = contestantsById.get(result.contestantId)
										const isIndividual = rowContestant?.entryType === 'individual'
										const currentAssignedJudgeIds = assignedJudgeIdsForContestant(event, result.contestantId)
										const assignmentDraftJudgeIds = judgeAssignmentDrafts[result.contestantId] ?? currentAssignedJudgeIds
										const hasAssignmentChanges = !sameJudgeAssignments(currentAssignedJudgeIds, assignmentDraftJudgeIds)
										const isEditingJudgeAssignment = editingJudgeAssignmentForContestantId === result.contestantId
										const isSavingAssignment = savingJudgeAssignmentForContestantId === result.contestantId
										const assignedJudgeStatus = event.judges
											.filter((judge) => currentAssignedJudgeIds.includes(judge.id))
											.map((judge) => {
												const judgeBreakdown = compiled.judgeBreakdown.find((item) => item.judgeId === judge.id)
												const hasScoredContestant = judgeBreakdown ? Object.prototype.hasOwnProperty.call(judgeBreakdown.totalsByContestant, result.contestantId) : false

												return {
													id: judge.id,
													name: judge.name,
													hasScoredContestant,
												}
											})

										const hasParticipantScores = useWeightedScores && Array.isArray(result.participantScores) && result.participantScores.length > 0

										return (
											<Fragment key={result.contestantId}>
												<tr className={index % 2 === 0 ? 'bg-[var(--surface)]' : 'bg-[var(--surface-muted)]'}>
													<td className='border-b border-[var(--border-soft)] px-3 py-3 font-medium'>#{result.rank}</td>
													<td className='border-b border-[var(--border-soft)] px-3 py-3'>
														<div className='flex items-center gap-2'>
															<span>{result.contestantName}</span>
															{isIndividual ? <span className='rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800'>Individual</span> : null}
														</div>
													</td>
													<td className='border-b border-[var(--border-soft)] px-3 py-3'>
														<div className='flex items-center gap-3'>
															<label className='flex items-center gap-1 text-xs cursor-pointer'>
																<input type='checkbox' checked={currentProgram === 'BSINT'} onChange={() => setManualAssignments((prev) => ({ ...prev, [result.contestantId]: currentProgram === 'BSINT' ? null : 'BSINT' }))} className='rounded border-[var(--border-strong)] text-emerald-600 focus:ring-emerald-500 cursor-pointer' />
																BSINT
															</label>
															<label className='flex items-center gap-1 text-xs cursor-pointer'>
																<input type='checkbox' checked={currentProgram === 'BSCS'} onChange={() => setManualAssignments((prev) => ({ ...prev, [result.contestantId]: currentProgram === 'BSCS' ? null : 'BSCS' }))} className='rounded border-[var(--border-strong)] text-emerald-600 focus:ring-emerald-500 cursor-pointer' />
																BSCS
															</label>
														</div>
													</td>
													{useWeightedScores ? (
														<>
															<td className='border-b border-[var(--border-soft)] px-3 py-3'>{formatScore(result.groupAverageScore ?? 0)}</td>
															<td className='border-b border-[var(--border-soft)] px-3 py-3'>{formatPercent(result.groupRating ?? 0)}</td>
															<td className='border-b border-[var(--border-soft)] px-3 py-3'>{formatScore(result.individualAverageScore ?? 0)}</td>
															<td className='border-b border-[var(--border-soft)] px-3 py-3'>{formatPercent(result.individualRating ?? 0)}</td>
															<td className='border-b border-[var(--border-soft)] px-3 py-3'>{formatScore(result.weightedScore ?? result.averageScore)}</td>
														</>
													) : (
														<>
															<td className='border-b border-[var(--border-soft)] px-3 py-3'>{formatScore(result.averageScore)}</td>
															<td className='border-b border-[var(--border-soft)] px-3 py-3'>{formatScore(result.totalScore)}</td>
														</>
													)}
													<td className='border-b border-[var(--border-soft)] px-3 py-3'>{result.judgeCount}</td>
												</tr>
												{hasParticipantScores ? (
													<tr className={index % 2 === 0 ? 'bg-[var(--surface)]' : 'bg-[var(--surface-muted)]'}>
														<td className='border-b border-[var(--border-soft)] px-3 py-2 text-xs text-[var(--text-secondary)]' colSpan={compiledTableColumnCount}>
															<div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3'>
																<span className='font-semibold shrink-0 sm:min-w-[120px]'>Participant Scores:</span>
																<div className='flex flex-wrap items-center gap-2'>
																	{result.participantScores?.map((participant, participantIndex) => (
																		<span key={`${result.contestantId}-${participant.participantLabel}-${participantIndex}`} className='rounded-full border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1'>
																			{participant.participantLabel}: {formatScore(participant.averageScore)} / {formatScore(participant.maxScore)} ({formatPercent(participant.rating ?? 0)})
																		</span>
																	))}
																</div>
															</div>
															<div className='mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3'>
																<span className='font-semibold shrink-0 sm:min-w-[120px]'>Judge Assignment:</span>
																<div className='relative inline-flex items-center gap-2'>
																	<div className='flex flex-wrap items-center gap-1'>
																		{assignedJudgeStatus.length > 0 ? (
																			assignedJudgeStatus.map((judgeStatus) => (
																				<span
																					key={`${result.contestantId}-${judgeStatus.id}-status`}
																					className={judgeStatus.hasScoredContestant ? 'rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-800' : 'rounded-full border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-800'}>
																					{judgeStatus.name}
																					{judgeStatus.hasScoredContestant ? '' : ' (Not scored)'}
																				</span>
																			))
																		) : (
																			<span className='rounded-full border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-800'>No assigned judge</span>
																		)}
																	</div>
																	<button type='button' onClick={() => setEditingJudgeAssignmentForContestantId((current) => (current === result.contestantId ? null : result.contestantId))} className='rounded-full border border-cyan-700 bg-cyan-900 px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-cyan-800'>
																		Edit Judge
																	</button>

																	{isEditingJudgeAssignment ? (
																		<div className='absolute left-0 top-full z-20 mt-2 w-max max-w-[min(92vw,560px)] rounded-2xl border border-cyan-300 bg-white p-3 shadow-xl'>
																			<p className='text-[11px] font-semibold uppercase tracking-wide text-cyan-900'>Swap Judges</p>
																			<div className='mt-2 flex flex-wrap items-center gap-2'>
																				{event.judges.map((judge) => (
																					<label key={`${result.contestantId}-${judge.id}`} className='flex items-center gap-1 rounded-full border border-cyan-300 bg-white px-2 py-1 text-[11px] text-cyan-900'>
																						<input type='checkbox' checked={assignmentDraftJudgeIds.includes(judge.id)} onChange={() => toggleJudgeAssignment(result.contestantId, judge.id)} className='rounded border-cyan-400 text-cyan-700 focus:ring-cyan-500' />
																						<span>{judge.name}</span>
																					</label>
																				))}
																			</div>
																			<div className='mt-3 flex flex-wrap items-center gap-2'>
																				<button
																					type='button'
																					onClick={() => saveJudgeAssignment(result.contestantId)}
																					disabled={!hasAssignmentChanges || isSavingAssignment}
																					className='rounded-full border border-cyan-700 bg-cyan-900 px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-60'>
																					{isSavingAssignment ? 'Saving...' : 'Save Swap'}
																				</button>
																				<button type='button' onClick={() => setEditingJudgeAssignmentForContestantId(null)} disabled={isSavingAssignment} className='rounded-full border border-cyan-300 bg-white px-3 py-1 text-[11px] font-semibold text-cyan-800 transition hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-60'>
																					Cancel
																				</button>
																			</div>
																		</div>
																	) : null}
																</div>
															</div>
														</td>
													</tr>
												) : null}
											</Fragment>
										)
									})}
								</tbody>
							</table>
						</div>
					</section>

					<section className='print:hidden rounded-[28px] border border-[var(--border-soft)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)] sm:p-8'>
						<h2 className='text-xl font-semibold text-[var(--text-primary)]'>Judge Links and Submission Status</h2>
						<div className='mt-4 space-y-3'>
							{event.judges.map((judge) => {
								const judgeResult = compiled.judgeBreakdown.find((item) => item.judgeId === judge.id)
								const judgePath = `/judge/${judge.token}`
								const fullJudgeUrl = baseUrl ? `${baseUrl}${judgePath}` : judgePath
								const copyValue = baseUrl || typeof window === 'undefined' ? fullJudgeUrl : `${window.location.origin}${judgePath}`

								return (
									<article key={judge.id} className='rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] p-4'>
										<div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
											<div>
												<p className='text-sm font-semibold text-[var(--text-primary)]'>{judge.name}</p>
												<a href={fullJudgeUrl} className='block break-all text-sm text-[var(--text-secondary)] underline'>
													{fullJudgeUrl}
												</a>
											</div>
											<div className='flex flex-wrap items-center gap-2'>
												<button type='button' onClick={() => copyLink(copyValue)} className='rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface-muted)]'>
													{copiedLink === copyValue ? 'Copied' : 'Copy Link'}
												</button>
												<div className='text-sm text-[var(--text-secondary)]'>{judgeResult?.submitted ? <span>Submitted {judgeResult.submittedAt ? formatDate(judgeResult.submittedAt) : ''}</span> : <span>Not submitted yet</span>}</div>
											</div>
										</div>
									</article>
								)
							})}
						</div>
					</section>

					<section className='print:hidden rounded-[28px] border border-[var(--border-soft)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)] sm:p-8'>
						<h2 className='text-xl font-semibold text-[var(--text-primary)]'>Rubric Breakdown</h2>
						<div className='mt-4 grid gap-4'>
							{event.criteria.map((criterion) => {
								const showPerContestantParticipants = isIndividualPresentationCriterion(criterion)

								return (
									<article key={criterion.id} className='rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] p-4'>
										<p className='text-sm font-semibold text-[var(--text-primary)]'>
											{criterion.name} (Max: {formatScore(criterionMaxScore(criterion))})
										</p>

										{showPerContestantParticipants ? (
											<div className='mt-2 space-y-3'>
												{event.contestants.map((contestant) => {
													const visibleSubCriteria = criterion.subCriteria.filter((subCriterion) => isSubCriterionApplicableToContestant(subCriterion.name, contestant, criterion))

													return (
														<div key={`${criterion.id}-${contestant.id}`} className='rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] p-3'>
															<p className='text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]'>{contestant.name}</p>
															<div className='mt-2 space-y-2'>
																{visibleSubCriteria.map((subCriterion) => (
																	<div key={`${contestant.id}-${subCriterion.id}`} className='grid gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2 text-sm sm:grid-cols-2'>
																		<span className='text-[var(--text-primary)]'>{displaySubCriterionNameForContestant(subCriterion.name, contestant)}</span>
																		<span className='text-[var(--text-secondary)]'>Max Score: {formatScore(subCriterion.maxScore)}</span>
																	</div>
																))}
															</div>
														</div>
													)
												})}
											</div>
										) : (
											<div className='mt-2 space-y-2'>
												{criterion.subCriteria.map((subCriterion) => (
													<div key={subCriterion.id} className='grid gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm sm:grid-cols-2'>
														<span className='text-[var(--text-primary)]'>{subCriterion.name}</span>
														<span className='text-[var(--text-secondary)]'>Max Score: {formatScore(subCriterion.maxScore)}</span>
													</div>
												))}
											</div>
										)}
									</article>
								)
							})}
						</div>
					</section>
				</div>
			</div>

			{/* PRINT VIEW (TABULATION SHEET) */}
			<style>{`
				@media print {
					@page {
						margin: 0;
					}
				}
			`}</style>
			<div className='hidden w-full bg-white p-12 text-black print:block min-h-screen'>
				<div className='text-center font-serif leading-tight'>
					<h1 className='text-xl font-bold uppercase'>{event.title}</h1>
					<p>Date: {formatDate(event.createdAt)}</p>
					<br />
					<h2 className='text-2xl font-bold uppercase tracking-widest'>Tabulation Sheet</h2>
					<div className='mx-auto mb-6 mt-2 w-1/2 border-b-2 border-black'></div>
				</div>

				<table className='mt-8 w-full border-collapse border border-black text-center text-sm'>
					<thead>
						<tr>
							<th className='border border-black p-2 font-bold uppercase'>Contestant No. / Name</th>
							{event.judges.map((j) => (
								<th key={j.id} className='whitespace-nowrap border border-black p-2 font-bold uppercase'>
									{j.name}
								</th>
							))}
							<th className='border border-black p-2 font-bold uppercase'>Final Score</th>
							<th className='border border-black p-2 font-bold uppercase'>Rank</th>
						</tr>
					</thead>
					<tbody>
						{compiled.rankings.map((result) => (
							<tr key={result.contestantId}>
								<td className='border border-black p-2 text-left font-semibold uppercase'>{result.contestantName}</td>
								{event.judges.map((j) => (
									<td key={j.id} className='border border-black p-2'>
										{result.perJudgeTotals[j.id] !== undefined ? formatScore(result.perJudgeTotals[j.id]) : ''}
									</td>
								))}
								<td className='border border-black p-2 font-bold'>{formatScore(useWeightedScores ? (result.weightedScore ?? result.averageScore) : result.averageScore)}</td>
								<td className='border border-black p-2 font-bold'>{result.rank}</td>
							</tr>
						))}
					</tbody>
				</table>

				<div className='mt-24 flex flex-wrap justify-around gap-y-16'>
					{event.judges.map((j) => (
						<div key={j.id} className='text-center'>
							<div className='mb-1 w-48 border-b border-black'></div>
							<p className='font-bold uppercase'>{j.name}</p>
							<p className='text-sm'>Judge</p>
						</div>
					))}
				</div>
			</div>
		</>
	)
}

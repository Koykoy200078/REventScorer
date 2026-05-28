'use client'

import Link from 'next/link'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { formatRubricLegend, normalizeRubricLegend } from '@/lib/rubric-legend'
import type { AdminEventEditorInput, AdminScoreRealtimeUpdate, EventCompiledResults, EventContestant, EventCriterion, EventProgramTag, EventScorer } from '@/lib/types'

type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
type ProgramLabel = EventProgramTag

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
	initialOpenEditor?: boolean
	allowEventEditor?: boolean
	wsAuthToken?: string
}

interface AdminEventResponse {
	event: EventScorer
	compiled: EventCompiledResults
	error?: string
}

type QueuedAdminSaveKind = 'program-assignment' | 'judge-assignment' | 'event-editor'
type PendingQueueFilter = 'all' | QueuedAdminSaveKind

interface ProgramAssignmentSaveBody {
	contestantId: string
	programTag: ProgramLabel | null
}

interface JudgeAssignmentSaveBody {
	contestantId: string
	judgeIds: string[]
}

interface EventEditorSaveBody {
	eventEditor: AdminEventEditorInput
}

type AdminSaveRequestBody = ProgramAssignmentSaveBody | JudgeAssignmentSaveBody | EventEditorSaveBody | { programAssignments: Array<{ contestantId: string; programTag: ProgramLabel | null }> }

interface QueuedAdminSaveAction {
	id: string
	eventId: string
	kind: QueuedAdminSaveKind
	requestBody: ProgramAssignmentSaveBody | JudgeAssignmentSaveBody | EventEditorSaveBody
	queuedAt: string
	summary: string
}

const QUEUED_ADMIN_SAVES_STORAGE_KEY = 'eventscorer:queued-admin-saves:v1'
const ADMIN_SAVE_AUTO_SYNC_INTERVAL_MS = 15_000

class AdminSaveError extends Error {
	status?: number

	constructor(message: string, status?: number) {
		super(message)
		this.name = 'AdminSaveError'
		this.status = status
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object'
}

function normalizeProgramTag(value: unknown): ProgramLabel | null {
	if (value === 'BSINT' || value === 'BSCS') {
		return value
	}

	return null
}

function queuedAdminSaveActionId(eventId: string, kind: QueuedAdminSaveKind, contestantId?: string): string {
	if (kind === 'event-editor') {
		return `${eventId}:event-editor`
	}

	if (kind === 'program-assignment') {
		return `${eventId}:program:${contestantId ?? ''}`
	}

	return `${eventId}:judge:${contestantId ?? ''}`
}

function isProgramAssignmentQueuedAction(action: QueuedAdminSaveAction): action is QueuedAdminSaveAction & { requestBody: ProgramAssignmentSaveBody } {
	return action.kind === 'program-assignment'
}

function isJudgeAssignmentQueuedAction(action: QueuedAdminSaveAction): action is QueuedAdminSaveAction & { requestBody: JudgeAssignmentSaveBody } {
	return action.kind === 'judge-assignment'
}

function readQueuedAdminSaveActions(): QueuedAdminSaveAction[] {
	if (typeof window === 'undefined') {
		return []
	}

	try {
		const raw = window.localStorage.getItem(QUEUED_ADMIN_SAVES_STORAGE_KEY)
		if (!raw) {
			return []
		}

		const parsed = JSON.parse(raw) as unknown
		if (!Array.isArray(parsed)) {
			return []
		}

		const normalized: QueuedAdminSaveAction[] = []

		for (const item of parsed) {
			if (!isRecord(item)) {
				continue
			}

			const eventId = typeof item.eventId === 'string' ? item.eventId.trim() : ''
			const kind = item.kind === 'program-assignment' || item.kind === 'judge-assignment' || item.kind === 'event-editor' ? item.kind : null
			const queuedAt = typeof item.queuedAt === 'string' ? item.queuedAt : new Date().toISOString()
			const summary = typeof item.summary === 'string' && item.summary.trim().length > 0 ? item.summary.trim() : 'admin save action'

			if (!eventId || !kind) {
				continue
			}

			const requestBody = item.requestBody
			if (!isRecord(requestBody)) {
				continue
			}

			let normalizedRequestBody: ProgramAssignmentSaveBody | JudgeAssignmentSaveBody | EventEditorSaveBody | null = null

			if (kind === 'program-assignment') {
				const contestantId = typeof requestBody.contestantId === 'string' ? requestBody.contestantId.trim() : ''
				if (!contestantId || !Object.prototype.hasOwnProperty.call(requestBody, 'programTag')) {
					continue
				}

				normalizedRequestBody = {
					contestantId,
					programTag: normalizeProgramTag(requestBody.programTag),
				}
			} else if (kind === 'judge-assignment') {
				const contestantId = typeof requestBody.contestantId === 'string' ? requestBody.contestantId.trim() : ''
				const judgeIds = Array.isArray(requestBody.judgeIds) ? requestBody.judgeIds.map((judgeId) => (typeof judgeId === 'string' ? judgeId.trim() : '')).filter((judgeId) => judgeId.length > 0) : []

				if (!contestantId || judgeIds.length === 0) {
					continue
				}

				normalizedRequestBody = {
					contestantId,
					judgeIds,
				}
			} else {
				const eventEditor = requestBody.eventEditor
				if (!isRecord(eventEditor)) {
					continue
				}

				normalizedRequestBody = {
					eventEditor: eventEditor as unknown as AdminEventEditorInput,
				}
			}

			normalized.push({
				id: typeof item.id === 'string' && item.id.trim().length > 0 ? item.id : queuedAdminSaveActionId(eventId, kind, 'contestantId' in normalizedRequestBody ? normalizedRequestBody.contestantId : undefined),
				eventId,
				kind,
				requestBody: normalizedRequestBody,
				queuedAt,
				summary,
			})
		}

		return normalized
	} catch {
		return []
	}
}

function writeQueuedAdminSaveActions(queue: QueuedAdminSaveAction[]): void {
	if (typeof window === 'undefined') {
		return
	}

	if (queue.length === 0) {
		window.localStorage.removeItem(QUEUED_ADMIN_SAVES_STORAGE_KEY)
		return
	}

	window.localStorage.setItem(QUEUED_ADMIN_SAVES_STORAGE_KEY, JSON.stringify(queue))
}

function listQueuedAdminSaveActionsForEvent(eventId: string): QueuedAdminSaveAction[] {
	const normalizedEventId = eventId.trim()
	if (!normalizedEventId) {
		return []
	}

	return readQueuedAdminSaveActions()
		.filter((action) => action.eventId === normalizedEventId)
		.sort((left, right) => new Date(left.queuedAt).getTime() - new Date(right.queuedAt).getTime())
}

function upsertQueuedAdminSaveAction(action: QueuedAdminSaveAction): void {
	const queue = readQueuedAdminSaveActions()
	const existingIndex = queue.findIndex((entry) => entry.id === action.id)

	if (existingIndex >= 0) {
		queue[existingIndex] = action
	} else {
		queue.push(action)
	}

	writeQueuedAdminSaveActions(queue)
}

function removeQueuedAdminSaveAction(actionId: string): void {
	const queue = readQueuedAdminSaveActions()
	const nextQueue = queue.filter((entry) => entry.id !== actionId)

	if (nextQueue.length === queue.length) {
		return
	}

	writeQueuedAdminSaveActions(nextQueue)
}

function shouldQueueAdminSave(error: unknown): boolean {
	if (typeof navigator !== 'undefined' && !navigator.onLine) {
		return true
	}

	if (error instanceof TypeError) {
		return true
	}

	if (error instanceof AdminSaveError && typeof error.status === 'number' && error.status >= 500) {
		return true
	}

	return false
}

function queuedAdminSaveKindLabel(kind: QueuedAdminSaveKind): string {
	if (kind === 'program-assignment') {
		return 'Program Assignment'
	}

	if (kind === 'judge-assignment') {
		return 'Judge Assignment'
	}

	return 'Published Event Changes'
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
	if (typeof result.finalRating === 'number' && Number.isFinite(result.finalRating)) {
		return result.finalRating
	}

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
	if (criterion.name.trim().toLowerCase() === 'individual presentation') {
		return true
	}

	return criterion.subCriteria.some((subCriterion) => {
		const normalizedName = subCriterion.name.trim()
		const splitMatch = normalizedName.match(/^(.+?)\s*[-\u2013\u2014]\s*(.+)$/)
		if (!splitMatch) {
			return false
		}

		return /(\d+)\s*$/.test(splitMatch[1].trim())
	})
}

function splitMemberCriterionName(name: string): { memberLabel: string; displayName: string } {
	const normalizedName = name.trim()
	const splitMatch = normalizedName.match(/^(.+?)\s*[-\u2013\u2014]\s*(.+)$/)
	if (!splitMatch) {
		return { memberLabel: 'Individual', displayName: normalizedName || name }
	}

	const memberLabel = splitMatch[1].trim()
	const displayName = splitMatch[2].trim()
	const hasMemberSuffix = /(\d+)\s*$/.test(memberLabel)

	if (!hasMemberSuffix) {
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

function memberCountFromSubCriteriaNames(subCriteria: Array<{ name: string }>): number {
	let maxMemberCount = 0

	for (const subCriterion of subCriteria) {
		const memberIndex = memberIndexFromLabel(splitMemberCriterionName(subCriterion.name).memberLabel)
		if (memberIndex && memberIndex > maxMemberCount) {
			maxMemberCount = memberIndex
		}
	}

	return maxMemberCount > 0 ? maxMemberCount : 1
}

function defaultMemberCountFromSubCriteria(subCriteria: EventCriterion['subCriteria']): number {
	return memberCountFromSubCriteriaNames(subCriteria)
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

function mergedIndividualSubCriteriaForContestant(criterion: EventCriterion, contestant: EventContestant): Array<{ id: string; name: string; maxScore: number }> {
	const merged: Array<{ id: string; name: string; maxScore: number }> = []
	const seenItemKeys = new Set<string>()

	for (const subCriterion of criterion.subCriteria) {
		if (!isSubCriterionApplicableToContestant(subCriterion.name, contestant, criterion)) {
			continue
		}

		const { displayName } = splitMemberCriterionName(subCriterion.name)
		const itemKey = `${displayName.toLowerCase()}::${subCriterion.maxScore}`

		if (seenItemKeys.has(itemKey)) {
			continue
		}

		seenItemKeys.add(itemKey)
		merged.push({
			id: subCriterion.id,
			name: displayName,
			maxScore: subCriterion.maxScore,
		})
	}

	return merged
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

function contestantProgramLabel(contestant: EventContestant | undefined): ProgramLabel | null {
	if (!contestant) {
		return null
	}

	return contestant.programTag === 'BSINT' || contestant.programTag === 'BSCS' ? contestant.programTag : null
}

function resolveProgramLabel(contestantName: string, contestant: EventContestant | undefined, manualAssignment: ProgramLabel | null | undefined): ProgramLabel | null {
	if (manualAssignment !== undefined) {
		return manualAssignment
	}

	const persistedProgram = contestantProgramLabel(contestant)
	if (persistedProgram) {
		return persistedProgram
	}

	return detectProgramLabel(contestantName)
}

function buildProgramAssignmentsFromEvent(event: EventScorer): Record<string, ProgramLabel | null> {
	const assignments: Record<string, ProgramLabel | null> = {}

	for (const contestant of event.contestants) {
		const persistedProgram = contestantProgramLabel(contestant)
		if (persistedProgram) {
			assignments[contestant.id] = persistedProgram
		}
	}

	return assignments
}

function extractDynamicTeamName(contestantName: string): string {
	const cleanedName = contestantName
		.replace(/\bBSINT\b|\bBSCS\b/gi, ' ')
		.replace(/\(\s*\)/g, ' ')
		.replace(/\(\s+/g, '(')
		.replace(/\s+\)/g, ')')
		.replace(/[|_]+/g, ' ')
		.replace(/\s{2,}/g, ' ')
		.replace(/^[\s\-:|/\\()]+|[\s\-:|/\\()]+$/g, '')
		.trim()

	return cleanedName.length > 0 ? cleanedName : contestantName
}

function teamsByProgram(rankings: EventCompiledResults['rankings'], contestantsById: Map<string, EventContestant>, manualAssignments: Record<string, ProgramLabel | null>, useWeighted: boolean): Record<ProgramLabel, ProgramTopTeam[]> {
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
			teamName: extractDynamicTeamName(result.contestantName),
			contestantName: result.contestantName,
			rank: result.rank,
			score,
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

function participantRankingsByProgram(rankings: EventCompiledResults['rankings'], contestantsById: Map<string, EventContestant>, manualAssignments: Record<string, ProgramLabel | null>): Record<ProgramLabel, ProgramTopParticipant[]> {
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

			grouped[detectedProgram].push({
				program: detectedProgram,
				teamName: extractDynamicTeamName(result.contestantName),
				contestantId: result.contestantId,
				contestantName: result.contestantName,
				participantLabel: participant.participantLabel,
				participantAverageScore: participant.averageScore,
				participantMaxScore: participant.maxScore,
				participantRating,
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

function createLocalEditorId(prefix: string): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return `${prefix}-${crypto.randomUUID()}`
	}

	return `${prefix}-${Math.random().toString(16).slice(2)}-${Date.now().toString(36)}`
}

function uniqueTrimmedNames(value: string): string[] {
	const unique = new Set<string>()

	for (const entry of value.split(/[\n,]/)) {
		const trimmed = entry.trim()
		if (trimmed.length === 0) {
			continue
		}

		unique.add(trimmed)
	}

	return Array.from(unique)
}

interface SharedSubCriterionDraft {
	id?: string
	name: string
	maxScore: number
}

function hasMemberScopedSubCriteria(subCriteria: Array<{ name: string }>): boolean {
	return subCriteria.some((subCriterion) => {
		const { memberLabel } = splitMemberCriterionName(subCriterion.name)
		return memberIndexFromLabel(memberLabel) !== null
	})
}

function collapseMemberScopedSubCriteria(subCriteria: Array<{ id?: string; name: string; maxScore: number }>): SharedSubCriterionDraft[] {
	const collapsed: SharedSubCriterionDraft[] = []
	const seenDisplayNames = new Set<string>()

	for (const subCriterion of subCriteria) {
		const { memberLabel, displayName } = splitMemberCriterionName(subCriterion.name)
		const memberIndex = memberIndexFromLabel(memberLabel)
		const normalizedName = (memberIndex ? displayName : subCriterion.name).trim()
		const key = normalizedName.toLowerCase()

		if (!normalizedName || seenDisplayNames.has(key)) {
			continue
		}

		seenDisplayNames.add(key)
		collapsed.push({
			id: subCriterion.id,
			name: normalizedName,
			maxScore: Number.isFinite(Number(subCriterion.maxScore)) ? Number(subCriterion.maxScore) : 0,
		})
	}

	return collapsed
}

function expectedMemberCountForEditorContestant(contestant: AdminEventEditorInput['contestants'][number]): number {
	if (contestant.entryType === 'individual') {
		return 1
	}

	const participants = Array.isArray(contestant.participants) ? contestant.participants.map((participant) => String(participant ?? '').trim()).filter((participant) => participant.length > 0) : []
	return participants.length > 0 ? participants.length : 1
}

function maxEditorMemberCount(contestants: AdminEventEditorInput['contestants']): number {
	if (!Array.isArray(contestants) || contestants.length === 0) {
		return 1
	}

	return contestants.reduce((maxCount, contestant) => Math.max(maxCount, expectedMemberCountForEditorContestant(contestant)), 1)
}

function criterionSubCriteriaTotalScore(subCriteria: Array<{ maxScore: number }>): number {
	return (
		Math.round(
			subCriteria.reduce((sum, subCriterion) => {
				const numericMaxScore = Number(subCriterion.maxScore)
				return sum + (Number.isFinite(numericMaxScore) ? numericMaxScore : 0)
			}, 0) * 1000,
		) / 1000
	)
}

function criterionUsesSharedMemberExpansion(criterion: AdminEventEditorInput['criteria'][number], existingCriterion?: EventCriterion): boolean {
	if (criterion.name.trim().toLowerCase() === 'individual presentation') {
		return true
	}

	if (existingCriterion && hasMemberScopedSubCriteria(existingCriterion.subCriteria)) {
		return true
	}

	return hasMemberScopedSubCriteria(criterion.subCriteria)
}

function resolveSharedCriterionMemberCount(criterion: AdminEventEditorInput['criteria'][number], existingCriterion: EventCriterion | undefined, editorMemberCount: number): number {
	const existingMemberCount = existingCriterion && hasMemberScopedSubCriteria(existingCriterion.subCriteria) ? memberCountFromSubCriteriaNames(existingCriterion.subCriteria) : 1
	const draftMemberCount = hasMemberScopedSubCriteria(criterion.subCriteria) ? memberCountFromSubCriteriaNames(criterion.subCriteria) : 1

	return Math.max(1, editorMemberCount, existingMemberCount, draftMemberCount)
}

function criterionTotalScoreForEditor(criterion: AdminEventEditorInput['criteria'][number]): number {
	return criterionSubCriteriaTotalScore(criterion.subCriteria)
}

function expandSharedSubCriteriaForMembers(subCriteria: Array<{ id?: string; name: string; maxScore: number }>, memberCount: number): AdminEventEditorInput['criteria'][number]['subCriteria'] {
	const sharedSubCriteria = collapseMemberScopedSubCriteria(subCriteria)

	if (memberCount <= 1 || sharedSubCriteria.length === 0) {
		return sharedSubCriteria.map((subCriterion) => ({
			id: subCriterion.id,
			name: subCriterion.name,
			maxScore: subCriterion.maxScore,
		}))
	}

	const expanded: AdminEventEditorInput['criteria'][number]['subCriteria'] = []

	for (let memberIndex = 1; memberIndex <= memberCount; memberIndex += 1) {
		const memberLabel = `Student ${memberIndex}`

		for (const sharedSubCriterion of sharedSubCriteria) {
			expanded.push({
				id: memberIndex === 1 ? sharedSubCriterion.id : undefined,
				name: `${memberLabel} - ${sharedSubCriterion.name}`,
				maxScore: sharedSubCriterion.maxScore,
			})
		}
	}

	return expanded
}

function prepareEventEditorPayloadForSubmit(draft: AdminEventEditorInput, existingEvent: EventScorer): AdminEventEditorInput {
	const synchronizedDraft = synchronizeEventEditorDraft(draft)
	const existingCriteriaById = new Map(existingEvent.criteria.map((criterion) => [criterion.id, criterion]))
	const editorMemberCount = maxEditorMemberCount(synchronizedDraft.contestants)

	return {
		...synchronizedDraft,
		criteria: synchronizedDraft.criteria.map((criterion) => {
			const existingCriterion = criterion.id ? existingCriteriaById.get(criterion.id) : undefined
			const shouldExpandForMembers = criterionUsesSharedMemberExpansion(criterion, existingCriterion)

			if (!shouldExpandForMembers) {
				return criterion
			}

			return {
				...criterion,
				subCriteria: expandSharedSubCriteriaForMembers(criterion.subCriteria, resolveSharedCriterionMemberCount(criterion, existingCriterion, editorMemberCount)),
			}
		}),
	}
}

function buildSynchronizedPresentationSlots(contestants: AdminEventEditorInput['contestants'], judges: AdminEventEditorInput['judges'], existingSlots: AdminEventEditorInput['presentationSlots']): NonNullable<AdminEventEditorInput['presentationSlots']> {
	const validJudgeIds = new Set(judges.map((judge) => String(judge.id ?? '').trim()).filter((judgeId) => judgeId.length > 0))
	const slotByContestantId = new Map<string, NonNullable<AdminEventEditorInput['presentationSlots']>[number]>()

	if (Array.isArray(existingSlots)) {
		for (const slot of existingSlots) {
			if (!slot || typeof slot !== 'object') {
				continue
			}

			const contestantId = String(slot.contestantId ?? '').trim()
			if (!contestantId || slotByContestantId.has(contestantId)) {
				continue
			}

			slotByContestantId.set(contestantId, slot)
		}
	}

	const fallbackJudgeIds = Array.from(validJudgeIds)

	return contestants.map((contestant, index) => {
		const contestantId = String(contestant.id ?? '').trim()
		const currentSlot = slotByContestantId.get(contestantId)

		const nextJudgeIds = Array.from(new Set((Array.isArray(currentSlot?.judgeIds) ? currentSlot.judgeIds : fallbackJudgeIds).map((judgeId) => String(judgeId ?? '').trim()).filter((judgeId) => validJudgeIds.has(judgeId))))

		return {
			id: String(currentSlot?.id ?? '').trim() || createLocalEditorId(`slot-${index + 1}`),
			label: String(currentSlot?.label ?? '').trim() || `Slot ${index + 1}`,
			contestantId,
			judgeIds: nextJudgeIds,
		}
	})
}

function synchronizeEventEditorDraft(draft: AdminEventEditorInput): AdminEventEditorInput {
	const contestants: AdminEventEditorInput['contestants'] = (Array.isArray(draft.contestants) ? draft.contestants : []).map((contestant, index) => {
		const rawNoatScore = contestant?.noatScore
		const numericNoatScore = typeof rawNoatScore === 'number' ? (Number.isFinite(rawNoatScore) ? rawNoatScore : null) : typeof rawNoatScore === 'string' && rawNoatScore.trim() !== '' && Number.isFinite(Number(rawNoatScore)) ? Number(rawNoatScore) : null

		return {
			id: String(contestant?.id ?? '').trim() || createLocalEditorId(`contestant-${index + 1}`),
			name: typeof contestant?.name === 'string' ? contestant.name : '',
			entryType: contestant?.entryType === 'individual' ? 'individual' : 'group',
			programTag: contestant?.programTag === 'BSINT' || contestant?.programTag === 'BSCS' ? contestant.programTag : null,
			participants: Array.isArray(contestant?.participants) ? contestant.participants.map((participant) => String(participant ?? '').trim()).filter((participant) => participant.length > 0) : [],
			noatScore: numericNoatScore,
			academicTrack: typeof contestant?.academicTrack === 'string' ? contestant.academicTrack : undefined,
			laptopAvailable: typeof contestant?.laptopAvailable === 'string' ? contestant.laptopAvailable : undefined,
		}
	})

	const judges: AdminEventEditorInput['judges'] = (Array.isArray(draft.judges) ? draft.judges : []).map((judge, index) => ({
		id: String(judge?.id ?? '').trim() || createLocalEditorId(`judge-${index + 1}`),
		name: typeof judge?.name === 'string' ? judge.name : '',
		email: typeof judge?.email === 'string' ? judge.email : '',
		token: typeof judge?.token === 'string' ? judge.token : '',
	}))

	const criteria: AdminEventEditorInput['criteria'] = (Array.isArray(draft.criteria) ? draft.criteria : []).map((criterion, criterionIndex) => ({
		id: String(criterion?.id ?? '').trim() || createLocalEditorId(`criterion-${criterionIndex + 1}`),
		name: typeof criterion?.name === 'string' ? criterion.name : '',
		subCriteria: (Array.isArray(criterion?.subCriteria) ? criterion.subCriteria : []).map((subCriterion, subCriterionIndex) => ({
			id: String(subCriterion?.id ?? '').trim() || createLocalEditorId(`subcriterion-${criterionIndex + 1}-${subCriterionIndex + 1}`),
			name: typeof subCriterion?.name === 'string' ? subCriterion.name : '',
			maxScore: Number.isFinite(Number(subCriterion?.maxScore)) ? Number(subCriterion?.maxScore) : 0,
		})),
	}))

	return {
		title: typeof draft.title === 'string' ? draft.title : '',
		description: typeof draft.description === 'string' ? draft.description : '',
		createdBy: typeof draft.createdBy === 'string' ? draft.createdBy : '',
		eventScoringType: draft.eventScoringType === 'final-oral-defense' ? 'final-oral-defense' : 'standard',
		rubricLegend: normalizeRubricLegend(draft.rubricLegend),
		contestants,
		judges,
		criteria,
		presentationSlots: buildSynchronizedPresentationSlots(contestants, judges, draft.presentationSlots),
	}
}

function buildAdminEventEditorSnapshot(event: EventScorer): AdminEventEditorInput {
	const contestants: AdminEventEditorInput['contestants'] = event.contestants.map((contestant) => ({
		id: contestant.id,
		name: contestant.name,
		entryType: contestant.entryType === 'individual' ? 'individual' : 'group',
		programTag: contestant.programTag ?? null,
		participants: contestant.entryType === 'group' ? [...(contestant.participants ?? [])] : [],
		noatScore: typeof contestant.noatScore === 'number' && Number.isFinite(contestant.noatScore) ? contestant.noatScore : null,
		academicTrack: contestant.academicTrack,
		laptopAvailable: contestant.laptopAvailable,
	}))

	const judges: AdminEventEditorInput['judges'] = event.judges.map((judge) => ({
		id: judge.id,
		name: judge.name,
		email: judge.email ?? '',
		token: judge.token,
	}))

	const criteria: AdminEventEditorInput['criteria'] = event.criteria.map((criterion) => {
		const shouldCollapseMemberScope = hasMemberScopedSubCriteria(criterion.subCriteria)
		const normalizedSubCriteria = shouldCollapseMemberScope ? collapseMemberScopedSubCriteria(criterion.subCriteria) : criterion.subCriteria

		return {
			id: criterion.id,
			name: criterion.name,
			subCriteria: normalizedSubCriteria.map((subCriterion) => ({
				id: subCriterion.id,
				name: subCriterion.name,
				maxScore: subCriterion.maxScore,
			})),
		}
	})

	const defaultPresentationSlots = event.contestants.map((contestant, index) => ({
		id: '',
		label: `Slot ${index + 1}`,
		contestantId: contestant.id,
		judgeIds: event.judges.map((judge) => judge.id),
	}))

	const sourceSlots = Array.isArray(event.presentationSlots) && event.presentationSlots.length > 0 ? event.presentationSlots : defaultPresentationSlots

	return {
		title: event.title,
		description: event.description ?? '',
		createdBy: event.createdBy ?? '',
		eventScoringType: event.eventScoringType ?? 'standard',
		rubricLegend: normalizeRubricLegend(event.rubricLegend),
		contestants,
		judges,
		criteria,
		presentationSlots: sourceSlots.map((slot) => ({
			id: slot.id,
			label: slot.label,
			contestantId: slot.contestantId,
			judgeIds: [...slot.judgeIds],
		})),
	}
}

export function AdminLiveDashboard({ initialEvent, initialCompiled, baseUrl, initialOpenEditor = false, allowEventEditor = false, wsAuthToken }: AdminLiveDashboardProps) {
	const [event, setEvent] = useState(initialEvent)
	const [compiled, setCompiled] = useState(initialCompiled)
	const [connectionState, setConnectionState] = useState<ConnectionState>('connecting')
	const [lastSignalAt, setLastSignalAt] = useState<string | null>(null)
	const [refreshError, setRefreshError] = useState<string | null>(null)
	const [isRefreshing, setIsRefreshing] = useState(false)
	const [copiedLink, setCopiedLink] = useState<string | null>(null)
	const [manualAssignments, setManualAssignments] = useState<Record<string, ProgramLabel | null>>(() => buildProgramAssignmentsFromEvent(initialEvent))
	const [isSavingProgramAssignments, setIsSavingProgramAssignments] = useState(false)
	const [judgeAssignmentDrafts, setJudgeAssignmentDrafts] = useState<Record<string, string[]>>(() => buildJudgeAssignmentDrafts(initialEvent))
	const [editingJudgeAssignmentForContestantId, setEditingJudgeAssignmentForContestantId] = useState<string | null>(null)
	const [savingJudgeAssignmentForContestantId, setSavingJudgeAssignmentForContestantId] = useState<string | null>(null)
	const [showAllTeamAnalytics, setShowAllTeamAnalytics] = useState<Record<ProgramLabel, boolean>>({ BSINT: false, BSCS: false })
	const [showAllParticipantAnalytics, setShowAllParticipantAnalytics] = useState<Record<ProgramLabel, boolean>>({ BSINT: false, BSCS: false })
	const [showAllSubCriteriaAnalytics, setShowAllSubCriteriaAnalytics] = useState<Record<ProgramLabel, boolean>>({ BSINT: false, BSCS: false })
	const [showEventEditor, setShowEventEditor] = useState(Boolean(initialOpenEditor && allowEventEditor))
	const [eventEditorDraft, setEventEditorDraft] = useState<AdminEventEditorInput>(() => synchronizeEventEditorDraft(buildAdminEventEditorSnapshot(initialEvent)))
	const [eventEditorError, setEventEditorError] = useState<string | null>(null)
	const [eventEditorNotice, setEventEditorNotice] = useState<string | null>(null)
	const [isSavingEventEditor, setIsSavingEventEditor] = useState(false)
	const [queuedAdminSaves, setQueuedAdminSaves] = useState<QueuedAdminSaveAction[]>([])
	const [isAutoSyncingAdminSaves, setIsAutoSyncingAdminSaves] = useState(false)
	const [adminQueueNotice, setAdminQueueNotice] = useState<string | null>(null)
	const [pendingQueueFilter, setPendingQueueFilter] = useState<PendingQueueFilter>('all')
	const [strandFilter, setStrandFilter] = useState<string>('All')
	const [remarkFilter, setRemarkFilter] = useState<string>('All')
	const refreshInFlight = useRef(false)
	const adminAutoSyncInFlight = useRef(false)

	const useWeightedScores = Boolean(compiled.hasWeightedScores)
	const useDirectFinalRating = useMemo(() => compiled.rankings.some((result) => typeof result.finalRating === 'number' && Number.isFinite(result.finalRating)), [compiled.rankings])
	const analyticsPreviewLimit = 3
	const compiledTableColumnCount = useWeightedScores ? 9 : 6
	const normalizedRubricLegend = useMemo(() => normalizeRubricLegend(event.rubricLegend), [event.rubricLegend])
	const rubricLegendText = useMemo(() => formatRubricLegend(normalizedRubricLegend), [normalizedRubricLegend])
	const contestantsById = useMemo(() => new Map(event.contestants.map((contestant) => [contestant.id, contestant])), [event.contestants])
	const judgesById = useMemo(() => new Map(event.judges.map((judge) => [judge.id, judge])), [event.judges])
	const resolvedProgramByContestantId = useMemo(() => {
		const map = new Map<string, ProgramLabel | null>()

		for (const result of compiled.rankings) {
			const manual = manualAssignments[result.contestantId]
			const contestant = contestantsById.get(result.contestantId)
			const currentProgram = resolveProgramLabel(result.contestantName, contestant, manual)
			map.set(result.contestantId, currentProgram)
		}

		return map
	}, [compiled.rankings, contestantsById, manualAssignments])
	const allContestantsBSINT = useMemo(() => compiled.rankings.length > 0 && compiled.rankings.every((result) => resolvedProgramByContestantId.get(result.contestantId) === 'BSINT'), [compiled.rankings, resolvedProgramByContestantId])
	const allContestantsBSCS = useMemo(() => compiled.rankings.length > 0 && compiled.rankings.every((result) => resolvedProgramByContestantId.get(result.contestantId) === 'BSCS'), [compiled.rankings, resolvedProgramByContestantId])
	const winners = useMemo(() => compiled.rankings.slice(0, 3), [compiled.rankings])
	const analyticsByProgram = useMemo(() => teamsByProgram(compiled.rankings, contestantsById, manualAssignments, useWeightedScores), [compiled.rankings, contestantsById, manualAssignments, useWeightedScores])
	const participantAnalyticsByProgram = useMemo(() => participantRankingsByProgram(compiled.rankings, contestantsById, manualAssignments), [compiled.rankings, contestantsById, manualAssignments])
	const subCriteriaAnalyticsByProgram = useMemo(() => subCriteriaRankingsByProgram(event, manualAssignments), [event, manualAssignments])
	const filterOptions = useMemo(() => {
		const strands = new Set<string>()
		const remarks = new Set<string>()
		for (const result of compiled.rankings) {
			if (result.directDetails?.strand) {
				const s = result.directDetails.strand
					.split(' / ')
					.map((v) => v.trim())
					.filter((v) => v)
				s.forEach((val) => strands.add(val))
			}
			if (result.directDetails?.remark) {
				const r = result.directDetails.remark
					.split(' / ')
					.map((v) => v.trim())
					.filter((v) => v)
				r.forEach((val) => remarks.add(val))
			}
		}
		return {
			strands: Array.from(strands).sort(),
			remarks: Array.from(remarks).sort(),
		}
	}, [compiled.rankings])
	const filteredRankings = useMemo(() => {
		return compiled.rankings.filter((result) => {
			if (strandFilter !== 'All') {
				const s = result.directDetails?.strand || ''
				if (!s.includes(strandFilter)) return false
			}
			if (remarkFilter !== 'All') {
				const r = result.directDetails?.remark || ''
				if (!r.includes(remarkFilter)) return false
			}
			return true
		})
	}, [compiled.rankings, strandFilter, remarkFilter])
	const eventEditorRubricTotalScore = useMemo(() => eventEditorDraft.criteria.reduce((sum, criterion) => sum + criterionTotalScoreForEditor(criterion), 0), [eventEditorDraft.criteria])
	const pendingQueueRows = useMemo(
		() =>
			queuedAdminSaves.map((action) => {
				if (isProgramAssignmentQueuedAction(action)) {
					const contestantName = contestantsById.get(action.requestBody.contestantId)?.name ?? action.requestBody.contestantId
					return {
						id: action.id,
						kind: action.kind,
						kindLabel: queuedAdminSaveKindLabel(action.kind),
						summary: action.summary,
						targetLabel: contestantName,
						detail: `Program tag: ${action.requestBody.programTag ?? 'Cleared'}`,
						queuedAt: action.queuedAt,
					}
				}

				if (isJudgeAssignmentQueuedAction(action)) {
					const contestantName = contestantsById.get(action.requestBody.contestantId)?.name ?? action.requestBody.contestantId
					const judgeNames = action.requestBody.judgeIds.map((judgeId) => judgesById.get(judgeId)?.name ?? judgeId)
					return {
						id: action.id,
						kind: action.kind,
						kindLabel: queuedAdminSaveKindLabel(action.kind),
						summary: action.summary,
						targetLabel: contestantName,
						detail: `Assigned judges: ${judgeNames.join(', ')}`,
						queuedAt: action.queuedAt,
					}
				}

				const editorDraft = 'eventEditor' in action.requestBody ? action.requestBody.eventEditor : undefined
				const contestantCount = Array.isArray(editorDraft?.contestants) ? editorDraft.contestants.length : 0
				const judgeCount = Array.isArray(editorDraft?.judges) ? editorDraft.judges.length : 0
				const criterionCount = Array.isArray(editorDraft?.criteria) ? editorDraft.criteria.length : 0

				return {
					id: action.id,
					kind: action.kind,
					kindLabel: queuedAdminSaveKindLabel(action.kind),
					summary: action.summary,
					targetLabel: event.title,
					detail: `Event editor payload: ${contestantCount} contestants, ${judgeCount} judges, ${criterionCount} criteria.`,
					queuedAt: action.queuedAt,
				}
			}),
		[event.title, contestantsById, judgesById, queuedAdminSaves],
	)
	const filteredPendingQueueRows = useMemo(() => {
		if (pendingQueueFilter === 'all') {
			return pendingQueueRows
		}

		return pendingQueueRows.filter((row) => row.kind === pendingQueueFilter)
	}, [pendingQueueFilter, pendingQueueRows])

	useEffect(() => {
		setJudgeAssignmentDrafts(buildJudgeAssignmentDrafts(event))
	}, [event])

	useEffect(() => {
		if (showEventEditor) {
			return
		}

		setEventEditorDraft(synchronizeEventEditorDraft(buildAdminEventEditorSnapshot(event)))
	}, [event, showEventEditor])

	const updateEventEditorDraft = useCallback((updater: (previous: AdminEventEditorInput) => AdminEventEditorInput) => {
		setEventEditorDraft((previous) => synchronizeEventEditorDraft(updater(previous)))
		setEventEditorError(null)
		setEventEditorNotice(null)
	}, [])

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
			const response = await fetch(`/api/eventscorer/admin/events/${event.id}`, {
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

	const patchAdminEvent = useCallback(
		async (requestBody: AdminSaveRequestBody, targetEventId = event.id): Promise<AdminEventResponse> => {
			const response = await fetch(`/api/eventscorer/admin/events/${targetEventId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(requestBody),
			})

			let responseBody: unknown = null
			try {
				responseBody = await response.json()
			} catch {
				responseBody = null
			}

			if (!response.ok) {
				const message = isRecord(responseBody) && typeof responseBody.error === 'string' ? responseBody.error : 'Unable to save admin changes.'
				throw new AdminSaveError(message, response.status)
			}

			if (!isRecord(responseBody) || !isRecord(responseBody.event) || !isRecord(responseBody.compiled)) {
				throw new AdminSaveError('Unexpected response while saving admin changes.', 502)
			}

			return responseBody as unknown as AdminEventResponse
		},
		[event.id],
	)

	const refreshQueuedAdminSaves = useCallback(() => {
		const queued = listQueuedAdminSaveActionsForEvent(event.id)
		setQueuedAdminSaves(queued)

		if (queued.length === 0) {
			return
		}

		const queuedProgramActions = queued.filter(isProgramAssignmentQueuedAction)
		if (queuedProgramActions.length > 0) {
			setManualAssignments((previous) => {
				const next = { ...previous }

				for (const action of queuedProgramActions) {
					next[action.requestBody.contestantId] = action.requestBody.programTag
				}

				return next
			})
		}

		const queuedJudgeActions = queued.filter(isJudgeAssignmentQueuedAction)
		if (queuedJudgeActions.length > 0) {
			setJudgeAssignmentDrafts((previous) => {
				const next = { ...previous }

				for (const action of queuedJudgeActions) {
					next[action.requestBody.contestantId] = [...action.requestBody.judgeIds]
				}

				return next
			})
		}
	}, [event.id])

	const syncQueuedAdminSaves = useCallback(
		async (showNotice = false): Promise<void> => {
			if (adminAutoSyncInFlight.current) {
				return
			}

			if (typeof navigator !== 'undefined' && !navigator.onLine) {
				return
			}

			const pendingSaves = listQueuedAdminSaveActionsForEvent(event.id)
			if (pendingSaves.length === 0) {
				setQueuedAdminSaves([])
				return
			}

			adminAutoSyncInFlight.current = true
			setIsAutoSyncingAdminSaves(true)

			let syncedCount = 0
			let permanentErrorMessage: string | null = null

			try {
				for (const pendingSave of pendingSaves) {
					try {
						const responseBody = await patchAdminEvent(pendingSave.requestBody, pendingSave.eventId)
						removeQueuedAdminSaveAction(pendingSave.id)
						syncedCount += 1

						setEvent(responseBody.event)
						setCompiled(responseBody.compiled)

						if (pendingSave.kind === 'event-editor') {
							setManualAssignments(buildProgramAssignmentsFromEvent(responseBody.event))
							setEditingJudgeAssignmentForContestantId(null)
							setEventEditorDraft(synchronizeEventEditorDraft(buildAdminEventEditorSnapshot(responseBody.event)))
							setShowEventEditor(false)
							setEventEditorError(null)
							setEventEditorNotice('Queued published event changes uploaded. Judge submissions were reset to keep scoring consistent with the updated structure.')
						}
					} catch (syncError) {
						if (syncError instanceof AdminSaveError && typeof syncError.status === 'number' && syncError.status >= 400 && syncError.status < 500) {
							removeQueuedAdminSaveAction(pendingSave.id)

							if (!permanentErrorMessage) {
								permanentErrorMessage = `Auto-upload skipped ${pendingSave.summary}: ${syncError.message}`
							}

							continue
						}

						break
					}
				}
			} finally {
				refreshQueuedAdminSaves()
				setIsAutoSyncingAdminSaves(false)
				adminAutoSyncInFlight.current = false
			}

			if (syncedCount > 0) {
				setRefreshError(null)

				if (showNotice) {
					setAdminQueueNotice(`Auto-uploaded ${syncedCount} pending admin ${syncedCount === 1 ? 'save' : 'saves'}.`)
				}
			}

			if (permanentErrorMessage) {
				setRefreshError(permanentErrorMessage)
			}
		},
		[event.id, patchAdminEvent, refreshQueuedAdminSaves],
	)

	useEffect(() => {
		refreshQueuedAdminSaves()
		void syncQueuedAdminSaves(false)
	}, [refreshQueuedAdminSaves, syncQueuedAdminSaves])

	useEffect(() => {
		const handleOnline = () => {
			void syncQueuedAdminSaves(true)
		}

		window.addEventListener('online', handleOnline)

		return () => {
			window.removeEventListener('online', handleOnline)
		}
	}, [syncQueuedAdminSaves])

	useEffect(() => {
		if (queuedAdminSaves.length === 0) {
			return
		}

		const intervalId = window.setInterval(() => {
			void syncQueuedAdminSaves(false)
		}, ADMIN_SAVE_AUTO_SYNC_INTERVAL_MS)

		return () => {
			window.clearInterval(intervalId)
		}
	}, [queuedAdminSaves.length, syncQueuedAdminSaves])

	const saveProgramAssignments = useCallback(
		async (assignments: Array<{ contestantId: string; programTag: ProgramLabel | null }>) => {
			if (assignments.length === 0) {
				return
			}

			setIsSavingProgramAssignments(true)
			setRefreshError(null)

			try {
				const responseBody = await patchAdminEvent({ programAssignments: assignments })

				setEvent(responseBody.event)
				setCompiled(responseBody.compiled)
				setAdminQueueNotice(null)
			} catch (error) {
				if (shouldQueueAdminSave(error)) {
					for (const assignment of assignments) {
						const contestantName = contestantsById.get(assignment.contestantId)?.name ?? assignment.contestantId

						upsertQueuedAdminSaveAction({
							id: queuedAdminSaveActionId(event.id, 'program-assignment', assignment.contestantId),
							eventId: event.id,
							kind: 'program-assignment',
							requestBody: {
								contestantId: assignment.contestantId,
								programTag: assignment.programTag,
							},
							queuedAt: new Date().toISOString(),
							summary: `program assignment for ${contestantName}`,
						})
					}

					refreshQueuedAdminSaves()
					setRefreshError(null)
					setAdminQueueNotice('Program assignment changes were saved locally and queued for auto-upload.')
					void syncQueuedAdminSaves(false)
				} else {
					setRefreshError(error instanceof Error ? error.message : 'Unable to update program tag assignments.')
				}
			} finally {
				setIsSavingProgramAssignments(false)
			}
		},
		[contestantsById, event.id, patchAdminEvent, refreshQueuedAdminSaves, syncQueuedAdminSaves],
	)

	const setProgramForAllContestants = useCallback(
		(program: ProgramLabel | null) => {
			const assignments = compiled.rankings.map((result) => ({ contestantId: result.contestantId, programTag: program }))

			setManualAssignments((previous) => {
				const next = { ...previous }

				for (const result of compiled.rankings) {
					next[result.contestantId] = program
				}

				return next
			})

			void saveProgramAssignments(assignments)
		},
		[compiled.rankings, saveProgramAssignments],
	)

	const toggleContestantProgram = useCallback(
		(contestantId: string, selectedProgram: ProgramLabel) => {
			const currentProgram = resolvedProgramByContestantId.get(contestantId) ?? null
			const nextProgram = currentProgram === selectedProgram ? null : selectedProgram

			setManualAssignments((previous) => ({
				...previous,
				[contestantId]: nextProgram,
			}))

			void saveProgramAssignments([{ contestantId, programTag: nextProgram }])
		},
		[resolvedProgramByContestantId, saveProgramAssignments],
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
				const responseBody = await patchAdminEvent({ contestantId, judgeIds })

				setEvent(responseBody.event)
				setCompiled(responseBody.compiled)
				setEditingJudgeAssignmentForContestantId(null)
				setAdminQueueNotice(null)
			} catch (error) {
				if (shouldQueueAdminSave(error)) {
					const contestantName = contestantsById.get(contestantId)?.name ?? contestantId

					upsertQueuedAdminSaveAction({
						id: queuedAdminSaveActionId(event.id, 'judge-assignment', contestantId),
						eventId: event.id,
						kind: 'judge-assignment',
						requestBody: {
							contestantId,
							judgeIds: [...judgeIds],
						},
						queuedAt: new Date().toISOString(),
						summary: `judge assignment for ${contestantName}`,
					})

					refreshQueuedAdminSaves()
					setRefreshError(null)
					setAdminQueueNotice(`Judge assignment for ${contestantName} was saved locally and queued for auto-upload.`)
					setEditingJudgeAssignmentForContestantId(null)
					void syncQueuedAdminSaves(false)
				} else {
					setRefreshError(error instanceof Error ? error.message : 'Unable to update judge assignment.')
				}
			} finally {
				setSavingJudgeAssignmentForContestantId(null)
			}
		},
		[contestantsById, event, judgeAssignmentDrafts, patchAdminEvent, refreshQueuedAdminSaves, syncQueuedAdminSaves],
	)

	const loadEventEditorFromCurrentEvent = useCallback(() => {
		setEventEditorDraft(synchronizeEventEditorDraft(buildAdminEventEditorSnapshot(event)))
		setEventEditorError(null)
		setEventEditorNotice(null)
	}, [event])

	const saveEventEditor = useCallback(async () => {
		setEventEditorError(null)
		setEventEditorNotice(null)
		setRefreshError(null)

		const preparedEditor = prepareEventEditorPayloadForSubmit(eventEditorDraft, event)
		setEventEditorDraft(preparedEditor)

		setIsSavingEventEditor(true)

		try {
			const responseBody = await patchAdminEvent({ eventEditor: preparedEditor })

			setEvent(responseBody.event)
			setCompiled(responseBody.compiled)
			setManualAssignments(buildProgramAssignmentsFromEvent(responseBody.event))
			setEditingJudgeAssignmentForContestantId(null)
			setEventEditorDraft(synchronizeEventEditorDraft(buildAdminEventEditorSnapshot(responseBody.event)))
			setEventEditorNotice('Published event updated. Judge submissions were reset to keep scoring consistent with the new structure.')
			setAdminQueueNotice(null)
			setShowEventEditor(false)
		} catch (error) {
			if (shouldQueueAdminSave(error)) {
				upsertQueuedAdminSaveAction({
					id: queuedAdminSaveActionId(event.id, 'event-editor'),
					eventId: event.id,
					kind: 'event-editor',
					requestBody: {
						eventEditor: preparedEditor,
					},
					queuedAt: new Date().toISOString(),
					summary: 'published event changes',
				})

				refreshQueuedAdminSaves()
				setEventEditorError(null)
				setEventEditorNotice('Published event changes were saved locally and queued for auto-upload. They will sync automatically when internet/service is available.')
				setAdminQueueNotice('Published event changes are queued for auto-upload.')
				void syncQueuedAdminSaves(false)
			} else {
				setEventEditorError(error instanceof Error ? error.message : 'Unable to update published event.')
			}
		} finally {
			setIsSavingEventEditor(false)
		}
	}, [event, eventEditorDraft, patchAdminEvent, refreshQueuedAdminSaves, syncQueuedAdminSaves])

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
			const queryParams = new URLSearchParams({ eventId })
			if (wsAuthToken) {
				queryParams.set('auth', wsAuthToken)
			}
			const query = `?${queryParams.toString()}`
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
	}, [event.id, refreshDashboard, wsAuthToken])

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
								<p className='mt-2 max-w-3xl text-xs text-[var(--text-secondary)]'>Rubric Legend: {rubricLegendText}</p>
								<p className='mt-3 text-xs text-[var(--text-muted)]'>
									Created {formatDate(event.createdAt)}
									{event.createdBy ? ` by ${event.createdBy}` : ''}
								</p>
							</div>

							<div className='flex flex-wrap items-center gap-2 print:hidden'>
								<span className={connectionBadgeClass(connectionState)}>{connectionLabel(connectionState)}</span>
								{lastSignalAt ? <span className='rounded-full border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-1 text-xs text-[var(--text-secondary)]'>Last update {formatDate(lastSignalAt)}</span> : null}
								{queuedAdminSaves.length > 0 ? <span className='rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs text-amber-800'>Pending saves {queuedAdminSaves.length}</span> : null}
								{isAutoSyncingAdminSaves ? <span className='rounded-full border border-cyan-300 bg-cyan-50 px-3 py-1 text-xs text-cyan-800'>Auto-uploading pending saves...</span> : null}
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
								<p className='text-xs text-[var(--text-muted)]'>{useWeightedScores ? 'Raw Score Scale' : useDirectFinalRating ? 'Final Rating Scale' : 'Score Scale'}</p>
								<p className='text-xl font-semibold text-[var(--text-primary)]'>{formatScore(compiled.maxPossibleScore)}</p>
							</div>
						</div>
					</header>

					{refreshError ? <section className='rounded-2xl border border-rose-400/40 bg-rose-300/15 px-4 py-3 text-sm text-rose-100 dark:text-rose-200'>{refreshError}</section> : null}
					{adminQueueNotice ? <section className='rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800'>{adminQueueNotice}</section> : null}
					{queuedAdminSaves.length > 0 ? (
						<section className='rounded-2xl border border-amber-300 bg-amber-50/80 px-4 py-4'>
							<div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
								<div>
									<h2 className='text-sm font-semibold uppercase tracking-wide text-amber-900'>Pending Queue</h2>
									<p className='mt-1 text-xs text-amber-800'>These local admin changes are waiting to sync.</p>
									<div className='mt-2 flex flex-wrap items-center gap-2'>
										{(
											[
												{ id: 'all', label: 'All' },
												{ id: 'program-assignment', label: 'Program' },
												{ id: 'judge-assignment', label: 'Judge' },
												{ id: 'event-editor', label: 'Event Editor' },
											] as Array<{ id: PendingQueueFilter; label: string }>
										).map((option) => {
											const isActive = pendingQueueFilter === option.id

											return (
												<button key={option.id} type='button' onClick={() => setPendingQueueFilter(option.id)} className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${isActive ? 'border-amber-700 bg-amber-900 text-white' : 'border-amber-300 bg-white text-amber-900 hover:bg-amber-100'}`}>
													{option.label}
												</button>
											)
										})}
									</div>
								</div>
								<button
									type='button'
									onClick={() => {
										void syncQueuedAdminSaves(true)
									}}
									disabled={isAutoSyncingAdminSaves}
									className='rounded-full border border-amber-400 bg-white px-4 py-2 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60'>
									{isAutoSyncingAdminSaves ? 'Syncing Queue...' : 'Sync Queue Now'}
								</button>
							</div>

							<div className='mt-3 space-y-2'>
								{filteredPendingQueueRows.length > 0 ? (
									filteredPendingQueueRows.map((row) => (
										<article key={row.id} className='rounded-xl border border-amber-200 bg-white/90 px-3 py-2'>
											<div className='flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between'>
												<p className='text-[11px] font-semibold uppercase tracking-wide text-amber-900'>{row.kindLabel}</p>
												<p className='text-[11px] text-amber-800'>Queued {formatDate(row.queuedAt)}</p>
											</div>
											<p className='mt-1 text-sm font-medium text-amber-950'>{row.targetLabel}</p>
											<p className='mt-1 text-xs text-amber-900'>{row.detail}</p>
											<p className='mt-1 text-[11px] text-amber-800/90'>Change: {row.summary}</p>
										</article>
									))
								) : (
									<p className='rounded-xl border border-amber-200 bg-white/80 px-3 py-2 text-xs text-amber-800'>No queued items for this filter.</p>
								)}
							</div>
						</section>
					) : null}

					{allowEventEditor ? (
						<section className='rounded-[28px] border border-[var(--border-soft)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)] sm:p-8'>
							<div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
								<div>
									<h2 className='text-xl font-semibold text-[var(--text-primary)]'>Edit After Publish</h2>
									<p className='mt-1 text-sm text-[var(--text-secondary)]'>Edit judges, rubric criteria, contestants/participants, presentation slots, and rubric legend directly from this dashboard.</p>
									<p className='mt-2 text-xs text-amber-700'>Saving this editor resets all current judge submissions so scoring stays consistent with the new structure.</p>
								</div>
								<div className='flex flex-wrap items-center gap-2'>
									<button
										type='button'
										onClick={() => {
											setShowEventEditor((current) => !current)
											if (!showEventEditor) {
												loadEventEditorFromCurrentEvent()
											}
										}}
										className='rounded-full border border-[var(--border-strong)] bg-[var(--surface-muted)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface)]'>
										{showEventEditor ? 'Hide Editor' : 'Open Editor Fields'}
									</button>
									<button type='button' onClick={loadEventEditorFromCurrentEvent} className='rounded-full border border-[var(--border-strong)] bg-[var(--surface-muted)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface)]'>
										Reload Snapshot
									</button>
								</div>
							</div>

							{eventEditorError ? <p className='mt-4 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700'>{eventEditorError}</p> : null}
							{eventEditorNotice ? <p className='mt-4 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700'>{eventEditorNotice}</p> : null}

							{showEventEditor ? (
								<div className='mt-4 space-y-6'>
									<section className='rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] p-4'>
										<h3 className='text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]'>Event Details</h3>
										<div className='mt-3 grid gap-3 sm:grid-cols-2'>
											<label className='text-xs text-[var(--text-secondary)]'>
												Title
												<input
													type='text'
													value={eventEditorDraft.title}
													onChange={(event) => {
														const value = event.target.value
														updateEventEditorDraft((previous) => ({ ...previous, title: value }))
													}}
													className='mt-1 w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none ring-emerald-500 focus:ring-2'
												/>
											</label>

											<label className='text-xs text-[var(--text-secondary)]'>
												Created By
												<input
													type='text'
													value={eventEditorDraft.createdBy ?? ''}
													onChange={(event) => {
														const value = event.target.value
														updateEventEditorDraft((previous) => ({ ...previous, createdBy: value }))
													}}
													className='mt-1 w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none ring-emerald-500 focus:ring-2'
												/>
											</label>

											<label className='text-xs text-[var(--text-secondary)]'>
												Scoring Type
												<select
													value={eventEditorDraft.eventScoringType ?? 'standard'}
													onChange={(event) => {
														const value = event.target.value === 'final-oral-defense' ? 'final-oral-defense' : 'standard'
														updateEventEditorDraft((previous) => ({ ...previous, eventScoringType: value }))
													}}
													className='mt-1 w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none ring-emerald-500 focus:ring-2'>
													<option value='standard'>Standard</option>
													<option value='final-oral-defense'>Final Oral Defense</option>
												</select>
											</label>

											<label className='sm:col-span-2 text-xs text-[var(--text-secondary)]'>
												Description
												<textarea
													value={eventEditorDraft.description ?? ''}
													onChange={(event) => {
														const value = event.target.value
														updateEventEditorDraft((previous) => ({ ...previous, description: value }))
													}}
													rows={3}
													className='mt-1 w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none ring-emerald-500 focus:ring-2'
												/>
											</label>
										</div>
									</section>

									<section className='rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] p-4'>
										<div className='flex items-center justify-between gap-2'>
											<h3 className='text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]'>Rubric Legend</h3>
											<div className='flex gap-2'>
												<button
													type='button'
													onClick={() => {
														updateEventEditorDraft((previous) => ({
															...previous,
															rubricLegend: [...normalizeRubricLegend(previous.rubricLegend), { score: 0, label: '' }],
														}))
													}}
													className='rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface-muted)]'>
													Add Legend Row
												</button>
												<button
													type='button'
													onClick={() => {
														updateEventEditorDraft((previous) => ({ ...previous, rubricLegend: normalizeRubricLegend(undefined) }))
													}}
													className='rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface-muted)]'>
													Reset Default
												</button>
											</div>
										</div>

										<div className='mt-3 space-y-2'>
											{normalizeRubricLegend(eventEditorDraft.rubricLegend).map((legendItem, legendIndex) => (
												<div key={`legend-${legendIndex}`} className='grid gap-2 sm:grid-cols-[120px_1fr_auto]'>
													<input
														type='number'
														step='1'
														value={legendItem.score}
														onChange={(event) => {
															const numericScore = Number(event.target.value)
															updateEventEditorDraft((previous) => ({
																...previous,
																rubricLegend: normalizeRubricLegend(previous.rubricLegend).map((item, itemIndex) => (itemIndex === legendIndex ? { ...item, score: Number.isFinite(numericScore) ? numericScore : 0 } : item)),
															}))
														}}
														className='rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none ring-emerald-500 focus:ring-2'
													/>
													<input
														type='text'
														value={legendItem.label}
														onChange={(event) => {
															const value = event.target.value
															updateEventEditorDraft((previous) => ({
																...previous,
																rubricLegend: normalizeRubricLegend(previous.rubricLegend).map((item, itemIndex) => (itemIndex === legendIndex ? { ...item, label: value } : item)),
															}))
														}}
														className='rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none ring-emerald-500 focus:ring-2'
													/>
													<button
														type='button'
														onClick={() => {
															updateEventEditorDraft((previous) => ({
																...previous,
																rubricLegend: normalizeRubricLegend(previous.rubricLegend).filter((_, itemIndex) => itemIndex !== legendIndex),
															}))
														}}
														className='rounded-full border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 transition hover:bg-rose-100'>
														Remove
													</button>
												</div>
											))}
										</div>
									</section>

									<section className='rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] p-4'>
										<div className='flex items-center justify-between gap-2'>
											<h3 className='text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]'>Judges</h3>
											<button
												type='button'
												onClick={() => {
													updateEventEditorDraft((previous) => ({
														...previous,
														judges: [...previous.judges, { id: createLocalEditorId('judge'), name: '', email: '' }],
													}))
												}}
												className='rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface-muted)]'>
												Add Judge
											</button>
										</div>

										<div className='mt-3 space-y-2'>
											{eventEditorDraft.judges.map((judge, judgeIndex) => (
												<div key={judge.id ?? `judge-${judgeIndex}`} className='grid gap-2 sm:grid-cols-[1fr_1fr_auto]'>
													<input
														type='text'
														placeholder='Judge name'
														value={judge.name}
														onChange={(event) => {
															const value = event.target.value
															updateEventEditorDraft((previous) => ({
																...previous,
																judges: previous.judges.map((item, itemIndex) => (itemIndex === judgeIndex ? { ...item, name: value } : item)),
															}))
														}}
														className='rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none ring-emerald-500 focus:ring-2'
													/>
													<input
														type='text'
														placeholder='Email (optional)'
														value={judge.email ?? ''}
														onChange={(event) => {
															const value = event.target.value
															updateEventEditorDraft((previous) => ({
																...previous,
																judges: previous.judges.map((item, itemIndex) => (itemIndex === judgeIndex ? { ...item, email: value } : item)),
															}))
														}}
														className='rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none ring-emerald-500 focus:ring-2'
													/>
													<button
														type='button'
														onClick={() => {
															updateEventEditorDraft((previous) => ({
																...previous,
																judges: previous.judges.filter((_, itemIndex) => itemIndex !== judgeIndex),
															}))
														}}
														className='rounded-full border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 transition hover:bg-rose-100'>
														Remove
													</button>
												</div>
											))}
										</div>
									</section>

									<section className='rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] p-4'>
										<div className='flex items-center justify-between gap-2'>
											<h3 className='text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]'>Contestants / Entries</h3>
											<button
												type='button'
												onClick={() => {
													updateEventEditorDraft((previous) => ({
														...previous,
														contestants: [...previous.contestants, { id: createLocalEditorId('contestant'), name: '', entryType: 'group', participants: [], programTag: null, noatScore: null }],
													}))
												}}
												className='rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface-muted)]'>
												Add Entry
											</button>
										</div>

										<div className='mt-3 space-y-3'>
											{eventEditorDraft.contestants.map((contestant, contestantIndex) => (
												<div key={contestant.id ?? `contestant-${contestantIndex}`} className='rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-3 space-y-2'>
													<div className='grid gap-2 sm:grid-cols-[1fr_120px_120px_1fr_1fr_100px_auto]'>
														<input
															type='text'
															placeholder='Contestant or team name'
															value={contestant.name}
															onChange={(event) => {
																const value = event.target.value
																updateEventEditorDraft((previous) => ({
																	...previous,
																	contestants: previous.contestants.map((item, itemIndex) => (itemIndex === contestantIndex ? { ...item, name: value } : item)),
																}))
															}}
															className='rounded-xl border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none ring-emerald-500 focus:ring-2'
														/>
														<select
															value={contestant.entryType === 'individual' ? 'individual' : 'group'}
															onChange={(event) => {
																const value = event.target.value === 'individual' ? 'individual' : 'group'
																updateEventEditorDraft((previous) => ({
																	...previous,
																	contestants: previous.contestants.map((item, itemIndex) =>
																		itemIndex === contestantIndex
																			? {
																					...item,
																					entryType: value,
																					participants: value === 'individual' ? [] : item.participants,
																				}
																			: item,
																	),
																}))
															}}
															className='rounded-xl border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none ring-emerald-500 focus:ring-2'>
															<option value='group'>Group</option>
															<option value='individual'>Individual</option>
														</select>
														<select
															value={contestant.programTag ?? ''}
															onChange={(event) => {
																const value = event.target.value === 'BSINT' || event.target.value === 'BSCS' ? event.target.value : null
																updateEventEditorDraft((previous) => ({
																	...previous,
																	contestants: previous.contestants.map((item, itemIndex) => (itemIndex === contestantIndex ? { ...item, programTag: value } : item)),
																}))
															}}
															className='rounded-xl border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none ring-emerald-500 focus:ring-2'>
															<option value=''>Program</option>
															<option value='BSINT'>BSINT</option>
															<option value='BSCS'>BSCS</option>
														</select>
														<input
															type='text'
															placeholder='Academic Track'
															value={contestant.academicTrack ?? ''}
															onChange={(event) => {
																const value = event.target.value
																updateEventEditorDraft((previous) => ({
																	...previous,
																	contestants: previous.contestants.map((item, itemIndex) => (itemIndex === contestantIndex ? { ...item, academicTrack: value } : item)),
																}))
															}}
															className='rounded-xl border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none ring-emerald-500 focus:ring-2'
														/>
														<input
															type='text'
															placeholder='Laptop / Remark'
															value={contestant.laptopAvailable ?? ''}
															onChange={(event) => {
																const value = event.target.value
																updateEventEditorDraft((previous) => ({
																	...previous,
																	contestants: previous.contestants.map((item, itemIndex) => (itemIndex === contestantIndex ? { ...item, laptopAvailable: value } : item)),
																}))
															}}
															className='rounded-xl border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none ring-emerald-500 focus:ring-2'
														/>
														<input
															type='number'
															min={0}
															step='0.01'
															placeholder='NOAT'
															value={contestant.noatScore ?? ''}
															onChange={(event) => {
																const rawValue = event.target.value
																const numericValue = Number.parseFloat(rawValue)
																const nextNoatScore = rawValue.trim() === '' || !Number.isFinite(numericValue) || numericValue < 0 ? null : Math.round(numericValue * 1000) / 1000
																updateEventEditorDraft((previous) => ({
																	...previous,
																	contestants: previous.contestants.map((item, itemIndex) => (itemIndex === contestantIndex ? { ...item, noatScore: nextNoatScore } : item)),
																}))
															}}
															className='rounded-xl border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2 text-right text-sm text-[var(--text-primary)] outline-none ring-emerald-500 focus:ring-2'
														/>
														<button
															type='button'
															onClick={() => {
																updateEventEditorDraft((previous) => ({
																	...previous,
																	contestants: previous.contestants.filter((_, itemIndex) => itemIndex !== contestantIndex),
																}))
															}}
															className='rounded-full border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 transition hover:bg-rose-100'>
															Remove
														</button>
													</div>

													{contestant.entryType !== 'individual' ? (
														<label className='block text-xs text-[var(--text-secondary)]'>
															Participants (comma or new line separated)
															<textarea
																value={Array.isArray(contestant.participants) ? contestant.participants.join('\n') : ''}
																onChange={(event) => {
																	const value = event.target.value
																	updateEventEditorDraft((previous) => ({
																		...previous,
																		contestants: previous.contestants.map((item, itemIndex) => (itemIndex === contestantIndex ? { ...item, participants: uniqueTrimmedNames(value) } : item)),
																	}))
																}}
																rows={2}
																className='mt-1 w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none ring-emerald-500 focus:ring-2'
															/>
														</label>
													) : null}
												</div>
											))}
										</div>
									</section>

									<section className='rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] p-4'>
										<div className='flex items-center justify-between gap-2'>
											<h3 className='text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]'>Rubric Criteria</h3>
											<button
												type='button'
												onClick={() => {
													updateEventEditorDraft((previous) => ({
														...previous,
														criteria: [
															...previous.criteria,
															{
																id: createLocalEditorId('criterion'),
																name: '',
																subCriteria: [{ id: createLocalEditorId('subcriterion'), name: '', maxScore: 0 }],
															},
														],
													}))
												}}
												className='rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface-muted)]'>
												Add Criterion
											</button>
										</div>
										<p className='mt-2 text-xs text-[var(--text-secondary)]'>Subcriteria here are shared. Updates are applied automatically to all students/members.</p>
										<p className='mt-1 text-xs text-[var(--text-secondary)]'>
											Total Rubric Score: <span className='font-semibold text-[var(--text-primary)]'>{formatScore(eventEditorRubricTotalScore)}</span>
										</p>
										<p className='mt-1 text-[11px] text-[var(--text-muted)]'>Totals shown here are based on the visible shared subcriteria values.</p>

										<div className='mt-3 space-y-3'>
											{eventEditorDraft.criteria.map((criterion, criterionIndex) => {
												const criterionTotalScore = criterionTotalScoreForEditor(criterion)

												return (
													<div key={criterion.id ?? `criterion-${criterionIndex}`} className='rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-3 space-y-2'>
														<div className='grid gap-2 sm:grid-cols-[1fr_auto_auto]'>
															<input
																type='text'
																placeholder='Criterion name'
																value={criterion.name}
																onChange={(event) => {
																	const value = event.target.value
																	updateEventEditorDraft((previous) => ({
																		...previous,
																		criteria: previous.criteria.map((item, itemIndex) => (itemIndex === criterionIndex ? { ...item, name: value } : item)),
																	}))
																}}
																className='rounded-xl border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none ring-emerald-500 focus:ring-2'
															/>
															<p className='inline-flex items-center justify-center rounded-full border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)]'>Total Score: {formatScore(criterionTotalScore)}</p>
															<button
																type='button'
																onClick={() => {
																	updateEventEditorDraft((previous) => ({
																		...previous,
																		criteria: previous.criteria.filter((_, itemIndex) => itemIndex !== criterionIndex),
																	}))
																}}
																className='rounded-full border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 transition hover:bg-rose-100'>
																Remove Criterion
															</button>
														</div>

														<div className='space-y-2'>
															{criterion.subCriteria.map((subCriterion, subCriterionIndex) => (
																<div key={subCriterion.id ?? `sub-${criterionIndex}-${subCriterionIndex}`} className='grid gap-2 sm:grid-cols-[1fr_160px_auto]'>
																	<input
																		type='text'
																		placeholder='Subcriterion name'
																		value={subCriterion.name}
																		onChange={(event) => {
																			const value = event.target.value
																			updateEventEditorDraft((previous) => ({
																				...previous,
																				criteria: previous.criteria.map((criterionItem, criterionItemIndex) =>
																					criterionItemIndex !== criterionIndex
																						? criterionItem
																						: {
																								...criterionItem,
																								subCriteria: criterionItem.subCriteria.map((subItem, subItemIndex) => (subItemIndex === subCriterionIndex ? { ...subItem, name: value } : subItem)),
																							},
																				),
																			}))
																		}}
																		className='rounded-xl border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none ring-emerald-500 focus:ring-2'
																	/>
																	<input
																		type='number'
																		step='0.01'
																		min='0'
																		value={subCriterion.maxScore}
																		onChange={(event) => {
																			const numericValue = Number(event.target.value)
																			updateEventEditorDraft((previous) => ({
																				...previous,
																				criteria: previous.criteria.map((criterionItem, criterionItemIndex) =>
																					criterionItemIndex !== criterionIndex
																						? criterionItem
																						: {
																								...criterionItem,
																								subCriteria: criterionItem.subCriteria.map((subItem, subItemIndex) => (subItemIndex === subCriterionIndex ? { ...subItem, maxScore: Number.isFinite(numericValue) ? numericValue : 0 } : subItem)),
																							},
																				),
																			}))
																		}}
																		className='rounded-xl border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none ring-emerald-500 focus:ring-2'
																	/>
																	<button
																		type='button'
																		onClick={() => {
																			updateEventEditorDraft((previous) => ({
																				...previous,
																				criteria: previous.criteria.map((criterionItem, criterionItemIndex) =>
																					criterionItemIndex !== criterionIndex
																						? criterionItem
																						: {
																								...criterionItem,
																								subCriteria: criterionItem.subCriteria.filter((_, subItemIndex) => subItemIndex !== subCriterionIndex),
																							},
																				),
																			}))
																		}}
																		className='rounded-full border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 transition hover:bg-rose-100'>
																		Remove
																	</button>
																</div>
															))}

															<button
																type='button'
																onClick={() => {
																	updateEventEditorDraft((previous) => ({
																		...previous,
																		criteria: previous.criteria.map((criterionItem, criterionItemIndex) =>
																			criterionItemIndex === criterionIndex
																				? {
																						...criterionItem,
																						subCriteria: [...criterionItem.subCriteria, { id: createLocalEditorId('subcriterion'), name: '', maxScore: 0 }],
																					}
																				: criterionItem,
																		),
																	}))
																}}
																className='rounded-full border border-[var(--border-strong)] bg-[var(--surface-muted)] px-3 py-1 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface)]'>
																Add Subcriterion
															</button>
														</div>
													</div>
												)
											})}
										</div>
									</section>

									<section className='rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] p-4'>
										<h3 className='text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]'>Presentation Assignments</h3>
										<p className='mt-1 text-xs text-[var(--text-secondary)]'>Slots are auto-synced with entries. Edit slot labels and assigned judges below.</p>
										<div className='mt-3 space-y-3'>
											{(eventEditorDraft.presentationSlots ?? []).map((slot, slotIndex) => {
												const contestantName = eventEditorDraft.contestants.find((contestant) => contestant.id === slot.contestantId)?.name || `Entry ${slotIndex + 1}`

												return (
													<div key={slot.id ?? `slot-${slotIndex}`} className='rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-3 space-y-2'>
														<p className='text-xs text-[var(--text-secondary)]'>
															Entry: <span className='font-semibold text-[var(--text-primary)]'>{contestantName}</span>
														</p>
														<input
															type='text'
															placeholder='Slot label'
															value={slot.label}
															onChange={(event) => {
																const value = event.target.value
																updateEventEditorDraft((previous) => ({
																	...previous,
																	presentationSlots: (previous.presentationSlots ?? []).map((item, itemIndex) => (itemIndex === slotIndex ? { ...item, label: value } : item)),
																}))
															}}
															className='w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none ring-emerald-500 focus:ring-2'
														/>

														<div className='flex flex-wrap gap-2'>
															{eventEditorDraft.judges.map((judge, judgeIndex) => {
																const judgeId = String(judge.id ?? '').trim()
																if (!judgeId) {
																	return null
																}

																const isChecked = (slot.judgeIds ?? []).includes(judgeId)

																return (
																	<label key={`${judgeId}-${judgeIndex}`} className='inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-1 text-xs text-[var(--text-primary)]'>
																		<input
																			type='checkbox'
																			checked={isChecked}
																			onChange={(event) => {
																				const checked = event.target.checked
																				updateEventEditorDraft((previous) => ({
																					...previous,
																					presentationSlots: (previous.presentationSlots ?? []).map((item, itemIndex) => {
																						if (itemIndex !== slotIndex) {
																							return item
																						}

																						const judgeIdSet = new Set(item.judgeIds ?? [])
																						if (checked) {
																							judgeIdSet.add(judgeId)
																						} else {
																							judgeIdSet.delete(judgeId)
																						}

																						return {
																							...item,
																							judgeIds: Array.from(judgeIdSet),
																						}
																					}),
																				}))
																			}}
																		/>
																		{judge.name || `Judge ${judgeIndex + 1}`}
																	</label>
																)
															})}
														</div>
													</div>
												)
											})}
										</div>
									</section>

									<div className='flex flex-wrap items-center gap-2'>
										<button
											type='button'
											onClick={() => {
												void saveEventEditor()
											}}
											disabled={isSavingEventEditor}
											className='rounded-full border border-emerald-700 bg-emerald-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60'>
											{isSavingEventEditor ? 'Saving Published Event...' : 'Save Published Event Changes'}
										</button>
										<button
											type='button'
											onClick={() => {
												setShowEventEditor(false)
												setEventEditorError(null)
											}}
											disabled={isSavingEventEditor}
											className='rounded-full border border-[var(--border-strong)] bg-[var(--surface-muted)] px-5 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-60'>
											Cancel
										</button>
									</div>
								</div>
							) : null}
						</section>
					) : null}

					<section className='rounded-[28px] border border-[var(--border-soft)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)] sm:p-8'>
						<h2 className='text-xl font-semibold text-[var(--text-primary)]'>Winners</h2>
						<p className='mt-1 text-sm text-[var(--text-secondary)]'>
							{useDirectFinalRating
								? 'Final Rating = normalized average (AVE/GPA, NOAT, Interview). Aligned strand bonus is applied to Interview points only.'
								: useWeightedScores
									? 'Final Oral Defense is shown separately by Group and Individual scoring. Final Score = (Group Rating x 60%) + (Individual Rating x 40%).'
									: 'Final Score is computed as Total Score / Total Judges.'}
						</p>

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
											) : useDirectFinalRating ? (
												<>
													<p className='mt-2 text-sm text-[var(--text-secondary)]'>
														Final Rating: <span className='font-semibold'>{formatScore(winner.finalRating ?? winner.averageScore)}</span>
													</p>
													<p className='text-xs text-[var(--text-muted)]'>
														Base: {formatScore(winner.baseFinalRating ?? 0)} · Interview Bonus Applied: +{formatScore(winner.bonusPoints ?? 0)}
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
						<p className='mt-1 text-sm text-[var(--text-secondary)]'>Top teams and per-contestant participant rankings separated for BSINT and BSCS.</p>

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
												<p className='text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]'>Per-Contestant Criteria Participant Rankings</p>
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
						<div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
							<div>
								<h2 className='text-xl font-semibold text-[var(--text-primary)]'>Compiled Scores</h2>
								{useWeightedScores ? (
									<p className='mt-1 text-xs text-[var(--text-secondary)]'>Final Oral Defense only: Final Score = (Group Rating x 60%) + (Individual Rating x 40%). Ratings are computed from the current rubric max scores.</p>
								) : useDirectFinalRating ? (
									<p className='mt-1 text-xs text-[var(--text-secondary)]'>Direct Rating: Final Rating = normalized average (AVE/GPA, NOAT, Interview), with aligned strand bonus applied to Interview points only.</p>
								) : null}
							</div>
							{useDirectFinalRating && (
								<div className='flex flex-wrap items-center gap-3 shrink-0'>
									{filterOptions.strands.length > 0 && (
										<select value={strandFilter} onChange={(e) => setStrandFilter(e.target.value)} className='rounded-xl border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400'>
											<option value='All'>All Strands</option>
											{filterOptions.strands.map((s) => (
												<option key={s} value={s}>
													{s}
												</option>
											))}
										</select>
									)}
									{filterOptions.remarks.length > 0 && (
										<select value={remarkFilter} onChange={(e) => setRemarkFilter(e.target.value)} className='rounded-xl border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400'>
											<option value='All'>All Remarks</option>
											{filterOptions.remarks.map((r) => (
												<option key={r} value={r}>
													{r}
												</option>
											))}
										</select>
									)}
								</div>
							)}
						</div>
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
														<input
															type='checkbox'
															checked={allContestantsBSINT}
															disabled={isSavingProgramAssignments}
															onChange={(event) => setProgramForAllContestants(event.target.checked ? 'BSINT' : null)}
															className='rounded border-[var(--border-strong)] text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60'
														/>
														All BSINT
													</label>
													<label className='flex items-center gap-1 cursor-pointer'>
														<input
															type='checkbox'
															checked={allContestantsBSCS}
															disabled={isSavingProgramAssignments}
															onChange={(event) => setProgramForAllContestants(event.target.checked ? 'BSCS' : null)}
															className='rounded border-[var(--border-strong)] text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60'
														/>
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
										) : useDirectFinalRating ? (
											<>
												<th className='border-b border-[var(--border-soft)] px-3 py-3 font-semibold'>AVE/GPA</th>
												<th className='border-b border-[var(--border-soft)] px-3 py-3 font-semibold'>NOAT</th>
												<th className='border-b border-[var(--border-soft)] px-3 py-3 font-semibold'>Interview</th>
												<th className='border-b border-[var(--border-soft)] px-3 py-3 font-semibold'>Final Rating</th>
												<th className='border-b border-[var(--border-soft)] px-3 py-3 font-semibold'>Total Score</th>
												<th className='border-b border-[var(--border-soft)] px-3 py-3 font-semibold'>Strand</th>
												<th className='border-b border-[var(--border-soft)] px-3 py-3 font-semibold'>Remark</th>
												<th className='border-b border-[var(--border-soft)] px-3 py-3 font-semibold'>Additional Remark</th>
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
									{filteredRankings.map((result, index) => {
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

										const hasParticipantScores = Array.isArray(result.participantScores) && result.participantScores.length > 0

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
																<input
																	type='checkbox'
																	checked={currentProgram === 'BSINT'}
																	disabled={isSavingProgramAssignments}
																	onChange={() => toggleContestantProgram(result.contestantId, 'BSINT')}
																	className='rounded border-[var(--border-strong)] text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60'
																/>
																BSINT
															</label>
															<label className='flex items-center gap-1 text-xs cursor-pointer'>
																<input
																	type='checkbox'
																	checked={currentProgram === 'BSCS'}
																	disabled={isSavingProgramAssignments}
																	onChange={() => toggleContestantProgram(result.contestantId, 'BSCS')}
																	className='rounded border-[var(--border-strong)] text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60'
																/>
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
													) : useDirectFinalRating ? (
														<>
															<td className='border-b border-[var(--border-soft)] px-3 py-3'>{formatScore(result.directDetails?.aveGpa ?? 0)}</td>
															<td className='border-b border-[var(--border-soft)] px-3 py-3'>{formatScore(result.directDetails?.noat ?? 0)}</td>
															<td className='border-b border-[var(--border-soft)] px-3 py-3'>{formatScore(result.directDetails?.totalInterview ?? 0)}</td>
															<td className='border-b border-[var(--border-soft)] px-3 py-3 font-semibold'>{formatScore(result.finalRating ?? result.averageScore)}</td>
															<td className='border-b border-[var(--border-soft)] px-3 py-3'>{formatScore(result.totalScore)}</td>
															<td className='border-b border-[var(--border-soft)] px-3 py-3 text-xs'>{result.directDetails?.strand || '-'}</td>
															<td className='border-b border-[var(--border-soft)] px-3 py-3 text-xs'>{result.directDetails?.remark || '-'}</td>
															<td className='border-b border-[var(--border-soft)] px-3 py-3 text-xs'>{result.directDetails?.additionalInfo || '-'}</td>
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
																	{result.participantScores?.map((participant, participantIndex) => {
																		const participantRating = participantAnalyticsScore(participant)
																		return (
																			<span key={`${result.contestantId}-${participant.participantLabel}-${participantIndex}`} className='rounded-full border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1'>
																				{participant.participantLabel}: {formatScore(participant.averageScore)} / {formatScore(participant.maxScore)} ({formatPercent(participantRating)})
																			</span>
																		)
																	})}
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
						<p className='mt-1 text-xs text-[var(--text-secondary)]'>Legend: {rubricLegendText}</p>
						<div className='mt-4 grid gap-4'>
							{event.criteria.map((criterion) => {
								const showPerContestantParticipants = isIndividualPresentationCriterion(criterion)
								const criterionScopeLabel = showPerContestantParticipants ? 'Per Contestant (Individual)' : 'Group Criteria Only'

								return (
									<article key={criterion.id} className='rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] p-4'>
										<div className='flex flex-wrap items-center justify-between gap-2'>
											<p className='text-sm font-semibold text-[var(--text-primary)]'>
												{criterion.name} (Max: {formatScore(criterionMaxScore(criterion))})
											</p>
											<span className='rounded-full border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)]'>Scope: {criterionScopeLabel}</span>
										</div>

										{showPerContestantParticipants ? (
											<div className='mt-2 space-y-3'>
												{event.contestants.map((contestant) => {
													const mergedSubCriteria = mergedIndividualSubCriteriaForContestant(criterion, contestant)

													return (
														<div key={`${criterion.id}-${contestant.id}`} className='rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] p-3'>
															<p className='text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]'>{contestant.name}</p>
															<div className='mt-2 space-y-2'>
																{mergedSubCriteria.map((item) => (
																	<div key={`${contestant.id}-${item.id}`} className='grid gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2 text-sm sm:grid-cols-2'>
																		<span className='text-[var(--text-primary)]'>{item.name}</span>
																		<span className='text-[var(--text-secondary)]'>Max Score: {formatScore(item.maxScore)}</span>
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

					<section className='print:hidden rounded-[28px] border border-[var(--border-soft)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)] sm:p-8'>
						<h2 className='text-xl font-semibold text-[var(--text-primary)]'>Judge Remarks</h2>
						<p className='mt-1 text-xs text-[var(--text-secondary)]'>Additional remarks and comments left by judges for each contestant.</p>
						<div className='mt-4 grid gap-4'>
							{event.contestants.map((contestant) => {
								const remarksForContestant = event.submissions
									.map((submission) => {
										const details = submission.contestantDetails?.[contestant.id]
										const judgeName = event.judges.find((j) => j.id === submission.judgeId)?.name || 'Unknown Judge'
										if (!details?.additionalInfo && !details?.remark) return null
										return { judgeName, remark: details.remark, additionalInfo: details.additionalInfo }
									})
									.filter((item): item is NonNullable<typeof item> => item !== null)

								if (remarksForContestant.length === 0) return null

								return (
									<article key={contestant.id} className='rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] p-4'>
										<p className='text-sm font-semibold text-[var(--text-primary)]'>{contestant.name}</p>
										<div className='mt-2 space-y-2'>
											{remarksForContestant.map((item, idx) => (
												<div key={idx} className='rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm'>
													<span className='font-semibold text-[var(--text-primary)]'>{item.judgeName}:</span> <span className='text-[var(--text-secondary)]'>{[item.remark, item.additionalInfo].filter(Boolean).join(' - ')}</span>
												</div>
											))}
										</div>
									</article>
								)
							})}
							{event.contestants.every((contestant) => !event.submissions.some((sub) => sub.contestantDetails?.[contestant.id]?.additionalInfo || sub.contestantDetails?.[contestant.id]?.remark)) && <p className='text-sm text-[var(--text-secondary)]'>No remarks have been submitted yet.</p>}
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
							<th className='border border-black p-2 font-bold uppercase'>{useDirectFinalRating ? 'Final Rating' : 'Final Score'}</th>
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
								<td className='border border-black p-2 font-bold'>{formatScore(useWeightedScores ? (result.weightedScore ?? result.averageScore) : useDirectFinalRating ? (result.finalRating ?? result.averageScore) : result.averageScore)}</td>
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

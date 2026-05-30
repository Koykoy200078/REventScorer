'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Select from 'react-select'

import { deriveDirectRatingConfigFromCriteria, detectDirectRatingScoreFields, DIRECT_RATING_STRAND_SELECT_GROUPS, DIRECT_RATING_TRACK_STRAND_TREE, normalizeDirectRatingConfig, resolveStrandAlignmentBonus, DIRECT_SCORE_FIELD_ORDER, DIRECT_SCORE_FIELD_LABELS } from '@/lib/direct-rating-config'
import { formatRubricLegend, normalizeRubricLegend } from '@/lib/rubric-legend'
import type { DirectRatingConfig, EventContestant, EventCriterion, EventPresentationSlot, JudgeContestantDetailsMap, JudgeProfile, RubricLegendItem, ScoreMatrix } from '@/lib/types'

type InputScoreMatrix = Record<string, Record<string, string>>
type InputContestantDetailsMap = Record<string, { strand: string; remark: string; additionalInfo: string }>
type DirectScoreField = ReturnType<typeof detectDirectRatingScoreFields>[number]

const DIRECT_REMARK_OPTIONS = ['Nihangyo + off-track', 'ON TRACK', 'ON TRACK with HIGH POTENTIAL', 'Transferee', 'OFF-TRACK with HIGH GRADES (STEM)', 'OFF-TRACK with POTENTIAL', 'OFF-TRACK']

const TVL_TRACK_NAME = 'Technical-Vocational-Livelihood (TVL) Track'

function getTVLLeafStrandOptions(): Array<{ value: string; label: string; group: string }> {
	const tvlTree = DIRECT_RATING_TRACK_STRAND_TREE.find((t) => t.track === TVL_TRACK_NAME)
	if (!tvlTree) return []
	const result: Array<{ value: string; label: string; group: string }> = []
	for (const node of tvlTree.nodes) {
		if (node.children && node.children.length > 0) {
			for (const child of node.children) {
				result.push({ value: child.value, label: child.label, group: node.label })
			}
		} else {
			result.push({ value: node.value, label: node.label, group: TVL_TRACK_NAME })
		}
	}
	return result
}

const TVL_LEAF_STRAND_OPTIONS = getTVLLeafStrandOptions()

function isTVLAcademicTrack(academicTrack: string | undefined): boolean {
	if (!academicTrack) return false
	const upper = academicTrack.toUpperCase()
	return upper.includes('TVL') || upper.includes('TECHNICAL-VOCATIONAL') || upper.includes('TECHNICAL') || upper.includes('VOCATIONAL')
}

function autoResolveStrand(academicTrack: string | undefined): string | null {
	if (!academicTrack) return null
	const lower = academicTrack.toLowerCase()
	if (lower.includes('science') || lower.includes('stem')) return 'Science, Technology, Engineering, and Mathematics (STEM)'
	if (lower.includes('accountancy') || lower.includes('abm')) return 'Accountancy, Business and Management (ABM)'
	if (lower.includes('humanities') || lower.includes('humss')) return 'Humanities and Social Sciences (HUMSS)'
	if (lower.includes('general academic') || lower.includes('gas')) return 'General Academic Strand (GAS)'
	if (lower.includes('sports')) return 'Sports Track'
	if (lower.includes('arts') || lower.includes('design')) return 'Arts and Design Track'
	return null
}

interface SubmitScoresRequestBody {
	scores: ScoreMatrix
	contestantId: string
	contestantDetails?: JudgeContestantDetailsMap
}

interface SubmitScoresResponseBody {
	error?: string
	submittedAt?: string
}

interface QueuedScoreUpload {
	id: string
	token: string
	contestantId: string
	contestantName: string
	payload: SubmitScoresRequestBody
	queuedAt: string
}

const QUEUED_SCORE_UPLOADS_STORAGE_KEY = 'eventscorer:queued-score-uploads:v1'
const AUTO_SYNC_INTERVAL_MS = 15_000

class SubmitScoresError extends Error {
	status?: number

	constructor(message: string, status?: number) {
		super(message)
		this.name = 'SubmitScoresError'
		this.status = status
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object'
}

function queuedScoreUploadId(token: string, contestantId: string): string {
	return `${token}:${contestantId}`
}

function readQueuedScoreUploads(): QueuedScoreUpload[] {
	if (typeof window === 'undefined') {
		return []
	}

	try {
		const raw = window.localStorage.getItem(QUEUED_SCORE_UPLOADS_STORAGE_KEY)
		if (!raw) {
			return []
		}

		const parsed = JSON.parse(raw) as unknown
		if (!Array.isArray(parsed)) {
			return []
		}

		const normalized: QueuedScoreUpload[] = []

		for (const entry of parsed) {
			if (!isRecord(entry)) {
				continue
			}

			const token = typeof entry.token === 'string' ? entry.token.trim() : ''
			const contestantId = typeof entry.contestantId === 'string' ? entry.contestantId.trim() : ''
			const contestantName = typeof entry.contestantName === 'string' ? entry.contestantName.trim() : ''
			const queuedAt = typeof entry.queuedAt === 'string' ? entry.queuedAt : new Date().toISOString()

			if (!token || !contestantId || !contestantName) {
				continue
			}

			const payload = entry.payload
			if (!isRecord(payload)) {
				continue
			}

			const payloadContestantId = typeof payload.contestantId === 'string' ? payload.contestantId.trim() : ''
			const payloadScores = payload.scores
			const payloadContestantDetails = payload.contestantDetails

			if (!payloadContestantId || !isRecord(payloadScores) || (payloadContestantDetails !== undefined && !isRecord(payloadContestantDetails))) {
				continue
			}

			normalized.push({
				id: typeof entry.id === 'string' && entry.id.trim().length > 0 ? entry.id : queuedScoreUploadId(token, contestantId),
				token,
				contestantId,
				contestantName,
				payload: {
					contestantId: payloadContestantId,
					scores: payloadScores as ScoreMatrix,
					...(payloadContestantDetails !== undefined ? { contestantDetails: payloadContestantDetails as JudgeContestantDetailsMap } : {}),
				},
				queuedAt,
			})
		}

		return normalized
	} catch {
		return []
	}
}

function writeQueuedScoreUploads(queue: QueuedScoreUpload[]): void {
	if (typeof window === 'undefined') {
		return
	}

	if (queue.length === 0) {
		window.localStorage.removeItem(QUEUED_SCORE_UPLOADS_STORAGE_KEY)
		return
	}

	window.localStorage.setItem(QUEUED_SCORE_UPLOADS_STORAGE_KEY, JSON.stringify(queue))
}

function listQueuedScoreUploadsForToken(token: string): QueuedScoreUpload[] {
	const normalizedToken = token.trim()
	if (!normalizedToken) {
		return []
	}

	return readQueuedScoreUploads()
		.filter((entry) => entry.token === normalizedToken)
		.sort((left, right) => new Date(left.queuedAt).getTime() - new Date(right.queuedAt).getTime())
}

function upsertQueuedScoreUpload(upload: QueuedScoreUpload): void {
	const queue = readQueuedScoreUploads()
	const existingIndex = queue.findIndex((entry) => entry.id === upload.id)

	if (existingIndex >= 0) {
		queue[existingIndex] = upload
	} else {
		queue.push(upload)
	}

	writeQueuedScoreUploads(queue)
}

function removeQueuedScoreUpload(uploadId: string): void {
	const queue = readQueuedScoreUploads()
	const nextQueue = queue.filter((entry) => entry.id !== uploadId)

	if (nextQueue.length === queue.length) {
		return
	}

	writeQueuedScoreUploads(nextQueue)
}

function shouldQueueScoreUpload(error: unknown): boolean {
	if (typeof navigator !== 'undefined' && !navigator.onLine) {
		return true
	}

	if (error instanceof TypeError) {
		return true
	}

	if (error instanceof SubmitScoresError && typeof error.status === 'number' && error.status >= 500) {
		return true
	}

	return false
}

function isServerUnreachableScoreUploadError(error: unknown): boolean {
	if (typeof navigator !== 'undefined' && !navigator.onLine) {
		return true
	}

	if (error instanceof TypeError) {
		return true
	}

	if (error instanceof SubmitScoresError && typeof error.status === 'number' && [502, 503, 504].includes(error.status)) {
		return true
	}

	if (error instanceof Error) {
		const normalizedMessage = error.message.toLowerCase()
		if (normalizedMessage.includes('upstream') || normalizedMessage.includes('unavailable') || normalizedMessage.includes('network')) {
			return true
		}
	}

	return false
}

interface JudgeScoringFormProps {
	token: string
	eventTitle: string
	contestants: EventContestant[]
	criteria: EventCriterion[]
	judge: JudgeProfile
	rubricLegend?: RubricLegendItem[]
	directRatingConfig?: DirectRatingConfig
	presentationSlots?: EventPresentationSlot[]
	existingScores?: ScoreMatrix
	existingSavedContestantIds?: string[]
	existingContestantDetails?: JudgeContestantDetailsMap
	submittedAt?: string
	initialContestantId?: string
	adminEditMode?: boolean
}

function round(value: number): number {
	return Math.round(value * 1000) / 1000
}

function parseAndClampScore(rawValue: string, maxScore: number): number {
	const parsedValue = Number.parseFloat(rawValue)
	const finiteValue = Number.isFinite(parsedValue) ? parsedValue : 0
	return Math.max(0, Math.min(finiteValue, maxScore))
}

function normalizeScoreInput(rawValue: string, maxScore: number): string {
	if (rawValue.trim() === '') {
		return ''
	}

	const parsedValue = Number.parseFloat(rawValue)
	if (!Number.isFinite(parsedValue)) {
		return '0'
	}

	if (parsedValue < 0) {
		return '0'
	}

	if (parsedValue > maxScore) {
		return String(round(maxScore))
	}

	return rawValue
}

function isIndividualCriterion(criterion: EventCriterion): boolean {
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

function criterionScopeLabel(criterion: EventCriterion): string {
	return isIndividualCriterion(criterion) ? 'Per Contestant (Individual)' : 'Group Criteria Only'
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

function normalizedParticipants(contestant?: EventContestant): string[] {
	if (!contestant?.participants) {
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

function allowedMemberCountForContestant(contestant: EventContestant | undefined, subCriteria: EventCriterion['subCriteria']): number {
	const defaultMemberCount = defaultMemberCountFromSubCriteria(subCriteria)

	if (!contestant) {
		return defaultMemberCount
	}

	if (contestant.entryType === 'individual') {
		return 1
	}

	const participants = normalizedParticipants(contestant)
	return participants.length > 0 ? participants.length : defaultMemberCount
}

function resolvedMemberLabel(memberLabel: string, contestant?: EventContestant): string {
	const participants = normalizedParticipants(contestant)
	if (participants.length === 0) {
		const memberIndex = memberIndexFromLabel(memberLabel)
		if (contestant?.entryType === 'individual' && memberIndex === 1) {
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

function groupSubCriteriaByMember(subCriteria: EventCriterion['subCriteria'], contestant?: EventContestant): Array<{ memberLabel: string; memberDisplayLabel: string; items: Array<{ subCriterion: EventCriterion['subCriteria'][number]; displayName: string }> }> {
	const allowedMemberCount = allowedMemberCountForContestant(contestant, subCriteria)
	const grouped = new Map<string, Array<{ subCriterion: EventCriterion['subCriteria'][number]; displayName: string }>>()

	for (const subCriterion of subCriteria) {
		const { memberLabel, displayName } = splitMemberCriterionName(subCriterion.name)
		const memberIndex = memberIndexFromLabel(memberLabel)
		if (memberIndex && memberIndex > allowedMemberCount) {
			continue
		}

		const existing = grouped.get(memberLabel)
		if (existing) {
			existing.push({ subCriterion, displayName })
		} else {
			grouped.set(memberLabel, [{ subCriterion, displayName }])
		}
	}

	return Array.from(grouped.entries()).map(([memberLabel, items]) => ({
		memberLabel,
		memberDisplayLabel: resolvedMemberLabel(memberLabel, contestant),
		items,
	}))
}

function applicableSubCriteriaForContestant(criterion: EventCriterion, contestant?: EventContestant): EventCriterion['subCriteria'] {
	if (!isIndividualCriterion(criterion)) {
		return criterion.subCriteria
	}

	const allowedMemberCount = allowedMemberCountForContestant(contestant, criterion.subCriteria)
	return criterion.subCriteria.filter((subCriterion) => {
		const memberIndex = memberIndexFromLabel(splitMemberCriterionName(subCriterion.name).memberLabel)
		return !memberIndex || memberIndex <= allowedMemberCount
	})
}

function hasPositiveDraftScore(scores: InputScoreMatrix, contestantId: string, criteria: EventCriterion[], ignoredSubCriterionIds: Set<string> = new Set()): boolean {
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

function detectInitiallyScoredContestants(contestants: EventContestant[], criteria: EventCriterion[], existingScores?: ScoreMatrix, existingSavedContestantIds?: string[]): Set<string> {
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

function buildInputMatrix(contestants: EventContestant[], criteria: EventCriterion[], existingScores?: ScoreMatrix): InputScoreMatrix {
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

function buildInputContestantDetails(contestants: EventContestant[], existingContestantDetails?: JudgeContestantDetailsMap): InputContestantDetailsMap {
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

function buildContestantDetailsPayload(contestantDetails: InputContestantDetailsMap): JudgeContestantDetailsMap {
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

function formatDate(iso: string): string {
	return new Intl.DateTimeFormat('en-US', {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(new Date(iso))
}

function migrateLegacyDirectRating(
	rawCriteria: EventCriterion[],
	rawScores: ScoreMatrix | undefined,
	directRatingConfig: DirectRatingConfig | undefined
): { criteria: EventCriterion[]; scores: ScoreMatrix | undefined } {
	const subCriteriaList = rawCriteria.flatMap((c) => c.subCriteria)
	const oldAveId = subCriteriaList.find((sc) => sc.name.toLowerCase().includes('ave') || sc.name.toLowerCase().includes('gpa'))?.id
	const oldNoatId = subCriteriaList.find((sc) => sc.name.toLowerCase() === 'noat')?.id
	const oldInterviewSubCriterion = subCriteriaList.find((sc) => !sc.name.toLowerCase().includes('ave') && !sc.name.toLowerCase().includes('gpa') && sc.name.toLowerCase() !== 'noat')

	if (!oldInterviewSubCriterion || !oldAveId || !oldNoatId) {
		return { criteria: rawCriteria, scores: rawScores }
	}

	const hasNewFields = subCriteriaList.some((sc) => sc.name.toLowerCase().includes('communication') || sc.name.toLowerCase().includes('personality'))
	if (hasNewFields) {
		if (!rawScores) {
			return { criteria: rawCriteria, scores: undefined }
		}

		const newInterviewContentId = subCriteriaList.find((sc) => sc.name.toLowerCase().includes('content') || sc.name.toLowerCase().includes('course'))?.id
		const newInterviewCommId = subCriteriaList.find((sc) => sc.name.toLowerCase().includes('communication'))?.id
		const newInterviewPersId = subCriteriaList.find((sc) => sc.name.toLowerCase().includes('personality'))?.id
		const newInterviewInterestId = subCriteriaList.find((sc) => sc.name.toLowerCase().includes('interest') || sc.name.toLowerCase().includes('commitment'))?.id
		const newInterviewSpecialId = subCriteriaList.find((sc) => sc.name.toLowerCase().includes('special') || sc.name.toLowerCase().includes('talents'))?.id
		
		const aveGpaId = subCriteriaList.find((sc) => sc.name.toLowerCase().includes('ave') || sc.name.toLowerCase().includes('gpa'))?.id
		const noatId = subCriteriaList.find((sc) => sc.name.toLowerCase() === 'noat')?.id

		const knownIds = new Set([newInterviewContentId, newInterviewCommId, newInterviewPersId, newInterviewInterestId, newInterviewSpecialId, aveGpaId, noatId].filter(Boolean))

		const migratedScores: ScoreMatrix = {}
		
		for (const [contestantId, contestantScores] of Object.entries(rawScores)) {
			migratedScores[contestantId] = { ...contestantScores }

			// Find old interview score ID (explicit legacy key, or fallback to first unknown key)
			let oldInterviewId: string | undefined = 'legacy-interview'
			if (contestantScores[oldInterviewId] === undefined) {
				oldInterviewId = Object.keys(contestantScores).find((key) => !knownIds.has(key) && key !== 'legacy-aveGpa' && key !== 'legacy-noat')
			}
			const oldScore = oldInterviewId ? Number(contestantScores[oldInterviewId]) : NaN

			const alreadyMigrated = newInterviewCommId ? contestantScores[newInterviewCommId] !== undefined : false

			if (!alreadyMigrated && Number.isFinite(oldScore) && oldScore > 0) {
				const contentMax = directRatingConfig?.maxScores?.interviewContent ?? 40
				const commMax = directRatingConfig?.maxScores?.interviewComm ?? 20
				const persMax = directRatingConfig?.maxScores?.interviewPers ?? 20
				const interestMax = directRatingConfig?.maxScores?.interviewInterest ?? 10
				const specialMax = directRatingConfig?.maxScores?.interviewSpecial ?? 10
				const totalMax = contentMax + commMax + persMax + interestMax + specialMax

				if (totalMax > 0 && newInterviewContentId && newInterviewCommId && newInterviewPersId && newInterviewInterestId && newInterviewSpecialId) {
					const contentScore = round((oldScore * contentMax) / totalMax)
					const commScore = round((oldScore * commMax) / totalMax)
					const persScore = round((oldScore * persMax) / totalMax)
					const interestScore = round((oldScore * interestMax) / totalMax)
					const specialScore = round(oldScore - (contentScore + commScore + persScore + interestScore))

					migratedScores[contestantId][newInterviewContentId] = contentScore
					migratedScores[contestantId][newInterviewCommId] = commScore
					migratedScores[contestantId][newInterviewPersId] = persScore
					migratedScores[contestantId][newInterviewInterestId] = interestScore
					migratedScores[contestantId][newInterviewSpecialId] = specialScore
				}
			}

			// Map old AVE/GPA and NOAT to new UUIDs
			if (aveGpaId && contestantScores['legacy-aveGpa'] !== undefined && contestantScores[aveGpaId] === undefined) {
				migratedScores[contestantId][aveGpaId] = contestantScores['legacy-aveGpa']
			}
			if (noatId && contestantScores['legacy-noat'] !== undefined && contestantScores[noatId] === undefined) {
				migratedScores[contestantId][noatId] = contestantScores['legacy-noat']
			}
		}

		return { criteria: rawCriteria, scores: migratedScores }
	}

	// Calculate the split manually from the old subcriterion if config doesn't exist, otherwise use config
	const interviewContentMax = directRatingConfig?.maxScores?.interviewContent ?? round((oldInterviewSubCriterion.maxScore * 8) / 20)
	const interviewCommMax = directRatingConfig?.maxScores?.interviewComm ?? round((oldInterviewSubCriterion.maxScore * 4) / 20)
	const interviewPersMax = directRatingConfig?.maxScores?.interviewPers ?? round((oldInterviewSubCriterion.maxScore * 4) / 20)
	const interviewInterestMax = directRatingConfig?.maxScores?.interviewInterest ?? round((oldInterviewSubCriterion.maxScore * 2) / 20)
	const interviewSpecialMax = directRatingConfig?.maxScores?.interviewSpecial ?? round(oldInterviewSubCriterion.maxScore - (interviewContentMax + interviewCommMax + interviewPersMax + interviewInterestMax))

	const normalizedConfig = normalizeDirectRatingConfig({
		...(directRatingConfig ?? {}),
		maxScores: {
			...(directRatingConfig?.maxScores ?? {}),
			aveGpa: directRatingConfig?.maxScores?.aveGpa ?? subCriteriaList.find((sc) => sc.id === oldAveId)?.maxScore ?? 100,
			noat: directRatingConfig?.maxScores?.noat ?? subCriteriaList.find((sc) => sc.id === oldNoatId)?.maxScore ?? 100,
			interviewContent: interviewContentMax,
			interviewComm: interviewCommMax,
			interviewPers: interviewPersMax,
			interviewInterest: interviewInterestMax,
			interviewSpecial: interviewSpecialMax,
		}
	})

	const migratedCriteria: EventCriterion[] = [
		{
			id: 'legacy-migrated-criterion',
			name: 'Direct Rating',
			maxScore: Object.values(normalizedConfig.maxScores).reduce((sum, score) => sum + score, 0),
			subCriteria: DIRECT_SCORE_FIELD_ORDER.map((fieldKey) => ({
				id: `legacy-migrated-${fieldKey}`,
				name: DIRECT_SCORE_FIELD_LABELS[fieldKey],
				maxScore: normalizedConfig.maxScores[fieldKey],
			})),
		},
	]

	if (!rawScores) {
		return { criteria: migratedCriteria, scores: undefined }
	}

	const migratedScores: ScoreMatrix = {}

	for (const [contestantId, contestantScores] of Object.entries(rawScores)) {
		migratedScores[contestantId] = { ...contestantScores }

		const alreadyMigrated = contestantScores['legacy-migrated-interviewComm'] !== undefined
		const oldScore = Number(contestantScores[oldInterviewSubCriterion.id])

		if (!alreadyMigrated && Number.isFinite(oldScore) && oldScore > 0) {
			const contentMax = normalizedConfig.maxScores.interviewContent
			const commMax = normalizedConfig.maxScores.interviewComm
			const persMax = normalizedConfig.maxScores.interviewPers
			const interestMax = normalizedConfig.maxScores.interviewInterest
			const specialMax = normalizedConfig.maxScores.interviewSpecial
			const totalMax = contentMax + commMax + persMax + interestMax + specialMax

			if (totalMax > 0) {
				const contentScore = round((oldScore * contentMax) / totalMax)
				const commScore = round((oldScore * commMax) / totalMax)
				const persScore = round((oldScore * persMax) / totalMax)
				const interestScore = round((oldScore * interestMax) / totalMax)
				const specialScore = round(oldScore - (contentScore + commScore + persScore + interestScore))

				migratedScores[contestantId]['legacy-migrated-interviewContent'] = contentScore
				migratedScores[contestantId]['legacy-migrated-interviewComm'] = commScore
				migratedScores[contestantId]['legacy-migrated-interviewPers'] = persScore
				migratedScores[contestantId]['legacy-migrated-interviewInterest'] = interestScore
				migratedScores[contestantId]['legacy-migrated-interviewSpecial'] = specialScore
			}
		}

		if (oldAveId && contestantScores[oldAveId] !== undefined && contestantScores['legacy-migrated-aveGpa'] === undefined) {
			migratedScores[contestantId]['legacy-migrated-aveGpa'] = contestantScores[oldAveId]
		}
		if (oldNoatId && contestantScores[oldNoatId] !== undefined && contestantScores['legacy-migrated-noat'] === undefined) {
			migratedScores[contestantId]['legacy-migrated-noat'] = contestantScores[oldNoatId]
		}
	}

	return { criteria: migratedCriteria, scores: migratedScores }
}

export function JudgeScoringForm({ token, eventTitle, contestants, criteria: rawCriteria, judge, rubricLegend, directRatingConfig, presentationSlots, existingScores: rawExistingScores, existingSavedContestantIds, existingContestantDetails, submittedAt, initialContestantId, adminEditMode = false }: JudgeScoringFormProps) {
	const topRef = useRef<HTMLDivElement>(null)
	const autoSyncInProgressRef = useRef(false)
	const { criteria, scores: existingScores } = useMemo(() => migrateLegacyDirectRating(rawCriteria, rawExistingScores, directRatingConfig), [rawCriteria, rawExistingScores, directRatingConfig])
	
	const [scores, setScores] = useState<InputScoreMatrix>(() => {
		const matrix = buildInputMatrix(contestants, criteria, existingScores)
		const derivedConfig = deriveDirectRatingConfigFromCriteria(criteria)
		const normalizedConfig = normalizeDirectRatingConfig(directRatingConfig, derivedConfig ?? undefined)
		const directFields = detectDirectRatingScoreFields(criteria, normalizedConfig)
		const noatField = directFields.find((f) => f.key === 'noat')

		if (noatField) {
			for (const contestant of contestants) {
				if (typeof contestant.noatScore === 'number' && Number.isFinite(contestant.noatScore)) {
					if (!matrix[contestant.id]) matrix[contestant.id] = {}
					matrix[contestant.id][noatField.subCriterionId] = contestant.noatScore.toString()
				}
			}
		}

		return matrix
	})
	const [contestantDetails, setContestantDetails] = useState<InputContestantDetailsMap>(() => buildInputContestantDetails(contestants, existingContestantDetails))
	const [savedContestantIds, setSavedContestantIds] = useState<Set<string>>(() => detectInitiallyScoredContestants(contestants, criteria, existingScores, existingSavedContestantIds))
	const [activeContestantIndex, setActiveContestantIndex] = useState(() => {
		if (!initialContestantId) {
			return 0
		}

		const targetIndex = contestants.findIndex((contestant) => contestant.id === initialContestantId)
		return targetIndex >= 0 ? targetIndex : 0
	})
	const [isSaving, setIsSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [successMessage, setSuccessMessage] = useState<string | null>(null)
	const [lastSubmittedAt, setLastSubmittedAt] = useState<string | undefined>(submittedAt)
	const [queuedUploads, setQueuedUploads] = useState<QueuedScoreUpload[]>([])
	const [isAutoSyncing, setIsAutoSyncing] = useState(false)
	const activeContestant = contestants[activeContestantIndex]
	const activeContestantId = activeContestant?.id ?? ''
	const normalizedLegend = useMemo(() => normalizeRubricLegend(rubricLegend), [rubricLegend])
	const rubricLegendText = useMemo(() => formatRubricLegend(normalizedLegend), [normalizedLegend])
	const resolvedDirectRatingConfig = useMemo(() => {
		const derivedConfig = deriveDirectRatingConfigFromCriteria(criteria)
		return normalizeDirectRatingConfig(directRatingConfig, derivedConfig ?? undefined)
	}, [criteria, directRatingConfig])
	const directScoreFields = useMemo(() => detectDirectRatingScoreFields(criteria, resolvedDirectRatingConfig), [criteria, resolvedDirectRatingConfig])
	const isDirectScoreMode = directScoreFields.length > 0
	const directNoatField = useMemo(() => directScoreFields.find((field) => field.key === 'noat') ?? null, [directScoreFields])
	const noatScoreByContestantId = useMemo(() => {
		if (!directNoatField) {
			return new Map<string, number>()
		}

		const entries = new Map<string, number>()
		for (const contestant of contestants) {
			if (typeof contestant.noatScore === 'number' && Number.isFinite(contestant.noatScore)) {
				entries.set(contestant.id, contestant.noatScore)
			}
		}

		return entries
	}, [contestants, directNoatField])

	const maxPossibleScore = useMemo(() => round(criteria.reduce((sum, criterion) => sum + applicableSubCriteriaForContestant(criterion, activeContestant).reduce((subTotal, subCriterion) => subTotal + Number(subCriterion.maxScore), 0), 0)), [criteria, activeContestant])
	const totalSubCriterionCount = useMemo(() => criteria.reduce((sum, criterion) => sum + applicableSubCriteriaForContestant(criterion, activeContestant).length, 0), [criteria, activeContestant])
	const slotLabelsByContestant = useMemo(() => {
		const labels = new Map<string, string>()
		if (!presentationSlots) {
			return labels
		}

		for (const slot of presentationSlots) {
			labels.set(slot.contestantId, slot.label)
		}

		return labels
	}, [presentationSlots])

	const activeSlotLabel = activeContestantId ? slotLabelsByContestant.get(activeContestantId) : undefined
	const draftScoredContestantIds = useMemo(() => {
		const ids = contestants
			.filter((contestant) => {
				if (!directNoatField || !noatScoreByContestantId.has(contestant.id)) {
					return hasPositiveDraftScore(scores, contestant.id, criteria)
				}

				return hasPositiveDraftScore(scores, contestant.id, criteria, new Set([directNoatField.subCriterionId]))
			})
			.map((contestant) => contestant.id)
		return new Set(ids)
	}, [contestants, criteria, directNoatField, noatScoreByContestantId, scores])
	const queuedContestantIds = useMemo(() => new Set(queuedUploads.map((entry) => entry.contestantId)), [queuedUploads])

	useEffect(() => {
		if (!directNoatField || noatScoreByContestantId.size === 0) {
			return
		}

		setScores((previous) => {
			let hasChange = false
			const nextScores: InputScoreMatrix = { ...previous }
			for (const [contestantId, noatScore] of noatScoreByContestantId) {
				const normalizedValue = normalizeScoreInput(String(noatScore), directNoatField.maxScore)
				const existingValue = previous[contestantId]?.[directNoatField.subCriterionId]
				if (existingValue === normalizedValue) {
					continue
				}

				hasChange = true
				const contestantScores = { ...(nextScores[contestantId] ?? {}) }
				contestantScores[directNoatField.subCriterionId] = normalizedValue
				nextScores[contestantId] = contestantScores
			}

			return hasChange ? nextScores : previous
		})
	}, [directNoatField, noatScoreByContestantId])

	const activeContestantTotal = useMemo(() => {
		if (!activeContestantId) {
			return 0
		}

		return round(
			criteria.reduce((total, criterion) => {
				const criterionTotal = applicableSubCriteriaForContestant(criterion, activeContestant).reduce((subTotal, subCriterion) => {
					const rawValue = scores[activeContestantId]?.[subCriterion.id] ?? '0'
					return subTotal + parseAndClampScore(rawValue, subCriterion.maxScore)
				}, 0)

				return total + criterionTotal
			}, 0),
		)
	}, [activeContestant, activeContestantId, criteria, scores])

	const directScoreMaxPossible = useMemo(() => {
		if (!isDirectScoreMode || directScoreFields.length === 0) {
			return 0
		}

		return 100
	}, [directScoreFields, isDirectScoreMode])

	const activeDirectInterviewFields = useMemo(() => directScoreFields.filter((field) => field.key.startsWith('interview')), [directScoreFields])
	const activeDirectInterviewMax = useMemo(() => activeDirectInterviewFields.reduce((sum, f) => sum + f.maxScore, 0), [activeDirectInterviewFields])

	const activeDirectBaseFinalRating = useMemo(() => {
		if (!isDirectScoreMode || !activeContestantId || directScoreFields.length === 0) {
			return 0
		}

		let avePercent = 0
		let noatPercent = 0
		let interviewScore = 0
		
		let hasAve = false
		let hasNoat = false
		let hasInterview = false

		for (const field of directScoreFields) {
			const rawValue = scores[activeContestantId]?.[field.subCriterionId] ?? '0'
			const score = parseAndClampScore(rawValue, field.maxScore)

			if (field.key === 'aveGpa') {
				if (field.maxScore > 0) avePercent = (score / field.maxScore) * 100
				hasAve = true
			} else if (field.key === 'noat') {
				if (field.maxScore > 0) noatPercent = (score / field.maxScore) * 100
				hasNoat = true
			} else if (field.key.startsWith('interview')) {
				interviewScore += score
				hasInterview = true
			}
		}

		let interviewPercent = 0
		if (hasInterview && activeDirectInterviewMax > 0) {
			interviewPercent = (interviewScore / activeDirectInterviewMax) * 100
		}

		let totalPercent = 0
		let divisor = 0
		if (hasAve) { totalPercent += avePercent; divisor++; }
		if (hasNoat) { totalPercent += noatPercent; divisor++; }
		if (hasInterview) { totalPercent += interviewPercent; divisor++; }

		return divisor > 0 ? round(totalPercent / divisor) : 0
	}, [activeContestantId, activeDirectInterviewMax, directScoreFields, isDirectScoreMode, scores])

	const activeDirectInterviewScore = useMemo(() => {
		if (!isDirectScoreMode || !activeContestantId || activeDirectInterviewFields.length === 0) {
			return 0
		}

		return activeDirectInterviewFields.reduce((sum, field) => {
			const rawValue = scores[activeContestantId]?.[field.subCriterionId] ?? '0'
			return sum + parseAndClampScore(rawValue, field.maxScore)
		}, 0)
	}, [activeContestantId, activeDirectInterviewFields, isDirectScoreMode, scores])

	const activeDirectStrand = activeContestantId ? (contestantDetails[activeContestantId]?.strand ?? '') : ''
	const activeDirectBonusPoints = useMemo(() => {
		if (!isDirectScoreMode || activeDirectStrand.trim().length === 0) {
			return 0
		}

		return round(resolveStrandAlignmentBonus(activeDirectStrand, resolvedDirectRatingConfig).bonusPoints)
	}, [activeDirectStrand, isDirectScoreMode, resolvedDirectRatingConfig])

	const activeDirectInterviewScoreWithBonus = useMemo(() => {
		if (!isDirectScoreMode || activeDirectInterviewFields.length === 0) {
			return activeDirectInterviewScore
		}

		return round(Math.min(activeDirectInterviewMax, activeDirectInterviewScore + activeDirectBonusPoints))
	}, [activeDirectBonusPoints, activeDirectInterviewFields.length, activeDirectInterviewMax, activeDirectInterviewScore, isDirectScoreMode])

	const activeDirectAppliedInterviewBonus = useMemo(() => round(Math.max(0, activeDirectInterviewScoreWithBonus - activeDirectInterviewScore)), [activeDirectInterviewScore, activeDirectInterviewScoreWithBonus])

	const activeDirectFinalRating = useMemo(() => {
		if (!isDirectScoreMode || !activeContestantId || directScoreFields.length === 0) {
			return 0
		}

		let avePercent = 0
		let noatPercent = 0
		
		let hasAve = false
		let hasNoat = false
		let hasInterview = activeDirectInterviewFields.length > 0

		for (const field of directScoreFields) {
			const rawValue = scores[activeContestantId]?.[field.subCriterionId] ?? '0'
			const score = parseAndClampScore(rawValue, field.maxScore)

			if (field.key === 'aveGpa') {
				if (field.maxScore > 0) avePercent = (score / field.maxScore) * 100
				hasAve = true
			} else if (field.key === 'noat') {
				if (field.maxScore > 0) noatPercent = (score / field.maxScore) * 100
				hasNoat = true
			}
		}

		let interviewPercent = 0
		if (hasInterview && activeDirectInterviewMax > 0) {
			interviewPercent = (activeDirectInterviewScoreWithBonus / activeDirectInterviewMax) * 100
		}

		let totalPercent = 0
		let divisor = 0
		if (hasAve) { totalPercent += avePercent; divisor++; }
		if (hasNoat) { totalPercent += noatPercent; divisor++; }
		if (hasInterview) { totalPercent += interviewPercent; divisor++; }

		return divisor > 0 ? round(totalPercent / divisor) : 0
	}, [activeContestantId, activeDirectInterviewFields.length, activeDirectInterviewMax, activeDirectInterviewScoreWithBonus, directScoreFields, isDirectScoreMode, scores])
	const directFinalRatingMaxPossible = useMemo(() => {
		if (!isDirectScoreMode) {
			return 0
		}

		return 100
	}, [isDirectScoreMode])

	const scoredFieldCount = useMemo(() => {
		if (!activeContestantId) {
			return 0
		}

		return criteria.reduce((sum, criterion) => {
			const countInCriterion = applicableSubCriteriaForContestant(criterion, activeContestant).reduce((count, subCriterion) => {
				const rawValue = scores[activeContestantId]?.[subCriterion.id] ?? '0'
				const parsedValue = Number.parseFloat(rawValue)
				return count + (Number.isFinite(parsedValue) && parsedValue > 0 ? 1 : 0)
			}, 0)

			return sum + countInCriterion
		}, 0)
	}, [activeContestant, activeContestantId, criteria, scores])

	function updateScore(contestantId: string, subCriterionId: string, value: string, maxScore: number): void {
		const normalizedValue = normalizeScoreInput(value, maxScore)

		setScores((previous) => ({
			...previous,
			[contestantId]: {
				...(previous[contestantId] ?? {}),
				[subCriterionId]: normalizedValue,
			},
		}))
	}

	function updateContestantDetailsField(contestantId: string, field: 'strand' | 'remark' | 'additionalInfo', value: string): void {
		setContestantDetails((previous) => ({
			...previous,
			[contestantId]: {
				...(previous[contestantId] ?? { strand: '', remark: '', additionalInfo: '' }),
				[field]: value,
			},
		}))
	}

	function goToContestant(index: number): void {
		setActiveContestantIndex(Math.max(0, Math.min(index, contestants.length - 1)))
		setError(null)
		setSuccessMessage(null)
	}

	function scrollToTopAfterSubmit(): void {
		window.requestAnimationFrame(() => {
			topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
		})
	}

	const refreshQueuedUploads = useCallback(() => {
		setQueuedUploads(listQueuedScoreUploadsForToken(token))
	}, [token])

	const markContestantsAsSaved = useCallback((contestantIds: string[]) => {
		if (contestantIds.length === 0) {
			return
		}

		setSavedContestantIds((previous) => {
			const next = new Set(previous)
			for (const contestantId of contestantIds) {
				next.add(contestantId)
			}
			return next
		})
	}, [])

	const submitPayload = useCallback(
		async (payload: SubmitScoresRequestBody): Promise<SubmitScoresResponseBody> => {
			const response = await fetch(`/api/eventscorer/judge/${token}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			})

			let responseBody: SubmitScoresResponseBody = {}
			try {
				responseBody = (await response.json()) as SubmitScoresResponseBody
			} catch {
				responseBody = {}
			}

			if (!response.ok) {
				throw new SubmitScoresError(responseBody.error ?? 'Unable to submit scores.', response.status)
			}

			return responseBody
		},
		[token],
	)

	const syncQueuedUploads = useCallback(
		async (showSuccessMessage = false): Promise<void> => {
			if (autoSyncInProgressRef.current) {
				return
			}

			if (typeof navigator !== 'undefined' && !navigator.onLine) {
				return
			}

			const pendingUploads = listQueuedScoreUploadsForToken(token)
			if (pendingUploads.length === 0) {
				setQueuedUploads([])
				return
			}

			autoSyncInProgressRef.current = true
			setIsAutoSyncing(true)

			const syncedContestantIds: string[] = []
			let syncedCount = 0
			let latestSubmittedAtValue: string | undefined
			let permanentErrorMessage: string | null = null

			try {
				for (const pendingUpload of pendingUploads) {
					try {
						const responseBody = await submitPayload(pendingUpload.payload)
						removeQueuedScoreUpload(pendingUpload.id)
						syncedContestantIds.push(pendingUpload.contestantId)
						syncedCount += 1

						if (responseBody.submittedAt) {
							latestSubmittedAtValue = responseBody.submittedAt
						}
					} catch (syncError) {
						if (syncError instanceof SubmitScoresError && typeof syncError.status === 'number' && syncError.status >= 400 && syncError.status < 500) {
							removeQueuedScoreUpload(pendingUpload.id)

							if (!permanentErrorMessage) {
								permanentErrorMessage = `Auto-upload skipped ${pendingUpload.contestantName}: ${syncError.message}`
							}

							continue
						}

						break
					}
				}
			} finally {
				refreshQueuedUploads()
				setIsAutoSyncing(false)
				autoSyncInProgressRef.current = false
			}

			if (syncedContestantIds.length > 0) {
				markContestantsAsSaved(syncedContestantIds)
			}

			if (latestSubmittedAtValue) {
				setLastSubmittedAt(latestSubmittedAtValue)
			}

			if (showSuccessMessage && syncedCount > 0) {
				setError(null)
				setSuccessMessage(`Auto-uploaded ${syncedCount} pending ${syncedCount === 1 ? 'entry' : 'entries'}.`)
			} else if (permanentErrorMessage) {
				setError(permanentErrorMessage)
			}
		},
		[markContestantsAsSaved, refreshQueuedUploads, submitPayload, token],
	)

	useEffect(() => {
		refreshQueuedUploads()
		void syncQueuedUploads(false)
	}, [refreshQueuedUploads, syncQueuedUploads])

	useEffect(() => {
		if (queuedUploads.length === 0) return

		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			e.preventDefault()
			e.returnValue = ''
		}

		window.addEventListener('beforeunload', handleBeforeUnload)
		return () => {
			window.removeEventListener('beforeunload', handleBeforeUnload)
		}
	}, [queuedUploads.length])

	// Auto-fill strand and additional remark from contestant data when switching contestants
	useEffect(() => {
		const laptopAvailable = activeContestant?.laptopAvailable
		const academicTrack = activeContestant?.academicTrack
		if (!activeContestantId) return
		
		setContestantDetails((previous) => {
			const current = previous[activeContestantId] || { strand: '', remark: '', additionalInfo: '' }
			let hasChanges = false
			const next = { ...current }

			if (!current.additionalInfo && laptopAvailable) {
				next.additionalInfo = laptopAvailable
				hasChanges = true
			}

			if (!current.strand && academicTrack && !isTVLAcademicTrack(academicTrack)) {
				const resolvedStrand = autoResolveStrand(academicTrack)
				if (resolvedStrand) {
					next.strand = resolvedStrand
					hasChanges = true
				}
			}

			return hasChanges ? {
				...previous,
				[activeContestantId]: next,
			} : previous
		})
	}, [activeContestantId]) // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		const handleOnline = () => {
			void syncQueuedUploads(true)
		}

		window.addEventListener('online', handleOnline)
		return () => {
			window.removeEventListener('online', handleOnline)
		}
	}, [syncQueuedUploads])

	useEffect(() => {
		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			if (queuedUploads.length > 0) {
				e.preventDefault()
				e.returnValue = ''
			}
		}

		window.addEventListener('beforeunload', handleBeforeUnload)
		return () => {
			window.removeEventListener('beforeunload', handleBeforeUnload)
		}
	}, [queuedUploads.length])

	useEffect(() => {
		if (queuedUploads.length === 0) {
			return
		}

		const intervalId = window.setInterval(() => {
			void syncQueuedUploads(false)
		}, AUTO_SYNC_INTERVAL_MS)

		return () => {
			window.clearInterval(intervalId)
		}
	}, [queuedUploads.length, syncQueuedUploads])

	async function submitScores(event: React.FormEvent<HTMLFormElement>): Promise<void> {
		event.preventDefault()
		if (!activeContestant) {
			setError('No contestant is selected.')
			return
		}

		const isResubmission = savedContestantIds.has(activeContestant.id)
		const confirmationMessage = isResubmission ? `Resubmit scores for ${activeContestant.name}? This will overwrite your previously saved scores for this entry.` : `Submit scores for ${activeContestant.name}?`

		if (!window.confirm(confirmationMessage)) {
			return
		}

		setIsSaving(true)
		setError(null)
		setSuccessMessage(null)

		const payload: ScoreMatrix = {}

		for (const contestant of contestants) {
			payload[contestant.id] = {}

			for (const criterion of criteria) {
				const applicableSubCriterionIds = new Set(applicableSubCriteriaForContestant(criterion, contestant).map((subCriterion) => subCriterion.id))

				for (const subCriterion of criterion.subCriteria) {
					if (!applicableSubCriterionIds.has(subCriterion.id)) {
						payload[contestant.id][subCriterion.id] = 0
						continue
					}

					const rawValue = scores[contestant.id]?.[subCriterion.id] ?? '0'
					payload[contestant.id][subCriterion.id] = round(parseAndClampScore(rawValue, subCriterion.maxScore))
				}
			}

			// ADD BACKWARD COMPATIBILITY FIELDS FOR ADMIN DASHBOARD
			if (criteria.some((c) => c.id === 'legacy-migrated-criterion')) {
				const oldInterviewId = rawCriteria.flatMap((c) => c.subCriteria).find((sc) => !sc.name.toLowerCase().includes('ave') && !sc.name.toLowerCase().includes('gpa') && sc.name.toLowerCase() !== 'noat')?.id
				const oldAveId = rawCriteria.flatMap((c) => c.subCriteria).find((sc) => sc.name.toLowerCase().includes('ave') || sc.name.toLowerCase().includes('gpa'))?.id
				const oldNoatId = rawCriteria.flatMap((c) => c.subCriteria).find((sc) => sc.name.toLowerCase() === 'noat')?.id

				if (oldInterviewId) {
					const contentScore = payload[contestant.id]['legacy-migrated-interviewContent'] ?? 0
					const commScore = payload[contestant.id]['legacy-migrated-interviewComm'] ?? 0
					const persScore = payload[contestant.id]['legacy-migrated-interviewPers'] ?? 0
					const interestScore = payload[contestant.id]['legacy-migrated-interviewInterest'] ?? 0
					const specialScore = payload[contestant.id]['legacy-migrated-interviewSpecial'] ?? 0
					payload[contestant.id][oldInterviewId] = round(contentScore + commScore + persScore + interestScore + specialScore)
				}

				if (oldAveId && payload[contestant.id]['legacy-migrated-aveGpa'] !== undefined) {
					payload[contestant.id][oldAveId] = payload[contestant.id]['legacy-migrated-aveGpa']
				}
				
				if (oldNoatId && payload[contestant.id]['legacy-migrated-noat'] !== undefined) {
					payload[contestant.id][oldNoatId] = payload[contestant.id]['legacy-migrated-noat']
				}
			}
		}

		const contestantDetailsPayload = buildContestantDetailsPayload(contestantDetails)

		const requestPayload: SubmitScoresRequestBody = {
			scores: payload,
			contestantId: activeContestant.id,
			...(Object.keys(contestantDetailsPayload).length > 0 ? { contestantDetails: contestantDetailsPayload } : {}),
		}
		const currentName = activeContestant.name
		const nextIndex = activeContestantIndex + 1

		try {
			const responseBody = await submitPayload(requestPayload)
			removeQueuedScoreUpload(queuedScoreUploadId(token, activeContestant.id))
			refreshQueuedUploads()

			if (responseBody.submittedAt) {
				setLastSubmittedAt(responseBody.submittedAt)
			}

			markContestantsAsSaved([activeContestant.id])

			if (adminEditMode) {
				setSuccessMessage(`Saved scores for ${currentName}. Continue editing this participant or switch entries.`)
			} else if (nextIndex < contestants.length) {
				setActiveContestantIndex(nextIndex)
				setSuccessMessage(`Saved scores for ${currentName}. Continue with ${contestants[nextIndex].name}.`)
			} else {
				setSuccessMessage(`Saved scores for ${currentName}. You can still review entries and resubmit if needed.`)
			}

			scrollToTopAfterSubmit()
		} catch (submitError) {
			if (shouldQueueScoreUpload(submitError)) {
				const serverUnreachable = isServerUnreachableScoreUploadError(submitError)
				const retryLabel = serverUnreachable ? 'the server is reachable' : 'internet is available'

				upsertQueuedScoreUpload({
					id: queuedScoreUploadId(token, activeContestant.id),
					token,
					contestantId: activeContestant.id,
					contestantName: activeContestant.name,
					payload: requestPayload,
					queuedAt: new Date().toISOString(),
				})
				refreshQueuedUploads()
				setError(null)

				if (adminEditMode) {
					setSuccessMessage(`Saved locally for ${currentName}. It will auto-upload when ${retryLabel}.`)
				} else if (nextIndex < contestants.length) {
					setActiveContestantIndex(nextIndex)
					setSuccessMessage(`Saved locally for ${currentName}. It will auto-upload when ${retryLabel}. Continue with ${contestants[nextIndex].name}.`)
				} else {
					setSuccessMessage(`Saved locally for ${currentName}. It will auto-upload when ${retryLabel}.`)
				}

				scrollToTopAfterSubmit()
				void syncQueuedUploads(false)
			} else {
				setError(submitError instanceof Error ? submitError.message : 'Unable to submit scores.')
			}
		} finally {
			setIsSaving(false)
		}
	}

	if (contestants.length === 0) {
		return (
			<div className='mx-auto w-full max-w-7xl px-4 py-8 sm:px-8'>
				<div className='rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-800'>No contestants found for this event.</div>
			</div>
		)
	}

	return (
		<div ref={topRef} className='mx-auto w-full max-w-7xl px-4 py-8 sm:px-8'>
			<div className='rounded-3xl border border-cyan-200 bg-white/95 p-6 shadow-xl shadow-cyan-950/10 sm:p-8'>
				<div className='flex flex-col gap-2'>
					<p className='text-xs uppercase tracking-[0.18em] text-cyan-800/80'>Judge Session</p>
					<h1 className='text-3xl font-semibold tracking-tight text-cyan-950'>{eventTitle}</h1>
					<p className='text-sm text-cyan-900/80'>
						Judge: <span className='font-semibold'>{judge.name}</span>
					</p>
					<p className='text-sm text-cyan-900/80'>Max possible score: {maxPossibleScore.toFixed(2)}</p>
					{lastSubmittedAt ? <p className='text-xs text-emerald-700'>Last submitted: {formatDate(lastSubmittedAt)}</p> : null}
					{queuedUploads.length > 0 ? <p className='text-xs text-amber-700'>Pending uploads: {queuedUploads.length}. Saved locally and waiting to sync.</p> : null}
					{isAutoSyncing ? <p className='text-xs text-cyan-800'>Auto-uploading pending saves...</p> : null}
				</div>

				<div className='mt-6 rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4'>
					<p className='text-xs uppercase tracking-[0.16em] text-cyan-900'>Score One Entry At A Time</p>
					<p className='mt-1 text-xs text-cyan-900/80'>Entries marked as Scored already have saved scores.</p>
					<div className='mt-3 flex flex-wrap gap-2'>
						{contestants.map((contestant, index) => {
							const isActive = index === activeContestantIndex
							const isSaved = savedContestantIds.has(contestant.id)
							const isQueued = queuedContestantIds.has(contestant.id)
							const hasDraft = draftScoredContestantIds.has(contestant.id)
							const slotLabel = slotLabelsByContestant.get(contestant.id)
							const isIndividual = contestant.entryType === 'individual'
							return (
								<button suppressHydrationWarning key={contestant.id} type='button' onClick={() => goToContestant(index)} className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${isActive ? 'border-cyan-800 bg-cyan-900 text-white' : 'border-cyan-300 bg-white text-cyan-900 hover:bg-cyan-100'}`}>
									<div className='flex flex-col items-start'>
										<span>
											{index + 1}. {contestant.name}
										</span>
										{isIndividual ? <span className={`text-[10px] ${isActive ? 'text-white/80' : 'text-sky-700'}`}>Individual</span> : null}
										{slotLabel ? <span className={`text-[10px] ${isActive ? 'text-white/80' : 'text-cyan-800/70'}`}>{slotLabel}</span> : null}
									</div>
									{isQueued ? (
										<span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${isActive ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'}`}>Queued</span>
									) : isSaved ? (
										<span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${isActive ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'}`}>Scored</span>
									) : hasDraft ? (
										<span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${isActive ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'}`}>Draft</span>
									) : null}
								</button>
							)
						})}
					</div>
				</div>

				<form onSubmit={submitScores} className='mt-6 flex flex-col gap-4'>
					<section className='rounded-2xl border border-cyan-100 bg-white p-4 sm:p-5'>
						<div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
							<div>
								<div className='flex items-center gap-2'>
									<h2 className='text-xl font-semibold text-cyan-950'>Now Scoring: {activeContestant.name}</h2>
									{activeContestant.entryType === 'individual' ? <span className='rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800'>Individual</span> : null}
								</div>
								<p className='mt-1 text-sm text-cyan-900/90'>
									Entry {activeContestantIndex + 1} of {contestants.length}
								</p>
								{activeSlotLabel ? <p className='text-xs text-cyan-900/80'>Slot: {activeSlotLabel}</p> : null}
							</div>
							<div className='flex flex-wrap items-center gap-2'>
								<span className='rounded-full bg-cyan-100 px-3 py-1 text-xs font-medium text-cyan-900'>
									Current Total: {activeContestantTotal.toFixed(2)} / {maxPossibleScore.toFixed(2)}
								</span>
								{isDirectScoreMode ? (
									<span className='rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-900'>
										Final Rating: {activeDirectFinalRating.toFixed(2)} / {directFinalRatingMaxPossible.toFixed(2)}
									</span>
								) : null}
								<span className='rounded-full bg-white px-3 py-1 text-xs font-medium text-cyan-900 ring-1 ring-cyan-200'>
									Scored Fields: {scoredFieldCount} / {totalSubCriterionCount}
								</span>
							</div>
						</div>

						<div className='mt-4 space-y-4'>
							{isDirectScoreMode ? (
								<article className='rounded-2xl border border-cyan-100 bg-cyan-50/40 p-4'>
									<div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
										<div>
											<h3 className='text-base font-semibold text-cyan-950'>Direct Score Entry</h3>
											<p className='text-[11px] font-medium text-cyan-900/85'>Enter AVE/GPA, NOAT, and Interview directly. NOAT may be admin-provided and read-only. Strand bonus is applied to Interview only, and Final Rating stays on a 0-100 scale.</p>
										</div>
										<div className='text-right'>
											<p className='text-xs font-semibold text-emerald-800'>
												Final Rating: {activeDirectFinalRating.toFixed(2)} / {directFinalRatingMaxPossible.toFixed(2)}
											</p>
											<p className='text-[11px] text-emerald-900/80'>
												Base: {activeDirectBaseFinalRating.toFixed(2)} / {directScoreMaxPossible.toFixed(2)} | Interview Bonus Applied: +{activeDirectAppliedInterviewBonus.toFixed(2)}
											</p>
										</div>
									</div>

									<div className='mt-3 grid gap-3 md:grid-cols-2'>
										{directScoreFields.filter((f) => !f.key.startsWith('interview')).map((field) => {
											const enteredValue = scores[activeContestantId]?.[field.subCriterionId] ?? '0'
											const enteredScore = parseAndClampScore(enteredValue, field.maxScore)
											const normalizedPercent = field.maxScore > 0 ? round((enteredScore / field.maxScore) * 100) : 0
											const isNoatLocked = field.key === 'noat' && noatScoreByContestantId.has(activeContestantId)

											return (
												<label key={field.subCriterionId} className='rounded-xl border border-cyan-200 bg-white p-3 text-sm font-medium text-slate-900'>
													<span className='block text-sm font-semibold text-cyan-950'>{field.label}</span>
													<span className='mt-1 block text-xs text-cyan-900/90'>
														Max: {field.maxScore.toFixed(2)}
														{isNoatLocked ? ' | Admin provided' : ''}
													</span>
													<input
														suppressHydrationWarning
														value={enteredValue}
														onChange={(inputEvent) => {
															if (isNoatLocked) {
																return
															}
															updateScore(activeContestantId, field.subCriterionId, inputEvent.target.value, field.maxScore)
														}}
														type='number'
														inputMode='decimal'
														min={0}
														max={field.maxScore}
														step='0.01'
														readOnly={isNoatLocked}
														className='mt-2 w-full rounded-lg border border-cyan-300 bg-white px-3 py-2 text-base font-semibold text-slate-900 placeholder:text-slate-500 caret-slate-900 outline-none ring-cyan-600 transition focus:border-cyan-500 focus:ring-2 read-only:cursor-default read-only:bg-slate-50 read-only:text-slate-600'
													/>
													<span className='mt-1 block text-xs font-medium text-slate-700'>
														Entered: {enteredScore.toFixed(2)} | Normalized: {normalizedPercent.toFixed(2)}%
													</span>
												</label>
											)
										})}
									</div>

									{directScoreFields.some((f) => f.key.startsWith('interview')) ? (
										<div className='mt-4 rounded-xl border border-cyan-200 bg-white/60 p-4'>
											<h4 className='mb-3 text-sm font-bold tracking-wider text-cyan-950 uppercase'>Interview</h4>
											<div className='grid gap-3 md:grid-cols-2'>
												{directScoreFields.filter((f) => f.key.startsWith('interview')).map((field) => {
													const enteredValue = scores[activeContestantId]?.[field.subCriterionId] ?? '0'
													const enteredScore = parseAndClampScore(enteredValue, field.maxScore)
													const normalizedPercent = field.maxScore > 0 ? round((enteredScore / field.maxScore) * 100) : 0

													return (
														<label key={field.subCriterionId} className='rounded-xl border border-cyan-200 bg-white p-3 text-sm font-medium text-slate-900'>
															<span className='block text-sm font-semibold text-cyan-950'>{field.label}</span>
															<span className='mt-1 block text-xs text-cyan-900/90'>
																Max: {field.maxScore.toFixed(2)}
															</span>
															<input
																suppressHydrationWarning
																value={enteredValue}
																onChange={(inputEvent) => {
																	updateScore(activeContestantId, field.subCriterionId, inputEvent.target.value, field.maxScore)
																}}
																type='number'
																inputMode='decimal'
																min={0}
																max={field.maxScore}
																step='0.01'
																className='mt-2 w-full rounded-lg border border-cyan-300 bg-white px-3 py-2 text-base font-semibold text-slate-900 placeholder:text-slate-500 caret-slate-900 outline-none ring-cyan-600 transition focus:border-cyan-500 focus:ring-2'
															/>
															<span className='mt-1 block text-xs font-medium text-slate-700'>
																Entered: {enteredScore.toFixed(2)} | Normalized: {normalizedPercent.toFixed(2)}%
															</span>
														</label>
													)
												})}
											</div>
										</div>
									) : null}

									<div className='mt-3 grid gap-3 md:grid-cols-2'>
										<label className='rounded-xl border border-cyan-200 bg-white p-3 text-sm font-medium text-slate-900'>
											<span className='block text-sm font-semibold text-cyan-950'>Strand</span>
											{isTVLAcademicTrack(activeContestant.academicTrack) ? (
												<>
													<p className='mt-1 text-[10px] text-cyan-700/80'>TVL Track — select specific sub-strand</p>
													<div className='mt-2'>
														<Select
															instanceId={`strand-tvl-select-${activeContestantId}`}
															options={Array.from(new Set(TVL_LEAF_STRAND_OPTIONS.map((o) => o.group))).map((groupName) => ({
																label: groupName,
																options: TVL_LEAF_STRAND_OPTIONS.filter((o) => o.group === groupName).map((o) => ({ value: o.value, label: o.label })),
															}))}
															value={(() => {
																const val = contestantDetails[activeContestantId]?.strand ?? ''
																return val ? { value: val, label: TVL_LEAF_STRAND_OPTIONS.find(o => o.value === val)?.label ?? val } : null
															})()}
															onChange={(selected) => updateContestantDetailsField(activeContestantId, 'strand', selected?.value ?? '')}
															isClearable
															placeholder='Search or select...'
															classNamePrefix='react-select'
															styles={{
																control: (base) => ({ ...base, borderRadius: '0.5rem', borderColor: '#67e8f9', minHeight: '42px', fontSize: '14px', paddingLeft: '4px' }),
																valueContainer: (base) => ({ ...base, padding: '2px 12px' }),
																singleValue: (base) => ({ ...base, marginLeft: 0, marginRight: 0 })
															}}
														/>
													</div>
												</>
											) : (
												<div className='mt-2'>
													<Select
														instanceId={`strand-select-${activeContestantId}`}
														options={DIRECT_RATING_STRAND_SELECT_GROUPS.map((group) => ({
															label: group.label,
															options: group.options.map((o) => ({ value: o.value, label: o.label })),
														}))}
														value={(() => {
															const val = contestantDetails[activeContestantId]?.strand ?? ''
															return val ? { value: val, label: DIRECT_RATING_STRAND_SELECT_GROUPS.flatMap(g => g.options).find(o => o.value === val)?.label ?? val } : null
														})()}
														onChange={(selected) => updateContestantDetailsField(activeContestantId, 'strand', selected?.value ?? '')}
														isClearable
														placeholder='Search or select...'
														classNamePrefix='react-select'
														styles={{
															control: (base) => ({ ...base, borderRadius: '0.5rem', borderColor: '#67e8f9', minHeight: '42px', fontSize: '14px', paddingLeft: '4px' }),
															valueContainer: (base) => ({ ...base, padding: '2px 12px' }),
															singleValue: (base) => ({ ...base, marginLeft: 0, marginRight: 0 })
														}}
													/>
												</div>
											)}
										</label>

										<label className='rounded-xl border border-cyan-200 bg-white p-3 text-sm font-medium text-slate-900'>
											<span className='block text-sm font-semibold text-cyan-950'>Remark</span>
											<div className='mt-2'>
												<Select
													instanceId={`remark-select-${activeContestantId}`}
													options={DIRECT_REMARK_OPTIONS.map((opt) => ({ value: opt, label: opt }))}
													value={(() => {
														const val = contestantDetails[activeContestantId]?.remark ?? ''
														return val ? { value: val, label: val } : null
													})()}
													onChange={(selected) => updateContestantDetailsField(activeContestantId, 'remark', selected?.value ?? '')}
													isClearable
													placeholder='Search or select...'
													classNamePrefix='react-select'
													styles={{
														control: (base) => ({ ...base, borderRadius: '0.5rem', borderColor: '#67e8f9', minHeight: '42px', fontSize: '14px', paddingLeft: '4px' }),
														valueContainer: (base) => ({ ...base, padding: '2px 12px' }),
														singleValue: (base) => ({ ...base, marginLeft: 0, marginRight: 0 })
													}}
												/>
											</div>
										</label>
									</div>

									<p className='mt-3 text-xs text-cyan-900/80'>Final Rating formula: ((AVE/GPA / Max AVE) x 100 + (NOAT / Max NOAT) x 100 + ((Interview + aligned strand bonus) / Max Interview) x 100) / 3, with Interview capped at its max score.</p>
								</article>
							) : (
								criteria.map((criterion) => {
									const applicableSubCriteria = applicableSubCriteriaForContestant(criterion, activeContestant)
									const scopeLabel = criterionScopeLabel(criterion)
									const parentMaxScore = round(applicableSubCriteria.reduce((sum, subCriterion) => sum + Number(subCriterion.maxScore), 0))
									const parentCurrentTotal = round(
										applicableSubCriteria.reduce((sum, subCriterion) => {
											const rawValue = scores[activeContestantId]?.[subCriterion.id] ?? '0'
											return sum + parseAndClampScore(rawValue, subCriterion.maxScore)
										}, 0),
									)

									return (
										<article key={criterion.id} className='rounded-2xl border border-cyan-100 bg-cyan-50/40 p-4'>
											<div className='flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between'>
												<div>
													<h3 className='text-base font-semibold text-cyan-950'>{criterion.name}</h3>
													<p className='text-[11px] font-medium text-cyan-900/85'>Scope: {scopeLabel}</p>
													{!directRatingConfig ? <p className='text-[11px] text-cyan-900/80'>Legend: {rubricLegendText}</p> : null}
												</div>
												<p className='text-xs text-cyan-900/90'>
													Parent Max: {parentMaxScore.toFixed(2)} | Current: {parentCurrentTotal.toFixed(2)}
												</p>
											</div>

											{isIndividualCriterion(criterion) ? (
												<div className='mt-3 space-y-4'>
													{groupSubCriteriaByMember(criterion.subCriteria, activeContestant).map((group) => {
														const groupMaxScore = round(group.items.reduce((sum, item) => sum + item.subCriterion.maxScore, 0))
														const groupCurrentTotal = round(
															group.items.reduce((sum, item) => {
																const rawValue = scores[activeContestantId]?.[item.subCriterion.id] ?? '0'
																return sum + parseAndClampScore(rawValue, item.subCriterion.maxScore)
															}, 0),
														)

														return (
															<div key={group.memberLabel} className='rounded-2xl border border-cyan-200 bg-white p-3'>
																<div className='flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between'>
																	<div>
																		<h4 className='text-sm font-semibold text-cyan-950'>{group.memberDisplayLabel}</h4>
																	</div>
																	<p className='text-xs text-cyan-900/90 sm:text-right'>
																		Max: {groupMaxScore.toFixed(2)} | Current: {groupCurrentTotal.toFixed(2)}
																	</p>
																</div>

																<div className='mt-3 grid gap-3 xl:grid-cols-2'>
																	{group.items.map(({ subCriterion, displayName }) => (
																		<label key={subCriterion.id} className='rounded-xl border border-cyan-200 bg-white p-3 text-sm font-medium text-slate-900'>
																			<span className='block text-sm font-semibold text-cyan-950'>{displayName}</span>
																			<span className='mt-1 block text-xs text-cyan-900/90'>Sub Max: {subCriterion.maxScore.toFixed(2)}</span>
																			<input
																				suppressHydrationWarning
																				value={scores[activeContestantId]?.[subCriterion.id] ?? '0'}
																				onChange={(inputEvent) => updateScore(activeContestantId, subCriterion.id, inputEvent.target.value, subCriterion.maxScore)}
																				type='number'
																				inputMode='decimal'
																				min={0}
																				max={subCriterion.maxScore}
																				step='0.01'
																				className='mt-2 w-full rounded-lg border border-cyan-300 bg-white px-3 py-2 text-base font-semibold text-slate-900 placeholder:text-slate-500 caret-slate-900 outline-none ring-cyan-600 transition focus:border-cyan-500 focus:ring-2'
																			/>
																			<span className='mt-1 block text-xs font-medium text-slate-700'>Entered Score: {scores[activeContestantId]?.[subCriterion.id] ?? '0'}</span>
																		</label>
																	))}
																</div>
															</div>
														)
													})}
												</div>
											) : (
												<div className='mt-3 grid gap-3 xl:grid-cols-2'>
													{criterion.subCriteria.map((subCriterion) => (
														<label key={subCriterion.id} className='rounded-xl border border-cyan-200 bg-white p-3 text-sm font-medium text-slate-900'>
															<span className='block text-sm font-semibold text-cyan-950'>{subCriterion.name}</span>
															<span className='mt-1 block text-xs text-cyan-900/90'>Sub Max: {subCriterion.maxScore.toFixed(2)}</span>
															<input
																suppressHydrationWarning
																value={scores[activeContestantId]?.[subCriterion.id] ?? '0'}
																onChange={(inputEvent) => updateScore(activeContestantId, subCriterion.id, inputEvent.target.value, subCriterion.maxScore)}
																type='number'
																inputMode='decimal'
																min={0}
																max={subCriterion.maxScore}
																step='0.01'
																className='mt-2 w-full rounded-lg border border-cyan-300 bg-white px-3 py-2 text-base font-semibold text-slate-900 placeholder:text-slate-500 caret-slate-900 outline-none ring-cyan-600 transition focus:border-cyan-500 focus:ring-2'
															/>
															<span className='mt-1 block text-xs font-medium text-slate-700'>Entered Score: {scores[activeContestantId]?.[subCriterion.id] ?? '0'}</span>
														</label>
													))}
												</div>
											)}
										</article>
									)
								})
							)}
						</div>
						<div className='mt-6'>
							<label className='block rounded-xl border border-cyan-200 bg-white p-4 text-sm font-medium text-slate-900 shadow-sm'>
								<span className='block text-sm font-semibold text-cyan-950'>Additional Remark (Optional)</span>
								<p className='mt-1 text-xs text-cyan-900/70'>
									Add any additional comments or observations for this contestant.
									{activeContestant.laptopAvailable ? <span className='ml-1 text-cyan-700/70'>(Auto-filled from laptop availability — you may overwrite)</span> : null}
								</p>
								<textarea
									suppressHydrationWarning
									value={contestantDetails[activeContestantId]?.additionalInfo ?? ''}
									onChange={(inputEvent) => updateContestantDetailsField(activeContestantId, 'additionalInfo', inputEvent.target.value)}
									placeholder='Enter any additional remark here...'
									rows={3}
									className='mt-3 w-full resize-none rounded-lg border border-cyan-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 caret-slate-900 outline-none ring-cyan-600 transition focus:border-cyan-500 focus:ring-2'
								/>
							</label>
						</div>
					</section>

					{error ? <p className='rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700'>{error}</p> : null}
					{successMessage ? <p className='rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700'>{successMessage}</p> : null}

					<div className='flex flex-wrap gap-3'>
						<button suppressHydrationWarning type='button' onClick={() => goToContestant(activeContestantIndex - 1)} disabled={activeContestantIndex === 0} className='rounded-full border border-cyan-300 bg-white px-5 py-2 text-sm font-medium text-cyan-900 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50'>
							Previous Entry
						</button>
						<button suppressHydrationWarning type='button' onClick={() => goToContestant(activeContestantIndex + 1)} disabled={activeContestantIndex >= contestants.length - 1} className='rounded-full border border-cyan-300 bg-white px-5 py-2 text-sm font-medium text-cyan-900 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50'>
							Next Entry
						</button>
						<button suppressHydrationWarning type='submit' disabled={isSaving} className='rounded-full bg-cyan-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-60'>
							{isSaving ? `Saving ${activeContestant.name}...` : `Save ${activeContestant.name} Scores`}
						</button>
					</div>

					<p className='text-xs text-cyan-900/90'>Tip: Save each contestant right after the presentation. If internet/service fails, scores are kept locally and auto-upload when connection is back.</p>
				</form>
			</div>
		</div>
	)
}

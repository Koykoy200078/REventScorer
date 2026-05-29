import { randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import mysql from 'mysql2/promise.js'
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise.js'

import { deriveDirectRatingConfigFromCriteria, detectDirectRatingScoreFields, normalizeDirectRatingConfig } from '@/lib/direct-rating-config'
import { normalizeRubricLegend } from '@/lib/rubric-legend'
import type {
	AdminEventEditorInput,
	ContestantEntryType,
	CreateEventInput,
	DirectRatingConfig,
	EventContestant,
	EventCriterion,
	EventJudge,
	EventPresentationSlot,
	EventProgramTag,
	EventScorer,
	EventScoringType,
	EventSubCriterion,
	EventSummary,
	JudgeDirectoryItem,
	JudgeContestantDetailsMap,
	JudgeSessionData,
	JudgeSubmission,
	RubricLegendItem,
	ScoreMatrix,
} from '@/lib/types'

interface StoreShape {
	events: EventScorer[]
}

interface DatabaseConfig {
	host: string
	port: number
	user: string
	password: string
	database: string
	connectionLimit: number
	queueLimit: number
	maxIdle: number
	idleTimeoutMs: number
}

interface EventRow extends RowDataPacket {
	id: string
	title: string
	description: string | null
	created_by: string | null
	event_scoring_type: string | null
	rubric_legend_json: string | null
	direct_rating_config_json: string | null
	created_at: string
}

interface ContestantRow extends RowDataPacket {
	id: string
	name: string
	entry_type: string
	program_tag: string | null
	noat_score: number | string | null
	academic_track: string | null
	laptop_available: string | null
	sort_order: number
}

interface ContestantParticipantRow extends RowDataPacket {
	contestant_id: string
	participant_name: string
	sort_order: number
}

interface JudgeRow extends RowDataPacket {
	id: string
	name: string
	email: string | null
	token: string
	sort_order: number
}

interface CriterionRow extends RowDataPacket {
	id: string
	name: string
	max_score: number | string
	sort_order: number
}

interface SubCriterionRow extends RowDataPacket {
	id: string
	criterion_id: string
	name: string
	max_score: number | string
	sort_order: number
}

interface PresentationSlotRow extends RowDataPacket {
	id: string
	label: string
	contestant_id: string
	sort_order: number
}

interface PresentationSlotJudgeRow extends RowDataPacket {
	slot_id: string
	judge_id: string
	sort_order: number
}

interface SubmissionRow extends RowDataPacket {
	id: number
	judge_id: string
	submitted_at: string
}

interface SubmissionSavedContestantRow extends RowDataPacket {
	submission_id: number
	contestant_id: string
}

interface SubmissionScoreRow extends RowDataPacket {
	submission_id: number
	contestant_id: string
	subcriterion_id: string
	score: number | string
}

interface SubmissionContestantDetailRow extends RowDataPacket {
	submission_id: number
	contestant_id: string
	strand: string | null
	remark: string | null
	additional_info: string | null
}

interface JudgeLookupRow extends RowDataPacket {
	id: string
	event_id: string
}

interface JudgeDirectoryRow extends RowDataPacket {
	name: string
	email: string | null
	created_at: string | Date
}

interface EventIdRow extends RowDataPacket {
	id: string
}

interface CountRow extends RowDataPacket {
	total: number | string
}

interface MysqlSystemVariableRow extends RowDataPacket {
	Variable_name: string
	Value: number | string
}

interface PersistableScoreRow {
	contestantId: string
	subCriterionId: string
	score: number
}

interface PersistableContestantDetailRow {
	contestantId: string
	strand?: string
	remark?: string
	additionalInfo?: string
}

type SqlExecutor = Pick<Pool, 'execute'> | PoolConnection
type SqlExecuteValues = Parameters<Pool['execute']>[1]

const LEGACY_DATA_FILE = path.join(process.cwd(), 'data', 'events.json')

const TABLE_EVENTS = 'es_events'
const TABLE_CONTESTANTS = 'es_contestants'
const TABLE_CONTESTANT_PARTICIPANTS = 'es_contestant_participants'
const TABLE_JUDGES = 'es_judges'
const TABLE_CRITERIA = 'es_criteria'
const TABLE_SUBCRITERIA = 'es_subcriteria'
const TABLE_PRESENTATION_SLOTS = 'es_presentation_slots'
const TABLE_PRESENTATION_SLOT_JUDGES = 'es_presentation_slot_judges'
const TABLE_SUBMISSIONS = 'es_submissions'
const TABLE_SUBMISSION_SAVED_CONTESTANTS = 'es_submission_saved_contestants'
const TABLE_SUBMISSION_SCORES = 'es_submission_scores'
const TABLE_SUBMISSION_CONTESTANT_DETAILS = 'es_submission_contestant_details'
const EVENTSCORER_SCHEMA_VERSION = 6

interface EventScorerGlobalState {
	__eventScorerPoolPromise?: Promise<Pool> | null
	__eventScorerSchemaVersion?: number
	__eventScorerSchemaPromise?: Promise<void> | null
}

const eventScorerGlobalState = globalThis as typeof globalThis & EventScorerGlobalState

function compactWhitespace(value: string): string {
	return value.trim().replace(/\s+/g, ' ')
}

function toPositiveNumber(value: unknown, fieldName: string): number {
	const numericValue = typeof value === 'number' ? value : Number(value)

	if (!Number.isFinite(numericValue) || numericValue <= 0) {
		throw new Error(`${fieldName} must be greater than 0.`)
	}

	return Math.round(numericValue * 1000) / 1000
}

function toPositiveNumberOrNull(value: unknown): number | null {
	const numericValue = typeof value === 'number' ? value : Number(value)

	if (!Number.isFinite(numericValue) || numericValue <= 0) {
		return null
	}

	return Math.round(numericValue * 1000) / 1000
}

function normalizeNoatScore(value: unknown): number | null {
	if (value === null || value === undefined) {
		return null
	}

	if (typeof value === 'string' && value.trim() === '') {
		return null
	}

	const numericValue = typeof value === 'number' ? value : Number(value)

	if (!Number.isFinite(numericValue) || numericValue < 0) {
		return null
	}

	return Math.round(numericValue * 1000) / 1000
}

function uniqueCaseInsensitive(values: string[]): string[] {
	const seen = new Set<string>()
	const result: string[] = []

	for (const value of values) {
		const key = value.toLowerCase()
		if (!seen.has(key)) {
			seen.add(key)
			result.push(value)
		}
	}

	return result
}

function parseEventScoringType(value: unknown): EventScoringType | null {
	if (typeof value !== 'string') {
		return null
	}

	const normalized = compactWhitespace(value)
		.toLowerCase()
		.replace(/[_\s]+/g, '-')

	if (normalized === 'final-oral-defense') {
		return 'final-oral-defense'
	}

	if (normalized === 'standard') {
		return 'standard'
	}

	return null
}

function parseProgramTag(value: unknown): EventProgramTag | null {
	if (typeof value !== 'string') {
		return null
	}

	const normalized = compactWhitespace(value).toUpperCase()

	if (normalized === 'BSINT' || normalized === 'BSCS') {
		return normalized
	}

	return null
}

function inferProgramTagFromContestantName(name: string): EventProgramTag | null {
	const normalizedName = compactWhitespace(name).toUpperCase()

	if (/\bBSINT\b/.test(normalizedName)) {
		return 'BSINT'
	}

	if (/\bBSCS\b/.test(normalizedName)) {
		return 'BSCS'
	}

	return null
}

function inferEventScoringTypeFromCriteria(criteria: unknown): EventScoringType {
	if (!Array.isArray(criteria)) {
		return 'standard'
	}

	const normalizedNames = new Set(
		criteria
			.map((criterion) => {
				if (!criterion || typeof criterion !== 'object') {
					return ''
				}

				const rawName = (criterion as { name?: unknown }).name
				return compactWhitespace(String(rawName ?? '')).toLowerCase()
			})
			.filter((name) => name.length > 0),
	)

	const hasGroupPresentation = normalizedNames.has('group presentation')
	const hasIndividualPresentation = normalizedNames.has('individual presentation')

	return hasGroupPresentation && hasIndividualPresentation ? 'final-oral-defense' : 'standard'
}

function normalizeContestantEntryType(value: unknown): ContestantEntryType {
	return value === 'individual' ? 'individual' : 'group'
}

function normalizeContestantProgramTag(value: unknown): EventProgramTag | null {
	if (value === null || value === undefined) {
		return null
	}

	if (typeof value === 'string' && compactWhitespace(value).length === 0) {
		return null
	}

	const parsed = parseProgramTag(value)
	if (!parsed) {
		throw new Error('Program tag must be either BSINT or BSCS.')
	}

	return parsed
}

function normalizeEventScoringType(value: unknown): EventScoringType {
	return parseEventScoringType(value) ?? 'standard'
}

function normalizeRubricLegendInput(value: unknown): RubricLegendItem[] {
	return normalizeRubricLegend(value)
}

function parseStoredRubricLegend(value: unknown): RubricLegendItem[] {
	if (typeof value !== 'string' || compactWhitespace(value).length === 0) {
		return normalizeRubricLegendInput(undefined)
	}

	try {
		const parsed = JSON.parse(value) as unknown
		return normalizeRubricLegendInput(parsed)
	} catch {
		return normalizeRubricLegendInput(undefined)
	}
}

function parseStoredDirectRatingConfig(value: unknown, criteria: EventCriterion[]): DirectRatingConfig | undefined {
	const derived = deriveDirectRatingConfigFromCriteria(criteria)

	if (typeof value !== 'string' || compactWhitespace(value).length === 0) {
		return derived ?? undefined
	}

	try {
		const parsed = JSON.parse(value) as unknown
		return normalizeDirectRatingConfig(parsed, derived ?? undefined)
	} catch {
		return derived ?? undefined
	}
}

function normalizeContestantParticipants(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return []
	}

	const cleaned = value.map((participant) => compactWhitespace(String(participant ?? ''))).filter((participant) => participant.length > 0)
	return uniqueCaseInsensitive(cleaned)
}

function normalizeUniqueIdCandidate(value: unknown, usedIds: Set<string>): string {
	const candidate = compactWhitespace(String(value ?? ''))
	if (candidate.length > 0 && !usedIds.has(candidate)) {
		usedIds.add(candidate)
		return candidate
	}

	let generated = randomUUID()
	while (usedIds.has(generated)) {
		generated = randomUUID()
	}

	usedIds.add(generated)
	return generated
}

function normalizeUniqueTokenCandidate(value: unknown, usedTokens: Set<string>): string {
	const candidate = compactWhitespace(String(value ?? ''))
	if (candidate.length > 0 && !usedTokens.has(candidate)) {
		usedTokens.add(candidate)
		return candidate
	}

	let generated = randomBytes(24).toString('hex')
	while (usedTokens.has(generated)) {
		generated = randomBytes(24).toString('hex')
	}

	usedTokens.add(generated)
	return generated
}

function normalizeContestants(contestants: CreateEventInput['contestants']): EventContestant[] {
	const cleaned = contestants
		.map((contestant) => {
			if (typeof contestant === 'string') {
				return {
					name: compactWhitespace(contestant),
					entryType: 'group' as ContestantEntryType,
					participants: [] as string[],
					programTag: null as EventProgramTag | null,
					noatScore: null as number | null,
				}
			}

			if (!contestant || typeof contestant !== 'object') {
				return {
					name: '',
					entryType: 'group' as ContestantEntryType,
					participants: [] as string[],
					programTag: null as EventProgramTag | null,
					noatScore: null as number | null,
				}
			}

			return {
				name: compactWhitespace(contestant.name ?? ''),
				entryType: normalizeContestantEntryType(contestant.entryType),
				participants: normalizeContestantParticipants(contestant.participants),
				programTag: normalizeContestantProgramTag(contestant.programTag),
				noatScore: normalizeNoatScore(contestant.noatScore),
				academicTrack: typeof contestant.academicTrack === 'string' && contestant.academicTrack.trim().length > 0 ? contestant.academicTrack.trim() : undefined,
				laptopAvailable: typeof contestant.laptopAvailable === 'string' && contestant.laptopAvailable.trim().length > 0 ? contestant.laptopAvailable.trim() : undefined,
			}
		})
		.filter((contestant) => contestant.name.length > 0)

	const seen = new Set<string>()
	const unique = [] as Array<{ name: string; entryType: ContestantEntryType; participants: string[]; programTag: EventProgramTag | null; noatScore: number | null; academicTrack?: string; laptopAvailable?: string }>

	for (const contestant of cleaned) {
		const key = `${contestant.entryType}|${contestant.programTag ?? 'none'}|${contestant.name.toLowerCase()}`
		if (seen.has(key)) {
			continue
		}

		seen.add(key)
		unique.push(contestant)
	}

	if (unique.length < 2) {
		throw new Error('At least 2 contestants are required.')
	}

	return unique.map((contestant) => ({
		id: randomUUID(),
		name: contestant.name,
		entryType: contestant.entryType,
		participants: contestant.entryType === 'group' && contestant.participants.length > 0 ? contestant.participants : undefined,
		programTag: contestant.programTag ?? undefined,
		noatScore: contestant.noatScore ?? undefined,
		academicTrack: contestant.academicTrack,
		laptopAvailable: contestant.laptopAvailable,
	}))
}

function normalizeJudges(judges: CreateEventInput['judges']): EventJudge[] {
	const cleaned = judges
		.map((judge) => ({
			name: compactWhitespace(judge.name),
			email: judge.email ? compactWhitespace(judge.email) : undefined,
		}))
		.filter((judge) => judge.name.length > 0)

	if (cleaned.length === 0) {
		throw new Error('At least 1 judge is required.')
	}

	const uniqueByName = uniqueCaseInsensitive(cleaned.map((judge) => judge.name))

	return uniqueByName.map((judgeName) => {
		const judgeData = cleaned.find((candidate) => candidate.name.toLowerCase() === judgeName.toLowerCase())

		return {
			id: randomUUID(),
			name: judgeName,
			email: judgeData?.email,
			token: randomBytes(24).toString('hex'),
		}
	})
}

function normalizeSubCriteria(subCriteria: CreateEventInput['criteria'][number]['subCriteria'], criterionName: string): EventSubCriterion[] {
	const cleaned = subCriteria
		.map((subCriterion) => ({
			name: compactWhitespace(subCriterion.name),
			maxScore: toPositiveNumber(subCriterion.maxScore, `Subcriterion max score (${criterionName})`),
		}))
		.filter((subCriterion) => subCriterion.name.length > 0)

	if (cleaned.length === 0) {
		throw new Error(`Criterion "${criterionName}" must have at least one subcriterion.`)
	}

	return cleaned.map((subCriterion) => ({
		id: randomUUID(),
		name: subCriterion.name,
		maxScore: subCriterion.maxScore,
	}))
}

function splitMemberCriterionName(name: string): { memberLabel: string; displayName: string } {
	const separatorIndex = name.indexOf(' - ')
	if (separatorIndex === -1) {
		return { memberLabel: 'Individual', displayName: name }
	}

	const memberLabel = name.slice(0, separatorIndex).trim()
	const displayName = name.slice(separatorIndex + 3).trim()
	return {
		memberLabel: memberLabel || 'Individual',
		displayName: displayName || name,
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

function isIndividualPresentationCriterionName(name: string): boolean {
	return name.trim().toLowerCase() === 'individual presentation'
}

function expectedMemberCountForContestant(contestant: EventContestant): number {
	if (contestant.entryType === 'individual') {
		return 1
	}

	const participantCount = Array.isArray(contestant.participants) ? contestant.participants.length : 0
	return participantCount > 0 ? participantCount : 1
}

function expandIndividualPresentationSubCriteriaIfNeeded(criterionName: string, subCriteria: CreateEventInput['criteria'][number]['subCriteria'], contestants: EventContestant[]): CreateEventInput['criteria'][number]['subCriteria'] {
	if (!isIndividualPresentationCriterionName(criterionName)) {
		return subCriteria
	}

	const hasExplicitMemberPrefix = subCriteria.some((subCriterion) => {
		const normalizedName = compactWhitespace(String(subCriterion.name ?? ''))
		const { memberLabel } = splitMemberCriterionName(normalizedName)
		return memberIndexFromLabel(memberLabel) !== null
	})

	if (hasExplicitMemberPrefix) {
		return subCriteria
	}

	const maxMemberCount = contestants.reduce((maxCount, contestant) => Math.max(maxCount, expectedMemberCountForContestant(contestant)), 1)

	if (maxMemberCount <= 1) {
		return subCriteria
	}

	const expanded: CreateEventInput['criteria'][number]['subCriteria'] = []

	for (let memberIndex = 1; memberIndex <= maxMemberCount; memberIndex += 1) {
		const memberLabel = `Student ${memberIndex}`

		for (const subCriterion of subCriteria) {
			const baseName = compactWhitespace(String(subCriterion.name ?? ''))
			expanded.push({
				name: `${memberLabel} - ${baseName}`,
				maxScore: subCriterion.maxScore,
			})
		}
	}

	return expanded
}

function normalizeCriteria(criteria: CreateEventInput['criteria'], contestants: EventContestant[]): EventCriterion[] {
	const cleaned = criteria
		.map((criterion) => ({
			name: compactWhitespace(criterion.name),
			subCriteria: criterion.subCriteria,
		}))
		.filter((criterion) => criterion.name.length > 0)

	if (cleaned.length === 0) {
		throw new Error('At least 1 parent criterion is required.')
	}

	return cleaned.map((criterion) => {
		const expandedSubCriteria = expandIndividualPresentationSubCriteriaIfNeeded(criterion.name, criterion.subCriteria, contestants)
		const normalizedSubCriteria = normalizeSubCriteria(expandedSubCriteria, criterion.name)
		const maxScore = Math.round(normalizedSubCriteria.reduce((sum, subCriterion) => sum + subCriterion.maxScore, 0) * 1000) / 1000

		if (maxScore <= 0) {
			throw new Error(`Criterion "${criterion.name}" must have total max score greater than 0.`)
		}

		return {
			id: randomUUID(),
			name: criterion.name,
			maxScore,
			subCriteria: normalizedSubCriteria,
		}
	})
}

function normalizePresentationSlots(slots: CreateEventInput['presentationSlots'], contestants: EventContestant[], judges: EventJudge[]): EventPresentationSlot[] | undefined {
	if (!Array.isArray(slots) || slots.length === 0) {
		return undefined
	}

	if (slots.length !== contestants.length) {
		throw new Error('Presentation slots must match the number of contestants.')
	}

	const judgeIdByName = new Map(judges.map((judge) => [judge.name.toLowerCase(), judge.id]))
	const usedContestantIndices = new Set<number>()

	const normalized = slots.map((slot, index) => {
		const contestantIndex = Number(slot.contestantIndex)
		if (!Number.isInteger(contestantIndex) || contestantIndex < 0 || contestantIndex >= contestants.length) {
			throw new Error('Presentation slot contestant index is invalid.')
		}

		if (usedContestantIndices.has(contestantIndex)) {
			throw new Error('Each contestant can only be assigned to one presentation slot.')
		}
		usedContestantIndices.add(contestantIndex)

		const contestant = contestants[contestantIndex]
		const label = compactWhitespace(slot.label ?? '') || `Slot ${index + 1}`
		const judgeNames = Array.isArray(slot.judgeNames) ? slot.judgeNames.map((name) => compactWhitespace(name)) : []
		const uniqueJudgeNames = uniqueCaseInsensitive(judgeNames.filter((name) => name.length > 0))
		const judgeIds = uniqueJudgeNames.map((name) => {
			const judgeId = judgeIdByName.get(name.toLowerCase())
			if (!judgeId) {
				throw new Error(`Judge "${name}" not found for presentation slot.`)
			}
			return judgeId
		})

		return {
			id: randomUUID(),
			label,
			contestantId: contestant.id,
			judgeIds,
		}
	})

	if (usedContestantIndices.size !== contestants.length) {
		throw new Error('Each contestant must be assigned to a presentation slot.')
	}

	return normalized
}

function buildEvent(input: CreateEventInput): EventScorer {
	const title = compactWhitespace(input.title ?? '')

	if (!title) {
		throw new Error('Event title is required.')
	}

	const description = input.description ? compactWhitespace(input.description) : undefined
	const createdBy = input.createdBy ? compactWhitespace(input.createdBy) : undefined
	const eventScoringType = normalizeEventScoringType(input.eventScoringType)
	const rubricLegend = normalizeRubricLegendInput(input.rubricLegend)

	const normalizedContestants = normalizeContestants(input.contestants ?? [])
	const normalizedJudges = normalizeJudges(input.judges ?? [])
	const normalizedCriteria = normalizeCriteria(input.criteria ?? [], normalizedContestants)
	const normalizedPresentationSlots = normalizePresentationSlots(input.presentationSlots, normalizedContestants, normalizedJudges)
	const derivedDirectRatingConfig = deriveDirectRatingConfigFromCriteria(normalizedCriteria)
	const directRatingConfig = input.directRatingConfig !== undefined || derivedDirectRatingConfig ? normalizeDirectRatingConfig(input.directRatingConfig, derivedDirectRatingConfig ?? undefined) : undefined

	return {
		id: randomUUID(),
		title,
		description,
		createdBy,
		eventScoringType,
		rubricLegend,
		directRatingConfig,
		createdAt: new Date().toISOString(),
		contestants: normalizedContestants,
		judges: normalizedJudges,
		criteria: normalizedCriteria,
		presentationSlots: normalizedPresentationSlots,
		submissions: [],
	}
}

function normalizeContestantsForAdminEditor(rawContestants: AdminEventEditorInput['contestants']): EventContestant[] {
	if (!Array.isArray(rawContestants)) {
		throw new Error('Contestants payload must be an array.')
	}

	const usedIds = new Set<string>()
	const usedNames = new Set<string>()
	const contestants: EventContestant[] = []

	for (const rawContestant of rawContestants) {
		if (!rawContestant || typeof rawContestant !== 'object') {
			continue
		}

		const contestantName = compactWhitespace(String(rawContestant.name ?? ''))
		if (contestantName.length === 0) {
			continue
		}

		const nameKey = contestantName.toLowerCase()
		if (usedNames.has(nameKey)) {
			throw new Error(`Contestant name "${contestantName}" is duplicated.`)
		}
		usedNames.add(nameKey)

		const entryType = normalizeContestantEntryType(rawContestant.entryType)
		const participants = normalizeContestantParticipants(rawContestant.participants)
		const programTag = normalizeContestantProgramTag(rawContestant.programTag)
		const noatScore = normalizeNoatScore(rawContestant.noatScore)

		contestants.push({
			id: normalizeUniqueIdCandidate(rawContestant.id, usedIds),
			name: contestantName,
			entryType,
			participants: entryType === 'group' && participants.length > 0 ? participants : undefined,
			programTag: programTag ?? undefined,
			noatScore: noatScore ?? undefined,
			academicTrack: typeof rawContestant.academicTrack === 'string' && rawContestant.academicTrack.trim().length > 0 ? rawContestant.academicTrack.trim() : undefined,
			laptopAvailable: typeof rawContestant.laptopAvailable === 'string' && rawContestant.laptopAvailable.trim().length > 0 ? rawContestant.laptopAvailable.trim() : undefined,
		})
	}

	if (contestants.length < 2) {
		throw new Error('At least 2 contestants are required.')
	}

	return contestants
}

function normalizeJudgesForAdminEditor(rawJudges: AdminEventEditorInput['judges']): EventJudge[] {
	if (!Array.isArray(rawJudges)) {
		throw new Error('Judges payload must be an array.')
	}

	const usedIds = new Set<string>()
	const usedNames = new Set<string>()
	const usedTokens = new Set<string>()
	const judges: EventJudge[] = []

	for (const rawJudge of rawJudges) {
		if (!rawJudge || typeof rawJudge !== 'object') {
			continue
		}

		const judgeName = compactWhitespace(String(rawJudge.name ?? ''))
		if (judgeName.length === 0) {
			continue
		}

		const nameKey = judgeName.toLowerCase()
		if (usedNames.has(nameKey)) {
			throw new Error(`Judge name "${judgeName}" is duplicated.`)
		}
		usedNames.add(nameKey)

		const email = typeof rawJudge.email === 'string' ? compactWhitespace(rawJudge.email) : ''

		judges.push({
			id: normalizeUniqueIdCandidate(rawJudge.id, usedIds),
			name: judgeName,
			email: email.length > 0 ? email : undefined,
			token: normalizeUniqueTokenCandidate(rawJudge.token, usedTokens),
		})
	}

	if (judges.length === 0) {
		throw new Error('At least 1 judge is required.')
	}

	return judges
}

function normalizeCriteriaForAdminEditor(rawCriteria: AdminEventEditorInput['criteria'], contestants: EventContestant[]): EventCriterion[] {
	if (!Array.isArray(rawCriteria)) {
		throw new Error('Criteria payload must be an array.')
	}

	const usedCriterionIds = new Set<string>()
	const usedSubCriterionIds = new Set<string>()
	const criteria: EventCriterion[] = []

	for (const rawCriterion of rawCriteria) {
		if (!rawCriterion || typeof rawCriterion !== 'object') {
			continue
		}

		const criterionName = compactWhitespace(String(rawCriterion.name ?? ''))
		if (criterionName.length === 0) {
			continue
		}

		const rawSubCriteria = Array.isArray(rawCriterion.subCriteria) ? rawCriterion.subCriteria : []
		const baseSubCriteria = rawSubCriteria
			.map((rawSubCriterion) => {
				if (!rawSubCriterion || typeof rawSubCriterion !== 'object') {
					return null
				}

				const subCriterionName = compactWhitespace(String(rawSubCriterion.name ?? ''))
				if (subCriterionName.length === 0) {
					return null
				}

				const maxScore = toPositiveNumber(rawSubCriterion.maxScore, `Subcriterion max score (${criterionName})`)
				return {
					name: subCriterionName,
					maxScore,
				}
			})
			.filter((subCriterion): subCriterion is { name: string; maxScore: number } => Boolean(subCriterion))

		if (baseSubCriteria.length === 0) {
			throw new Error(`Criterion "${criterionName}" must have at least one subcriterion.`)
		}

		const expandedSubCriteria = expandIndividualPresentationSubCriteriaIfNeeded(criterionName, baseSubCriteria, contestants)
		const normalizedSubCriteria = expandedSubCriteria.map((subCriterion) => ({
			id: normalizeUniqueIdCandidate(undefined, usedSubCriterionIds),
			name: compactWhitespace(String(subCriterion.name ?? '')),
			maxScore: toPositiveNumber(subCriterion.maxScore, `Subcriterion max score (${criterionName})`),
		}))

		const maxScore = Math.round(normalizedSubCriteria.reduce((sum, subCriterion) => sum + subCriterion.maxScore, 0) * 1000) / 1000
		if (maxScore <= 0) {
			throw new Error(`Criterion "${criterionName}" must have total max score greater than 0.`)
		}

		criteria.push({
			id: normalizeUniqueIdCandidate(rawCriterion.id, usedCriterionIds),
			name: criterionName,
			maxScore,
			subCriteria: normalizedSubCriteria,
		})
	}

	if (criteria.length === 0) {
		throw new Error('At least 1 parent criterion is required.')
	}

	return criteria
}

function normalizePresentationSlotsForAdminEditor(rawSlots: AdminEventEditorInput['presentationSlots'], contestants: EventContestant[], judges: EventJudge[]): EventPresentationSlot[] | undefined {
	if (rawSlots === undefined) {
		return undefined
	}

	if (!Array.isArray(rawSlots) || rawSlots.length === 0) {
		return undefined
	}

	if (rawSlots.length !== contestants.length) {
		throw new Error('Presentation slots must match the number of contestants.')
	}

	const usedSlotIds = new Set<string>()
	const usedContestantIds = new Set<string>()
	const validContestantIds = new Set(contestants.map((contestant) => contestant.id))
	const validJudgeIds = new Set(judges.map((judge) => judge.id))
	const judgeIdByName = new Map(judges.map((judge) => [judge.name.toLowerCase(), judge.id]))

	const normalizedSlots = rawSlots.map((rawSlot, index) => {
		if (!rawSlot || typeof rawSlot !== 'object') {
			throw new Error('Invalid presentation slot payload.')
		}

		let contestantId = compactWhitespace(String(rawSlot.contestantId ?? ''))
		if (!contestantId) {
			const contestantIndex = Number(rawSlot.contestantIndex)
			if (Number.isInteger(contestantIndex) && contestantIndex >= 0 && contestantIndex < contestants.length) {
				contestantId = contestants[contestantIndex].id
			}
		}

		if (!contestantId || !validContestantIds.has(contestantId)) {
			throw new Error('Presentation slot contestant mapping is invalid.')
		}

		if (usedContestantIds.has(contestantId)) {
			throw new Error('Each contestant can only be assigned to one presentation slot.')
		}
		usedContestantIds.add(contestantId)

		let judgeIds: string[] = []

		if (Array.isArray(rawSlot.judgeIds) && rawSlot.judgeIds.length > 0) {
			judgeIds = uniqueCaseInsensitive(rawSlot.judgeIds.map((judgeId) => compactWhitespace(String(judgeId ?? ''))))
			judgeIds = judgeIds.filter((judgeId) => validJudgeIds.has(judgeId))
		} else if (Array.isArray(rawSlot.judgeNames) && rawSlot.judgeNames.length > 0) {
			judgeIds = uniqueCaseInsensitive(rawSlot.judgeNames.map((judgeName) => compactWhitespace(String(judgeName ?? '').toLowerCase())))
			judgeIds = judgeIds.map((judgeName) => judgeIdByName.get(judgeName) ?? '').filter((judgeId) => judgeId.length > 0)
		}

		return {
			id: normalizeUniqueIdCandidate(rawSlot.id, usedSlotIds),
			label: compactWhitespace(String(rawSlot.label ?? '')) || `Slot ${index + 1}`,
			contestantId,
			judgeIds,
		}
	})

	if (usedContestantIds.size !== contestants.length) {
		throw new Error('Each contestant must be assigned to a presentation slot.')
	}

	return normalizedSlots
}

function normalizeEventEditorInput(previousEvent: EventScorer, rawInput: unknown): EventScorer {
	if (!rawInput || typeof rawInput !== 'object') {
		throw new Error('Event editor payload is invalid.')
	}

	const source = rawInput as Partial<AdminEventEditorInput>
	const title = compactWhitespace(String(source.title ?? ''))
	if (!title) {
		throw new Error('Event title is required.')
	}

	const description = typeof source.description === 'string' ? compactWhitespace(source.description) : ''
	const createdBy = typeof source.createdBy === 'string' ? compactWhitespace(source.createdBy) : ''
	const eventScoringType = normalizeEventScoringType(source.eventScoringType)
	const rubricLegend = normalizeRubricLegendInput(source.rubricLegend)
	const contestants = normalizeContestantsForAdminEditor(source.contestants ?? [])
	const judges = normalizeJudgesForAdminEditor(source.judges ?? [])
	const criteria = normalizeCriteriaForAdminEditor(source.criteria ?? [], contestants)
	const presentationSlots = normalizePresentationSlotsForAdminEditor(source.presentationSlots, contestants, judges)
	const derivedDirectRatingConfig = deriveDirectRatingConfigFromCriteria(criteria)
	const directRatingConfig = source.directRatingConfig !== undefined || previousEvent.directRatingConfig || derivedDirectRatingConfig ? normalizeDirectRatingConfig(source.directRatingConfig, derivedDirectRatingConfig ?? previousEvent.directRatingConfig ?? undefined) : undefined

	return {
		...previousEvent,
		title,
		description: description.length > 0 ? description : undefined,
		createdBy: createdBy.length > 0 ? createdBy : undefined,
		eventScoringType,
		rubricLegend,
		directRatingConfig,
		contestants,
		judges,
		criteria,
		presentationSlots,
		submissions: [],
	}
}

function normalizeScoreMatrix(event: EventScorer, rawMatrix: unknown): ScoreMatrix {
	if (!rawMatrix || typeof rawMatrix !== 'object') {
		throw new Error('Scores payload must be an object.')
	}

	const matrix = rawMatrix as Record<string, Record<string, unknown>>
	const normalized: ScoreMatrix = {}

	for (const contestant of event.contestants) {
		const contestantScores = matrix[contestant.id] ?? {}
		normalized[contestant.id] = {}

		for (const parentCriterion of event.criteria) {
			for (const subCriterion of parentCriterion.subCriteria) {
				const incomingValue = contestantScores[subCriterion.id] ?? 0
				const numeric = typeof incomingValue === 'number' ? incomingValue : Number(incomingValue)

				if (!Number.isFinite(numeric)) {
					throw new Error(`Score for ${contestant.name} / ${subCriterion.name} must be a number.`)
				}

				if (numeric < 0 || numeric > subCriterion.maxScore) {
					throw new Error(`Score for ${contestant.name} / ${subCriterion.name} must be between 0 and ${subCriterion.maxScore}.`)
				}

				normalized[contestant.id][subCriterion.id] = Math.round(numeric * 1000) / 1000
			}
		}
	}

	return normalized
}

function normalizeContestantDetailText(value: unknown, maxLength: number): string | undefined {
	if (typeof value !== 'string') {
		return undefined
	}

	const normalized = value.trim()
	if (!normalized) {
		return undefined
	}

	return normalized.slice(0, maxLength)
}

function normalizeContestantDetails(event: EventScorer, rawDetails: unknown): JudgeContestantDetailsMap {
	if (rawDetails === undefined || rawDetails === null) {
		return {}
	}

	if (typeof rawDetails !== 'object') {
		throw new Error('Contestant details payload must be an object.')
	}

	const sourceDetails = rawDetails as Record<string, unknown>
	const normalized: JudgeContestantDetailsMap = {}

	for (const contestant of event.contestants) {
		const rawContestantDetails = sourceDetails[contestant.id]
		if (!rawContestantDetails || typeof rawContestantDetails !== 'object') {
			continue
		}

		const rawDetailsRecord = rawContestantDetails as Record<string, unknown>
		const strand = normalizeContestantDetailText(rawDetailsRecord.strand, 255)
		const remark = normalizeContestantDetailText(rawDetailsRecord.remark, 255)
		const additionalInfo = normalizeContestantDetailText(rawDetailsRecord.additionalInfo, 2000)

		if (!strand && !remark && !additionalInfo) {
			continue
		}

		normalized[contestant.id] = {
			...(strand ? { strand } : {}),
			...(remark ? { remark } : {}),
			...(additionalInfo ? { additionalInfo } : {}),
		}
	}

	return normalized
}

function hasPositiveScoreForContestant(scores: ScoreMatrix, contestantId: string): boolean {
	const contestantScores = scores[contestantId]

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

function savedContestantIdsForSubmission(event: EventScorer, submission: EventScorer['submissions'][number]): Set<string> {
	const validContestantIds = new Set(event.contestants.map((contestant) => contestant.id))

	if (Array.isArray(submission.savedContestantIds) && submission.savedContestantIds.length > 0) {
		return new Set(submission.savedContestantIds.filter((contestantId) => validContestantIds.has(contestantId)))
	}

	const inferredSavedIds = event.contestants.filter((contestant) => hasPositiveScoreForContestant(submission.scores, contestant.id)).map((contestant) => contestant.id)

	return new Set(inferredSavedIds)
}

function countSubmittedJudges(event: EventScorer): number {
	const submissionsByJudge = new Map(event.submissions.map((submission) => [submission.judgeId, submission]))

	return event.judges.reduce((count, judge) => {
		const submission = submissionsByJudge.get(judge.id)
		if (!submission) {
			return count
		}

		const savedContestantIds = savedContestantIdsForSubmission(event, submission)
		return savedContestantIds.size > 0 ? count + 1 : count
	}, 0)
}

function hasAnyAssignedJudges(event: EventScorer): boolean {
	if (!Array.isArray(event.presentationSlots) || event.presentationSlots.length === 0) {
		return false
	}

	return event.presentationSlots.some((slot) => slot.judgeIds.length > 0)
}

function assignedSlotsForJudge(event: EventScorer, judgeId: string): EventPresentationSlot[] | null {
	if (!Array.isArray(event.presentationSlots) || event.presentationSlots.length === 0) {
		return null
	}

	if (!hasAnyAssignedJudges(event)) {
		return null
	}

	return event.presentationSlots.filter((slot) => slot.judgeIds.includes(judgeId))
}

function isJudgeAssignedToContestant(event: EventScorer, judgeId: string, contestantId: string): boolean {
	if (!Array.isArray(event.presentationSlots) || event.presentationSlots.length === 0) {
		return true
	}

	if (!hasAnyAssignedJudges(event)) {
		return true
	}

	return event.presentationSlots.some((slot) => slot.contestantId === contestantId && slot.judgeIds.includes(judgeId))
}

function normalizeJudgeAssignmentIds(event: EventScorer, rawJudgeIds: unknown): string[] {
	if (!Array.isArray(rawJudgeIds)) {
		throw new Error('Judge assignments must be an array of judge IDs.')
	}

	const cleanedJudgeIds = Array.from(new Set(rawJudgeIds.map((judgeId) => compactWhitespace(String(judgeId ?? ''))).filter((judgeId) => judgeId.length > 0)))

	if (cleanedJudgeIds.length === 0) {
		throw new Error('At least 1 judge must be assigned to a participant.')
	}

	const validJudgeIds = new Set(event.judges.map((judge) => judge.id))

	for (const judgeId of cleanedJudgeIds) {
		if (!validJudgeIds.has(judgeId)) {
			throw new Error('One or more selected judges are not part of this event.')
		}
	}

	return cleanedJudgeIds
}

function normalizeProgramTagAssignments(event: EventScorer, rawAssignments: unknown): Array<{ contestantId: string; programTag: EventProgramTag | null }> {
	if (!Array.isArray(rawAssignments) || rawAssignments.length === 0) {
		throw new Error('Program tag assignments must include at least one participant.')
	}

	const validContestantIds = new Set(event.contestants.map((contestant) => contestant.id))
	const byContestantId = new Map<string, EventProgramTag | null>()

	for (const assignment of rawAssignments) {
		if (!assignment || typeof assignment !== 'object') {
			throw new Error('Invalid program tag assignment payload.')
		}

		const contestantId = compactWhitespace(String((assignment as { contestantId?: unknown }).contestantId ?? ''))
		if (contestantId.length === 0) {
			throw new Error('Program tag assignment is missing a participant ID.')
		}

		if (!validContestantIds.has(contestantId)) {
			throw new Error('Participant not found for this event.')
		}

		const programTag = normalizeContestantProgramTag((assignment as { programTag?: unknown }).programTag)
		byContestantId.set(contestantId, programTag)
	}

	return Array.from(byContestantId.entries()).map(([contestantId, programTag]) => ({ contestantId, programTag }))
}

function ensurePresentationSlotsForAssignmentUpdates(event: EventScorer): EventPresentationSlot[] {
	const existingSlots = Array.isArray(event.presentationSlots) ? event.presentationSlots : []
	const hasAnyJudgeAssigned = existingSlots.some((slot) => slot.judgeIds.length > 0)
	const existingSlotByContestantId = new Map(existingSlots.map((slot) => [slot.contestantId, slot]))
	const allJudgeIds = event.judges.map((judge) => judge.id)
	const validJudgeIds = new Set(allJudgeIds)

	return event.contestants.map((contestant, index) => {
		const existingSlot = existingSlotByContestantId.get(contestant.id)
		const baseJudgeIds = hasAnyJudgeAssigned ? (existingSlot?.judgeIds ?? allJudgeIds) : allJudgeIds
		const normalizedJudgeIds = Array.from(new Set(baseJudgeIds.filter((judgeId) => validJudgeIds.has(judgeId))))

		return {
			id: existingSlot?.id ?? randomUUID(),
			label: compactWhitespace(existingSlot?.label ?? '') || `Slot ${index + 1}`,
			contestantId: contestant.id,
			judgeIds: normalizedJudgeIds,
		}
	})
}

function buildSavedContestantIds(event: EventScorer, previousSubmission: EventScorer['submissions'][number] | undefined, savedContestantId: string): string[] {
	const validContestantIds = new Set(event.contestants.map((contestant) => contestant.id))

	if (!validContestantIds.has(savedContestantId)) {
		throw new Error('Contestant not found for this event.')
	}

	const savedIds = new Set<string>()

	if (previousSubmission) {
		for (const contestantId of savedContestantIdsForSubmission(event, previousSubmission)) {
			savedIds.add(contestantId)
		}
	}

	savedIds.add(savedContestantId)

	return Array.from(savedIds)
}

function normalizeIsoTimestamp(value: unknown, fallbackIso?: string): string {
	if (typeof value === 'string' && value.trim().length > 0) {
		const parsed = new Date(value)
		if (Number.isFinite(parsed.getTime())) {
			return parsed.toISOString()
		}
	}

	if (typeof fallbackIso === 'string' && fallbackIso.trim().length > 0) {
		const parsedFallback = new Date(fallbackIso)
		if (Number.isFinite(parsedFallback.getTime())) {
			return parsedFallback.toISOString()
		}
	}

	return new Date().toISOString()
}

function toMySqlDateTime(isoTimestamp: string): string {
	const normalizedIso = normalizeIsoTimestamp(isoTimestamp)
	return normalizedIso.slice(0, 23).replace('T', ' ')
}

function fromMySqlDateTime(value: unknown): string {
	if (value instanceof Date) {
		return value.toISOString()
	}

	const raw = compactWhitespace(String(value ?? ''))
	if (!raw) {
		return new Date().toISOString()
	}

	const withT = raw.includes('T') ? raw : raw.replace(' ', 'T')
	const withTimezone = /z$/i.test(withT) ? withT : `${withT}Z`
	const parsed = new Date(withTimezone)

	if (!Number.isFinite(parsed.getTime())) {
		return new Date().toISOString()
	}

	return parsed.toISOString()
}

function parseIntegerWithFallback(value: string | undefined, fallback: number): number {
	if (!value) {
		return fallback
	}

	const parsed = Number.parseInt(value, 10)
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback
	}

	return parsed
}

function parseNonNegativeIntegerWithFallback(value: string | undefined, fallback: number): number {
	if (!value) {
		return fallback
	}

	const parsed = Number.parseInt(value, 10)
	if (!Number.isFinite(parsed) || parsed < 0) {
		return fallback
	}

	return parsed
}

function resolveEffectiveConnectionLimit(requestedLimit: number, serverMaxConnections: number | null): number {
	if (!Number.isFinite(serverMaxConnections) || !serverMaxConnections || serverMaxConnections <= 0) {
		return requestedLimit
	}

	const reservedConnections = parseIntegerWithFallback(process.env.EVENTSCORER_DB_RESERVED_CONNECTIONS, 5)
	const availableConnections = Math.max(1, serverMaxConnections - reservedConnections)
	return Math.max(1, Math.min(requestedLimit, availableConnections))
}

function normalizeDatabaseName(value: string | undefined): string {
	const normalized = compactWhitespace(value ?? '')
	if (!normalized) {
		return 'shareme_eventscorer'
	}

	if (!/^[A-Za-z0-9_]+$/.test(normalized)) {
		throw new Error('Database name may only contain letters, numbers, and underscores.')
	}

	return normalized
}

function buildDatabaseConfig(): DatabaseConfig {
	const host = compactWhitespace(process.env.EVENTSCORER_DB_HOST ?? process.env.MYSQL_HOST ?? process.env.DB_HOST ?? '127.0.0.1')
	const port = parseIntegerWithFallback(process.env.EVENTSCORER_DB_PORT ?? process.env.MYSQL_PORT ?? process.env.DB_PORT, 3306)
	const user = compactWhitespace(process.env.EVENTSCORER_DB_USER ?? process.env.MYSQL_USER ?? process.env.DB_USER ?? '')
	const password = process.env.EVENTSCORER_DB_PASSWORD ?? process.env.MYSQL_PASSWORD ?? process.env.DB_PASSWORD ?? ''
	const database = normalizeDatabaseName(process.env.EVENTSCORER_DB_NAME ?? process.env.MYSQL_DATABASE ?? process.env.DB_NAME)
	const connectionLimit = parseIntegerWithFallback(process.env.EVENTSCORER_DB_POOL_SIZE ?? process.env.MYSQL_POOL_SIZE, 4)
	const queueLimit = parseNonNegativeIntegerWithFallback(process.env.EVENTSCORER_DB_QUEUE_LIMIT ?? process.env.MYSQL_QUEUE_LIMIT, 200)
	const defaultMaxIdle = Math.min(connectionLimit, 2)
	const requestedMaxIdle = parseNonNegativeIntegerWithFallback(process.env.EVENTSCORER_DB_MAX_IDLE ?? process.env.MYSQL_MAX_IDLE, defaultMaxIdle)
	const maxIdle = Math.min(connectionLimit, Math.max(1, requestedMaxIdle))
	const idleTimeoutMs = parseIntegerWithFallback(process.env.EVENTSCORER_DB_IDLE_TIMEOUT_MS ?? process.env.MYSQL_IDLE_TIMEOUT_MS, 15000)

	if (!host) {
		throw new Error('Database host is required.')
	}

	if (!user) {
		throw new Error('Database user is required. Set EVENTSCORER_DB_USER in .env.')
	}

	return {
		host,
		port,
		user,
		password,
		database,
		connectionLimit,
		queueLimit,
		maxIdle,
		idleTimeoutMs,
	}
}

async function getPool(): Promise<Pool> {
	const existingPoolPromise = eventScorerGlobalState.__eventScorerPoolPromise
	if (existingPoolPromise) {
		const pool = await existingPoolPromise
		await ensureSchemaVersion(pool)
		return pool
	}

	const initializingPoolPromise = initializePool().catch((error) => {
		if (eventScorerGlobalState.__eventScorerPoolPromise === initializingPoolPromise) {
			eventScorerGlobalState.__eventScorerPoolPromise = null
		}

		throw error
	})

	eventScorerGlobalState.__eventScorerPoolPromise = initializingPoolPromise
	const pool = await initializingPoolPromise
	await ensureSchemaVersion(pool)
	return pool
}

async function ensureSchemaVersion(pool: Pool): Promise<void> {
	const currentVersion = eventScorerGlobalState.__eventScorerSchemaVersion ?? 0
	if (currentVersion >= EVENTSCORER_SCHEMA_VERSION) {
		return
	}

	const existingSchemaPromise = eventScorerGlobalState.__eventScorerSchemaPromise
	if (existingSchemaPromise) {
		await existingSchemaPromise
		return
	}

	const schemaPromise = ensureSchema(pool)
		.then(() => {
			eventScorerGlobalState.__eventScorerSchemaVersion = EVENTSCORER_SCHEMA_VERSION
		})
		.finally(() => {
			if (eventScorerGlobalState.__eventScorerSchemaPromise === schemaPromise) {
				eventScorerGlobalState.__eventScorerSchemaPromise = null
			}
		})

	eventScorerGlobalState.__eventScorerSchemaPromise = schemaPromise
	await schemaPromise
}

async function initializePool(): Promise<Pool> {
	const config = buildDatabaseConfig()
	let serverMaxConnections: number | null = null

	const bootstrap = await mysql.createConnection({
		host: config.host,
		port: config.port,
		user: config.user,
		password: config.password,
	})

	try {
		await bootstrap.query(`CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)

		const [systemVariableRows] = await bootstrap.query<MysqlSystemVariableRow[]>(`SHOW VARIABLES LIKE 'max_connections'`)
		const parsedMaxConnections = Number(systemVariableRows[0]?.Value ?? 0)
		if (Number.isFinite(parsedMaxConnections) && parsedMaxConnections > 0) {
			serverMaxConnections = parsedMaxConnections
		}
	} finally {
		await bootstrap.end()
	}

	const effectiveConnectionLimit = resolveEffectiveConnectionLimit(config.connectionLimit, serverMaxConnections)
	if (effectiveConnectionLimit < config.connectionLimit && serverMaxConnections) {
		console.warn(`[eventscorer] MySQL max_connections=${serverMaxConnections}; capping pool size to ${effectiveConnectionLimit} (requested ${config.connectionLimit}).`)
	}

	const effectiveMaxIdle = Math.min(config.maxIdle, effectiveConnectionLimit)

	const pool = mysql.createPool({
		host: config.host,
		port: config.port,
		user: config.user,
		password: config.password,
		database: config.database,
		waitForConnections: true,
		connectionLimit: effectiveConnectionLimit,
		queueLimit: config.queueLimit,
		maxIdle: effectiveMaxIdle,
		idleTimeout: config.idleTimeoutMs,
		decimalNumbers: true,
		dateStrings: true,
		enableKeepAlive: true,
		keepAliveInitialDelay: 0,
	})

	await ensureSchemaVersion(pool)
	await migrateLegacyJsonIfNeeded(pool)
	return pool
}

async function ensureSchema(pool: Pool): Promise<void> {
	const statements = [
		`CREATE TABLE IF NOT EXISTS ${TABLE_EVENTS} (
			id VARCHAR(36) NOT NULL,
			title VARCHAR(255) NOT NULL,
			description TEXT NULL,
			created_by VARCHAR(255) NULL,
			event_scoring_type VARCHAR(32) NOT NULL DEFAULT 'standard',
			rubric_legend_json LONGTEXT NULL,
			direct_rating_config_json LONGTEXT NULL,
			created_at DATETIME(3) NOT NULL,
			PRIMARY KEY (id),
			INDEX idx_${TABLE_EVENTS}_created_at (created_at)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS ${TABLE_CONTESTANTS} (
			id VARCHAR(36) NOT NULL,
			event_id VARCHAR(36) NOT NULL,
			name VARCHAR(255) NOT NULL,
			entry_type VARCHAR(32) NOT NULL DEFAULT 'group',
			program_tag VARCHAR(16) NULL,
			noat_score DECIMAL(10,3) NULL,
			academic_track VARCHAR(512) NULL,
			laptop_available VARCHAR(512) NULL,
			sort_order INT NOT NULL,
			PRIMARY KEY (id),
			INDEX idx_${TABLE_CONTESTANTS}_event_order (event_id, sort_order),
			CONSTRAINT fk_${TABLE_CONTESTANTS}_event FOREIGN KEY (event_id) REFERENCES ${TABLE_EVENTS}(id) ON DELETE CASCADE
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS ${TABLE_CONTESTANT_PARTICIPANTS} (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			contestant_id VARCHAR(36) NOT NULL,
			participant_name VARCHAR(255) NOT NULL,
			sort_order INT NOT NULL,
			PRIMARY KEY (id),
			INDEX idx_${TABLE_CONTESTANT_PARTICIPANTS}_contestant_order (contestant_id, sort_order),
			CONSTRAINT fk_${TABLE_CONTESTANT_PARTICIPANTS}_contestant FOREIGN KEY (contestant_id) REFERENCES ${TABLE_CONTESTANTS}(id) ON DELETE CASCADE
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS ${TABLE_JUDGES} (
			id VARCHAR(36) NOT NULL,
			event_id VARCHAR(36) NOT NULL,
			name VARCHAR(255) NOT NULL,
			email VARCHAR(255) NULL,
			token VARCHAR(128) NOT NULL,
			sort_order INT NOT NULL,
			PRIMARY KEY (id),
			UNIQUE KEY uq_${TABLE_JUDGES}_token (token),
			INDEX idx_${TABLE_JUDGES}_event_order (event_id, sort_order),
			CONSTRAINT fk_${TABLE_JUDGES}_event FOREIGN KEY (event_id) REFERENCES ${TABLE_EVENTS}(id) ON DELETE CASCADE
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS ${TABLE_CRITERIA} (
			id VARCHAR(36) NOT NULL,
			event_id VARCHAR(36) NOT NULL,
			name VARCHAR(255) NOT NULL,
			max_score DECIMAL(10,3) NOT NULL,
			sort_order INT NOT NULL,
			PRIMARY KEY (id),
			INDEX idx_${TABLE_CRITERIA}_event_order (event_id, sort_order),
			CONSTRAINT fk_${TABLE_CRITERIA}_event FOREIGN KEY (event_id) REFERENCES ${TABLE_EVENTS}(id) ON DELETE CASCADE
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS ${TABLE_SUBCRITERIA} (
			id VARCHAR(36) NOT NULL,
			criterion_id VARCHAR(36) NOT NULL,
			name VARCHAR(255) NOT NULL,
			max_score DECIMAL(10,3) NOT NULL,
			sort_order INT NOT NULL,
			PRIMARY KEY (id),
			INDEX idx_${TABLE_SUBCRITERIA}_criterion_order (criterion_id, sort_order),
			CONSTRAINT fk_${TABLE_SUBCRITERIA}_criterion FOREIGN KEY (criterion_id) REFERENCES ${TABLE_CRITERIA}(id) ON DELETE CASCADE
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS ${TABLE_PRESENTATION_SLOTS} (
			id VARCHAR(36) NOT NULL,
			event_id VARCHAR(36) NOT NULL,
			label VARCHAR(255) NOT NULL,
			contestant_id VARCHAR(36) NOT NULL,
			sort_order INT NOT NULL,
			PRIMARY KEY (id),
			UNIQUE KEY uq_${TABLE_PRESENTATION_SLOTS}_event_contestant (event_id, contestant_id),
			INDEX idx_${TABLE_PRESENTATION_SLOTS}_event_order (event_id, sort_order),
			CONSTRAINT fk_${TABLE_PRESENTATION_SLOTS}_event FOREIGN KEY (event_id) REFERENCES ${TABLE_EVENTS}(id) ON DELETE CASCADE,
			CONSTRAINT fk_${TABLE_PRESENTATION_SLOTS}_contestant FOREIGN KEY (contestant_id) REFERENCES ${TABLE_CONTESTANTS}(id) ON DELETE CASCADE
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS ${TABLE_PRESENTATION_SLOT_JUDGES} (
			slot_id VARCHAR(36) NOT NULL,
			judge_id VARCHAR(36) NOT NULL,
			sort_order INT NOT NULL,
			PRIMARY KEY (slot_id, judge_id),
			INDEX idx_${TABLE_PRESENTATION_SLOT_JUDGES}_judge (judge_id),
			CONSTRAINT fk_${TABLE_PRESENTATION_SLOT_JUDGES}_slot FOREIGN KEY (slot_id) REFERENCES ${TABLE_PRESENTATION_SLOTS}(id) ON DELETE CASCADE,
			CONSTRAINT fk_${TABLE_PRESENTATION_SLOT_JUDGES}_judge FOREIGN KEY (judge_id) REFERENCES ${TABLE_JUDGES}(id) ON DELETE CASCADE
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS ${TABLE_SUBMISSIONS} (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			event_id VARCHAR(36) NOT NULL,
			judge_id VARCHAR(36) NOT NULL,
			submitted_at DATETIME(3) NOT NULL,
			PRIMARY KEY (id),
			UNIQUE KEY uq_${TABLE_SUBMISSIONS}_event_judge (event_id, judge_id),
			INDEX idx_${TABLE_SUBMISSIONS}_event (event_id),
			CONSTRAINT fk_${TABLE_SUBMISSIONS}_event FOREIGN KEY (event_id) REFERENCES ${TABLE_EVENTS}(id) ON DELETE CASCADE,
			CONSTRAINT fk_${TABLE_SUBMISSIONS}_judge FOREIGN KEY (judge_id) REFERENCES ${TABLE_JUDGES}(id) ON DELETE CASCADE
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS ${TABLE_SUBMISSION_SAVED_CONTESTANTS} (
			submission_id BIGINT UNSIGNED NOT NULL,
			contestant_id VARCHAR(36) NOT NULL,
			PRIMARY KEY (submission_id, contestant_id),
			INDEX idx_${TABLE_SUBMISSION_SAVED_CONTESTANTS}_contestant (contestant_id),
			CONSTRAINT fk_${TABLE_SUBMISSION_SAVED_CONTESTANTS}_submission FOREIGN KEY (submission_id) REFERENCES ${TABLE_SUBMISSIONS}(id) ON DELETE CASCADE,
			CONSTRAINT fk_${TABLE_SUBMISSION_SAVED_CONTESTANTS}_contestant FOREIGN KEY (contestant_id) REFERENCES ${TABLE_CONTESTANTS}(id) ON DELETE CASCADE
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS ${TABLE_SUBMISSION_SCORES} (
			submission_id BIGINT UNSIGNED NOT NULL,
			contestant_id VARCHAR(36) NOT NULL,
			subcriterion_id VARCHAR(36) NOT NULL,
			score DECIMAL(10,3) NOT NULL,
			PRIMARY KEY (submission_id, contestant_id, subcriterion_id),
			INDEX idx_${TABLE_SUBMISSION_SCORES}_contestant (contestant_id),
			INDEX idx_${TABLE_SUBMISSION_SCORES}_subcriterion (subcriterion_id),
			CONSTRAINT fk_${TABLE_SUBMISSION_SCORES}_submission FOREIGN KEY (submission_id) REFERENCES ${TABLE_SUBMISSIONS}(id) ON DELETE CASCADE,
			CONSTRAINT fk_${TABLE_SUBMISSION_SCORES}_contestant FOREIGN KEY (contestant_id) REFERENCES ${TABLE_CONTESTANTS}(id) ON DELETE CASCADE,
			CONSTRAINT fk_${TABLE_SUBMISSION_SCORES}_subcriterion FOREIGN KEY (subcriterion_id) REFERENCES ${TABLE_SUBCRITERIA}(id) ON DELETE CASCADE
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		`CREATE TABLE IF NOT EXISTS ${TABLE_SUBMISSION_CONTESTANT_DETAILS} (
			submission_id BIGINT UNSIGNED NOT NULL,
			contestant_id VARCHAR(36) NOT NULL,
			strand VARCHAR(255) NULL,
			remark VARCHAR(255) NULL,
			additional_info TEXT NULL,
			PRIMARY KEY (submission_id, contestant_id),
			INDEX idx_${TABLE_SUBMISSION_CONTESTANT_DETAILS}_contestant (contestant_id),
			CONSTRAINT fk_${TABLE_SUBMISSION_CONTESTANT_DETAILS}_submission FOREIGN KEY (submission_id) REFERENCES ${TABLE_SUBMISSIONS}(id) ON DELETE CASCADE,
			CONSTRAINT fk_${TABLE_SUBMISSION_CONTESTANT_DETAILS}_contestant FOREIGN KEY (contestant_id) REFERENCES ${TABLE_CONTESTANTS}(id) ON DELETE CASCADE
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
	]

	for (const statement of statements) {
		await pool.execute(statement)
	}

	const [legendColumnRows] = await pool.execute<CountRow[]>(
		`SELECT COUNT(*) AS total
		 FROM information_schema.columns
		 WHERE table_schema = DATABASE()
		   AND table_name = ?
		   AND column_name = ?`,
		[TABLE_EVENTS, 'rubric_legend_json'],
	)

	const legendColumnExists = Number(legendColumnRows[0]?.total ?? 0) > 0
	if (!legendColumnExists) {
		await pool.execute(`ALTER TABLE ${TABLE_EVENTS} ADD COLUMN rubric_legend_json LONGTEXT NULL AFTER event_scoring_type`)
	}

	const [directConfigColumnRows] = await pool.execute<CountRow[]>(
		`SELECT COUNT(*) AS total
		 FROM information_schema.columns
		 WHERE table_schema = DATABASE()
		   AND table_name = ?
		   AND column_name = ?`,
		[TABLE_EVENTS, 'direct_rating_config_json'],
	)

	const directConfigColumnExists = Number(directConfigColumnRows[0]?.total ?? 0) > 0
	if (!directConfigColumnExists) {
		await pool.execute(`ALTER TABLE ${TABLE_EVENTS} ADD COLUMN direct_rating_config_json LONGTEXT NULL AFTER rubric_legend_json`)
	}

	const [noatColumnRows] = await pool.execute<CountRow[]>(
		`SELECT COUNT(*) AS total
		 FROM information_schema.columns
		 WHERE table_schema = DATABASE()
		   AND table_name = ?
		   AND column_name = ?`,
		[TABLE_CONTESTANTS, 'noat_score'],
	)

	const noatColumnExists = Number(noatColumnRows[0]?.total ?? 0) > 0
	if (!noatColumnExists) {
		await pool.execute(`ALTER TABLE ${TABLE_CONTESTANTS} ADD COLUMN noat_score DECIMAL(10,3) NULL AFTER program_tag`)
	}

	const [academicTrackColumnRows] = await pool.execute<CountRow[]>(
		`SELECT COUNT(*) AS total
		 FROM information_schema.columns
		 WHERE table_schema = DATABASE()
		   AND table_name = ?
		   AND column_name = ?`,
		[TABLE_CONTESTANTS, 'academic_track'],
	)

	const academicTrackColumnExists = Number(academicTrackColumnRows[0]?.total ?? 0) > 0
	if (!academicTrackColumnExists) {
		await pool.execute(`ALTER TABLE ${TABLE_CONTESTANTS} ADD COLUMN academic_track VARCHAR(512) NULL AFTER noat_score`)
	}

	const [laptopAvailableColumnRows] = await pool.execute<CountRow[]>(
		`SELECT COUNT(*) AS total
		 FROM information_schema.columns
		 WHERE table_schema = DATABASE()
		   AND table_name = ?
		   AND column_name = ?`,
		[TABLE_CONTESTANTS, 'laptop_available'],
	)

	const laptopAvailableColumnExists = Number(laptopAvailableColumnRows[0]?.total ?? 0) > 0
	if (!laptopAvailableColumnExists) {
		await pool.execute(`ALTER TABLE ${TABLE_CONTESTANTS} ADD COLUMN laptop_available VARCHAR(512) NULL AFTER academic_track`)
	}
}

async function selectRows<T extends RowDataPacket>(executor: SqlExecutor, statement: string, params: SqlExecuteValues = []): Promise<T[]> {
	const [rows] = await executor.execute<T[]>(statement, params)
	return rows
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
	if (chunkSize <= 0) {
		return [items]
	}

	const chunks: T[][] = []
	for (let index = 0; index < items.length; index += chunkSize) {
		chunks.push(items.slice(index, index + chunkSize))
	}

	return chunks
}

function normalizeLegacyContestants(value: unknown): EventContestant[] {
	if (!Array.isArray(value)) {
		return []
	}

	const seenContestantIds = new Set<string>()
	const normalized: EventContestant[] = []

	for (const rawContestant of value) {
		if (!rawContestant || typeof rawContestant !== 'object') {
			continue
		}

		const source = rawContestant as Partial<EventContestant>
		const name = compactWhitespace(String(source.name ?? ''))
		if (!name) {
			continue
		}

		let contestantId = compactWhitespace(String(source.id ?? ''))
		if (!contestantId || seenContestantIds.has(contestantId)) {
			contestantId = randomUUID()
		}
		seenContestantIds.add(contestantId)

		const entryType = normalizeContestantEntryType(source.entryType)
		const participants = normalizeContestantParticipants(source.participants)
		const programTag = parseProgramTag(source.programTag) ?? inferProgramTagFromContestantName(name)
		const noatScore = normalizeNoatScore((source as { noatScore?: unknown }).noatScore)

		normalized.push({
			id: contestantId,
			name,
			entryType,
			participants: entryType === 'group' && participants.length > 0 ? participants : undefined,
			programTag: programTag ?? undefined,
			noatScore: noatScore ?? undefined,
		})
	}

	return normalized
}

function normalizeLegacyJudges(value: unknown): EventJudge[] {
	if (!Array.isArray(value)) {
		return []
	}

	const seenJudgeIds = new Set<string>()
	const seenTokens = new Set<string>()
	const normalized: EventJudge[] = []

	for (const rawJudge of value) {
		if (!rawJudge || typeof rawJudge !== 'object') {
			continue
		}

		const source = rawJudge as Partial<EventJudge>
		const name = compactWhitespace(String(source.name ?? ''))
		if (!name) {
			continue
		}

		let judgeId = compactWhitespace(String(source.id ?? ''))
		if (!judgeId || seenJudgeIds.has(judgeId)) {
			judgeId = randomUUID()
		}
		seenJudgeIds.add(judgeId)

		let token = compactWhitespace(String(source.token ?? ''))
		if (!token || seenTokens.has(token)) {
			token = randomBytes(24).toString('hex')
		}
		seenTokens.add(token)

		const email = typeof source.email === 'string' ? compactWhitespace(source.email) : ''
		normalized.push({
			id: judgeId,
			name,
			email: email || undefined,
			token,
		})
	}

	return normalized
}

function normalizeLegacyCriteria(value: unknown): EventCriterion[] {
	if (!Array.isArray(value)) {
		return []
	}

	const seenCriterionIds = new Set<string>()
	const seenSubCriterionIds = new Set<string>()
	const normalizedCriteria: EventCriterion[] = []

	for (const rawCriterion of value) {
		if (!rawCriterion || typeof rawCriterion !== 'object') {
			continue
		}

		const sourceCriterion = rawCriterion as Partial<EventCriterion>
		const criterionName = compactWhitespace(String(sourceCriterion.name ?? ''))
		if (!criterionName) {
			continue
		}

		let criterionId = compactWhitespace(String(sourceCriterion.id ?? ''))
		if (!criterionId || seenCriterionIds.has(criterionId)) {
			criterionId = randomUUID()
		}
		seenCriterionIds.add(criterionId)

		const sourceSubCriteria = Array.isArray(sourceCriterion.subCriteria) ? sourceCriterion.subCriteria : []
		const normalizedSubCriteria: EventSubCriterion[] = []

		for (const rawSubCriterion of sourceSubCriteria) {
			if (!rawSubCriterion || typeof rawSubCriterion !== 'object') {
				continue
			}

			const sourceSubCriterion = rawSubCriterion as Partial<EventSubCriterion>
			const subCriterionName = compactWhitespace(String(sourceSubCriterion.name ?? ''))
			if (!subCriterionName) {
				continue
			}

			const maxScore = toPositiveNumberOrNull(sourceSubCriterion.maxScore)
			if (maxScore === null) {
				continue
			}

			let subCriterionId = compactWhitespace(String(sourceSubCriterion.id ?? ''))
			if (!subCriterionId || seenSubCriterionIds.has(subCriterionId)) {
				subCriterionId = randomUUID()
			}
			seenSubCriterionIds.add(subCriterionId)

			normalizedSubCriteria.push({
				id: subCriterionId,
				name: subCriterionName,
				maxScore,
			})
		}

		if (normalizedSubCriteria.length === 0) {
			continue
		}

		const criterionMaxScore = Math.round(normalizedSubCriteria.reduce((sum, subCriterion) => sum + subCriterion.maxScore, 0) * 1000) / 1000
		if (criterionMaxScore <= 0) {
			continue
		}

		normalizedCriteria.push({
			id: criterionId,
			name: criterionName,
			maxScore: criterionMaxScore,
			subCriteria: normalizedSubCriteria,
		})
	}

	return normalizedCriteria
}

function normalizeLegacyPresentationSlots(value: unknown, contestants: EventContestant[], judges: EventJudge[]): EventPresentationSlot[] | undefined {
	if (!Array.isArray(value) || value.length === 0) {
		return undefined
	}

	const validContestantIds = new Set(contestants.map((contestant) => contestant.id))
	const validJudgeIds = new Set(judges.map((judge) => judge.id))
	const usedContestantIds = new Set<string>()
	const seenSlotIds = new Set<string>()
	const normalizedSlots: EventPresentationSlot[] = []

	for (const rawSlot of value) {
		if (!rawSlot || typeof rawSlot !== 'object') {
			continue
		}

		const sourceSlot = rawSlot as Partial<EventPresentationSlot>
		const contestantId = compactWhitespace(String(sourceSlot.contestantId ?? ''))
		if (!contestantId || !validContestantIds.has(contestantId) || usedContestantIds.has(contestantId)) {
			continue
		}
		usedContestantIds.add(contestantId)

		let slotId = compactWhitespace(String(sourceSlot.id ?? ''))
		if (!slotId || seenSlotIds.has(slotId)) {
			slotId = randomUUID()
		}
		seenSlotIds.add(slotId)

		const rawJudgeIds = Array.isArray(sourceSlot.judgeIds) ? sourceSlot.judgeIds : []
		const judgeIds = Array.from(new Set(rawJudgeIds.map((judgeId) => compactWhitespace(String(judgeId ?? ''))).filter((judgeId) => judgeId.length > 0 && validJudgeIds.has(judgeId))))

		const label = compactWhitespace(String(sourceSlot.label ?? '')) || `Slot ${normalizedSlots.length + 1}`
		normalizedSlots.push({
			id: slotId,
			label,
			contestantId,
			judgeIds,
		})
	}

	if (normalizedSlots.length !== contestants.length) {
		return undefined
	}

	return normalizedSlots
}

function normalizeLegacySubmissions(event: EventScorer, value: unknown): JudgeSubmission[] {
	if (!Array.isArray(value)) {
		return []
	}

	const validJudgeIds = new Set(event.judges.map((judge) => judge.id))
	const validContestantIds = new Set(event.contestants.map((contestant) => contestant.id))
	const latestSubmissionByJudge = new Map<string, JudgeSubmission>()

	for (const rawSubmission of value) {
		if (!rawSubmission || typeof rawSubmission !== 'object') {
			continue
		}

		const sourceSubmission = rawSubmission as Partial<JudgeSubmission>
		const judgeId = compactWhitespace(String(sourceSubmission.judgeId ?? ''))
		if (!judgeId || !validJudgeIds.has(judgeId)) {
			continue
		}

		let normalizedScores: ScoreMatrix
		try {
			normalizedScores = normalizeScoreMatrix(event, sourceSubmission.scores ?? {})
		} catch {
			continue
		}

		const submittedAt = normalizeIsoTimestamp(sourceSubmission.submittedAt, event.createdAt)
		const savedContestantIds = Array.isArray(sourceSubmission.savedContestantIds) ? Array.from(new Set(sourceSubmission.savedContestantIds.map((contestantId) => compactWhitespace(String(contestantId ?? ''))).filter((contestantId) => validContestantIds.has(contestantId)))) : []
		let contestantDetails: JudgeContestantDetailsMap = {}

		try {
			contestantDetails = normalizeContestantDetails(event, sourceSubmission.contestantDetails)
		} catch {
			contestantDetails = {}
		}

		const normalizedSubmission: JudgeSubmission = {
			judgeId,
			submittedAt,
			scores: normalizedScores,
			savedContestantIds: savedContestantIds.length > 0 ? savedContestantIds : undefined,
			contestantDetails: Object.keys(contestantDetails).length > 0 ? contestantDetails : undefined,
		}

		const existingSubmission = latestSubmissionByJudge.get(judgeId)
		if (!existingSubmission) {
			latestSubmissionByJudge.set(judgeId, normalizedSubmission)
			continue
		}

		const existingTime = new Date(existingSubmission.submittedAt).getTime()
		const currentTime = new Date(submittedAt).getTime()
		if (!Number.isFinite(existingTime) || currentTime >= existingTime) {
			latestSubmissionByJudge.set(judgeId, normalizedSubmission)
		}
	}

	return Array.from(latestSubmissionByJudge.values())
}

function normalizeLegacyEventForImport(rawEvent: unknown): EventScorer | null {
	if (!rawEvent || typeof rawEvent !== 'object') {
		return null
	}

	const sourceEvent = rawEvent as Partial<EventScorer>
	const title = compactWhitespace(String(sourceEvent.title ?? ''))
	if (!title) {
		return null
	}

	const contestants = normalizeLegacyContestants(sourceEvent.contestants)
	if (contestants.length < 2) {
		return null
	}

	const judges = normalizeLegacyJudges(sourceEvent.judges)
	if (judges.length === 0) {
		return null
	}

	const criteria = normalizeLegacyCriteria(sourceEvent.criteria)
	if (criteria.length === 0) {
		return null
	}

	const rawEventId = compactWhitespace(String(sourceEvent.id ?? ''))
	const eventId = rawEventId || randomUUID()
	const description = compactWhitespace(String(sourceEvent.description ?? '')) || undefined
	const createdBy = compactWhitespace(String(sourceEvent.createdBy ?? '')) || undefined
	const createdAt = normalizeIsoTimestamp(sourceEvent.createdAt)
	const eventScoringType = parseEventScoringType(sourceEvent.eventScoringType) ?? inferEventScoringTypeFromCriteria(criteria)
	const rubricLegend = normalizeRubricLegendInput(sourceEvent.rubricLegend)
	const derivedDirectRatingConfig = deriveDirectRatingConfigFromCriteria(criteria)
	const directRatingConfig = sourceEvent.directRatingConfig !== undefined || derivedDirectRatingConfig ? normalizeDirectRatingConfig(sourceEvent.directRatingConfig, derivedDirectRatingConfig ?? undefined) : undefined
	const presentationSlots = normalizeLegacyPresentationSlots(sourceEvent.presentationSlots, contestants, judges)

	const normalizedEvent: EventScorer = {
		id: eventId,
		title,
		description,
		createdBy,
		eventScoringType,
		rubricLegend,
		directRatingConfig,
		createdAt,
		contestants,
		judges,
		criteria,
		presentationSlots,
		submissions: [],
	}

	normalizedEvent.submissions = normalizeLegacySubmissions(normalizedEvent, sourceEvent.submissions)
	return normalizedEvent
}

async function migrateLegacyJsonIfNeeded(pool: Pool): Promise<void> {
	if (process.env.EVENTSCORER_SKIP_JSON_MIGRATION === '1') {
		return
	}

	const [countRow] = await selectRows<CountRow>(pool, `SELECT COUNT(*) AS total FROM ${TABLE_EVENTS}`)
	const existingEventCount = Number(countRow?.total ?? 0)
	if (existingEventCount > 0) {
		return
	}

	let rawFile: string
	try {
		rawFile = await readFile(LEGACY_DATA_FILE, 'utf8')
	} catch (error) {
		const maybeError = error as NodeJS.ErrnoException
		if (maybeError.code === 'ENOENT') {
			return
		}
		throw error
	}

	if (!rawFile.trim()) {
		return
	}

	let parsedStore: StoreShape
	try {
		parsedStore = JSON.parse(rawFile) as StoreShape
	} catch {
		return
	}

	if (!parsedStore || !Array.isArray(parsedStore.events) || parsedStore.events.length === 0) {
		return
	}

	const normalizedEvents: EventScorer[] = []
	const seenEventIds = new Set<string>()
	const seenJudgeTokens = new Set<string>()

	for (const rawEvent of parsedStore.events) {
		const normalized = normalizeLegacyEventForImport(rawEvent)
		if (!normalized) {
			continue
		}

		let normalizedEvent = normalized
		if (seenEventIds.has(normalizedEvent.id)) {
			normalizedEvent = { ...normalizedEvent, id: randomUUID() }
		}
		seenEventIds.add(normalizedEvent.id)

		const normalizedJudges = normalizedEvent.judges.map((judge) => {
			let token = judge.token
			while (seenJudgeTokens.has(token)) {
				token = randomBytes(24).toString('hex')
			}
			seenJudgeTokens.add(token)

			return token === judge.token ? judge : { ...judge, token }
		})

		normalizedEvents.push({
			...normalizedEvent,
			judges: normalizedJudges,
		})
	}

	if (normalizedEvents.length === 0) {
		return
	}

	const connection = await pool.getConnection()
	try {
		await connection.beginTransaction()
		for (const event of normalizedEvents) {
			await insertEventGraph(connection, event)
		}
		await connection.commit()
		console.info(`[eventscorer] Imported ${normalizedEvents.length} legacy event(s) from data/events.json into MySQL.`)
	} catch (error) {
		await connection.rollback()
		throw error
	} finally {
		connection.release()
	}
}

function buildPersistableScoreRows(event: EventScorer, scores: ScoreMatrix): PersistableScoreRow[] {
	const rows: PersistableScoreRow[] = []

	for (const contestant of event.contestants) {
		for (const criterion of event.criteria) {
			for (const subCriterion of criterion.subCriteria) {
				const rawScore = scores[contestant.id]?.[subCriterion.id] ?? 0
				const numericScore = Number(rawScore)
				if (!Number.isFinite(numericScore)) {
					continue
				}

				const roundedScore = Math.round(numericScore * 1000) / 1000
				if (roundedScore <= 0) {
					continue
				}

				rows.push({
					contestantId: contestant.id,
					subCriterionId: subCriterion.id,
					score: roundedScore,
				})
			}
		}
	}

	return rows
}

function buildPersistableContestantDetailRows(event: EventScorer, contestantDetails: JudgeContestantDetailsMap): PersistableContestantDetailRow[] {
	const rows: PersistableContestantDetailRow[] = []

	for (const contestant of event.contestants) {
		const details = contestantDetails[contestant.id]
		if (!details || typeof details !== 'object') {
			continue
		}

		const strand = normalizeContestantDetailText(details.strand, 255)
		const remark = normalizeContestantDetailText(details.remark, 255)
		const additionalInfo = normalizeContestantDetailText(details.additionalInfo, 2000)

		if (!strand && !remark && !additionalInfo) {
			continue
		}

		rows.push({
			contestantId: contestant.id,
			...(strand ? { strand } : {}),
			...(remark ? { remark } : {}),
			...(additionalInfo ? { additionalInfo } : {}),
		})
	}

	return rows
}

async function ensureSubmissionRow(connection: PoolConnection, eventId: string, judgeId: string, submittedAt: string): Promise<number> {
	await connection.execute(
		`INSERT INTO ${TABLE_SUBMISSIONS} (event_id, judge_id, submitted_at)
		 VALUES (?, ?, ?)
		 ON DUPLICATE KEY UPDATE submitted_at = VALUES(submitted_at)`,
		[eventId, judgeId, toMySqlDateTime(submittedAt)],
	)

	const submissionRows = await selectRows<SubmissionRow>(
		connection,
		`SELECT id, judge_id, submitted_at
		 FROM ${TABLE_SUBMISSIONS}
		 WHERE event_id = ? AND judge_id = ?
		 LIMIT 1`,
		[eventId, judgeId],
	)

	if (submissionRows.length === 0) {
		throw new Error('Unable to save submission.')
	}

	return Number(submissionRows[0].id)
}

async function replaceSavedContestantIds(connection: PoolConnection, submissionId: number, savedContestantIds: string[]): Promise<void> {
	await connection.execute(`DELETE FROM ${TABLE_SUBMISSION_SAVED_CONTESTANTS} WHERE submission_id = ?`, [submissionId])

	const uniqueSavedIds = Array.from(new Set(savedContestantIds.map((contestantId) => compactWhitespace(contestantId)).filter((contestantId) => contestantId.length > 0)))
	if (uniqueSavedIds.length === 0) {
		return
	}

	const chunks = chunkArray(uniqueSavedIds, 300)
	for (const chunk of chunks) {
		const placeholders = chunk.map(() => '(?, ?)').join(', ')
		const params = chunk.flatMap((contestantId) => [submissionId, contestantId])
		await connection.execute(`INSERT INTO ${TABLE_SUBMISSION_SAVED_CONTESTANTS} (submission_id, contestant_id) VALUES ${placeholders}`, params)
	}
}

async function replaceSubmissionScores(connection: PoolConnection, submissionId: number, scoreRows: PersistableScoreRow[]): Promise<void> {
	await connection.execute(`DELETE FROM ${TABLE_SUBMISSION_SCORES} WHERE submission_id = ?`, [submissionId])

	if (scoreRows.length === 0) {
		return
	}

	const chunks = chunkArray(scoreRows, 400)
	for (const chunk of chunks) {
		const placeholders = chunk.map(() => '(?, ?, ?, ?)').join(', ')
		const params = chunk.flatMap((row) => [submissionId, row.contestantId, row.subCriterionId, row.score])
		await connection.execute(`INSERT INTO ${TABLE_SUBMISSION_SCORES} (submission_id, contestant_id, subcriterion_id, score) VALUES ${placeholders}`, params)
	}
}

async function replaceSubmissionContestantDetails(connection: PoolConnection, submissionId: number, detailRows: PersistableContestantDetailRow[]): Promise<void> {
	await connection.execute(`DELETE FROM ${TABLE_SUBMISSION_CONTESTANT_DETAILS} WHERE submission_id = ?`, [submissionId])

	if (detailRows.length === 0) {
		return
	}

	const chunks = chunkArray(detailRows, 250)
	for (const chunk of chunks) {
		const placeholders = chunk.map(() => '(?, ?, ?, ?, ?)').join(', ')
		const params = chunk.flatMap((row) => [submissionId, row.contestantId, row.strand ?? null, row.remark ?? null, row.additionalInfo ?? null])
		await connection.execute(`INSERT INTO ${TABLE_SUBMISSION_CONTESTANT_DETAILS} (submission_id, contestant_id, strand, remark, additional_info) VALUES ${placeholders}`, params)
	}
}

async function upsertSubmissionWithScores(connection: PoolConnection, event: EventScorer, judgeId: string, submittedAt: string, scores: ScoreMatrix, savedContestantIds: string[], contestantDetails: JudgeContestantDetailsMap): Promise<void> {
	const submissionId = await ensureSubmissionRow(connection, event.id, judgeId, submittedAt)
	const scoreRows = buildPersistableScoreRows(event, scores)
	const detailRows = buildPersistableContestantDetailRows(event, contestantDetails)

	await replaceSubmissionScores(connection, submissionId, scoreRows)
	await replaceSubmissionContestantDetails(connection, submissionId, detailRows)
	await replaceSavedContestantIds(connection, submissionId, savedContestantIds)
}

async function insertEventGraph(connection: PoolConnection, event: EventScorer): Promise<void> {
	await connection.execute(
		`INSERT INTO ${TABLE_EVENTS} (id, title, description, created_by, event_scoring_type, rubric_legend_json, direct_rating_config_json, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		[event.id, event.title, event.description ?? null, event.createdBy ?? null, normalizeEventScoringType(event.eventScoringType), JSON.stringify(normalizeRubricLegendInput(event.rubricLegend)), event.directRatingConfig ? JSON.stringify(normalizeDirectRatingConfig(event.directRatingConfig)) : null, toMySqlDateTime(event.createdAt)],
	)

	for (let contestantIndex = 0; contestantIndex < event.contestants.length; contestantIndex += 1) {
		const contestant = event.contestants[contestantIndex]
		const entryType = normalizeContestantEntryType(contestant.entryType)
		const programTag = normalizeContestantProgramTag(contestant.programTag)
		const noatScore = normalizeNoatScore(contestant.noatScore)

		await connection.execute(
			`INSERT INTO ${TABLE_CONTESTANTS} (id, event_id, name, entry_type, program_tag, noat_score, academic_track, laptop_available, sort_order)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[contestant.id, event.id, contestant.name, entryType, programTag, noatScore, contestant.academicTrack ?? null, contestant.laptopAvailable ?? null, contestantIndex],
		)

		const participants = entryType === 'group' && Array.isArray(contestant.participants) ? contestant.participants : []
		for (let participantIndex = 0; participantIndex < participants.length; participantIndex += 1) {
			const participantName = compactWhitespace(participants[participantIndex] ?? '')
			if (!participantName) {
				continue
			}

			await connection.execute(
				`INSERT INTO ${TABLE_CONTESTANT_PARTICIPANTS} (contestant_id, participant_name, sort_order)
				 VALUES (?, ?, ?)`,
				[contestant.id, participantName, participantIndex],
			)
		}
	}

	for (let judgeIndex = 0; judgeIndex < event.judges.length; judgeIndex += 1) {
		const judge = event.judges[judgeIndex]
		const token = compactWhitespace(judge.token)
		if (!token) {
			throw new Error(`Judge token is missing for ${judge.name}.`)
		}

		await connection.execute(
			`INSERT INTO ${TABLE_JUDGES} (id, event_id, name, email, token, sort_order)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			[judge.id, event.id, judge.name, judge.email ?? null, token, judgeIndex],
		)
	}

	for (let criterionIndex = 0; criterionIndex < event.criteria.length; criterionIndex += 1) {
		const criterion = event.criteria[criterionIndex]
		let criterionTotal = 0

		for (const subCriterion of criterion.subCriteria) {
			criterionTotal += toPositiveNumber(subCriterion.maxScore, `Subcriterion max score (${criterion.name})`)
		}

		criterionTotal = Math.round(criterionTotal * 1000) / 1000
		if (criterionTotal <= 0) {
			throw new Error(`Criterion "${criterion.name}" must have total max score greater than 0.`)
		}

		await connection.execute(
			`INSERT INTO ${TABLE_CRITERIA} (id, event_id, name, max_score, sort_order)
			 VALUES (?, ?, ?, ?, ?)`,
			[criterion.id, event.id, criterion.name, criterionTotal, criterionIndex],
		)

		for (let subCriterionIndex = 0; subCriterionIndex < criterion.subCriteria.length; subCriterionIndex += 1) {
			const subCriterion = criterion.subCriteria[subCriterionIndex]
			const subCriterionMax = toPositiveNumber(subCriterion.maxScore, `Subcriterion max score (${criterion.name})`)

			await connection.execute(
				`INSERT INTO ${TABLE_SUBCRITERIA} (id, criterion_id, name, max_score, sort_order)
				 VALUES (?, ?, ?, ?, ?)`,
				[subCriterion.id, criterion.id, subCriterion.name, subCriterionMax, subCriterionIndex],
			)
		}
	}

	const validJudgeIds = new Set(event.judges.map((judge) => judge.id))
	if (Array.isArray(event.presentationSlots) && event.presentationSlots.length > 0) {
		for (let slotIndex = 0; slotIndex < event.presentationSlots.length; slotIndex += 1) {
			const slot = event.presentationSlots[slotIndex]
			await connection.execute(
				`INSERT INTO ${TABLE_PRESENTATION_SLOTS} (id, event_id, label, contestant_id, sort_order)
				 VALUES (?, ?, ?, ?, ?)`,
				[slot.id, event.id, slot.label, slot.contestantId, slotIndex],
			)

			const slotJudgeIds = Array.from(new Set(slot.judgeIds.filter((judgeId) => validJudgeIds.has(judgeId))))
			for (let judgeIndex = 0; judgeIndex < slotJudgeIds.length; judgeIndex += 1) {
				await connection.execute(
					`INSERT INTO ${TABLE_PRESENTATION_SLOT_JUDGES} (slot_id, judge_id, sort_order)
					 VALUES (?, ?, ?)`,
					[slot.id, slotJudgeIds[judgeIndex], judgeIndex],
				)
			}
		}
	}

	for (const submission of event.submissions) {
		const savedContestantIds = Array.from(savedContestantIdsForSubmission(event, submission))
		await upsertSubmissionWithScores(connection, event, submission.judgeId, submission.submittedAt, submission.scores, savedContestantIds, submission.contestantDetails ?? {})
	}
}

async function replacePresentationSlotsForEvent(connection: PoolConnection, eventId: string, slots: EventPresentationSlot[]): Promise<void> {
	await connection.execute(`DELETE FROM ${TABLE_PRESENTATION_SLOTS} WHERE event_id = ?`, [eventId])

	for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
		const slot = slots[slotIndex]
		await connection.execute(
			`INSERT INTO ${TABLE_PRESENTATION_SLOTS} (id, event_id, label, contestant_id, sort_order)
			 VALUES (?, ?, ?, ?, ?)`,
			[slot.id, eventId, slot.label, slot.contestantId, slotIndex],
		)

		const uniqueJudgeIds = Array.from(new Set(slot.judgeIds.map((judgeId) => compactWhitespace(judgeId)).filter((judgeId) => judgeId.length > 0)))
		for (let judgeIndex = 0; judgeIndex < uniqueJudgeIds.length; judgeIndex += 1) {
			await connection.execute(
				`INSERT INTO ${TABLE_PRESENTATION_SLOT_JUDGES} (slot_id, judge_id, sort_order)
				 VALUES (?, ?, ?)`,
				[slot.id, uniqueJudgeIds[judgeIndex], judgeIndex],
			)
		}
	}
}

async function loadEventById(executor: SqlExecutor, eventId: string): Promise<EventScorer | undefined> {
	const eventRows = await selectRows<EventRow>(
		executor,
		`SELECT id, title, description, created_by, event_scoring_type, rubric_legend_json, direct_rating_config_json, created_at
		 FROM ${TABLE_EVENTS}
		 WHERE id = ?
		 LIMIT 1`,
		[eventId],
	)

	if (eventRows.length === 0) {
		return undefined
	}

	const eventRow = eventRows[0]

	const contestantRows = await selectRows<ContestantRow>(
		executor,
		`SELECT id, name, entry_type, program_tag, noat_score, academic_track, laptop_available, sort_order
		 FROM ${TABLE_CONTESTANTS}
		 WHERE event_id = ?
		 ORDER BY sort_order ASC, id ASC`,
		[eventId],
	)

	const contestantParticipantRows = await selectRows<ContestantParticipantRow>(
		executor,
		`SELECT cp.contestant_id, cp.participant_name, cp.sort_order
		 FROM ${TABLE_CONTESTANT_PARTICIPANTS} cp
		 INNER JOIN ${TABLE_CONTESTANTS} c ON c.id = cp.contestant_id
		 WHERE c.event_id = ?
		 ORDER BY cp.sort_order ASC, cp.id ASC`,
		[eventId],
	)

	const judgesRows = await selectRows<JudgeRow>(
		executor,
		`SELECT id, name, email, token, sort_order
		 FROM ${TABLE_JUDGES}
		 WHERE event_id = ?
		 ORDER BY sort_order ASC, id ASC`,
		[eventId],
	)

	const criteriaRows = await selectRows<CriterionRow>(
		executor,
		`SELECT id, name, max_score, sort_order
		 FROM ${TABLE_CRITERIA}
		 WHERE event_id = ?
		 ORDER BY sort_order ASC, id ASC`,
		[eventId],
	)

	const subCriteriaRows = await selectRows<SubCriterionRow>(
		executor,
		`SELECT sc.id, sc.criterion_id, sc.name, sc.max_score, sc.sort_order
		 FROM ${TABLE_SUBCRITERIA} sc
		 INNER JOIN ${TABLE_CRITERIA} c ON c.id = sc.criterion_id
		 WHERE c.event_id = ?
		 ORDER BY sc.sort_order ASC, sc.id ASC`,
		[eventId],
	)

	const presentationSlotRows = await selectRows<PresentationSlotRow>(
		executor,
		`SELECT id, label, contestant_id, sort_order
		 FROM ${TABLE_PRESENTATION_SLOTS}
		 WHERE event_id = ?
		 ORDER BY sort_order ASC, id ASC`,
		[eventId],
	)

	const presentationSlotJudgeRows = await selectRows<PresentationSlotJudgeRow>(
		executor,
		`SELECT psj.slot_id, psj.judge_id, psj.sort_order
		 FROM ${TABLE_PRESENTATION_SLOT_JUDGES} psj
		 INNER JOIN ${TABLE_PRESENTATION_SLOTS} ps ON ps.id = psj.slot_id
		 WHERE ps.event_id = ?
		 ORDER BY psj.sort_order ASC, psj.judge_id ASC`,
		[eventId],
	)

	const submissionRows = await selectRows<SubmissionRow>(
		executor,
		`SELECT id, judge_id, submitted_at
		 FROM ${TABLE_SUBMISSIONS}
		 WHERE event_id = ?
		 ORDER BY submitted_at ASC, id ASC`,
		[eventId],
	)

	const submissionSavedContestantRows = await selectRows<SubmissionSavedContestantRow>(
		executor,
		`SELECT ssc.submission_id, ssc.contestant_id
		 FROM ${TABLE_SUBMISSION_SAVED_CONTESTANTS} ssc
		 INNER JOIN ${TABLE_SUBMISSIONS} s ON s.id = ssc.submission_id
		 WHERE s.event_id = ?
		 ORDER BY ssc.contestant_id ASC`,
		[eventId],
	)

	const submissionScoreRows = await selectRows<SubmissionScoreRow>(
		executor,
		`SELECT ss.submission_id, ss.contestant_id, ss.subcriterion_id, ss.score
		 FROM ${TABLE_SUBMISSION_SCORES} ss
		 INNER JOIN ${TABLE_SUBMISSIONS} s ON s.id = ss.submission_id
		 WHERE s.event_id = ?
		 ORDER BY ss.contestant_id ASC, ss.subcriterion_id ASC`,
		[eventId],
	)

	const submissionContestantDetailRows = await selectRows<SubmissionContestantDetailRow>(
		executor,
		`SELECT scd.submission_id, scd.contestant_id, scd.strand, scd.remark, scd.additional_info
		 FROM ${TABLE_SUBMISSION_CONTESTANT_DETAILS} scd
		 INNER JOIN ${TABLE_SUBMISSIONS} s ON s.id = scd.submission_id
		 WHERE s.event_id = ?
		 ORDER BY scd.contestant_id ASC`,
		[eventId],
	)

	const participantsByContestantId = new Map<string, string[]>()
	for (const participantRow of contestantParticipantRows) {
		const participantList = participantsByContestantId.get(participantRow.contestant_id) ?? []
		participantList.push(participantRow.participant_name)
		participantsByContestantId.set(participantRow.contestant_id, participantList)
	}

	const contestants: EventContestant[] = contestantRows.map((contestantRow) => {
		const entryType = normalizeContestantEntryType(contestantRow.entry_type)
		const participants = participantsByContestantId.get(contestantRow.id) ?? []
		const programTag = parseProgramTag(contestantRow.program_tag) ?? inferProgramTagFromContestantName(contestantRow.name)
		const noatScore = normalizeNoatScore(contestantRow.noat_score)

		return {
			id: contestantRow.id,
			name: contestantRow.name,
			entryType,
			participants: entryType === 'group' && participants.length > 0 ? participants : undefined,
			programTag: programTag ?? undefined,
			noatScore: noatScore ?? undefined,
			academicTrack: typeof contestantRow.academic_track === 'string' && contestantRow.academic_track.length > 0 ? contestantRow.academic_track : undefined,
			laptopAvailable: typeof contestantRow.laptop_available === 'string' && contestantRow.laptop_available.length > 0 ? contestantRow.laptop_available : undefined,
		}
	})

	const judges: EventJudge[] = judgesRows.map((judgeRow) => ({
		id: judgeRow.id,
		name: judgeRow.name,
		email: judgeRow.email ?? undefined,
		token: judgeRow.token,
	}))

	const subCriteriaByCriterionId = new Map<string, EventSubCriterion[]>()
	for (const subCriterionRow of subCriteriaRows) {
		const list = subCriteriaByCriterionId.get(subCriterionRow.criterion_id) ?? []
		list.push({
			id: subCriterionRow.id,
			name: subCriterionRow.name,
			maxScore: Number(subCriterionRow.max_score),
		})
		subCriteriaByCriterionId.set(subCriterionRow.criterion_id, list)
	}

	const criteria: EventCriterion[] = criteriaRows.map((criterionRow) => {
		const subCriteria = subCriteriaByCriterionId.get(criterionRow.id) ?? []
		const computedMaxScore = Math.round(subCriteria.reduce((sum, subCriterion) => sum + subCriterion.maxScore, 0) * 1000) / 1000
		const fallbackMaxScore = Number(criterionRow.max_score)

		return {
			id: criterionRow.id,
			name: criterionRow.name,
			maxScore: computedMaxScore > 0 ? computedMaxScore : fallbackMaxScore,
			subCriteria,
		}
	})

	const judgeIdsBySlotId = new Map<string, string[]>()
	for (const slotJudgeRow of presentationSlotJudgeRows) {
		const list = judgeIdsBySlotId.get(slotJudgeRow.slot_id) ?? []
		list.push(slotJudgeRow.judge_id)
		judgeIdsBySlotId.set(slotJudgeRow.slot_id, list)
	}

	const presentationSlots = presentationSlotRows.length
		? presentationSlotRows.map((slotRow) => ({
				id: slotRow.id,
				label: slotRow.label,
				contestantId: slotRow.contestant_id,
				judgeIds: judgeIdsBySlotId.get(slotRow.id) ?? [],
			}))
		: undefined

	const savedContestantIdsBySubmissionId = new Map<number, string[]>()
	for (const savedRow of submissionSavedContestantRows) {
		const list = savedContestantIdsBySubmissionId.get(savedRow.submission_id) ?? []
		list.push(savedRow.contestant_id)
		savedContestantIdsBySubmissionId.set(savedRow.submission_id, list)
	}

	const scoresBySubmissionId = new Map<number, ScoreMatrix>()
	for (const scoreRow of submissionScoreRows) {
		const submissionScores = scoresBySubmissionId.get(scoreRow.submission_id) ?? {}
		const contestantScores = submissionScores[scoreRow.contestant_id] ?? {}
		contestantScores[scoreRow.subcriterion_id] = Math.round(Number(scoreRow.score) * 1000) / 1000
		submissionScores[scoreRow.contestant_id] = contestantScores
		scoresBySubmissionId.set(scoreRow.submission_id, submissionScores)
	}

	const contestantDetailsBySubmissionId = new Map<number, JudgeContestantDetailsMap>()
	for (const detailRow of submissionContestantDetailRows) {
		const strand = normalizeContestantDetailText(detailRow.strand, 255)
		const remark = normalizeContestantDetailText(detailRow.remark, 255)
		const additionalInfo = normalizeContestantDetailText(detailRow.additional_info, 2000)

		if (!strand && !remark && !additionalInfo) {
			continue
		}

		const submissionDetails = contestantDetailsBySubmissionId.get(detailRow.submission_id) ?? {}
		submissionDetails[detailRow.contestant_id] = {
			...(strand ? { strand } : {}),
			...(remark ? { remark } : {}),
			...(additionalInfo ? { additionalInfo } : {}),
		}
		contestantDetailsBySubmissionId.set(detailRow.submission_id, submissionDetails)
	}

	const submissions: JudgeSubmission[] = submissionRows.map((submissionRow) => {
		const scores = scoresBySubmissionId.get(submissionRow.id) ?? {}
		const savedContestantIds = savedContestantIdsBySubmissionId.get(submissionRow.id) ?? []
		const contestantDetails = contestantDetailsBySubmissionId.get(submissionRow.id)

		return {
			judgeId: submissionRow.judge_id,
			submittedAt: fromMySqlDateTime(submissionRow.submitted_at),
			scores,
			savedContestantIds: savedContestantIds.length > 0 ? Array.from(new Set(savedContestantIds)) : undefined,
			contestantDetails: contestantDetails && Object.keys(contestantDetails).length > 0 ? contestantDetails : undefined,
		}
	})

	const eventScoringType = parseEventScoringType(eventRow.event_scoring_type) ?? inferEventScoringTypeFromCriteria(criteria)
	const rubricLegend = parseStoredRubricLegend(eventRow.rubric_legend_json)
	const directRatingConfig = parseStoredDirectRatingConfig(eventRow.direct_rating_config_json, criteria)

	return {
		id: eventRow.id,
		title: eventRow.title,
		description: eventRow.description ?? undefined,
		createdBy: eventRow.created_by ?? undefined,
		eventScoringType,
		rubricLegend,
		directRatingConfig,
		createdAt: fromMySqlDateTime(eventRow.created_at),
		contestants,
		judges,
		criteria,
		presentationSlots,
		submissions,
	}
}

export async function listEvents(): Promise<EventScorer[]> {
	const pool = await getPool()
	const eventIdRows = await selectRows<EventIdRow>(pool, `SELECT id FROM ${TABLE_EVENTS} ORDER BY created_at DESC, id DESC`)

	const events: EventScorer[] = []
	for (const row of eventIdRows) {
		const event = await loadEventById(pool, row.id)
		if (event) {
			events.push(event)
		}
	}

	return events
}

export async function listEventSummaries(): Promise<EventSummary[]> {
	const events = await listEvents()

	return events.map((event) => ({
		id: event.id,
		title: event.title,
		createdAt: event.createdAt,
		contestantCount: event.contestants.length,
		judgeCount: event.judges.length,
		submittedJudgeCount: countSubmittedJudges(event),
		isDirectRating: detectDirectRatingScoreFields(event.criteria).length > 0,
	}))
}

export async function listJudgeDirectory(): Promise<JudgeDirectoryItem[]> {
	const pool = await getPool()
	const rows = await selectRows<JudgeDirectoryRow>(
		pool,
		`SELECT j.name, j.email, e.created_at
		 FROM ${TABLE_JUDGES} AS j
		 INNER JOIN ${TABLE_EVENTS} AS e ON e.id = j.event_id
		 WHERE TRIM(j.name) <> ''
		 ORDER BY e.created_at DESC, j.sort_order ASC`,
	)

	const byName = new Map<string, JudgeDirectoryItem>()

	for (const row of rows) {
		const name = compactWhitespace(row.name)
		if (!name) {
			continue
		}

		const key = name.toLowerCase()
		const normalizedEmail = row.email ? compactWhitespace(row.email) : ''
		const lastUsedAt = fromMySqlDateTime(row.created_at)
		const existing = byName.get(key)

		if (!existing) {
			byName.set(key, {
				name,
				...(normalizedEmail ? { email: normalizedEmail } : {}),
				lastUsedAt,
				usageCount: 1,
			})
			continue
		}

		if (!existing.email && normalizedEmail) {
			existing.email = normalizedEmail
		}

		if (new Date(lastUsedAt).getTime() > new Date(existing.lastUsedAt).getTime()) {
			existing.lastUsedAt = lastUsedAt
		}

		existing.usageCount += 1
	}

	const judges = Array.from(byName.values())
	judges.sort((left, right) => {
		const dateDiff = new Date(right.lastUsedAt).getTime() - new Date(left.lastUsedAt).getTime()
		if (dateDiff !== 0) {
			return dateDiff
		}
		return left.name.localeCompare(right.name, 'en', { sensitivity: 'base' })
	})

	return judges
}

export async function createEvent(input: CreateEventInput): Promise<EventScorer> {
	const event = buildEvent(input)
	const pool = await getPool()
	const connection = await pool.getConnection()

	try {
		await connection.beginTransaction()
		await insertEventGraph(connection, event)
		await connection.commit()
		return event
	} catch (error) {
		await connection.rollback()
		throw error
	} finally {
		connection.release()
	}
}

export async function getEventById(eventId: string): Promise<EventScorer | undefined> {
	const pool = await getPool()
	return loadEventById(pool, eventId)
}

export async function deleteEventById(eventId: string): Promise<void> {
	const normalizedEventId = compactWhitespace(eventId)
	if (!normalizedEventId) {
		throw new Error('Event ID is required.')
	}

	const pool = await getPool()
	const existingEvent = await loadEventById(pool, normalizedEventId)
	if (!existingEvent) {
		throw new Error('Event not found.')
	}

	await pool.execute(`DELETE FROM ${TABLE_EVENTS} WHERE id = ?`, [normalizedEventId])
}

export async function updateContestantJudgeAssignments(eventId: string, contestantId: string, rawJudgeIds: unknown): Promise<EventScorer> {
	const pool = await getPool()
	const connection = await pool.getConnection()

	try {
		await connection.beginTransaction()

		const event = await loadEventById(connection, eventId)
		if (!event) {
			throw new Error('Event not found.')
		}

		const contestantExists = event.contestants.some((contestant) => contestant.id === contestantId)
		if (!contestantExists) {
			throw new Error('Contestant not found for this event.')
		}

		const updatedJudgeIds = normalizeJudgeAssignmentIds(event, rawJudgeIds)
		const updatedSlots = ensurePresentationSlotsForAssignmentUpdates(event).map((slot) => (slot.contestantId === contestantId ? { ...slot, judgeIds: updatedJudgeIds } : slot))
		const assignedJudgeIdsByContestant = new Map(updatedSlots.map((slot) => [slot.contestantId, new Set(slot.judgeIds)]))

		const updatedSubmissions = event.submissions.map((submission) => {
			const filteredSavedContestantIds = Array.from(savedContestantIdsForSubmission(event, submission)).filter((savedContestantId) => {
				const assignedJudgeIds = assignedJudgeIdsByContestant.get(savedContestantId)
				if (!assignedJudgeIds) {
					return true
				}

				return assignedJudgeIds.has(submission.judgeId)
			})

			return {
				...submission,
				savedContestantIds: filteredSavedContestantIds,
			}
		})

		const updatedEvent: EventScorer = {
			...event,
			presentationSlots: updatedSlots,
			submissions: updatedSubmissions,
		}

		await replacePresentationSlotsForEvent(connection, eventId, updatedSlots)
		for (const submission of updatedSubmissions) {
			const submissionId = await ensureSubmissionRow(connection, eventId, submission.judgeId, submission.submittedAt)
			const savedContestantIds = Array.isArray(submission.savedContestantIds) ? submission.savedContestantIds : []
			await replaceSavedContestantIds(connection, submissionId, savedContestantIds)
		}

		await connection.commit()
		return updatedEvent
	} catch (error) {
		await connection.rollback()
		throw error
	} finally {
		connection.release()
	}
}

export async function updateContestantProgramTags(eventId: string, rawAssignments: unknown): Promise<EventScorer> {
	const pool = await getPool()
	const connection = await pool.getConnection()

	try {
		await connection.beginTransaction()

		const event = await loadEventById(connection, eventId)
		if (!event) {
			throw new Error('Event not found.')
		}

		const assignments = normalizeProgramTagAssignments(event, rawAssignments)
		const assignmentByContestantId = new Map(assignments.map((assignment) => [assignment.contestantId, assignment.programTag]))

		for (const assignment of assignments) {
			await connection.execute(
				`UPDATE ${TABLE_CONTESTANTS}
				 SET program_tag = ?
				 WHERE event_id = ? AND id = ?`,
				[assignment.programTag, eventId, assignment.contestantId],
			)
		}

		const updatedEvent: EventScorer = {
			...event,
			contestants: event.contestants.map((contestant) => {
				if (!assignmentByContestantId.has(contestant.id)) {
					return contestant
				}

				const nextProgramTag = assignmentByContestantId.get(contestant.id) ?? null
				return {
					...contestant,
					programTag: nextProgramTag ?? undefined,
				}
			}),
		}

		await connection.commit()
		return updatedEvent
	} catch (error) {
		await connection.rollback()
		throw error
	} finally {
		connection.release()
	}
}

export async function updateEventDefinition(eventId: string, rawInput: unknown): Promise<EventScorer> {
	const pool = await getPool()
	const connection = await pool.getConnection()

	try {
		await connection.beginTransaction()

		const existingEvent = await loadEventById(connection, eventId)
		if (!existingEvent) {
			throw new Error('Event not found.')
		}

		const normalizedEvent = normalizeEventEditorInput(existingEvent, rawInput)

		await connection.execute(`DELETE FROM ${TABLE_EVENTS} WHERE id = ?`, [eventId])
		await insertEventGraph(connection, normalizedEvent)

		// Restore previous submissions mapped to new UUIDs
		const subCriterionMap = new Map<string, string>()
		for (const oldCriterion of existingEvent.criteria) {
			const newCriterion = normalizedEvent.criteria.find((c) => c.name === oldCriterion.name)
			if (!newCriterion) continue
			for (const oldSub of oldCriterion.subCriteria) {
				const newSub = newCriterion.subCriteria.find((s) => s.name === oldSub.name)
				if (newSub) {
					subCriterionMap.set(oldSub.id, newSub.id)
				}
			}
		}

		const validContestantIds = new Set(normalizedEvent.contestants.map((c) => c.id))
		const validJudgeIds = new Set(normalizedEvent.judges.map((j) => j.id))

		for (const oldSubmission of existingEvent.submissions) {
			if (!validJudgeIds.has(oldSubmission.judgeId)) {
				continue
			}

			const newScores: ScoreMatrix = {}
			for (const contestantId of Object.keys(oldSubmission.scores)) {
				if (!validContestantIds.has(contestantId)) continue
				newScores[contestantId] = {}
				for (const oldSubId of Object.keys(oldSubmission.scores[contestantId] ?? {})) {
					const newSubId = subCriterionMap.get(oldSubId)
					if (newSubId) {
						newScores[contestantId][newSubId] = oldSubmission.scores[contestantId][oldSubId]
					}
				}
			}

			const newSavedContestantIds = Array.isArray(oldSubmission.savedContestantIds)
				? oldSubmission.savedContestantIds.filter((id) => validContestantIds.has(id))
				: []

			const newContestantDetails: JudgeContestantDetailsMap = {}
			if (oldSubmission.contestantDetails) {
				for (const contestantId of Object.keys(oldSubmission.contestantDetails)) {
					if (validContestantIds.has(contestantId)) {
						newContestantDetails[contestantId] = oldSubmission.contestantDetails[contestantId]
					}
				}
			}

			await upsertSubmissionWithScores(
				connection,
				normalizedEvent,
				oldSubmission.judgeId,
				oldSubmission.submittedAt,
				newScores,
				newSavedContestantIds,
				newContestantDetails
			)

			normalizedEvent.submissions.push({
				...oldSubmission,
				scores: newScores,
				savedContestantIds: newSavedContestantIds,
				contestantDetails: newContestantDetails,
			})
		}

		await connection.commit()
		return normalizedEvent
	} catch (error) {
		await connection.rollback()
		throw error
	} finally {
		connection.release()
	}
}

export async function getJudgeSessionByToken(token: string): Promise<JudgeSessionData | undefined> {
	const normalizedToken = compactWhitespace(token)
	if (!normalizedToken) {
		return undefined
	}

	const pool = await getPool()
	const judgeRows = await selectRows<JudgeLookupRow>(
		pool,
		`SELECT id, event_id
		 FROM ${TABLE_JUDGES}
		 WHERE token = ?
		 LIMIT 1`,
		[normalizedToken],
	)

	if (judgeRows.length === 0) {
		return undefined
	}

	const judgeLookup = judgeRows[0]
	const event = await loadEventById(pool, judgeLookup.event_id)
	if (!event) {
		return undefined
	}

	const judge = event.judges.find((candidate) => candidate.id === judgeLookup.id)
	if (!judge) {
		return undefined
	}

	const submission = event.submissions.find((item) => item.judgeId === judge.id)
	const assignedSlots = assignedSlotsForJudge(event, judge.id)
	const allSlots = Array.isArray(event.presentationSlots) && event.presentationSlots.length > 0 ? event.presentationSlots : undefined
	const contestantsById = new Map(event.contestants.map((contestant) => [contestant.id, contestant]))
	const orderedContestants = assignedSlots ? assignedSlots.map((slot) => contestantsById.get(slot.contestantId)).filter((contestant): contestant is EventContestant => Boolean(contestant)) : event.contestants

	return {
		event: {
			id: event.id,
			title: event.title,
			description: event.description,
			eventScoringType: event.eventScoringType,
			rubricLegend: event.rubricLegend,
			directRatingConfig: event.directRatingConfig,
			contestants: orderedContestants,
			criteria: event.criteria,
			presentationSlots: assignedSlots ?? allSlots,
		},
		judge: {
			id: judge.id,
			name: judge.name,
			email: judge.email,
		},
		submission,
	}
}

export async function submitJudgeScoresByToken(token: string, rawScores: unknown, savedContestantId: string, rawContestantDetails?: unknown): Promise<{ event: EventScorer; judge: EventJudge; submittedAt: string }> {
	const normalizedToken = compactWhitespace(token)
	if (!normalizedToken) {
		throw new Error('Judge link not found.')
	}

	const pool = await getPool()
	const connection = await pool.getConnection()

	try {
		await connection.beginTransaction()

		const judgeRows = await selectRows<JudgeLookupRow>(
			connection,
			`SELECT id, event_id
			 FROM ${TABLE_JUDGES}
			 WHERE token = ?
			 LIMIT 1`,
			[normalizedToken],
		)

		if (judgeRows.length === 0) {
			throw new Error('Judge link not found.')
		}

		const judgeLookup = judgeRows[0]
		const event = await loadEventById(connection, judgeLookup.event_id)
		if (!event) {
			throw new Error('Event not found.')
		}

		const judge = event.judges.find((candidate) => candidate.id === judgeLookup.id)
		if (!judge) {
			throw new Error('Judge link not found.')
		}

		if (!isJudgeAssignedToContestant(event, judge.id, savedContestantId)) {
			throw new Error('You are not assigned to score this presentation.')
		}

		const normalizedScores = normalizeScoreMatrix(event, rawScores)
		const submittedAt = new Date().toISOString()
		const submissionIndex = event.submissions.findIndex((submission) => submission.judgeId === judge.id)
		const previousSubmission = submissionIndex >= 0 ? event.submissions[submissionIndex] : undefined
		const normalizedContestantDetails = rawContestantDetails === undefined ? (previousSubmission?.contestantDetails ?? {}) : normalizeContestantDetails(event, rawContestantDetails)
		const savedContestantIds = buildSavedContestantIds(event, previousSubmission, savedContestantId)

		if (submissionIndex >= 0) {
			event.submissions[submissionIndex] = {
				judgeId: judge.id,
				scores: normalizedScores,
				submittedAt,
				savedContestantIds,
				contestantDetails: Object.keys(normalizedContestantDetails).length > 0 ? normalizedContestantDetails : undefined,
			}
		} else {
			event.submissions.push({
				judgeId: judge.id,
				scores: normalizedScores,
				submittedAt,
				savedContestantIds,
				contestantDetails: Object.keys(normalizedContestantDetails).length > 0 ? normalizedContestantDetails : undefined,
			})
		}

		await upsertSubmissionWithScores(connection, event, judge.id, submittedAt, normalizedScores, savedContestantIds, normalizedContestantDetails)

		await connection.commit()
		return { event, judge, submittedAt }
	} catch (error) {
		await connection.rollback()
		throw error
	} finally {
		connection.release()
	}
}

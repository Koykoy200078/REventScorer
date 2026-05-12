import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { ContestantEntryType, CreateEventInput, EventContestant, EventCriterion, EventJudge, EventPresentationSlot, EventScorer, EventScoringType, EventSubCriterion, EventSummary, JudgeSessionData, ScoreMatrix } from '@/lib/types'

interface StoreShape {
	events: EventScorer[]
}

const DATA_FILE = path.join(process.cwd(), 'data', 'events.json')

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

async function readStore(): Promise<StoreShape> {
	try {
		const raw = await readFile(DATA_FILE, 'utf8')
		const parsed = JSON.parse(raw) as Partial<StoreShape>

		if (!parsed || !Array.isArray(parsed.events)) {
			return { events: [] }
		}

		let didMigrateEvents = false
		const migratedEvents = parsed.events.map((event) => {
			if (!event || typeof event !== 'object') {
				didMigrateEvents = true
				return event as EventScorer
			}

			const typedEvent = event as EventScorer
			const parsedType = parseEventScoringType(typedEvent.eventScoringType)
			const nextType = parsedType ?? inferEventScoringTypeFromCriteria(typedEvent.criteria)

			if (parsedType === nextType && typedEvent.eventScoringType === nextType) {
				return typedEvent
			}

			didMigrateEvents = true
			return {
				...typedEvent,
				eventScoringType: nextType,
			}
		})

		if (didMigrateEvents) {
			const migratedStore: StoreShape = { events: migratedEvents }
			await writeStore(migratedStore)
			return migratedStore
		}

		return { events: migratedEvents }
	} catch (error) {
		const maybeError = error as NodeJS.ErrnoException

		if (maybeError.code === 'ENOENT') {
			const initial: StoreShape = { events: [] }
			await mkdir(path.dirname(DATA_FILE), { recursive: true })
			await writeFile(DATA_FILE, JSON.stringify(initial, null, 2), 'utf8')
			return initial
		}

		throw error
	}
}

async function writeStore(store: StoreShape): Promise<void> {
	await mkdir(path.dirname(DATA_FILE), { recursive: true })
	await writeFile(DATA_FILE, JSON.stringify(store, null, 2), 'utf8')
}

function normalizeContestantEntryType(value: unknown): ContestantEntryType {
	return value === 'individual' ? 'individual' : 'group'
}

function normalizeEventScoringType(value: unknown): EventScoringType {
	return parseEventScoringType(value) ?? 'standard'
}

function normalizeContestantParticipants(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return []
	}

	const cleaned = value.map((participant) => compactWhitespace(String(participant ?? ''))).filter((participant) => participant.length > 0)
	return uniqueCaseInsensitive(cleaned)
}

function normalizeContestants(contestants: CreateEventInput['contestants']): EventContestant[] {
	const cleaned = contestants
		.map((contestant) => {
			if (typeof contestant === 'string') {
				return {
					name: compactWhitespace(contestant),
					entryType: 'group' as ContestantEntryType,
					participants: [] as string[],
				}
			}

			if (!contestant || typeof contestant !== 'object') {
				return {
					name: '',
					entryType: 'group' as ContestantEntryType,
					participants: [] as string[],
				}
			}

			return {
				name: compactWhitespace(contestant.name ?? ''),
				entryType: normalizeContestantEntryType(contestant.entryType),
				participants: normalizeContestantParticipants(contestant.participants),
			}
		})
		.filter((contestant) => contestant.name.length > 0)

	const seen = new Set<string>()
	const unique = [] as Array<{ name: string; entryType: ContestantEntryType; participants: string[] }>

	for (const contestant of cleaned) {
		const key = `${contestant.entryType}|${contestant.name.toLowerCase()}`
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
		throw new Error(`Criterion \"${criterionName}\" must have at least one subcriterion.`)
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
			throw new Error(`Criterion \"${criterion.name}\" must have total max score greater than 0.`)
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

	const normalizedContestants = normalizeContestants(input.contestants ?? [])
	const normalizedJudges = normalizeJudges(input.judges ?? [])
	const normalizedCriteria = normalizeCriteria(input.criteria ?? [], normalizedContestants)
	const normalizedPresentationSlots = normalizePresentationSlots(input.presentationSlots, normalizedContestants, normalizedJudges)

	return {
		id: randomUUID(),
		title,
		description,
		createdBy,
		eventScoringType,
		createdAt: new Date().toISOString(),
		contestants: normalizedContestants,
		judges: normalizedJudges,
		criteria: normalizedCriteria,
		presentationSlots: normalizedPresentationSlots,
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

export async function listEvents(): Promise<EventScorer[]> {
	const store = await readStore()
	return store.events.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
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
	}))
}

export async function createEvent(input: CreateEventInput): Promise<EventScorer> {
	const store = await readStore()
	const event = buildEvent(input)
	store.events.unshift(event)
	await writeStore(store)
	return event
}

export async function getEventById(eventId: string): Promise<EventScorer | undefined> {
	const store = await readStore()
	return store.events.find((event) => event.id === eventId)
}

export async function updateContestantJudgeAssignments(eventId: string, contestantId: string, rawJudgeIds: unknown): Promise<EventScorer> {
	const store = await readStore()

	for (let index = 0; index < store.events.length; index += 1) {
		const event = store.events[index]
		if (event.id !== eventId) {
			continue
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

		store.events[index] = updatedEvent
		await writeStore(store)
		return updatedEvent
	}

	throw new Error('Event not found.')
}

export async function getJudgeSessionByToken(token: string): Promise<JudgeSessionData | undefined> {
	const store = await readStore()

	for (const event of store.events) {
		const judge = event.judges.find((candidate) => candidate.token === token)
		if (!judge) {
			continue
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

	return undefined
}

export async function submitJudgeScoresByToken(token: string, rawScores: unknown, savedContestantId: string): Promise<{ event: EventScorer; judge: EventJudge; submittedAt: string }> {
	const store = await readStore()

	for (let index = 0; index < store.events.length; index += 1) {
		const event = store.events[index]
		const judge = event.judges.find((candidate) => candidate.token === token)

		if (!judge) {
			continue
		}

		if (!isJudgeAssignedToContestant(event, judge.id, savedContestantId)) {
			throw new Error('You are not assigned to score this presentation.')
		}

		const normalizedScores = normalizeScoreMatrix(event, rawScores)
		const submittedAt = new Date().toISOString()
		const submissionIndex = event.submissions.findIndex((submission) => submission.judgeId === judge.id)
		const previousSubmission = submissionIndex >= 0 ? event.submissions[submissionIndex] : undefined
		const savedContestantIds = buildSavedContestantIds(event, previousSubmission, savedContestantId)

		if (submissionIndex >= 0) {
			event.submissions[submissionIndex] = {
				judgeId: judge.id,
				scores: normalizedScores,
				submittedAt,
				savedContestantIds,
			}
		} else {
			event.submissions.push({ judgeId: judge.id, scores: normalizedScores, submittedAt, savedContestantIds })
		}

		store.events[index] = event
		await writeStore(store)

		return { event, judge, submittedAt }
	}

	throw new Error('Judge link not found.')
}

import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { CreateEventInput, EventContestant, EventCriterion, EventJudge, EventScorer, EventSubCriterion, EventSummary, JudgeSessionData, ScoreMatrix } from '@/lib/types'

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

async function readStore(): Promise<StoreShape> {
	try {
		const raw = await readFile(DATA_FILE, 'utf8')
		const parsed = JSON.parse(raw) as Partial<StoreShape>

		if (!parsed || !Array.isArray(parsed.events)) {
			return { events: [] }
		}

		return { events: parsed.events }
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

function normalizeContestants(contestants: string[]): EventContestant[] {
	const cleaned = contestants.map((contestant) => compactWhitespace(contestant)).filter((contestant) => contestant.length > 0)
	const unique = uniqueCaseInsensitive(cleaned)

	if (unique.length < 2) {
		throw new Error('At least 2 contestants are required.')
	}

	return unique.map((name) => ({ id: randomUUID(), name }))
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

function normalizeCriteria(criteria: CreateEventInput['criteria']): EventCriterion[] {
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
		const normalizedSubCriteria = normalizeSubCriteria(criterion.subCriteria, criterion.name)
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

function buildEvent(input: CreateEventInput): EventScorer {
	const title = compactWhitespace(input.title ?? '')

	if (!title) {
		throw new Error('Event title is required.')
	}

	const description = input.description ? compactWhitespace(input.description) : undefined
	const createdBy = input.createdBy ? compactWhitespace(input.createdBy) : undefined

	return {
		id: randomUUID(),
		title,
		description,
		createdBy,
		createdAt: new Date().toISOString(),
		contestants: normalizeContestants(input.contestants ?? []),
		judges: normalizeJudges(input.judges ?? []),
		criteria: normalizeCriteria(input.criteria ?? []),
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

export async function getJudgeSessionByToken(token: string): Promise<JudgeSessionData | undefined> {
	const store = await readStore()

	for (const event of store.events) {
		const judge = event.judges.find((candidate) => candidate.token === token)
		if (!judge) {
			continue
		}

		const submission = event.submissions.find((item) => item.judgeId === judge.id)

		return {
			event: {
				id: event.id,
				title: event.title,
				description: event.description,
				contestants: event.contestants,
				criteria: event.criteria,
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

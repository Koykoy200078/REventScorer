import { getJudgeSessionByToken, submitJudgeScoresByToken } from '@/lib/storage'
import type { AdminScoreRealtimeUpdate, EventScorer, JudgeSubmission } from '@/lib/types'

export const dynamic = 'force-dynamic'

function messageFromError(error: unknown, fallbackMessage: string): string {
	return error instanceof Error ? error.message : fallbackMessage
}

function parseBackendPort(value: string | undefined, fallback = 3007): number {
	const parsed = Number.parseInt(value || '', 10)
	if (Number.isFinite(parsed) && parsed > 0) return parsed
	return fallback
}

function normalizeOrigin(rawOrigin: string): string | null {
	if (!rawOrigin) return null

	try {
		const url = new URL(rawOrigin)
		if (url.hostname === 'localhost') url.hostname = '127.0.0.1'
		if (!url.port) url.port = String(parseBackendPort(process.env.NEXT_PUBLIC_BACKEND_PORT || process.env.PORT))
		return `${url.protocol}//${url.hostname}:${url.port}`
	} catch {
		return null
	}
}

function getBroadcastOrigins(_request: Request): string[] {
	const backendPort = parseBackendPort(process.env.NEXT_PUBLIC_BACKEND_PORT || process.env.PORT, 3007)
	const backendHttpPort = parseBackendPort(process.env.NEXT_PUBLIC_BACKEND_HTTP_PORT || process.env.BACKEND_HTTP_PORT, backendPort)
	const origins: string[] = []

	const pushUnique = (origin: string | null) => {
		if (!origin) return
		if (!origins.includes(origin)) origins.push(origin)
	}

	pushUnique(normalizeOrigin(process.env.NEXT_PROXY_API_ORIGIN || ''))
	pushUnique(normalizeOrigin(process.env.UNIFIED_API_ORIGIN || ''))
	pushUnique(`http://127.0.0.1:${backendHttpPort}`)
	pushUnique(`http://127.0.0.1:${backendPort}`)
	return origins
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

	const inferredSavedIds = event.contestants.filter((contestant) => hasPositiveScoreForContestant(submission, contestant.id)).map((contestant) => contestant.id)

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

async function broadcastScoreUpdate(request: Request, payload: AdminScoreRealtimeUpdate): Promise<void> {
	const body = JSON.stringify(payload)
	let lastError: unknown = null

	for (const origin of getBroadcastOrigins(request)) {
		const targetUrl = `${origin}/api/eventscorer/broadcast`

		try {
			const response = await fetch(targetUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body,
				cache: 'no-store',
			})

			if (response.ok) return

			console.warn(`[eventscorer] Broadcast failed via ${targetUrl} (status ${response.status})`)
			lastError = new Error(`Broadcast returned status ${response.status}`)
		} catch (error) {
			lastError = error
			console.warn(`[eventscorer] Broadcast transport failure via ${targetUrl}: ${messageFromError(error, 'unknown error')}`)
		}
	}

	throw lastError instanceof Error ? lastError : new Error('Broadcast failed for all backend origins')
}

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }): Promise<Response> {
	const { token } = await context.params
	const session = await getJudgeSessionByToken(token)

	if (!session) {
		return Response.json({ error: 'Judge link not found.' }, { status: 404 })
	}

	return Response.json(session)
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }): Promise<Response> {
	try {
		const { token } = await context.params
		const body = (await request.json()) as { scores?: unknown; contestantId?: unknown }

		if (typeof body.contestantId !== 'string' || body.contestantId.trim().length === 0) {
			throw new Error('Contestant ID is required.')
		}

		const submission = await submitJudgeScoresByToken(token, body.scores, body.contestantId)

		const realtimePayload: AdminScoreRealtimeUpdate = {
			eventId: submission.event.id,
			judgeId: submission.judge.id,
			judgeName: submission.judge.name,
			submittedAt: submission.submittedAt,
			submittedJudgeCount: countSubmittedJudges(submission.event),
			totalJudgeCount: submission.event.judges.length,
		}

		try {
			await broadcastScoreUpdate(request, realtimePayload)
		} catch (error) {
			console.error('Failed to broadcast score update:', messageFromError(error, 'unknown error'))
		}

		return Response.json({
			ok: true,
			eventId: submission.event.id,
			judgeName: submission.judge.name,
			submittedAt: submission.submittedAt,
		})
	} catch (error) {
		const message = messageFromError(error, 'Unable to submit scores.')
		const status = message.toLowerCase().includes('not found') ? 404 : 400
		return Response.json({ error: message }, { status })
	}
}

import { getJudgeSessionByToken, submitJudgeScoresByToken } from '@/lib/storage'
import type { AdminScoreRealtimeUpdate } from '@/lib/types'

export const dynamic = 'force-dynamic'

function messageFromError(error: unknown, fallbackMessage: string): string {
	return error instanceof Error ? error.message : fallbackMessage
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
		const body = (await request.json()) as { scores?: unknown }

		const submission = await submitJudgeScoresByToken(token, body.scores)

		const realtimePayload: AdminScoreRealtimeUpdate = {
			eventId: submission.event.id,
			judgeId: submission.judge.id,
			judgeName: submission.judge.name,
			submittedAt: submission.submittedAt,
			submittedJudgeCount: submission.event.submissions.length,
			totalJudgeCount: submission.event.judges.length,
		}

		globalThis.__eventScorerRealtimeBroadcast?.(realtimePayload)

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

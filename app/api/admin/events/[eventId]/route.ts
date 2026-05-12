import { compileEventResults } from '@/lib/scoring'
import { getEventById, updateContestantJudgeAssignments } from '@/lib/storage'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, context: { params: Promise<{ eventId: string }> }): Promise<Response> {
	const { eventId } = await context.params
	const event = await getEventById(eventId)

	if (!event) {
		return Response.json({ error: 'Event not found.' }, { status: 404 })
	}

	const compiled = compileEventResults(event)

	return Response.json({ event, compiled })
}

export async function PATCH(request: Request, context: { params: Promise<{ eventId: string }> }): Promise<Response> {
	try {
		const { eventId } = await context.params
		const body = (await request.json()) as { contestantId?: unknown; judgeIds?: unknown }

		if (typeof body.contestantId !== 'string' || body.contestantId.trim().length === 0) {
			throw new Error('Contestant ID is required.')
		}

		const event = await updateContestantJudgeAssignments(eventId, body.contestantId, body.judgeIds)
		const compiled = compileEventResults(event)

		return Response.json({ ok: true, event, compiled })
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unable to update judge assignments.'
		const status = message.toLowerCase().includes('not found') ? 404 : 400
		return Response.json({ error: message }, { status })
	}
}

import { compileEventResults } from '@/lib/scoring'
import { getEventById, updateContestantJudgeAssignments, updateContestantProgramTags } from '@/lib/storage'

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
		const body = (await request.json()) as {
			contestantId?: unknown
			judgeIds?: unknown
			programTag?: unknown
			programAssignments?: unknown
		}

		let event

		if (Array.isArray(body.programAssignments)) {
			event = await updateContestantProgramTags(eventId, body.programAssignments)
		} else if (Object.prototype.hasOwnProperty.call(body, 'programTag')) {
			if (typeof body.contestantId !== 'string' || body.contestantId.trim().length === 0) {
				throw new Error('Contestant ID is required.')
			}

			event = await updateContestantProgramTags(eventId, [{ contestantId: body.contestantId, programTag: body.programTag }])
		} else {
			if (typeof body.contestantId !== 'string' || body.contestantId.trim().length === 0) {
				throw new Error('Contestant ID is required.')
			}

			event = await updateContestantJudgeAssignments(eventId, body.contestantId, body.judgeIds)
		}

		const compiled = compileEventResults(event)

		return Response.json({ ok: true, event, compiled })
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unable to update judge assignments.'
		const status = message.toLowerCase().includes('not found') ? 404 : 400
		return Response.json({ error: message }, { status })
	}
}

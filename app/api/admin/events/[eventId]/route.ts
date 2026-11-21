import { cookies } from 'next/headers'

import { compileEventResults } from '@/lib/scoring'
import { deleteEventById, getEventById, updateContestantJudgeAssignments, updateContestantProgramTags, updateEventDefinition } from '@/lib/storage'
import { redactJudgeSecrets } from '@/lib/judge-redaction'
import { isUnlockedRequest, UPDATE_AUTH_COOKIE_NAME, verifyUpdateAuthCookieValue } from '@/lib/update-auth'
import { refuseUnlessOwnOrigin } from '@/lib/origin-guard'

export const dynamic = 'force-dynamic'

const UPDATE_PASSWORD_REQUIRED = { error: 'Update password required.' }

// S5: without the update password the event comes without its judges' link tokens and emails;
// the compiled results are the same either way (the golden snapshot reads them without it).
export async function GET(request: Request, context: { params: Promise<{ eventId: string }> }): Promise<Response> {
	const { eventId } = await context.params
	const event = await getEventById(eventId)

	if (!event) {
		return Response.json({ error: 'Event not found.' }, { status: 404 })
	}

	const compiled = compileEventResults(event)
	const unlocked = isUnlockedRequest(request)

	return Response.json({ event: unlocked ? event : redactJudgeSecrets(event), compiled, judgeLinksLocked: !unlocked })
}

export async function PATCH(request: Request, context: { params: Promise<{ eventId: string }> }): Promise<Response> {
	// S2: only EventScorer's own pages (or server-to-server calls with no Origin) may write.
	const refused = refuseUnlessOwnOrigin(request)
	if (refused) return refused

	// S6: every change (program tags, judge assignment, the event editor) needs the update password.
	if (!isUnlockedRequest(request)) {
		return Response.json(UPDATE_PASSWORD_REQUIRED, { status: 401 })
	}

	try {
		const { eventId } = await context.params
		const body = (await request.json()) as {
			contestantId?: unknown
			judgeIds?: unknown
			programTag?: unknown
			programAssignments?: unknown
			eventEditor?: unknown
		}

		let event

		if (body.eventEditor && typeof body.eventEditor === 'object') {
			event = await updateEventDefinition(eventId, body.eventEditor)
		} else if (Array.isArray(body.programAssignments)) {
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

export async function DELETE(request: Request, context: { params: Promise<{ eventId: string }> }): Promise<Response> {
	// S2: only EventScorer's own pages (or server-to-server calls with no Origin) may write.
	const refused = refuseUnlessOwnOrigin(request)
	if (refused) return refused

	try {
		const { eventId } = await context.params
		const cookieStore = await cookies()
		const authCookie = cookieStore.get(UPDATE_AUTH_COOKIE_NAME)?.value

		if (!verifyUpdateAuthCookieValue(authCookie)) {
			return Response.json({ error: 'Update password required.' }, { status: 401 })
		}

		let body: { confirmText?: unknown } = {}
		try {
			body = (await request.json()) as { confirmText?: unknown }
		} catch {
			return Response.json({ error: 'Invalid request body.' }, { status: 400 })
		}

		const confirmText = typeof body.confirmText === 'string' ? body.confirmText.trim() : ''
		if (confirmText !== 'DELETE') {
			return Response.json({ error: 'Type DELETE to confirm removal.' }, { status: 400 })
		}

		await deleteEventById(eventId)
		return Response.json({ ok: true })
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unable to delete event.'
		const status = message.toLowerCase().includes('not found') ? 404 : 400
		return Response.json({ error: message }, { status })
	}
}
// touch 

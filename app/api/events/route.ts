import type { CreateEventInput, CreateEventResponse } from '@/lib/types'
import { createEvent, listEventSummaries } from '@/lib/storage'

export const dynamic = 'force-dynamic'

function errorResponse(error: unknown, fallbackMessage: string): Response {
	const message = error instanceof Error ? error.message : fallbackMessage
	return Response.json({ error: message }, { status: 400 })
}

export async function GET(): Promise<Response> {
	const events = await listEventSummaries()
	return Response.json({ events })
}

export async function POST(request: Request): Promise<Response> {
	try {
		const body = (await request.json()) as CreateEventInput
		const event = await createEvent(body)
		const origin = new URL(request.url).origin

		const responsePayload: CreateEventResponse = {
			eventId: event.id,
			adminUrl: `${origin}/admin/${event.id}`,
			judgeLinks: event.judges.map((judge) => ({
				judgeId: judge.id,
				judgeName: judge.name,
				token: judge.token,
				url: `${origin}/judge/${judge.token}`,
			})),
		}

		return Response.json(responsePayload, { status: 201 })
	} catch (error) {
		return errorResponse(error, 'Unable to create scorer event.')
	}
}

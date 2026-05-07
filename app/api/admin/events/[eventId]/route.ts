import { compileEventResults } from '@/lib/scoring'
import { getEventById } from '@/lib/storage'

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

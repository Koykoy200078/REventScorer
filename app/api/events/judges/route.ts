import { listJudgeDirectory } from '@/lib/storage'
import { isUnlockedRequest } from '@/lib/update-auth'

export const dynamic = 'force-dynamic'

function errorResponse(error: unknown, fallbackMessage: string): Response {
	const message = error instanceof Error ? error.message : fallbackMessage
	return Response.json({ error: message }, { status: 500 })
}

// S6: the judge directory (names and emails of every judge) needs the update password.
export async function GET(request: Request): Promise<Response> {
	if (!isUnlockedRequest(request)) {
		return Response.json({ error: 'Update password required.' }, { status: 401 })
	}

	try {
		const judges = await listJudgeDirectory()
		return Response.json({ judges })
	} catch (error) {
		return errorResponse(error, 'Unable to load judge directory.')
	}
}

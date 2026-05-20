import { listJudgeDirectory } from '@/lib/storage'

export const dynamic = 'force-dynamic'

function errorResponse(error: unknown, fallbackMessage: string): Response {
	const message = error instanceof Error ? error.message : fallbackMessage
	return Response.json({ error: message }, { status: 500 })
}

export async function GET(): Promise<Response> {
	try {
		const judges = await listJudgeDirectory()
		return Response.json({ judges })
	} catch (error) {
		return errorResponse(error, 'Unable to load judge directory.')
	}
}

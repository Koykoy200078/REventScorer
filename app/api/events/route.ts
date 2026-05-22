import os from 'node:os'

import type { CreateEventInput, CreateEventResponse } from '@/lib/types'
import { createEvent, listEventSummaries } from '@/lib/storage'

export const dynamic = 'force-dynamic'

function errorResponse(error: unknown, fallbackMessage: string): Response {
	const message = error instanceof Error ? error.message : fallbackMessage
	return Response.json({ error: message }, { status: 400 })
}

function getFirstLanIPv4(): string | null {
	if (process.env.SERVER_IP) {
		return process.env.SERVER_IP
	}

	for (const interfaces of Object.values(os.networkInterfaces())) {
		for (const iface of interfaces || []) {
			if (iface.family === 'IPv4' && !iface.internal) {
				return iface.address
			}
		}
	}

	return null
}

function resolveOriginHostname(rawHostname: string): string {
	const nonRoutable = ['0.0.0.0', '127.0.0.1', 'localhost', '[::]', '[::1]']
	if (!nonRoutable.includes(rawHostname.toLowerCase())) {
		return rawHostname
	}

	return getFirstLanIPv4() ?? rawHostname
}

export async function GET(): Promise<Response> {
	const events = await listEventSummaries()
	return Response.json({ events })
}

export async function POST(request: Request): Promise<Response> {
	try {
		const body = (await request.json()) as CreateEventInput
		const event = await createEvent(body)

		const url = new URL(request.url)
		
		const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host')
		if (forwardedHost) {
			url.host = forwardedHost
		}

		url.port = process.env.EVENTSCORER_PORT || '3001'
		url.hostname = resolveOriginHostname(url.hostname)

		const forwardedProto = request.headers.get('x-forwarded-proto') || request.headers.get('x-forwarded-protocol')
		const normalizedProto = forwardedProto ? forwardedProto.split(',')[0].trim().toLowerCase() : ''
		if (normalizedProto === 'https' || normalizedProto === 'http') {
			url.protocol = `${normalizedProto}:`
		}
		const origin = url.origin

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


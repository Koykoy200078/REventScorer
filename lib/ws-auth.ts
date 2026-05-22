import 'server-only'

import crypto from 'node:crypto'

const WS_AUTH_SALT = 'eventscorer:admin-ws:v1'

function getAdminSecret(): string {
	return (process.env.EVENTSCORER_ADMIN_SECRET ?? '').trim()
}

export function buildAdminWsToken(eventId: string): string | null {
	const secret = getAdminSecret()
	const normalizedEventId = String(eventId ?? '').trim()

	if (!secret || !normalizedEventId) {
		return null
	}

	return crypto.createHmac('sha256', secret).update(`${WS_AUTH_SALT}:${normalizedEventId}`).digest('hex')
}

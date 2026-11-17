import { NextResponse } from 'next/server'

import {
	getAuthLimiter,
	getUpdateAuthCookieOptions,
	hasUpdatePasswordConfigured,
	isUnlockedRequest,
	limiterKeyFor,
	tooManyAttemptsResponse,
	verifyUpdatePassword,
} from '@/lib/update-auth'

function shouldUseSecureCookie(request: Request): boolean {
	const forcedSecure = (process.env.EVENTSCORER_COOKIE_SECURE ?? '').trim().toLowerCase()
	const forwardedProto = request.headers.get('x-forwarded-proto') ?? ''
	const normalizedProto = forwardedProto.split(',')[0]?.trim().toLowerCase()
	const requestProtocol = new URL(request.url).protocol.replace(':', '')
	return forcedSecure === '1' || forcedSecure === 'true' ? true : forcedSecure === '0' || forcedSecure === 'false' ? false : normalizedProto === 'https' || requestProtocol === 'https'
}

function unlockedResponse(request: Request): Response {
	const response = NextResponse.json({ ok: true })
	response.cookies.set(getUpdateAuthCookieOptions({ secure: shouldUseSecureCookie(request) }))
	return response
}

// Whether the update password is configured, and whether this browser has unlocked.
export async function GET(request: Request): Promise<Response> {
	return Response.json({ configured: hasUpdatePasswordConfigured(), unlocked: isUnlockedRequest(request) })
}

export async function POST(request: Request): Promise<Response> {
	if (!hasUpdatePasswordConfigured()) {
		return NextResponse.json({ error: 'Update password is not configured.' }, { status: 500 })
	}

	// S7: an admin who has already unlocked is never limited; the cookie is renewed.
	if (isUnlockedRequest(request)) return unlockedResponse(request)

	const limiter = getAuthLimiter()
	const key = limiterKeyFor(request)
	const verdict = limiter.check(key, Date.now())
	if (!verdict.allowed) return tooManyAttemptsResponse(verdict.retryAfterMs)

	let body: { password?: unknown } = {}

	try {
		body = (await request.json()) as { password?: unknown }
	} catch {
		return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
	}

	if (!verifyUpdatePassword(body?.password)) {
		limiter.recordFailure(key, Date.now())
		return NextResponse.json({ error: 'Invalid password.' }, { status: 401 })
	}

	limiter.reset(key)
	return unlockedResponse(request)
}

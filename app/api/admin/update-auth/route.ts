import { NextResponse } from 'next/server'

import { getUpdateAuthCookieOptions, hasUpdatePasswordConfigured, verifyUpdatePassword } from '@/lib/update-auth'

export async function POST(request: Request): Promise<Response> {
	if (!hasUpdatePasswordConfigured()) {
		return NextResponse.json({ error: 'Update password is not configured.' }, { status: 500 })
	}

	let body: { password?: unknown } = {}

	try {
		body = (await request.json()) as { password?: unknown }
	} catch {
		return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
	}

	const password = typeof body.password === 'string' ? body.password : ''
	if (!verifyUpdatePassword(password)) {
		return NextResponse.json({ error: 'Invalid password.' }, { status: 401 })
	}

	const forcedSecure = (process.env.EVENTSCORER_COOKIE_SECURE ?? '').trim().toLowerCase()
	const forwardedProto = request.headers.get('x-forwarded-proto') ?? ''
	const normalizedProto = forwardedProto.split(',')[0]?.trim().toLowerCase()
	const requestProtocol = new URL(request.url).protocol.replace(':', '')
	const shouldUseSecure = forcedSecure === '1' || forcedSecure === 'true' ? true : forcedSecure === '0' || forcedSecure === 'false' ? false : normalizedProto === 'https' || requestProtocol === 'https'

	const response = NextResponse.json({ ok: true })
	response.cookies.set(getUpdateAuthCookieOptions({ secure: shouldUseSecure }))
	return response
}

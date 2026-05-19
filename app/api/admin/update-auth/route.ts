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

	const response = NextResponse.json({ ok: true })
	response.cookies.set(getUpdateAuthCookieOptions())
	return response
}

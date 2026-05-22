import { cookies, headers } from 'next/headers'
import { notFound } from 'next/navigation'

import { AdminLiveDashboard } from '@/components/admin-live-dashboard'
import { compileEventResults } from '@/lib/scoring'
import { getEventById } from '@/lib/storage'
import { UPDATE_AUTH_COOKIE_NAME, verifyUpdateAuthCookieValue } from '@/lib/update-auth'
import { buildAdminWsToken } from '@/lib/ws-auth'

export const dynamic = 'force-dynamic'

export default async function AdminEventPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams?: Promise<{ update?: string; editor?: string }> }) {
	const { eventId } = await params
	const resolvedSearchParams = searchParams ? await searchParams : undefined
	const openEditor = resolvedSearchParams?.update === '1' || resolvedSearchParams?.update === 'true' || resolvedSearchParams?.editor === '1' || resolvedSearchParams?.editor === 'true'
	const cookieStore = await cookies()
	const authCookie = cookieStore.get(UPDATE_AUTH_COOKIE_NAME)?.value
	const allowEventEditor = openEditor && verifyUpdateAuthCookieValue(authCookie)
	const event = await getEventById(eventId)

	if (!event) {
		notFound()
	}

	const compiled = compileEventResults(event)
	const requestHeaders = await headers()
	const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host') ?? ''
	const protocol = requestHeaders.get('x-forwarded-proto') ?? 'http'
	const baseUrl = host ? `${protocol}://${host}` : ''
	const wsAuthToken = buildAdminWsToken(event.id)

	return <AdminLiveDashboard initialEvent={event} initialCompiled={compiled} baseUrl={baseUrl} initialOpenEditor={allowEventEditor} allowEventEditor={allowEventEditor} wsAuthToken={wsAuthToken ?? undefined} />
}

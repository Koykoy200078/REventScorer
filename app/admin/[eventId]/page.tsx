import { headers } from 'next/headers'
import { notFound } from 'next/navigation'

import { AdminLiveDashboard } from '@/components/admin-live-dashboard'
import { compileEventResults } from '@/lib/scoring'
import { getEventById } from '@/lib/storage'

export const dynamic = 'force-dynamic'

export default async function AdminEventPage({ params }: { params: Promise<{ eventId: string }> }) {
	const { eventId } = await params
	const event = await getEventById(eventId)

	if (!event) {
		notFound()
	}

	const compiled = compileEventResults(event)
	const requestHeaders = await headers()
	const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host') ?? ''
	const protocol = requestHeaders.get('x-forwarded-proto') ?? 'http'
	const baseUrl = host ? `${protocol}://${host}` : ''

	return <AdminLiveDashboard initialEvent={event} initialCompiled={compiled} baseUrl={baseUrl} />
}

import Link from 'next/link'

import { RatingSheet } from '@/components/rating-sheet'

export const dynamic = 'force-dynamic'

export default async function RatingSheetPage({ searchParams }: { searchParams?: Promise<{ editEventId?: string }> }) {
	const resolvedSearchParams = searchParams ? await searchParams : undefined
	const editEventId = typeof resolvedSearchParams?.editEventId === 'string' ? resolvedSearchParams.editEventId : undefined

	return (
		<div className='min-h-screen bg-transparent pb-10'>
			<div className='mx-auto w-full max-w-6xl px-4 pt-6 sm:px-8'>
				<Link href='/' className='inline-flex items-center rounded-full border border-emerald-700/30 bg-emerald-50 px-4 py-2 text-sm text-emerald-900 transition hover:bg-emerald-100'>
					Back to Dashboard
				</Link>
			</div>
			<RatingSheet editEventId={editEventId} />
		</div>
	)
}

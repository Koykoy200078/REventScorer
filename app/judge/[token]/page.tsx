import { notFound } from 'next/navigation'

import { JudgeScoringForm } from '@/components/judge-scoring-form'
import { getJudgeSessionByToken } from '@/lib/storage'

export const dynamic = 'force-dynamic'

export default async function JudgeTokenPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams?: Promise<{ contestantId?: string; fromAdmin?: string }> }) {
	const { token } = await params
	const resolvedSearchParams = searchParams ? await searchParams : undefined
	const initialContestantId = typeof resolvedSearchParams?.contestantId === 'string' ? resolvedSearchParams.contestantId : undefined
	const adminEditMode = resolvedSearchParams?.fromAdmin === '1' || resolvedSearchParams?.fromAdmin === 'true'
	const session = await getJudgeSessionByToken(token)

	if (!session) {
		notFound()
	}

	return (
		<div className='min-h-screen bg-transparent pb-12'>
			<JudgeScoringForm
				token={token}
				eventTitle={session.event.title}
				contestants={session.event.contestants}
				criteria={session.event.criteria}
				judge={session.judge}
				presentationSlots={session.event.presentationSlots}
				existingScores={session.submission?.scores}
				existingSavedContestantIds={session.submission?.savedContestantIds}
				submittedAt={session.submission?.submittedAt}
				initialContestantId={initialContestantId}
				adminEditMode={adminEditMode}
			/>
		</div>
	)
}

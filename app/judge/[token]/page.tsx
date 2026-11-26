import { notFound } from 'next/navigation'

import { JudgeScoringForm } from '@/components/judge-scoring-form'
import { parseViewParam } from '@/lib/judge/layout'
import { getJudgeSessionByToken } from '@/lib/storage'

export const dynamic = 'force-dynamic'

export default async function JudgeTokenPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams?: Promise<{ contestantId?: string; fromAdmin?: string; view?: string | string[] }> }) {
	const { token } = await params
	const resolvedSearchParams = searchParams ? await searchParams : undefined
	const initialContestantId = typeof resolvedSearchParams?.contestantId === 'string' ? resolvedSearchParams.contestantId : undefined
	const adminEditMode = resolvedSearchParams?.fromAdmin === '1' || resolvedSearchParams?.fromAdmin === 'true'
	const session = await getJudgeSessionByToken(token)

	if (!session) {
		notFound()
	}

	return (
		<div className='min-h-screen bg-slate-50'>
			<JudgeScoringForm
				token={token}
				eventTitle={session.event.title}
				eventDescription={session.event.description}
				eventScoringType={session.event.eventScoringType}
				contestants={session.event.contestants}
				criteria={session.event.criteria}
				judge={session.judge}
				rubricLegend={session.event.rubricLegend}
				showRubricLegend={session.event.showRubricLegend}
				directRatingConfig={session.event.directRatingConfig}
				presentationSlots={session.event.presentationSlots}
				existingScores={session.submission?.scores}
				existingSavedContestantIds={session.submission?.savedContestantIds}
				existingContestantDetails={session.submission?.contestantDetails}
				submittedAt={session.submission?.submittedAt}
				initialContestantId={initialContestantId}
				adminEditMode={adminEditMode}
				initialView={parseViewParam(resolvedSearchParams?.view)}
			/>
		</div>
	)
}

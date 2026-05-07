import { notFound } from 'next/navigation'

import { JudgeScoringForm } from '@/components/judge-scoring-form'
import { getJudgeSessionByToken } from '@/lib/storage'

export const dynamic = 'force-dynamic'

export default async function JudgeTokenPage({ params }: { params: Promise<{ token: string }> }) {
	const { token } = await params
	const session = await getJudgeSessionByToken(token)

	if (!session) {
		notFound()
	}

	return (
		<div className='min-h-screen bg-transparent pb-12'>
			<JudgeScoringForm token={token} eventTitle={session.event.title} contestants={session.event.contestants} criteria={session.event.criteria} judge={session.judge} existingScores={session.submission?.scores} submittedAt={session.submission?.submittedAt} />
		</div>
	)
}

import type { DraftStatus } from '@/lib/judge/draft-state'
import type { EventContestant } from '@/lib/types'

// Stage 5 Task 5 Step 5: the Previous / Next / Save buttons, moved verbatim out of
// components/judge-scoring-form.tsx. Step 6 moves them into the sticky dock and the header.
export function JudgeActions({
	activeContestant,
	activeContestantIndex,
	contestants,
	isSaving,
	draftStatus,
	goToContestant,
}: {
	activeContestant: EventContestant
	activeContestantIndex: number
	contestants: EventContestant[]
	isSaving: boolean
	draftStatus: DraftStatus
	goToContestant: (index: number) => void
}) {
	return (
					<div className='flex flex-wrap gap-3'>
						<button suppressHydrationWarning type='button' onClick={() => goToContestant(activeContestantIndex - 1)} disabled={activeContestantIndex === 0} className='rounded-full border border-cyan-300 bg-white px-5 py-2 text-sm font-medium text-cyan-900 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50'>
							Previous Entry
						</button>
						<button suppressHydrationWarning type='button' onClick={() => goToContestant(activeContestantIndex + 1)} disabled={activeContestantIndex >= contestants.length - 1} className='rounded-full border border-cyan-300 bg-white px-5 py-2 text-sm font-medium text-cyan-900 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50'>
							Next Entry
						</button>
						<button suppressHydrationWarning type='submit' disabled={isSaving} data-testid='save-scores' data-draft-status={draftStatus} className='rounded-full bg-cyan-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-60'>
							{isSaving ? `Saving ${activeContestant.name}...` : `Save ${activeContestant.name} Scores`}
						</button>
					</div>
	)
}

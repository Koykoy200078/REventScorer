import type { EventContestant } from '@/lib/types'

// Stage 5 Task 5 Step 5: the Additional Remark box, moved verbatim out of
// components/judge-scoring-form.tsx. Step 10 rebuilds it as Section C.
export function RemarksSection({
	activeContestant,
	activeContestantId,
	contestantDetails,
	updateContestantDetailsField,
}: {
	activeContestant: EventContestant
	activeContestantId: string
	contestantDetails: Record<string, { strand: string; remark: string; additionalInfo: string }>
	updateContestantDetailsField: (contestantId: string, field: 'strand' | 'remark' | 'additionalInfo', value: string) => void
}) {
	return (
						<div className='mt-6'>
							<label className='block rounded-xl border border-cyan-200 bg-white p-4 text-sm font-medium text-slate-900 shadow-sm'>
								<span className='block text-sm font-semibold text-cyan-950'>Additional Remark (Optional)</span>
								<p className='mt-1 text-xs text-cyan-900/70'>
									Add any additional comments or observations for this contestant.
									{activeContestant.laptopAvailable ? <span className='ml-1 text-cyan-700/70'>(Auto-filled from laptop availability — you may overwrite)</span> : null}
								</p>
								<textarea
									suppressHydrationWarning
									data-testid='additional-remark'
									value={contestantDetails[activeContestantId]?.additionalInfo ?? ''}
									onChange={(inputEvent) => updateContestantDetailsField(activeContestantId, 'additionalInfo', inputEvent.target.value)}
									placeholder='Enter any additional remark here...'
									rows={3}
									className='mt-3 w-full resize-none rounded-lg border border-cyan-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 caret-slate-900 outline-none ring-cyan-600 transition focus:border-cyan-500 focus:ring-2'
								/>
							</label>
						</div>
	)
}

import { rosterStatus } from '@/lib/judge/status'
import type { EventContestant } from '@/lib/types'

// Stage 5 Task 5 Step 5: the judge page's roster chips, moved verbatim out of
// components/judge-scoring-form.tsx. Step 6 replaces them with the contestant picker.
export function JudgeRoster({
	contestants,
	activeContestantIndex,
	savedContestantIds,
	queuedContestantIds,
	draftScoredContestantIds,
	slotLabelsByContestant,
	goToContestant,
}: {
	contestants: EventContestant[]
	activeContestantIndex: number
	savedContestantIds: ReadonlySet<string>
	queuedContestantIds: ReadonlySet<string>
	draftScoredContestantIds: ReadonlySet<string>
	slotLabelsByContestant: ReadonlyMap<string, string>
	goToContestant: (index: number) => void
}) {
	return (
				<div className='mt-6 rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4'>
					<p className='text-xs uppercase tracking-[0.16em] text-cyan-900'>Score One Entry At A Time</p>
					<p className='mt-1 text-xs text-cyan-900/80'>Entries marked as Scored already have saved scores.</p>
					<div data-testid='judge-roster' className='mt-3 flex flex-wrap gap-2'>
						{contestants.map((contestant, index) => {
							const isActive = index === activeContestantIndex
							const isSaved = savedContestantIds.has(contestant.id)
							const isQueued = queuedContestantIds.has(contestant.id)
							const hasDraft = draftScoredContestantIds.has(contestant.id)
							const slotLabel = slotLabelsByContestant.get(contestant.id)
							const isIndividual = contestant.entryType === 'individual'
							return (
								<button suppressHydrationWarning key={contestant.id} type='button' onClick={() => goToContestant(index)} data-testid='roster-entry' data-contestant-id={contestant.id} data-status={rosterStatus({ queued: isQueued, saved: isSaved, hasDraft })} aria-current={isActive ? 'true' : undefined} className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${isActive ? 'border-cyan-800 bg-cyan-900 text-white' : 'border-cyan-300 bg-white text-cyan-900 hover:bg-cyan-100'}`}>
									<div className='flex flex-col items-start'>
										<span>
											{index + 1}. {contestant.name}
										</span>
										{isIndividual ? <span className={`text-[10px] ${isActive ? 'text-white/80' : 'text-sky-700'}`}>Individual</span> : null}
										{slotLabel ? <span className={`text-[10px] ${isActive ? 'text-white/80' : 'text-cyan-800/70'}`}>{slotLabel}</span> : null}
									</div>
									{isQueued ? (
										<span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${isActive ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'}`}>Queued</span>
									) : isSaved ? (
										<span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${isActive ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'}`}>Scored</span>
									) : hasDraft ? (
										<span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${isActive ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'}`}>Draft</span>
									) : null}
								</button>
							)
						})}
					</div>
				</div>
	)
}

import type { InputScoreMatrix } from '@/lib/judge/matrix'
import { applicableSubCriteriaForContestant, criterionScopeLabel, groupSubCriteriaByMember, isIndividualCriterion } from '@/lib/judge/members'
import { parseAndClampScore, round } from '@/lib/judge/score-input'
import type { DirectRatingConfig, EventContestant, EventCriterion } from '@/lib/types'

// Stage 5 Task 5 Step 5: the criterion articles of a scored event, moved verbatim out of
// components/judge-scoring-form.tsx (its props keep the form's own names). Steps 7-9 replace
// them with the Unified, Group-only and Individual-only sections.
export function CriterionList({
	criteria,
	activeContestant,
	activeContestantId,
	scores,
	directRatingConfig,
	rubricLegendText,
	updateScore,
}: {
	criteria: EventCriterion[]
	activeContestant: EventContestant
	activeContestantId: string
	scores: InputScoreMatrix
	directRatingConfig?: DirectRatingConfig
	rubricLegendText: string
	updateScore: (contestantId: string, subCriterionId: string, value: string, maxScore: number) => void
}) {
	return (
		<>
			{criteria.map((criterion) => {
									const applicableSubCriteria = applicableSubCriteriaForContestant(criterion, activeContestant)
									const scopeLabel = criterionScopeLabel(criterion)
									const parentMaxScore = round(applicableSubCriteria.reduce((sum, subCriterion) => sum + Number(subCriterion.maxScore), 0))
									const parentCurrentTotal = round(
										applicableSubCriteria.reduce((sum, subCriterion) => {
											const rawValue = scores[activeContestantId]?.[subCriterion.id] ?? '0'
											return sum + parseAndClampScore(rawValue, subCriterion.maxScore)
										}, 0),
									)

									return (
										<article key={criterion.id} className='rounded-2xl border border-cyan-100 bg-cyan-50/40 p-4'>
											<div className='flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between'>
												<div>
													<h3 className='text-base font-semibold text-cyan-950'>{criterion.name}</h3>
													<p className='text-[11px] font-medium text-cyan-900/85'>Scope: {scopeLabel}</p>
													{!directRatingConfig ? <p className='text-[11px] text-cyan-900/80'>Legend: {rubricLegendText}</p> : null}
												</div>
												<p className='text-xs text-cyan-900/90'>
													Parent Max: {parentMaxScore.toFixed(2)} | Current: {parentCurrentTotal.toFixed(2)}
												</p>
											</div>

											{isIndividualCriterion(criterion) ? (
												<div className='mt-3 space-y-4'>
													{groupSubCriteriaByMember(criterion.subCriteria, activeContestant).map((group) => {
														const groupMaxScore = round(group.items.reduce((sum, item) => sum + item.subCriterion.maxScore, 0))
														const groupCurrentTotal = round(
															group.items.reduce((sum, item) => {
																const rawValue = scores[activeContestantId]?.[item.subCriterion.id] ?? '0'
																return sum + parseAndClampScore(rawValue, item.subCriterion.maxScore)
															}, 0),
														)

														return (
															<div key={group.memberLabel} data-testid='member-group' data-member-label={group.memberLabel} className='rounded-2xl border border-cyan-200 bg-white p-3'>
																<div className='flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between'>
																	<div>
																		<h4 className='text-sm font-semibold text-cyan-950'>{group.memberDisplayLabel}</h4>
																	</div>
																	<p className='text-xs text-cyan-900/90 sm:text-right'>
																		Max: {groupMaxScore.toFixed(2)} | Current: {groupCurrentTotal.toFixed(2)}
																	</p>
																</div>

																<div className='mt-3 grid gap-3 xl:grid-cols-2'>
																	{group.items.map(({ subCriterion, displayName }) => (
																		<label key={subCriterion.id} className='rounded-xl border border-cyan-200 bg-white p-3 text-sm font-medium text-slate-900'>
																			<span className='block text-sm font-semibold text-cyan-950'>{displayName}</span>
																			<span className='mt-1 block text-xs text-cyan-900/90'>Sub Max: {subCriterion.maxScore.toFixed(2)}</span>
																			<input
																				suppressHydrationWarning
																				data-testid='score-input'
																				data-subcriterion-id={subCriterion.id}
																				value={scores[activeContestantId]?.[subCriterion.id] ?? '0'}
																				onChange={(inputEvent) => updateScore(activeContestantId, subCriterion.id, inputEvent.target.value, subCriterion.maxScore)}
																				type='number'
																				inputMode='decimal'
																				min={0}
																				max={subCriterion.maxScore}
																				step='0.01'
																				className='mt-2 w-full rounded-lg border border-cyan-300 bg-white px-3 py-2 text-base font-semibold text-slate-900 placeholder:text-slate-500 caret-slate-900 outline-none ring-cyan-600 transition focus:border-cyan-500 focus:ring-2'
																			/>
																			<span className='mt-1 block text-xs font-medium text-slate-700'>Entered Score: {scores[activeContestantId]?.[subCriterion.id] ?? '0'}</span>
																		</label>
																	))}
																</div>
															</div>
														)
													})}
												</div>
											) : (
												<div className='mt-3 grid gap-3 xl:grid-cols-2'>
													{criterion.subCriteria.map((subCriterion) => (
														<label key={subCriterion.id} className='rounded-xl border border-cyan-200 bg-white p-3 text-sm font-medium text-slate-900'>
															<span className='block text-sm font-semibold text-cyan-950'>{subCriterion.name}</span>
															<span className='mt-1 block text-xs text-cyan-900/90'>Sub Max: {subCriterion.maxScore.toFixed(2)}</span>
															<input
																suppressHydrationWarning
																data-testid='score-input'
																data-subcriterion-id={subCriterion.id}
																value={scores[activeContestantId]?.[subCriterion.id] ?? '0'}
																onChange={(inputEvent) => updateScore(activeContestantId, subCriterion.id, inputEvent.target.value, subCriterion.maxScore)}
																type='number'
																inputMode='decimal'
																min={0}
																max={subCriterion.maxScore}
																step='0.01'
																className='mt-2 w-full rounded-lg border border-cyan-300 bg-white px-3 py-2 text-base font-semibold text-slate-900 placeholder:text-slate-500 caret-slate-900 outline-none ring-cyan-600 transition focus:border-cyan-500 focus:ring-2'
															/>
															<span className='mt-1 block text-xs font-medium text-slate-700'>Entered Score: {scores[activeContestantId]?.[subCriterion.id] ?? '0'}</span>
														</label>
													))}
												</div>
											)}
										</article>
									)
								})}
		</>
	)
}

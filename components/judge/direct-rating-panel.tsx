import Select from 'react-select'

import { DIRECT_RATING_STRAND_SELECT_GROUPS } from '@/lib/direct-rating-config'
import type { DirectScoreField } from '@/lib/judge/legacy-direct'
import type { InputContestantDetailsMap, InputScoreMatrix } from '@/lib/judge/matrix'
import { parseAndClampScore, round } from '@/lib/judge/score-input'
import { DIRECT_REMARK_OPTIONS, isTVLAcademicTrack, TVL_LEAF_STRAND_OPTIONS } from '@/lib/judge/strand'
import type { EventContestant } from '@/lib/types'

// Stage 5 Task 5 Step 5: the direct-rating article, moved verbatim out of
// components/judge-scoring-form.tsx (its props keep the form's own names). Step 9 restyles it.
export function DirectRatingPanel({
	activeContestant,
	activeContestantId,
	directScoreFields,
	scores,
	noatScoreByContestantId,
	contestantDetails,
	activeDirectFinalRating,
	directFinalRatingMaxPossible,
	activeDirectBaseFinalRating,
	directScoreMaxPossible,
	activeDirectAppliedInterviewBonus,
	updateScore,
	updateContestantDetailsField,
}: {
	activeContestant: EventContestant
	activeContestantId: string
	directScoreFields: DirectScoreField[]
	scores: InputScoreMatrix
	noatScoreByContestantId: ReadonlyMap<string, number>
	contestantDetails: InputContestantDetailsMap
	activeDirectFinalRating: number
	directFinalRatingMaxPossible: number
	activeDirectBaseFinalRating: number
	directScoreMaxPossible: number
	activeDirectAppliedInterviewBonus: number
	updateScore: (contestantId: string, subCriterionId: string, value: string, maxScore: number) => void
	updateContestantDetailsField: (contestantId: string, field: 'strand' | 'remark' | 'additionalInfo', value: string) => void
}) {
	return (
								<article className='rounded-2xl border border-cyan-100 bg-cyan-50/40 p-4'>
									<div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
										<div>
											<h3 className='text-base font-semibold text-cyan-950'>Direct Score Entry</h3>
											<p className='text-[11px] font-medium text-cyan-900/85'>Enter AVE/GPA, NOAT, and Interview directly. NOAT may be admin-provided and read-only. Strand bonus is applied to Interview only, and Final Rating stays on a 0-100 scale.</p>
										</div>
										<div className='text-right'>
											<p className='text-xs font-semibold text-emerald-800'>
												Final Rating: {activeDirectFinalRating.toFixed(2)} / {directFinalRatingMaxPossible.toFixed(2)}
											</p>
											<p className='text-[11px] text-emerald-900/80'>
												Base: {activeDirectBaseFinalRating.toFixed(2)} / {directScoreMaxPossible.toFixed(2)} | Interview Bonus Applied: +{activeDirectAppliedInterviewBonus.toFixed(2)}
											</p>
										</div>
									</div>

									<div className='mt-3 grid gap-3 md:grid-cols-2'>
										{directScoreFields.filter((f) => !f.key.startsWith('interview')).map((field) => {
											const enteredValue = scores[activeContestantId]?.[field.subCriterionId] ?? '0'
											const enteredScore = parseAndClampScore(enteredValue, field.maxScore)
											const normalizedPercent = field.maxScore > 0 ? round((enteredScore / field.maxScore) * 100) : 0
											const isNoatLocked = field.key === 'noat' && noatScoreByContestantId.has(activeContestantId)

											return (
												<label key={field.subCriterionId} className='rounded-xl border border-cyan-200 bg-white p-3 text-sm font-medium text-slate-900'>
													<span className='block text-sm font-semibold text-cyan-950'>{field.label}</span>
													<span className='mt-1 block text-xs text-cyan-900/90'>
														Max: {field.maxScore.toFixed(2)}
														{isNoatLocked ? ' | Admin provided' : ''}
													</span>
													<input
														suppressHydrationWarning
														data-testid='score-input'
														data-subcriterion-id={field.subCriterionId}
														value={enteredValue}
														onChange={(inputEvent) => {
															if (isNoatLocked) {
																return
															}
															updateScore(activeContestantId, field.subCriterionId, inputEvent.target.value, field.maxScore)
														}}
														type='number'
														inputMode='decimal'
														min={0}
														max={field.maxScore}
														step='0.01'
														readOnly={isNoatLocked}
														className='mt-2 w-full rounded-lg border border-cyan-300 bg-white px-3 py-2 text-base font-semibold text-slate-900 placeholder:text-slate-500 caret-slate-900 outline-none ring-cyan-600 transition focus:border-cyan-500 focus:ring-2 read-only:cursor-default read-only:bg-slate-50 read-only:text-slate-600'
													/>
													<span className='mt-1 block text-xs font-medium text-slate-700'>
														Entered: {enteredScore.toFixed(2)} | Normalized: {normalizedPercent.toFixed(2)}%
													</span>
												</label>
											)
										})}
									</div>

									{directScoreFields.some((f) => f.key.startsWith('interview')) ? (
										<div className='mt-4 rounded-xl border border-cyan-200 bg-white/60 p-4'>
											<h4 className='mb-3 text-sm font-bold tracking-wider text-cyan-950 uppercase'>Interview</h4>
											<div className='grid gap-3 md:grid-cols-2'>
												{directScoreFields.filter((f) => f.key.startsWith('interview')).map((field) => {
													const enteredValue = scores[activeContestantId]?.[field.subCriterionId] ?? '0'
													const enteredScore = parseAndClampScore(enteredValue, field.maxScore)
													const normalizedPercent = field.maxScore > 0 ? round((enteredScore / field.maxScore) * 100) : 0

													return (
														<label key={field.subCriterionId} className='rounded-xl border border-cyan-200 bg-white p-3 text-sm font-medium text-slate-900'>
															<span className='block text-sm font-semibold text-cyan-950'>{field.label}</span>
															<span className='mt-1 block text-xs text-cyan-900/90'>
																Max: {field.maxScore.toFixed(2)}
															</span>
															<input
																suppressHydrationWarning
																data-testid='score-input'
																data-subcriterion-id={field.subCriterionId}
																value={enteredValue}
																onChange={(inputEvent) => {
																	updateScore(activeContestantId, field.subCriterionId, inputEvent.target.value, field.maxScore)
																}}
																type='number'
																inputMode='decimal'
																min={0}
																max={field.maxScore}
																step='0.01'
																className='mt-2 w-full rounded-lg border border-cyan-300 bg-white px-3 py-2 text-base font-semibold text-slate-900 placeholder:text-slate-500 caret-slate-900 outline-none ring-cyan-600 transition focus:border-cyan-500 focus:ring-2'
															/>
															<span className='mt-1 block text-xs font-medium text-slate-700'>
																Entered: {enteredScore.toFixed(2)} | Normalized: {normalizedPercent.toFixed(2)}%
															</span>
														</label>
													)
												})}
											</div>
										</div>
									) : null}

									<div className='mt-3 grid gap-3 md:grid-cols-2'>
										<label className='rounded-xl border border-cyan-200 bg-white p-3 text-sm font-medium text-slate-900'>
											<span className='block text-sm font-semibold text-cyan-950'>Strand</span>
											{isTVLAcademicTrack(activeContestant.academicTrack) ? (
												<>
													<p className='mt-1 text-[10px] text-cyan-700/80'>TVL Track — select specific sub-strand</p>
													<div data-testid='strand-select' className='mt-2'>
														<Select
															instanceId={`strand-tvl-select-${activeContestantId}`}
															options={Array.from(new Set(TVL_LEAF_STRAND_OPTIONS.map((o) => o.group))).map((groupName) => ({
																label: groupName,
																options: TVL_LEAF_STRAND_OPTIONS.filter((o) => o.group === groupName).map((o) => ({ value: o.value, label: o.label })),
															}))}
															value={(() => {
																const val = contestantDetails[activeContestantId]?.strand ?? ''
																return val ? { value: val, label: TVL_LEAF_STRAND_OPTIONS.find(o => o.value === val)?.label ?? val } : null
															})()}
															onChange={(selected) => updateContestantDetailsField(activeContestantId, 'strand', selected?.value ?? '')}
															isClearable
															placeholder='Search or select...'
															classNamePrefix='react-select'
															styles={{
																control: (base) => ({ ...base, borderRadius: '0.5rem', borderColor: '#67e8f9', minHeight: '42px', fontSize: '14px', paddingLeft: '4px' }),
																valueContainer: (base) => ({ ...base, padding: '2px 12px' }),
																singleValue: (base) => ({ ...base, marginLeft: 0, marginRight: 0 })
															}}
														/>
													</div>
												</>
											) : (
												<div data-testid='strand-select' className='mt-2'>
													<Select
														instanceId={`strand-select-${activeContestantId}`}
														options={DIRECT_RATING_STRAND_SELECT_GROUPS.map((group) => ({
															label: group.label,
															options: group.options.map((o) => ({ value: o.value, label: o.label })),
														}))}
														value={(() => {
															const val = contestantDetails[activeContestantId]?.strand ?? ''
															return val ? { value: val, label: DIRECT_RATING_STRAND_SELECT_GROUPS.flatMap(g => g.options).find(o => o.value === val)?.label ?? val } : null
														})()}
														onChange={(selected) => updateContestantDetailsField(activeContestantId, 'strand', selected?.value ?? '')}
														isClearable
														placeholder='Search or select...'
														classNamePrefix='react-select'
														styles={{
															control: (base) => ({ ...base, borderRadius: '0.5rem', borderColor: '#67e8f9', minHeight: '42px', fontSize: '14px', paddingLeft: '4px' }),
															valueContainer: (base) => ({ ...base, padding: '2px 12px' }),
															singleValue: (base) => ({ ...base, marginLeft: 0, marginRight: 0 })
														}}
													/>
												</div>
											)}
										</label>

										<label className='rounded-xl border border-cyan-200 bg-white p-3 text-sm font-medium text-slate-900'>
											<span className='block text-sm font-semibold text-cyan-950'>Remark</span>
											<div data-testid='remark-select' className='mt-2'>
												<Select
													instanceId={`remark-select-${activeContestantId}`}
													options={DIRECT_REMARK_OPTIONS.map((opt) => ({ value: opt, label: opt }))}
													value={(() => {
														const val = contestantDetails[activeContestantId]?.remark ?? ''
														return val ? { value: val, label: val } : null
													})()}
													onChange={(selected) => updateContestantDetailsField(activeContestantId, 'remark', selected?.value ?? '')}
													isClearable
													placeholder='Search or select...'
													classNamePrefix='react-select'
													styles={{
														control: (base) => ({ ...base, borderRadius: '0.5rem', borderColor: '#67e8f9', minHeight: '42px', fontSize: '14px', paddingLeft: '4px' }),
														valueContainer: (base) => ({ ...base, padding: '2px 12px' }),
														singleValue: (base) => ({ ...base, marginLeft: 0, marginRight: 0 })
													}}
												/>
											</div>
										</label>
									</div>

									<p className='mt-3 text-xs text-cyan-900/80'>Final Rating formula: ((AVE/GPA / Max AVE) x 100 + (NOAT / Max NOAT) x 100 + ((Interview + aligned strand bonus) / Max Interview) x 100) / 3, with Interview capped at its max score.</p>
								</article>
	)
}

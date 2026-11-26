'use client'

// Create Scorer Event's Rubric Criteria section (design 2026-11-26-create-rubric-legend), moved verbatim from
// create-scorer-form.tsx; the form keeps the criteria and passes them in with the legend lock already applied.

import { useId } from 'react'

import { buttonClassName } from '@/components/ui/button'
import { BODY, BOX, CHIP_EMERALD, FIELD, FIELD_STATIC, H2, HELP, NOTE_BOX, PANEL, WELL } from '@/components/ui/form-styles'
import type { LegendLock } from '@/lib/create/legend-max'
import { formatLegendScore } from '@/lib/rubric-legend'
import { cx } from '@/lib/ui/cx'

export type SubCriterionDraft = {
	id: string
	name: string
	maxScore: string
}

export type CriterionDraft = {
	id: string
	name: string
	appliesTo: 'group' | 'individual'
	subCriteria: SubCriterionDraft[]
}

function toNumber(value: string): number {
	const numeric = Number.parseFloat(value)
	return Number.isFinite(numeric) ? numeric : 0
}

export function criterionMaxScore(criterion: Pick<CriterionDraft, 'subCriteria'>): number {
	return criterion.subCriteria.reduce((sum, subCriterion) => sum + toNumber(subCriterion.maxScore), 0)
}

export type RubricCriteriaSectionProps = {
	/** The criteria as shown and sent: withLegendMaxes(criteria, legendLock). */
	lockedCriteria: CriterionDraft[]
	legendLock: LegendLock
	totalEventMaxScore: number
	addCriterion: () => void
	updateCriterion: (criterionId: string, value: Partial<Pick<CriterionDraft, 'name' | 'appliesTo'>>) => void
	removeCriterion: (criterionId: string) => void
	addSubCriterion: (criterionId: string) => void
	updateSubCriterion: (criterionId: string, subCriterionId: string, value: Partial<Pick<SubCriterionDraft, 'name' | 'maxScore'>>) => void
	removeSubCriterion: (criterionId: string, subCriterionId: string) => void
	/** Design 2026-11-26-create-rubric-legend: the folded criteria (ids), kept by the form. */
	collapsedIds: ReadonlySet<string>
	onToggle: (criterionId: string) => void
	onSetAll: (collapsed: boolean) => void
}

export function RubricCriteriaSection({ lockedCriteria, legendLock, totalEventMaxScore, addCriterion, updateCriterion, removeCriterion, addSubCriterion, updateSubCriterion, removeSubCriterion, collapsedIds, onToggle, onSetAll }: RubricCriteriaSectionProps) {
	// The moved JSX counts the criteria (only one left: no Remove Parent); the locked copies are the same list.
	const criteria = lockedCriteria
	// DOM ids for the fold: a criterion's own id is random and made separately by the server render and the browser,
	// so it must not reach the HTML (hydration); useId plus the position is the same on both.
	const foldIdPrefix = useId()
	return (
		<section className={PANEL}>
			<div className='mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
				<h2 className={H2}>Rubric Criteria</h2>
				<div className='flex flex-wrap items-center gap-3'>
					<span className={CHIP_EMERALD}>Event Max Score: {totalEventMaxScore.toFixed(2)}</span>
					<button type='button' onClick={() => onSetAll(true)} className={buttonClassName('admin-outline', 'sm')}>
						Collapse all
					</button>
					<button type='button' onClick={() => onSetAll(false)} className={buttonClassName('admin-outline', 'sm')}>
						Expand all
					</button>
					<button type='button' onClick={addCriterion} className={buttonClassName('admin-outline')}>
						Add Parent Criterion
					</button>
				</div>
			</div>
			<p className={cx(HELP, 'mb-4')}>Choose each criterion scope: Per Contestant (Individual) for member-based questions, or Group Criteria Only for one team-level set of questions.</p>
			{legendLock.on ? (
				<p className={cx(NOTE_BOX, 'mb-4')}>
					Max scores follow the Rubric Legend (top score {formatLegendScore(legendLock.top)}). Turn the legend off to set them yourself.
				</p>
			) : null}

			<div className='space-y-5'>
				{lockedCriteria.map((criterion, criterionIndex) => {
					const parentMaxScore = criterionMaxScore(criterion)
					// Show/hide: the one-line summary stays; the fields fold away (they keep their values).
					const label = criterion.name.trim() || `Parent criterion ${criterionIndex + 1}`
					const collapsed = collapsedIds.has(criterion.id)
					const bodyId = `${foldIdPrefix}-criterion-${criterionIndex}`
					const count = criterion.subCriteria.length

					return (
						<div key={criterion.id} className={WELL}>
							<div className='flex flex-wrap items-center gap-2'>
								<button
									type='button'
									data-testid='criterion-fold'
									aria-expanded={!collapsed}
									aria-controls={bodyId}
									aria-label={`${collapsed ? 'Show' : 'Hide'} ${label}`}
									onClick={() => onToggle(criterion.id)}
									className={buttonClassName('admin-outline', 'xs')}>
									{collapsed ? 'Show' : 'Hide'}
								</button>
								<p data-testid='criterion-summary' className={cx(BODY, 'min-w-0 flex-1 break-words')}>
									<span className='font-semibold'>{label}</span> · {count} {count === 1 ? 'subcriterion' : 'subcriteria'} · Parent Max {parentMaxScore.toFixed(2)} · {criterion.appliesTo === 'individual' ? 'Per Contestant' : 'Group'}
								</p>
							</div>
							<div id={bodyId} hidden={collapsed} className='mt-3'>
							<div className='mb-3 grid gap-2 sm:grid-cols-[1fr_180px_180px_auto]'>
								<input
									value={criterion.name}
									onChange={(event) =>
										updateCriterion(criterion.id, {
											name: event.target.value,
										})
									}
									placeholder={`Parent criterion ${criterionIndex + 1}`}
									className={cx(FIELD, 'px-3 py-2')}
								/>
								<div className={cx(FIELD_STATIC, 'flex items-center')}>Parent Max: {parentMaxScore.toFixed(2)}</div>
								<select
									value={criterion.appliesTo}
									onChange={(event) =>
										updateCriterion(criterion.id, {
											appliesTo: event.target.value as 'group' | 'individual',
										})
									}
									className={cx(FIELD, 'px-3 py-2')}>
									<option value='group'>Apply To: Group Criteria Only</option>
									<option value='individual'>Apply To: Per Contestant (Individual)</option>
								</select>
								{criteria.length > 1 ? (
									<button type='button' onClick={() => removeCriterion(criterion.id)} className={buttonClassName('admin-remove', 'sm')}>
										Remove Parent
									</button>
								) : null}
							</div>
							{criterion.appliesTo === 'individual' ? (
								<p className={cx(HELP, 'mb-3')}>This criterion will be expanded per member and scored per contestant member, even when the event uses Standard Scoring.</p>
							) : (
								<p className={cx(HELP, 'mb-3')}>This criterion will stay as group-only questions (one set for the whole team/entry).</p>
							)}

							<div className='mb-3 flex items-center justify-between'>
								<span className={HELP}>Subcriteria total max score: {parentMaxScore.toFixed(2)}</span>
								<button type='button' onClick={() => addSubCriterion(criterion.id)} className={buttonClassName('admin-outline', 'xs')}>
									Add Subcriterion
								</button>
							</div>

							<div className='space-y-2'>
								{criterion.subCriteria.map((subCriterion, subCriterionIndex) => (
									<div key={subCriterion.id} className={cx(BOX, 'grid gap-2 sm:grid-cols-[1fr_160px_auto]')}>
										<input
											value={subCriterion.name}
											onChange={(event) =>
												updateSubCriterion(criterion.id, subCriterion.id, {
													name: event.target.value,
												})
											}
											placeholder={`Subcriterion ${subCriterionIndex + 1}`}
											className={cx(FIELD, 'px-3 py-2')}
										/>
										<div className='flex flex-col gap-1'>
											<input
												value={subCriterion.maxScore}
												onChange={(event) =>
													updateSubCriterion(criterion.id, subCriterion.id, {
														maxScore: event.target.value,
													})
												}
												readOnly={legendLock.on}
												type='number'
												min={0}
												step='0.01'
												placeholder='Subcriterion max score'
												className={cx(FIELD, 'px-3 py-2', legendLock.on && 'bg-slate-100')}
											/>
											{legendLock.on ? <span className={HELP}>from legend</span> : null}
										</div>
										{criterion.subCriteria.length > 1 ? (
											<button type='button' onClick={() => removeSubCriterion(criterion.id, subCriterion.id)} className={buttonClassName('admin-remove', 'sm')}>
												Remove
											</button>
										) : null}
									</div>
								))}
							</div>
							</div>
						</div>
					)
				})}
			</div>
		</section>
	)
}

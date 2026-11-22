'use client'

import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import Icon from '@/components/ui/icon'
import { criterionMaxScore } from '@/lib/admin/analytics'
import { formatDate, formatScore } from '@/lib/admin/format'
import { isIndividualPresentationCriterion, mergedIndividualSubCriteriaForContestant } from '@/lib/admin/members'
import type { RemarkItem } from '@/lib/admin/observations-log'
import type { ProgramLabel } from '@/lib/admin/program'
import type { EventContestant, EventCriterion, RubricLegendItem } from '@/lib/types'
import { cx } from '@/lib/ui/cx'

export interface TelemetryJudge {
	id: string
	name: string
	/** Present only while this browser is unlocked (S5). */
	token?: string
	/** The judge has saved at least one entry. */
	saved: boolean
	submittedAt?: string
	progress: { saved: number; assigned: number }
}

const ENTRY_BADGE: Record<ProgramLabel, BadgeVariant> = { BSINT: 'admin-remark-sky', BSCS: 'admin-remark-emerald' }

/** The legend tiles' figure colours, best score first (A955 to A971): emerald, sky, slate, muted, and rose for 0. */
function legendTone(item: RubricLegendItem, index: number): string {
	if (item.score === 0) return 'text-rose-600'
	return ['text-emerald-700', 'text-sky-700', 'text-slate-700'][index] ?? 'text-slate-500'
}

/**
 * Judge Telemetry (spec 2.3): the judge links full width (R53: judge-links, one judge-link-row per judge with its
 * status dot, "Submitted …", the link and Copy while unlocked, and judge-progress), then the rubric beside the
 * remarks (remark-item, remarks-count, export-observations). Data and callbacks only.
 */
export function TelemetryTab({
	judges,
	locked,
	baseUrl,
	copiedLink,
	onCopy,
	onUnlock,
	isDirect,
	legend,
	criteria,
	contestants,
	remarks,
	programOf,
	onExportObservations,
}: {
	judges: TelemetryJudge[]
	locked: boolean
	baseUrl: string
	copiedLink: string | null
	onCopy: (value: string) => void
	onUnlock: () => void
	isDirect: boolean
	legend: RubricLegendItem[]
	criteria: EventCriterion[]
	contestants: EventContestant[]
	remarks: RemarkItem[]
	programOf: (contestantId: string) => ProgramLabel | null
	onExportObservations: () => void
}) {
	return (
		<>
			<Card variant='admin-panel' as='section' data-testid='judge-links' data-locked={locked ? 'true' : 'false'} aria-labelledby='judge-links-heading' className='w-full'>
				<div className='flex flex-wrap items-center justify-between gap-space-sm mb-space-sm'>
					<div className='flex items-center gap-space-xs'>
						<Icon name='admin_panel_settings' className='text-sky-600 text-[22px]' />
						<h2 id='judge-links-heading' className='font-headline-sm text-headline-sm text-slate-900 font-bold'>
							Judge links
						</h2>
					</div>
					{locked ? (
						<Button variant='admin-primary' icon='lock' data-testid='unlock-judge-links' onClick={onUnlock}>
							Unlock judge links
						</Button>
					) : null}
				</div>
				<p className='font-body-sm text-body-sm text-slate-600 mb-space-md'>
					{locked ? 'Each judge’s progress. Their scoring links show once this browser is unlocked with the update password.' : 'Each judge’s scoring link and progress.'}
				</p>
				<div className='flex flex-col gap-space-sm'>
					{judges.map((judge) => {
						const judgePath = judge.token ? `/judge/${judge.token}` : null
						const fullUrl = judgePath ? (baseUrl ? `${baseUrl}${judgePath}` : judgePath) : null
						const copyValue = judgePath ? (baseUrl || typeof window === 'undefined' ? fullUrl! : `${window.location.origin}${judgePath}`) : null
						const percent = judge.progress.assigned > 0 ? Math.round((judge.progress.saved * 100) / judge.progress.assigned) : 0
						return (
							<Card key={judge.id} variant='admin-inset-row' data-testid='judge-link-row' data-judge-id={judge.id}>
								<div className='min-w-0'>
									<div className='flex flex-wrap items-center gap-space-xs'>
										<span aria-hidden className={cx('w-2 h-2 rounded-full', judge.saved ? 'bg-emerald-500' : 'bg-amber-500')} />
										<span className='font-label-md text-label-md text-slate-900 font-bold'>{judge.name}</span>
										<span className='font-label-sm text-label-sm text-slate-500'>{judge.submittedAt ? `Submitted ${formatDate(judge.submittedAt)}` : 'No saves yet'}</span>
									</div>
									<div className='flex items-center gap-space-xs mt-1 min-w-0'>
										{locked || !fullUrl ? (
											<span className='font-body-sm text-body-sm text-slate-500'>Link hidden until unlocked</span>
										) : (
											<>
												<a href={fullUrl} className='font-mono text-body-sm text-slate-500 truncate max-w-xs sm:max-w-md hover:text-slate-900 underline-offset-2 hover:underline'>
													{fullUrl}
												</a>
												<Button variant='admin-link-sky' size='xs' icon='content_copy' onClick={() => copyValue && onCopy(copyValue)}>
													{copiedLink === copyValue ? 'Copied' : 'Copy'}
												</Button>
											</>
										)}
									</div>
								</div>
								<div data-testid='judge-progress' data-saved={judge.progress.saved} data-assigned={judge.progress.assigned} className='flex items-center justify-between sm:justify-end gap-space-md shrink-0'>
									<div className='text-right'>
										<span className='font-label-sm text-label-sm text-slate-500 block'>Progress</span>
										<span className='font-label-md text-label-md text-slate-900 font-mono font-bold'>
											{judge.progress.saved} / {judge.progress.assigned} saved
										</span>
									</div>
									<Badge variant={percent >= 100 ? 'admin-progress-emerald' : 'admin-progress-sky'}>{percent}%</Badge>
								</div>
							</Card>
						)
					})}
				</div>
			</Card>

			<div className='grid grid-cols-1 lg:grid-cols-2 gap-space-lg items-start'>
				<Card variant='admin-panel' as='section' aria-labelledby='rubric-heading'>
					<div className='flex items-center gap-space-xs mb-space-sm pb-space-xs border-b border-slate-100'>
						<Icon name='grading' className='text-emerald-600 text-[20px]' />
						<h2 id='rubric-heading' className='font-headline-sm text-headline-sm text-slate-900 font-bold'>
							Rubric
						</h2>
					</div>
					{!isDirect && legend.length > 0 ? (
						<Card variant='admin-inset' className='mb-space-md'>
							<span className='font-label-sm text-label-sm text-slate-500 uppercase font-bold tracking-wider block mb-space-xs'>Score legend</span>
							<div className='grid grid-cols-[repeat(auto-fit,minmax(4.5rem,1fr))] gap-1 text-center font-label-sm text-label-sm'>
								{legend.map((item, index) => (
									<Card key={`${item.score}-${index}`} variant='admin-legend-cell'>
										<span className={cx('font-mono font-bold', legendTone(item, index))}>{item.score}</span>
										<span className={cx('block truncate', item.score === 0 ? 'text-rose-600' : 'text-slate-800')} title={item.label}>
											{item.label}
										</span>
									</Card>
								))}
							</div>
						</Card>
					) : null}
					<div className='flex flex-col gap-space-md'>
						{criteria.map((criterion) => {
							const perEntry = isIndividualPresentationCriterion(criterion)
							return (
								<div key={criterion.id}>
									<div className='flex flex-wrap justify-between items-center gap-x-space-sm mb-space-xxs'>
										<span className='font-label-md text-label-md text-slate-900 font-bold'>{criterion.name}</span>
										<span className='font-mono text-emerald-700 font-bold text-label-md'>{formatScore(criterionMaxScore(criterion))} max</span>
									</div>
									<span className='font-label-sm text-label-sm text-slate-500 block mb-1'>{perEntry ? 'Per contestant (individual)' : 'Group criteria only'}</span>
									{perEntry ? (
										<div className='flex flex-col gap-space-xs'>
											{contestants.map((contestant) => (
												<Card key={contestant.id} variant='admin-inset' className='text-label-sm font-label-sm space-y-1'>
													<span className='block font-semibold text-slate-700 uppercase tracking-wider'>{contestant.name}</span>
													{mergedIndividualSubCriteriaForContestant(criterion, contestant).map((item) => (
														<div key={item.id} className='flex justify-between gap-space-sm text-slate-700'>
															<span>{item.name}</span>
															<span className='font-mono font-semibold text-slate-900'>{formatScore(item.maxScore)}</span>
														</div>
													))}
												</Card>
											))}
										</div>
									) : (
										<Card variant='admin-inset' className='text-label-sm font-label-sm space-y-1'>
											{criterion.subCriteria.map((subCriterion) => (
												<div key={subCriterion.id} className='flex justify-between gap-space-sm text-slate-700'>
													<span>{subCriterion.name}</span>
													<span className='font-mono font-semibold text-slate-900'>{formatScore(subCriterion.maxScore)}</span>
												</div>
											))}
										</Card>
									)}
								</div>
							)
						})}
					</div>
				</Card>

				<Card variant='admin-panel' as='section' aria-labelledby='remarks-heading' className='flex flex-col'>
					<div className='flex items-center justify-between gap-space-sm mb-space-sm pb-space-xs border-b border-slate-100'>
						<div className='flex items-center gap-space-xs'>
							<Icon name='rate_review' className='text-sky-600 text-[20px]' />
							<h2 id='remarks-heading' className='font-headline-sm text-headline-sm text-slate-900 font-bold'>
								Remarks
							</h2>
						</div>
						<span data-testid='remarks-count' data-count={remarks.length} className='font-label-sm text-label-sm text-slate-500 font-mono'>
							{remarks.length} {remarks.length === 1 ? 'remark' : 'remarks'}
						</span>
					</div>
					<p className='font-body-sm text-body-sm text-slate-600 mb-space-md'>Remarks the judges saved with their scores.</p>
					{remarks.length === 0 ? (
						<p className='font-body-sm text-body-sm text-slate-500'>No remarks yet.</p>
					) : (
						<ul className='space-y-space-sm overflow-y-auto max-h-[480px] pr-1'>
							{remarks.map((item, index) => {
								const program = programOf(item.contestantId)
								return (
									<li key={`${item.judgeId}-${item.contestantId}-${item.label}-${index}`} data-testid='remark-item' data-judge-id={item.judgeId} data-contestant-id={item.contestantId} className='p-space-sm rounded-lg bg-slate-50 border border-slate-200'>
										<span className='font-label-md text-label-md text-slate-900 font-bold block mb-1'>{item.judgeName}</span>
										<div className='flex flex-wrap items-center gap-1.5 mb-1.5'>
											<Badge variant={program ? ENTRY_BADGE[program] : 'admin-topic-neutral'}>{item.contestantName}</Badge>
											<span className='font-label-sm text-label-sm text-slate-600'>{item.label}</span>
										</div>
										<p className='font-body-sm text-body-sm text-slate-700 whitespace-pre-line break-words'>{item.text}</p>
									</li>
								)
							})}
						</ul>
					)}
					<div className='mt-space-md pt-space-sm border-t border-slate-100 flex items-center justify-between gap-space-sm'>
						<Button variant='admin-link' size='xs' icon='download' data-testid='export-observations' onClick={onExportObservations}>
							Export observations log (.txt)
						</Button>
					</div>
				</Card>
			</div>
		</>
	)
}

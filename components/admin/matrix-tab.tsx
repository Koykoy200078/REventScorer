'use client'

import { useEffect, useRef, useState } from 'react'

import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeaderCell, DataTableRow } from '@/components/ui/data-table'
import Icon from '@/components/ui/icon'
import { Pagination } from '@/components/ui/pagination'
import { ProgressBar, type ProgressTone } from '@/components/ui/progress-bar'
import { SearchInput } from '@/components/ui/search-input'
import { Select } from '@/components/ui/select'
import { formatPercent, formatScore } from '@/lib/admin/format'
import type { ScoringKind } from '@/lib/admin/formula'
import { ALL_OPTION, filterEntries, MATRIX_PAGE_SIZE, type MatrixEntry, paginate } from '@/lib/admin/matrix'
import type { ProgramLabel } from '@/lib/admin/program'
import { type EntryStatus, type EntryStatusKind, entryStatusLabel } from '@/lib/admin/status'
import type { EventCompiledResults } from '@/lib/types'
import { cx } from '@/lib/ui/cx'

type Ranking = EventCompiledResults['rankings'][number]

export interface MatrixJudgeChip {
	id: string
	name: string
	scored: boolean
	/** The judge's total for the entry (their final rating on direct events); null when not scored. */
	total: number | null
}

export interface MatrixRow {
	result: Ranking
	entry: MatrixEntry
	status: EntryStatus
	section?: string
	isIndividual: boolean
	/** The judges assigned to the entry, in the event's judge order. */
	judges: MatrixJudgeChip[]
}

export interface MatrixView {
	query: string
	tracks: Record<ProgramLabel, boolean>
	status: 'all' | EntryStatusKind
	strand: string
	remark: string
	page: number
	showAll: boolean
	/** Rows shown whatever the filters until the next filter change (a program just toggled, R49). */
	keep: string[]
}

export const INITIAL_MATRIX_VIEW: MatrixView = { query: '', tracks: { BSINT: true, BSCS: true }, status: 'all', strand: ALL_OPTION, remark: ALL_OPTION, page: 1, showAll: false, keep: [] }

export type MatrixFilterPatch = Partial<Pick<MatrixView, 'query' | 'tracks' | 'status' | 'strand' | 'remark'>>

const STATUS_OPTIONS: Array<{ value: 'all' | EntryStatusKind; label: string }> = [
	{ value: 'all', label: 'All' },
	{ value: 'complete', label: 'Complete' },
	{ value: 'in-progress', label: 'In progress' },
	{ value: 'pending', label: 'Pending' },
	{ value: 'no-judge', label: 'No judge assigned' },
]

const STATUS_BAR: Record<EntryStatusKind, ProgressTone> = { complete: 'emerald', 'in-progress': 'amber', pending: 'slate', 'no-judge': 'slate' }
const STATUS_TEXT: Record<EntryStatusKind, string> = { complete: 'text-emerald-700', 'in-progress': 'text-amber-800', pending: 'text-slate-600', 'no-judge': 'text-rose-700' }
const PROGRAM_TEXT: Record<ProgramLabel, string> = { BSINT: 'text-sky-700', BSCS: 'text-emerald-700' }
const CHECKBOX: Record<ProgramLabel, string> = { BSINT: 'accent-sky-600 rounded', BSCS: 'accent-emerald-600 rounded' }

const FIGURE = 'font-label-md text-label-md text-slate-900 font-mono font-bold block'
const HEADLINE_FIGURE = 'font-score-display text-[1.5rem] leading-none text-emerald-700 font-mono font-bold block'
const CAPTION = 'font-label-sm text-label-sm text-slate-500 block mt-1'
const TEXT_CELL = 'font-body-sm text-body-sm text-slate-700 max-w-[14rem] break-words'
const NOT_SCORED = 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-50 text-slate-600 border border-slate-200 font-label-sm text-label-sm font-medium'

function rankBadge(result: Ranking): BadgeVariant {
	if (result.judgeCount === 0) return 'admin-rank-circle-pending'
	return result.rank <= 3 ? 'admin-rank-circle-emerald' : 'admin-rank-circle'
}

function Dash() {
	return <span className='text-slate-400'>—</span>
}

/**
 * The Score Audit Matrix (spec 2.2): search, track, status (and, for direct events, exact strand and remark)
 * filters, pages of 10 or every row, one row per entry with its figures (data-col on the bare figure), status
 * (R47), the row detail with participant pills, judge chips and Edit Judge (R50), and Breakdown (R51).
 * Data and callbacks only: the container keeps the view, the drafts and the saves.
 */
export function MatrixTab({
	kind,
	rows,
	view,
	onFilterChange,
	onPageChange,
	onShowAllChange,
	strandOptions,
	remarkOptions,
	entryMaxOf,
	everyProgram,
	savingPrograms,
	onToggleProgram,
	onSetEveryProgram,
	judges,
	swapOpenId,
	swapDraft,
	swapSavingId,
	onOpenSwap,
	onCancelSwap,
	onToggleSwapJudge,
	onSaveSwap,
	onBreakdown,
}: {
	kind: ScoringKind
	rows: MatrixRow[]
	view: MatrixView
	onFilterChange: (patch: MatrixFilterPatch) => void
	onPageChange: (page: number) => void
	onShowAllChange: (showAll: boolean) => void
	strandOptions: string[]
	remarkOptions: string[]
	/** The most one judge can give an entry (its own member rows, B65). */
	entryMaxOf: (contestantId: string) => number
	everyProgram: Record<ProgramLabel, boolean>
	savingPrograms: boolean
	onToggleProgram: (contestantId: string, program: ProgramLabel) => void
	onSetEveryProgram: (program: ProgramLabel | null) => void
	judges: Array<{ id: string; name: string }>
	swapOpenId: string | null
	swapDraft: string[] | null
	swapSavingId: string | null
	onOpenSwap: (contestantId: string) => void
	onCancelSwap: (contestantId: string) => void
	onToggleSwapJudge: (contestantId: string, judgeId: string) => void
	onSaveSwap: (contestantId: string) => void
	onBreakdown: (contestantId: string) => void
}) {
	// A judge who has scored the open entry is removed only after a yes (owner, 2026-11-21): asked when they are unticked,
	// and again at Save for a judge who has scored since the untick (a live refresh keeps the draft). `atSave` questions
	// continue the save after a yes; "Keep judge" ticks the judge again.
	const [pendingRemoval, setPendingRemoval] = useState<{ contestantId: string; judgeId: string; atSave: boolean } | null>(null)
	const [confirmedRemovals, setConfirmedRemovals] = useState<{ contestantId: string; judgeIds: string[] } | null>(null)
	const confirmedFor = (contestantId: string) => (confirmedRemovals?.contestantId === contestantId ? confirmedRemovals.judgeIds : [])
	const unconfirmedScoredRemoval = (row: MatrixRow, confirmed: string[]) => {
		const draft = swapDraft ?? row.judges.map((judge) => judge.id)
		return row.judges.find((judge) => judge.scored && !draft.includes(judge.id) && !confirmed.includes(judge.id))
	}
	const answerRemoval = (remove: boolean) => {
		if (!pendingRemoval) return
		const { contestantId, judgeId, atSave } = pendingRemoval
		setPendingRemoval(null)
		if (!remove) {
			if (atSave) onToggleSwapJudge(contestantId, judgeId)
			return
		}
		const confirmed = [...confirmedFor(contestantId), judgeId]
		setConfirmedRemovals({ contestantId, judgeIds: confirmed })
		if (!atSave) {
			onToggleSwapJudge(contestantId, judgeId)
			return
		}
		const row = rows.find((item) => item.result.contestantId === contestantId)
		const next = row ? unconfirmedScoredRemoval(row, confirmed) : undefined
		if (next) setPendingRemoval({ contestantId, judgeId: next.id, atSave: true })
		else onSaveSwap(contestantId)
	}

	const keep = new Set(view.keep)
	const filtered = filterEntries(
		rows.map((row) => ({ ...row.entry, row })),
		{ query: view.query, tracks: view.tracks, status: view.status, strand: view.strand, remark: view.remark },
		keep,
	)
	const shown = paginate(filtered, view.page, view.showAll ? 'all' : MATRIX_PAGE_SIZE)
	const columns = 6 + (kind === 'weighted' ? 5 : kind === 'direct' ? 8 : 2)

	return (
		<Card variant='admin-flush' as='section' aria-labelledby='matrix-heading' className='flex flex-col'>
			<div className='p-space-lg bg-slate-50/70 border-b border-slate-200 flex flex-col gap-space-md'>
				<div>
					<h2 id='matrix-heading' className='font-headline-md text-headline-md text-slate-900 font-bold'>
						Score matrix
					</h2>
					<p className='font-body-sm text-body-sm text-slate-600 mt-0.5'>Every entry with its figures, the judges who scored it and its status. Export CSV exports every entry, whatever the filters.</p>
				</div>
				<div className='flex flex-col xl:flex-row xl:items-center justify-between gap-space-md'>
					<SearchInput
						data-testid='matrix-search'
						value={view.query}
						onValueChange={(query) => onFilterChange({ query })}
						label='Search entries, sections and participants'
						placeholder='Search an entry, section or participant…'
						wrapperClassName='flex-1 min-w-[16rem] max-w-md'
					/>
					<div className='flex flex-wrap items-center gap-space-md'>
						<div className='flex items-center gap-space-sm bg-white border border-slate-200 px-space-md py-1.5 rounded-lg shadow-2xs' role='group' aria-label='Show programs'>
							<span className='font-label-sm text-label-sm text-slate-500 uppercase font-semibold'>Show</span>
							{(['BSINT', 'BSCS'] as const).map((program) => (
								<label key={program} className='flex items-center gap-1.5 font-label-md text-label-md text-slate-800 cursor-pointer'>
									<input
										type='checkbox'
										data-testid='matrix-track'
										data-program={program}
										className={CHECKBOX[program]}
										checked={view.tracks[program]}
										onChange={(event) => onFilterChange({ tracks: { ...view.tracks, [program]: event.target.checked } })}
									/>
									<span className={cx('font-semibold', PROGRAM_TEXT[program])}>{program}</span>
								</label>
							))}
						</div>
						<Select label='Status' data-testid='matrix-status' value={view.status} onChange={(event) => onFilterChange({ status: event.target.value as MatrixView['status'] })}>
							{STATUS_OPTIONS.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</Select>
						{kind === 'direct' && strandOptions.length > 0 ? (
							<Select label='Strand' className='max-w-[14rem]' value={view.strand} onChange={(event) => onFilterChange({ strand: event.target.value })}>
								<option value={ALL_OPTION}>All</option>
								{strandOptions.map((strand) => (
									<option key={strand} value={strand}>
										{strand}
									</option>
								))}
							</Select>
						) : null}
						{kind === 'direct' && remarkOptions.length > 0 ? (
							<Select label='Remark' className='max-w-[14rem]' value={view.remark} onChange={(event) => onFilterChange({ remark: event.target.value })}>
								<option value={ALL_OPTION}>All</option>
								{remarkOptions.map((remark) => (
									<option key={remark} value={remark}>
										{remark}
									</option>
								))}
							</Select>
						) : null}
					</div>
				</div>
			</div>

			<DataTable caption='Score matrix'>
				<DataTableHead>
					<DataTableHeaderCell align='center' className='w-16'>
						Rank
					</DataTableHeaderCell>
					<DataTableHeaderCell className='min-w-[280px]'>Entry</DataTableHeaderCell>
					<DataTableHeaderCell className='w-40'>
						<span className='block'>Program</span>
						<span className='mt-1 flex flex-wrap items-center gap-x-space-sm gap-y-0.5 normal-case tracking-normal font-normal text-slate-500'>
							<span>Set every entry&apos;s program:</span>
							{(['BSINT', 'BSCS'] as const).map((program) => (
								<label key={program} className='flex items-center gap-1 cursor-pointer'>
									<input
										type='checkbox'
										data-testid='program-all'
										data-program={program}
										className={cx(CHECKBOX[program], 'disabled:cursor-not-allowed')}
										checked={everyProgram[program]}
										disabled={savingPrograms}
										onChange={(event) => onSetEveryProgram(event.target.checked ? program : null)}
									/>
									<span className={PROGRAM_TEXT[program]}>All {program}</span>
								</label>
							))}
						</span>
					</DataTableHeaderCell>
					{kind === 'weighted' ? (
						<>
							<DataTableHeaderCell align='right'>Group score</DataTableHeaderCell>
							<DataTableHeaderCell align='right'>Group rating</DataTableHeaderCell>
							<DataTableHeaderCell align='right'>Individual score</DataTableHeaderCell>
							<DataTableHeaderCell align='right'>Individual rating</DataTableHeaderCell>
							<DataTableHeaderCell align='right'>Weighted</DataTableHeaderCell>
						</>
					) : kind === 'direct' ? (
						<>
							<DataTableHeaderCell align='right'>AVE/GPA</DataTableHeaderCell>
							<DataTableHeaderCell align='right'>NOAT</DataTableHeaderCell>
							<DataTableHeaderCell align='right'>Interview</DataTableHeaderCell>
							<DataTableHeaderCell align='right'>Final</DataTableHeaderCell>
							<DataTableHeaderCell align='right'>Total</DataTableHeaderCell>
							<DataTableHeaderCell>Strand</DataTableHeaderCell>
							<DataTableHeaderCell>Remark</DataTableHeaderCell>
							<DataTableHeaderCell>Additional remark</DataTableHeaderCell>
						</>
					) : (
						<>
							<DataTableHeaderCell align='right' className='w-36'>
								Average
							</DataTableHeaderCell>
							<DataTableHeaderCell align='right' className='w-36'>
								Total
							</DataTableHeaderCell>
						</>
					)}
					<DataTableHeaderCell align='center'>Judges</DataTableHeaderCell>
					<DataTableHeaderCell className='min-w-[180px]'>Status</DataTableHeaderCell>
					<DataTableHeaderCell align='center' className='w-32'>
						Actions
					</DataTableHeaderCell>
				</DataTableHead>
				<DataTableBody>
					{shown.items.length === 0 ? (
						<DataTableRow>
							<DataTableCell colSpan={columns} className='text-slate-500'>
								No entries match the filters.
							</DataTableCell>
						</DataTableRow>
					) : (
						shown.items.map(({ row }) => (
							<MatrixTableRow
								key={row.result.contestantId}
								row={row}
								kind={kind}
								entryMaxOf={entryMaxOf}
								savingPrograms={savingPrograms}
								onToggleProgram={onToggleProgram}
								judges={judges}
								swapOpen={swapOpenId === row.result.contestantId}
								swapDraft={swapOpenId === row.result.contestantId ? swapDraft : null}
								swapSaving={swapSavingId === row.result.contestantId}
								pendingRemovalJudgeId={pendingRemoval?.contestantId === row.result.contestantId ? pendingRemoval.judgeId : null}
								onAskRemoval={(judgeId) => setPendingRemoval({ contestantId: row.result.contestantId, judgeId, atSave: false })}
								onAnswerRemoval={answerRemoval}
								onOpenSwap={() => {
									setPendingRemoval(null)
									setConfirmedRemovals(null)
									if (swapOpenId === row.result.contestantId) onCancelSwap(row.result.contestantId)
									else onOpenSwap(row.result.contestantId)
								}}
								onCancelSwap={() => {
									setPendingRemoval(null)
									setConfirmedRemovals(null)
									onCancelSwap(row.result.contestantId)
								}}
								onToggleSwapJudge={(judgeId) => onToggleSwapJudge(row.result.contestantId, judgeId)}
								onSaveSwap={() => {
									const next = unconfirmedScoredRemoval(row, confirmedFor(row.result.contestantId))
									if (next) setPendingRemoval({ contestantId: row.result.contestantId, judgeId: next.id, atSave: true })
									else onSaveSwap(row.result.contestantId)
								}}
								onBreakdown={() => onBreakdown(row.result.contestantId)}
							/>
						))
					)}
				</DataTableBody>
			</DataTable>

			<Pagination
				total={filtered.length}
				page={shown.page}
				pageSize={view.showAll ? 0 : MATRIX_PAGE_SIZE}
				onPageChange={onPageChange}
				previousLabel='Previous'
				nextLabel='Next'
				navLabel='Matrix pages'
				pageLabel={(page) => `Page ${page}`}
				hooks={{ previous: 'matrix-prev', next: 'matrix-next', page: 'matrix-page' }}
				summary={
					<span className='flex flex-wrap items-center gap-space-sm'>
						<span data-testid='matrix-count'>
							Showing {shown.from}-{shown.to} of {shown.total}
						</span>
						<button
							type='button'
							data-testid='matrix-show-all'
							aria-pressed={view.showAll}
							onClick={() => onShowAllChange(!view.showAll)}
							className='px-space-sm py-1 rounded bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 aria-pressed:bg-emerald-50 aria-pressed:border-emerald-200 aria-pressed:text-emerald-800 font-semibold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary'
						>
							Show all
						</button>
					</span>
				}
			/>
		</Card>
	)
}

function MatrixTableRow({
	row,
	kind,
	entryMaxOf,
	savingPrograms,
	onToggleProgram,
	judges,
	swapOpen,
	swapDraft,
	swapSaving,
	pendingRemovalJudgeId,
	onAskRemoval,
	onAnswerRemoval,
	onOpenSwap,
	onCancelSwap,
	onToggleSwapJudge,
	onSaveSwap,
	onBreakdown,
}: {
	row: MatrixRow
	kind: ScoringKind
	/** The most one judge can give an entry (its own member rows, B65). */
	entryMaxOf: (contestantId: string) => number
	savingPrograms: boolean
	onToggleProgram: (contestantId: string, program: ProgramLabel) => void
	judges: Array<{ id: string; name: string }>
	swapOpen: boolean
	swapDraft: string[] | null
	swapSaving: boolean
	pendingRemovalJudgeId: string | null
	onAskRemoval: (judgeId: string) => void
	onAnswerRemoval: (remove: boolean) => void
	onOpenSwap: () => void
	onCancelSwap: () => void
	onToggleSwapJudge: (judgeId: string) => void
	onSaveSwap: () => void
	onBreakdown: () => void
}) {
	const { result, entry, status } = row
	const id = result.contestantId
	const draft = swapDraft ?? row.judges.map((judge) => judge.id)
	const assignedIds = row.judges.map((judge) => judge.id)
	const changed = draft.length !== assignedIds.length || draft.some((judgeId) => !assignedIds.includes(judgeId))
	const scoredIds = new Set(row.judges.filter((judge) => judge.scored).map((judge) => judge.id))
	const pendingName = pendingRemovalJudgeId ? (judges.find((judge) => judge.id === pendingRemovalJudgeId)?.name ?? 'This judge') : null
	// B72: Save, Cancel and the removal question unmount the button that was pressed; the focus goes back to Edit
	// Judge when the swap closes, and to that judge's box when the question is answered.
	const editJudgeRef = useRef<HTMLButtonElement>(null)
	const swapRef = useRef<HTMLDivElement>(null)
	const wasOpen = useRef(swapOpen)
	useEffect(() => {
		if (wasOpen.current && !swapOpen && (document.activeElement === null || document.activeElement === document.body)) editJudgeRef.current?.focus()
		wasOpen.current = swapOpen
	}, [swapOpen])
	const answerRemoval = (remove: boolean) => {
		const judgeId = pendingRemovalJudgeId
		onAnswerRemoval(remove)
		requestAnimationFrame(() => {
			if (document.activeElement !== null && document.activeElement !== document.body) return
			swapRef.current?.querySelector<HTMLInputElement>(`[data-testid="judge-swap-option"][data-judge-id="${judgeId}"]`)?.focus()
		})
	}
	const percent = status.assigned > 0 ? (status.saved * 100) / status.assigned : 0

	return (
		<DataTableRow data-testid='ranking-row' data-contestant-id={id} data-rank={result.rank}>
			<DataTableCell align='center'>
				<Badge variant={rankBadge(result)}>{result.rank}</Badge>
			</DataTableCell>
			<DataTableCell rowHeader>
				<div className='flex flex-wrap items-center gap-space-xs'>
					<span className='font-headline-sm text-headline-sm text-slate-900 font-bold'>{result.contestantName}</span>
					{row.section ? <Badge variant='admin-topic-neutral'>{row.section}</Badge> : null}
					{row.isIndividual ? <Badge variant='admin-topic-sky'>Individual</Badge> : null}
				</div>
				<div data-testid='ranking-detail' data-contestant-id={id} className='mt-space-xs flex flex-col gap-space-sm'>
					{result.participantScores && result.participantScores.length > 0 ? (
						<div className='flex flex-wrap items-center gap-1.5'>
							{result.participantScores.map((participant, index) => {
								const rating = typeof participant.rating === 'number' ? participant.rating : participant.maxScore > 0 ? (participant.averageScore / participant.maxScore) * 100 : 0
								return (
									<Badge key={`${participant.participantLabel}-${index}`} variant='admin-score'>
										{participant.participantLabel}: {formatScore(participant.averageScore)} / {formatScore(participant.maxScore)} ({formatPercent(rating)})
									</Badge>
								)
							})}
						</div>
					) : null}
					<div className='flex flex-wrap items-center gap-space-xs'>
						<span className='font-label-sm text-label-sm text-slate-500'>Judges:</span>
						{row.judges.length === 0 ? <span className='font-label-sm text-label-sm text-rose-700'>none assigned</span> : null}
						{row.judges.map((judge) => (
							<span
								key={judge.id}
								data-testid='assigned-judge'
								data-judge-id={judge.id}
								data-scored={judge.scored ? 'true' : 'false'}
								className={judge.scored ? 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-label-sm text-label-sm font-medium' : NOT_SCORED}
							>
								{judge.scored ? `${judge.name} ✓ ${judge.total === null ? '' : formatScore(judge.total)}`.trim() : `${judge.name} · not scored`}
							</span>
						))}
						<Button ref={editJudgeRef} variant='admin-link-inline' size='xs' icon='edit' data-testid='edit-judge' data-contestant-id={id} aria-expanded={swapOpen} onClick={onOpenSwap}>
							Edit Judge
						</Button>
					</div>
					{swapOpen ? (
						<div ref={swapRef} data-testid='judge-swap' className='rounded-lg border border-slate-200 bg-slate-50 p-space-sm flex flex-col gap-space-sm max-w-xl'>
							<span className='font-label-sm text-label-sm text-slate-500 uppercase font-bold tracking-wider'>Judges for this entry</span>
							<div className='flex flex-wrap gap-space-xs'>
								{judges.map((judge) => {
									const checked = draft.includes(judge.id)
									return (
										<label key={judge.id} className='flex items-center gap-1.5 px-space-sm py-1 rounded bg-white border border-slate-200 font-label-md text-label-md text-slate-800 cursor-pointer'>
											<input
												type='checkbox'
												data-testid='judge-swap-option'
												data-judge-id={judge.id}
												className='accent-emerald-600 rounded'
												checked={checked}
												disabled={swapSaving}
												onChange={() => {
													if (checked && draft.length <= 1) return // an entry keeps at least one judge
													if (checked && scoredIds.has(judge.id)) onAskRemoval(judge.id)
													else onToggleSwapJudge(judge.id)
												}}
											/>
											{judge.name}
										</label>
									)
								})}
							</div>
							<p className='font-label-sm text-label-sm text-slate-500'>An entry keeps at least one judge.</p>
							{pendingName ? (
								<div data-testid='judge-removal-confirm' role='alert' className='rounded-lg border border-amber-300 bg-amber-50 p-space-sm flex flex-col gap-space-xs'>
									<p className='flex items-start gap-space-xs font-body-sm text-body-sm text-amber-900'>
										<Icon name='warning' className='text-[16px] text-amber-600 mt-0.5' />
										<span>{pendingName} has already scored this entry; removing them drops that score from the results.</span>
									</p>
									<div className='flex flex-wrap gap-space-xs'>
										<Button variant='admin-primary' size='xs' data-testid='judge-removal-accept' onClick={() => answerRemoval(true)}>
											Remove judge
										</Button>
										<Button variant='admin-outline' size='xs' data-testid='judge-removal-cancel' onClick={() => answerRemoval(false)}>
											Keep judge
										</Button>
									</div>
								</div>
							) : null}
							<div className='flex flex-wrap gap-space-xs'>
								<Button variant='admin-primary' size='xs' data-testid='judge-swap-save' disabled={!changed || swapSaving || pendingName !== null} onClick={onSaveSwap}>
									{swapSaving ? 'Saving…' : 'Save judges'}
								</Button>
								<Button variant='admin-outline' size='xs' disabled={swapSaving} onClick={onCancelSwap}>
									Cancel
								</Button>
							</div>
						</div>
					) : null}
				</div>
			</DataTableCell>
			<DataTableCell>
				<div className='flex flex-col gap-1'>
					{(['BSINT', 'BSCS'] as const).map((program) => (
						<label key={program} className='flex items-center gap-1.5 font-label-md text-label-md cursor-pointer'>
							<input
								type='checkbox'
								data-testid='program-toggle'
								data-contestant-id={id}
								data-program={program}
								className={cx(CHECKBOX[program], 'disabled:cursor-not-allowed')}
								checked={entry.program === program}
								disabled={savingPrograms}
								onChange={() => onToggleProgram(id, program)}
							/>
							<span className={cx('font-semibold', PROGRAM_TEXT[program])}>{program}</span>
						</label>
					))}
				</div>
			</DataTableCell>
			{kind === 'weighted' ? (
				<>
					<DataTableCell align='right'>
						<span className={FIGURE}>{formatScore(result.groupAverageScore ?? 0)}</span>
					</DataTableCell>
					<DataTableCell align='right'>
						<span className={FIGURE}>{formatPercent(result.groupRating ?? 0)}</span>
					</DataTableCell>
					<DataTableCell align='right'>
						<span className={FIGURE}>{formatScore(result.individualAverageScore ?? 0)}</span>
					</DataTableCell>
					<DataTableCell align='right'>
						<span className={FIGURE}>{formatPercent(result.individualRating ?? 0)}</span>
					</DataTableCell>
					<DataTableCell align='right'>
						<span data-col='weighted' className={HEADLINE_FIGURE}>
							{formatScore(result.weightedScore ?? result.averageScore)}
						</span>
						<span className={CAPTION}>Final score</span>
					</DataTableCell>
				</>
			) : kind === 'direct' ? (
				<>
					<DataTableCell align='right'>
						<span className={FIGURE}>{formatScore(result.directDetails?.aveGpa ?? 0)}</span>
					</DataTableCell>
					<DataTableCell align='right'>
						<span className={FIGURE}>{formatScore(result.directDetails?.noat ?? 0)}</span>
					</DataTableCell>
					<DataTableCell align='right'>
						<span className={FIGURE}>{formatScore(result.directDetails?.totalInterview ?? 0)}</span>
					</DataTableCell>
					<DataTableCell align='right'>
						<span data-col='final' className={HEADLINE_FIGURE}>
							{formatScore(result.finalRating ?? result.averageScore)}
						</span>
						<span className={CAPTION}>/ 100</span>
					</DataTableCell>
					<DataTableCell align='right'>
						<span data-col='total' className={FIGURE}>
							{formatScore(result.totalScore)}
						</span>
					</DataTableCell>
					<DataTableCell className={TEXT_CELL}>{result.directDetails?.strand || <Dash />}</DataTableCell>
					<DataTableCell className={TEXT_CELL}>{result.directDetails?.remark || <Dash />}</DataTableCell>
					<DataTableCell className={TEXT_CELL}>{result.directDetails?.additionalInfo || <Dash />}</DataTableCell>
				</>
			) : (
				<>
					<DataTableCell align='right'>
						<span data-col='average' className={HEADLINE_FIGURE}>
							{formatScore(result.averageScore)}
						</span>
						<span className={CAPTION}>Average</span>
					</DataTableCell>
					<DataTableCell align='right'>
						<span data-col='total' className={FIGURE}>
							{formatScore(result.totalScore)}
						</span>
						{result.judgeCount > 0 ? <span className={CAPTION}>/ {formatScore(entryMaxOf(result.contestantId) * result.judgeCount)} raw</span> : null}
					</DataTableCell>
				</>
			)}
			<DataTableCell align='center'>
				<span data-col='judges' className='font-label-md text-label-md text-slate-900 font-mono font-bold'>
					{result.judgeCount}
				</span>
			</DataTableCell>
			<DataTableCell>
				<div data-testid='entry-status' data-status={status.kind} data-saved={status.saved} data-assigned={status.assigned} className='flex flex-col'>
					<span className={cx('font-label-md text-label-md font-semibold', STATUS_TEXT[status.kind])}>{entryStatusLabel(status)}</span>
					{status.kind !== 'no-judge' ? <ProgressBar variant='mini' tone={STATUS_BAR[status.kind]} value={percent} aria-label={`${status.saved} of ${status.assigned} judges saved`} /> : null}
				</div>
			</DataTableCell>
			<DataTableCell align='center'>
				<Button variant='admin-outline' size='xs' data-testid='breakdown' data-contestant-id={id} onClick={onBreakdown}>
					Breakdown
				</Button>
			</DataTableCell>
		</DataTableRow>
	)
}

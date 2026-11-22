'use client'

import { Button } from '@/components/ui/button'
import Dialog, { DialogLedger, DialogLedgerRow, DialogStat, DialogStatGrid } from '@/components/ui/dialog'
import type { BreakdownRow } from '@/lib/admin/breakdown'
import { formatPercent, formatScore } from '@/lib/admin/format'
import type { ScoringKind } from '@/lib/admin/formula'
import type { ProgramLabel } from '@/lib/admin/program'
import type { EntryStatus } from '@/lib/admin/status'
import type { EventCompiledResults } from '@/lib/types'

type Ranking = EventCompiledResults['rankings'][number]

/**
 * The Score Audit Matrix's breakdown of one entry (spec R51): the final figure, the program and how many assigned
 * judges saved it; one `breakdown-judge` row per assigned judge and per judge whose score counts (data-total = the
 * API's total, '' when not scored; "(not assigned)" for a judge counted but no longer assigned); participant rows for
 * member events. Closes with its button, Escape or the backdrop; focus returns to the button that opened it. Mount it
 * at page level (Dialog).
 */
export function BreakdownDialog({
	result,
	kind,
	program,
	status,
	rows,
	maxPossibleScore,
	onClose,
}: {
	result: Ranking | null
	kind: ScoringKind
	program: ProgramLabel | null
	status: EntryStatus | null
	rows: BreakdownRow[]
	maxPossibleScore: number
	onClose: () => void
}) {
	const denominator = kind === 'direct' ? '/ 100' : `/ ${formatScore(maxPossibleScore)} raw`
	const score = result ? (kind === 'direct' ? (result.finalRating ?? result.averageScore) : kind === 'weighted' ? (result.weightedScore ?? result.averageScore) : result.averageScore) : 0

	return (
		<Dialog
			open={result !== null}
			onClose={onClose}
			closeOnBackdrop
			data-testid='breakdown-dialog'
			eyebrow='Score breakdown'
			title={result?.contestantName ?? ''}
			className='max-w-lg'
			actions={
				<Button variant='admin-tonal' onClick={onClose}>
					Close
				</Button>
			}
		>
			{result ? (
				<>
					<DialogStatGrid>
						<DialogStat label={kind === 'direct' ? 'Final rating' : 'Final score'} value={formatScore(score)} />
						<DialogStat label='Program' value={program ?? '—'} tone='sky' />
						<DialogStat label='Judges saved' value={status ? `${status.saved} / ${status.assigned}` : '—'} tone='slate' />
					</DialogStatGrid>
					<DialogLedger title={kind === 'direct' ? "Each judge's rating" : "Each judge's total"}>
						{rows.length === 0 ? <DialogLedgerRow label='No judge assigned or counted' value='' /> : null}
						{rows.map((row) => (
							<DialogLedgerRow
								key={row.judgeId}
								data-testid='breakdown-judge'
								data-judge-id={row.judgeId}
								data-total={row.total === null ? '' : String(row.total)}
								label={
									<>
										{row.judgeName}
										{row.assigned ? null : <span className='text-slate-500 font-normal'> (not assigned)</span>}
									</>
								}
								value={row.total === null ? 'not scored' : `${formatScore(row.total)} ${denominator}`}
								muted={row.total === null}
							/>
						))}
					</DialogLedger>
					{result.participantScores && result.participantScores.length > 0 ? (
						<DialogLedger title='Participants'>
							{result.participantScores.map((participant, index) => {
								const rating = typeof participant.rating === 'number' ? participant.rating : participant.maxScore > 0 ? (participant.averageScore / participant.maxScore) * 100 : 0
								return (
									<DialogLedgerRow
										key={`${participant.participantLabel}-${index}`}
										label={participant.participantLabel}
										value={`${formatScore(participant.averageScore)} / ${formatScore(participant.maxScore)} (${formatPercent(rating)})`}
									/>
								)
							})}
						</DialogLedger>
					) : null}
				</>
			) : null}
		</Dialog>
	)
}

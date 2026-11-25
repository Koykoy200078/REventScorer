import type { ReactNode } from 'react'

import { CriterionCard } from '@/components/judge/criterion-card'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { KpiReadout } from '@/components/ui/kpi-card'
import { formatScore } from '@/components/ui/preset-rail'
import type { Examinee } from '@/lib/judge/layout'
import { cellTotals } from '@/lib/judge/status'

function initials(name: string): string {
	const letters = name
		.split(/\s+/)
		.filter(Boolean)
		.map((part) => part[0]?.toUpperCase() ?? '')
		.join('')
	return letters.slice(0, 2) || '?'
}

/**
 * One examinee's cells (Stage 5 Task 5, spec §2.5). 'unified' is Part A (C-2 header, C-3 cards);
 * 'individual' is the Individual-only candidate header and C-8 cards. Both render the hook
 * member-group around the header (with the participant's name) and only that examinee's inputs, and
 * are mounted for the selected examinee only. 'individual-entry' (the individual layout with at most
 * one examinee) puts the candidate header, named after the entry, outside, then the member-group
 * with a compact heading.
 */
export function IndividualSection({
	variant,
	examinee,
	index,
	count,
	entryName,
	entryTotals,
	inputRow,
	locked,
	onCell,
	batch,
}: {
	variant: 'unified' | 'individual' | 'individual-entry'
	examinee: Examinee | undefined
	index: number
	count: number
	entryName: string
	/** individual-entry: the whole entry's sum and maximum. */
	entryTotals?: { score: number; max: number }
	inputRow: Record<string, string>
	locked: ReadonlySet<string>
	onCell: (subCriterionId: string, raw: string, max: number) => void
	batch?: ReactNode
}) {
	const totals = examinee ? cellTotals(examinee.cells.map((cell) => cell.subCriterion), inputRow) : { score: 0, max: 0 }
	const cards = (cardVariant: 'unified-individual' | 'individual') =>
		examinee?.cells.map((cell, cellIndex) => (
			<CriterionCard
				key={cell.subCriterion.id}
				variant={cardVariant}
				number={cellIndex + 1}
				title={cell.displayName}
				parentName={cell.criterion.name}
				subCriterionId={cell.subCriterion.id}
				max={cell.subCriterion.maxScore}
				value={inputRow[cell.subCriterion.id] ?? '0'}
				locked={locked.has(cell.subCriterion.id)}
				onValue={(raw) => onCell(cell.subCriterion.id, raw, cell.subCriterion.maxScore)}
			/>
		))

	const candidateHeader = (name: string, part: string, subtotal: { score: number; max: number }, role?: string, description?: string) => (
		<Card variant='individual-header'>
			<div className='flex items-start gap-space-md min-w-0'>
				<div aria-hidden className='w-14 h-14 rounded-xl bg-surface-container-high flex items-center justify-center text-primary font-display text-2xl font-bold shrink-0 shadow-inner'>
					{initials(name)}
				</div>
				<div className='flex flex-col min-w-0 [overflow-wrap:anywhere]'>
					<div className='flex flex-wrap items-center gap-space-xs mb-1'>
						<Badge variant='individual-part'>{part}</Badge>
						<Badge variant='individual-subtotal'>
							Subtotal: {formatScore(subtotal.score)} / {formatScore(subtotal.max)} pts
						</Badge>
					</div>
					<div className='flex flex-wrap items-center gap-space-sm min-w-0'>
						<h2 className='font-headline-md text-headline-md text-on-surface font-bold [overflow-wrap:anywhere] min-w-0'>{name}</h2>
						{role ? <Badge variant='individual-role'>{role}</Badge> : null}
					</div>
					{description ? <p className='font-body-sm text-body-sm text-on-surface-variant mt-1'>{description}</p> : null}
				</div>
			</div>
			{batch}
		</Card>
	)

	if (variant === 'unified') {
		if (!examinee) return null
		return (
			<div data-testid='member-group' data-member-label={examinee.memberLabel} className='flex flex-col gap-space-md'>
				<Card variant='unified-header'>
					<div className='flex items-center gap-space-md min-w-0'>
						<div aria-hidden className='w-9 h-9 rounded-lg bg-emerald-700 text-white flex items-center justify-center font-headline-sm text-headline-sm font-bold shadow-xs shrink-0'>
							A
						</div>
						<div className='min-w-0'>
							<div className='flex items-center gap-space-sm flex-wrap'>
								<h2 className='font-headline-sm text-headline-sm text-slate-900 font-bold [overflow-wrap:anywhere] min-w-0'>
									Part A: Individual • Examinee {index + 1} of {count}: {examinee.displayLabel}
								</h2>
								<Badge variant='unified-section-teal'>Individual max: {formatScore(totals.max)} pts</Badge>
							</div>
							<p className='font-body-sm text-body-sm text-emerald-800 mt-0.5 font-medium [overflow-wrap:anywhere]'>These scores are {examinee.displayLabel}&apos;s alone.</p>
						</div>
					</div>
					<KpiReadout className='min-w-0 max-w-full flex-wrap [overflow-wrap:anywhere]' tone='emerald' label={`${examinee.displayLabel} subtotal:`} value={formatScore(totals.score)} outOf={`/ ${formatScore(totals.max)} pts`} />
				</Card>
				<div className='flex flex-col gap-space-md'>{cards('unified-individual')}</div>
			</div>
		)
	}

	if (variant === 'individual') {
		if (!examinee) return null
		return (
			<div data-testid='member-group' data-member-label={examinee.memberLabel} className='flex flex-col gap-space-md'>
				{candidateHeader(examinee.displayLabel, `Examinee ${index + 1} of ${count}`, totals, examinee.memberLabel, 'Criteria for this examinee only.')}
				<div className='flex flex-col gap-space-md'>{cards('individual')}</div>
			</div>
		)
	}

	return (
		<>
			{candidateHeader(entryName, 'Individual entry', entryTotals ?? totals)}
			{examinee ? (
				<div data-testid='member-group' data-member-label={examinee.memberLabel} className='flex flex-col gap-space-md'>
					<p className='font-body-sm text-body-sm text-slate-500 [overflow-wrap:anywhere]'>
						{examinee.displayLabel} · {examinee.memberLabel}
					</p>
					<div className='flex flex-col gap-space-md'>{cards('individual')}</div>
				</div>
			) : null}
		</>
	)
}

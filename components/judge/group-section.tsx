import type { ReactNode } from 'react'

import { CriterionCard } from '@/components/judge/criterion-card'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { KpiReadout } from '@/components/ui/kpi-card'
import { formatScore } from '@/components/ui/preset-rail'
import type { ContestantCells } from '@/lib/judge/layout'
import { cellTotals, enteredCount } from '@/lib/judge/status'

type Block = ContestantCells['groupBlocks'][number]

export function membersPhrase(count: number, lead: 'shared by' | 'Applied to'): string {
	return count === 1 ? `${lead} the 1 member` : `${lead} all ${count} members`
}

/**
 * The cells of no single examinee (Stage 5 Task 5, spec §2.5): Unified Part B (C-2 header, C-4
 * grid), Group only (C-5 callout, then one block per criterion of C-6 cards) and, in the individual
 * layout, "Criteria for the whole entry" (C-8 cards). Each block has a caption "Max · Current"
 * (today's "Parent Max | Current") when it is one of several, and always in Group only and the
 * entry list.
 */
export function GroupSection({
	variant,
	blocks,
	participants,
	inputRow,
	locked,
	onCell,
	batch,
}: {
	variant: 'unified' | 'group' | 'entry'
	blocks: Block[]
	participants: string[]
	inputRow: Record<string, string>
	locked: ReadonlySet<string>
	onCell: (subCriterionId: string, raw: string, max: number) => void
	batch?: ReactNode
}) {
	if (blocks.length === 0) return null
	const cells = blocks.flatMap((block) => block.cells.map((cell) => cell.subCriterion))
	const totals = cellTotals(cells, inputRow)
	const caption = (block: Block) => {
		const own = cellTotals(block.cells.map((cell) => cell.subCriterion), inputRow)
		return `Max ${formatScore(own.max)} pts • Current ${formatScore(own.score)} pts`
	}
	const card = (block: Block, cell: Block['cells'][number], index: number, cardVariant: 'unified-group' | 'group' | 'individual', wide = false) => (
		<CriterionCard
			key={cell.subCriterion.id}
			variant={cardVariant}
			number={index + 1}
			title={cell.displayName}
			parentName={block.criterion.name}
			subCriterionId={cell.subCriterion.id}
			max={cell.subCriterion.maxScore}
			value={inputRow[cell.subCriterion.id] ?? '0'}
			locked={locked.has(cell.subCriterion.id)}
			wide={wide}
			onValue={(raw) => onCell(cell.subCriterion.id, raw, cell.subCriterion.maxScore)}
		/>
	)

	if (variant === 'unified') {
		const shared = participants.length > 0 ? membersPhrase(participants.length, 'shared by') : 'shared by the whole entry'
		return (
			<section className='flex flex-col gap-space-md'>
				<Card variant='unified-header'>
					<div className='flex items-center gap-space-md min-w-0'>
						<div aria-hidden className='w-9 h-9 rounded-lg bg-teal-700 text-white flex items-center justify-center font-headline-sm text-headline-sm font-bold shadow-xs shrink-0'>
							B
						</div>
						<div className='min-w-0'>
							<div className='flex items-center gap-space-sm flex-wrap'>
								<h2 className='font-headline-sm text-headline-sm text-slate-900 font-bold'>Part B: Group criteria ({shared})</h2>
								<Badge variant='unified-section-emerald'>Group max: {formatScore(totals.max)} pts</Badge>
							</div>
							{participants.length > 0 ? (
								<p className='font-body-sm text-body-sm text-slate-600 mt-0.5'>
									{membersPhrase(participants.length, 'Applied to')}: <span className='font-semibold text-slate-800'>{participants.join(', ')}</span>
								</p>
							) : null}
						</div>
					</div>
					<KpiReadout tone='teal' label='Group subtotal:' value={formatScore(totals.score)} outOf={`/ ${formatScore(totals.max)} pts`} />
				</Card>
				{blocks.map((block) => (
					<div key={block.criterion.id} className='flex flex-col gap-space-sm'>
						{blocks.length >= 2 ? (
							<div className='flex flex-wrap items-baseline justify-between gap-space-sm'>
								<h3 className='font-label-md text-label-md text-slate-900 font-bold uppercase tracking-wider'>{block.criterion.name}</h3>
								<span className='font-body-sm text-body-sm text-slate-500'>{caption(block)}</span>
							</div>
						) : null}
						<div className='grid grid-cols-1 md:grid-cols-2 gap-space-md'>{block.cells.map((cell, index) => card(block, cell, index, 'unified-group', block.cells.length % 2 === 1 && index === block.cells.length - 1))}</div>
					</div>
				))}
			</section>
		)
	}

	if (variant === 'group') {
		return (
			<>
				<Card variant='group-callout'>
					<div className='flex flex-col gap-space-sm'>
						<div className='flex flex-wrap items-center gap-space-sm'>
							<Badge variant='group-mode'>Group criteria</Badge>
							<span className='font-label-md text-label-md text-on-surface font-semibold'>Group max: {formatScore(totals.max)} pts</span>
						</div>
						<p className='font-body-sm text-body-sm text-on-surface-variant'>Scores entered below apply to the whole entry.</p>
						{participants.length > 0 ? (
							<ul className='grid grid-cols-1 sm:grid-cols-2 gap-space-xs'>
								{participants.map((name, index) => (
									<li key={`${index}-${name}`} className='flex items-center gap-space-xs min-w-0'>
										<span aria-hidden className='w-1.5 h-1.5 rounded-full bg-primary shrink-0' />
										<span className='font-label-md text-label-md text-on-surface font-semibold truncate'>{name}</span>
										<span className='font-label-sm text-label-sm text-slate-500'>Student {index + 1}</span>
									</li>
								))}
							</ul>
						) : null}
						{batch}
					</div>
				</Card>
				{blocks.map((block) => {
					const entered = enteredCount(block.cells.map((cell) => cell.subCriterion), inputRow)
					return (
						<section key={block.criterion.id} className='flex flex-col gap-space-md'>
							<div className='flex flex-wrap items-baseline justify-between gap-space-sm'>
								<h2 className='font-headline-sm text-headline-sm text-on-surface font-semibold'>{block.criterion.name}</h2>
								<div className='flex flex-wrap items-center gap-space-sm'>
									<span className='font-body-sm text-body-sm text-slate-500'>{caption(block)}</span>
									<Badge variant='group-completion'>
										{entered.entered} of {entered.total} entered
									</Badge>
								</div>
							</div>
							<div className='flex flex-col gap-space-md'>{block.cells.map((cell, index) => card(block, cell, index, 'group'))}</div>
						</section>
					)
				})}
			</>
		)
	}

	return (
		<section className='flex flex-col gap-space-md'>
			<h2 className='font-headline-sm text-headline-sm text-on-surface font-semibold'>Criteria for the whole entry</h2>
			{blocks.map((block) => (
				<div key={block.criterion.id} className='flex flex-col gap-space-sm'>
					<div className='flex flex-wrap items-baseline justify-between gap-space-sm'>
						<h3 className='font-label-md text-label-md text-on-surface font-bold uppercase tracking-wider'>{block.criterion.name}</h3>
						<span className='font-body-sm text-body-sm text-slate-500'>{caption(block)}</span>
					</div>
					<div className='flex flex-col gap-space-md'>{block.cells.map((cell, index) => card(block, cell, index, 'individual'))}</div>
				</div>
			))}
		</section>
	)
}

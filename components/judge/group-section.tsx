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

const OTHER_NOTE = 'Not part of the 60/40 score. Entered scores are still saved.'

/**
 * The cells of no single examinee (Stage 5 Task 5, spec §2.5): Unified Part B (C-2 header, C-4
 * grid), Group only (C-5 callout, then one block per criterion of C-6 cards) and, in the individual
 * layout, "Criteria for the whole entry" (C-8 cards). `blocks.counted` are the criteria the preview
 * counts as the group part; in a weighted event any other plain criterion is in `blocks.other` and
 * follows under "Other criteria" (critique M3). The header, the maximum and the subtotal cover the
 * counted blocks only. Each block has a caption "Max · Current" when it is one of several, and
 * always in Group only and the entry list.
 */
export function GroupSection({
	variant,
	blocks,
	participants,
	formula,
	inputRow,
	locked,
	onCell,
	batch,
}: {
	variant: 'unified' | 'group' | 'entry'
	blocks: { counted: Block[]; other: Block[] }
	participants: string[]
	formula?: string | null
	inputRow: Record<string, string>
	locked: ReadonlySet<string>
	onCell: (subCriterionId: string, raw: string, max: number) => void
	batch?: ReactNode
}) {
	const all = [...blocks.counted, ...blocks.other]
	if (all.length === 0) return null
	const totals = cellTotals(blocks.counted.flatMap((block) => block.cells.map((cell) => cell.subCriterion)), inputRow)
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
	const otherHeading = (level: 'h2' | 'h3') => {
		const Heading = level
		return (
			<div className='flex flex-col gap-0.5'>
				<Heading className='font-headline-sm text-headline-sm text-on-surface font-semibold'>Other criteria</Heading>
				<p className='font-body-sm text-body-sm text-slate-500'>{OTHER_NOTE}</p>
			</div>
		)
	}

	if (variant === 'unified') {
		const shared = participants.length > 0 ? membersPhrase(participants.length, 'shared by') : 'shared by the whole entry'
		const unifiedBlock = (block: Block, withCaption: boolean) => (
			<div key={block.criterion.id} className='flex flex-col gap-space-sm'>
				{withCaption ? (
					<div className='flex flex-wrap items-baseline justify-between gap-space-sm'>
						<h3 className='font-label-md text-label-md text-slate-900 font-bold uppercase tracking-wider'>{block.criterion.name}</h3>
						<span className='font-body-sm text-body-sm text-slate-500'>{caption(block)}</span>
					</div>
				) : null}
				<div className='grid grid-cols-1 md:grid-cols-2 gap-space-md'>{block.cells.map((cell, index) => card(block, cell, index, 'unified-group', block.cells.length % 2 === 1 && index === block.cells.length - 1))}</div>
			</div>
		)
		return (
			<section className='flex flex-col gap-space-md'>
				{blocks.counted.length > 0 ? (
					<>
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
											{membersPhrase(participants.length, 'Applied to')}: <span className='font-semibold text-slate-800 [overflow-wrap:anywhere]'>{participants.join(', ')}</span>
										</p>
									) : null}
									{formula ? <p className='font-body-sm text-body-sm text-slate-500 mt-0.5'>{formula}</p> : null}
								</div>
							</div>
							<KpiReadout className='min-w-0 max-w-full flex-wrap' tone='teal' label='Group subtotal:' value={formatScore(totals.score)} outOf={`/ ${formatScore(totals.max)} pts`} />
						</Card>
						{blocks.counted.map((block) => unifiedBlock(block, blocks.counted.length >= 2))}
					</>
				) : null}
				{blocks.other.length > 0 ? (
					<>
						{otherHeading('h2')}
						{blocks.other.map((block) => unifiedBlock(block, true))}
					</>
				) : null}
			</section>
		)
	}

	if (variant === 'group') {
		const groupBlock = (block: Block) => {
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
		}
		return (
			<>
				<Card variant='group-callout'>
					<div className='flex flex-col gap-space-sm'>
						<div className='flex flex-wrap items-center gap-space-sm'>
							<Badge variant='group-mode'>Group criteria</Badge>
							<span className='font-label-md text-label-md text-on-surface font-semibold'>Group max: {formatScore(totals.max)} pts</span>
						</div>
						<p className='font-body-sm text-body-sm text-on-surface-variant'>
							Scores entered below apply to the whole entry.{formula ? ` ${formula}` : ''}
						</p>
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
				{blocks.counted.map(groupBlock)}
				{blocks.other.length > 0 ? (
					<>
						{otherHeading('h2')}
						{blocks.other.map(groupBlock)}
					</>
				) : null}
			</>
		)
	}

	const entryBlock = (block: Block) => (
		<div key={block.criterion.id} className='flex flex-col gap-space-sm'>
			<div className='flex flex-wrap items-baseline justify-between gap-space-sm'>
				<h3 className='font-label-md text-label-md text-on-surface font-bold uppercase tracking-wider'>{block.criterion.name}</h3>
				<span className='font-body-sm text-body-sm text-slate-500'>{caption(block)}</span>
			</div>
			<div className='flex flex-col gap-space-md'>{block.cells.map((cell, index) => card(block, cell, index, 'individual'))}</div>
		</div>
	)
	return (
		<section className='flex flex-col gap-space-md'>
			{blocks.counted.length > 0 ? (
				<>
					<h2 className='font-headline-sm text-headline-sm text-on-surface font-semibold'>Criteria for the whole entry</h2>
					{blocks.counted.map(entryBlock)}
				</>
			) : null}
			{blocks.other.length > 0 ? (
				<>
					{otherHeading('h2')}
					{blocks.other.map(entryBlock)}
				</>
			) : null}
		</section>
	)
}

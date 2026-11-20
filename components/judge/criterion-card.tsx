import { useId } from 'react'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { formatScore, PresetRail } from '@/components/ui/preset-rail'
import { ScoreInput } from '@/components/ui/score-input'
import { parseAndClampScore } from '@/lib/judge/score-input'
import { isEnteredValue } from '@/lib/judge/status'

export type CriterionCardVariant = 'unified-individual' | 'unified-group' | 'group' | 'individual'

export interface CriterionCardProps {
	variant: CriterionCardVariant
	/** 1-based position in its list (the G number circle and the I overline). */
	number: number
	title: string
	/** The parent criterion's name, as the card's description line. */
	parentName?: string
	subCriterionId: string
	max: number
	/** The raw input string the form keeps for this cell. */
	value: string
	/** An admin-provided value (NOAT): read-only. */
	locked?: boolean
	/** unified-group only: the last card of an odd count spans both columns. */
	wide?: boolean
	onValue: (raw: string) => void
}

/**
 * One score cell in each view's own card (Stage 5 Task 5, spec §2.5): Unified individual (C-3 with
 * SI-1), Unified group (C-4 with SI-2), Group only (C-6 with SI-3) and Individual only (C-8 with
 * SI-4). The input keeps the hook contract: score-input, data-subcriterion-id, type=number, min 0,
 * max, step 0.01, read-only when locked. Its accessible name starts with the card title. The preset
 * chips (PR-1 to PR-4) write 0, 50, 75, 90 or 100% of the maximum, rounded to 2 decimals (B44).
 */
export function CriterionCard({ variant, number, title, parentName, subCriterionId, max, value, locked = false, wide = false, onValue }: CriterionCardProps) {
	const titleId = useId()
	const scored = isEnteredValue(value)
	const rail = (className?: string) => (
		<PresetRail variant={variant} max={max} value={value} onChange={(score) => onValue(String(score))} aria-labelledby={titleId} disabled={locked} wide={variant === 'unified-group' && wide} className={className} />
	)
	const input = {
		'data-testid': 'score-input',
		'data-subcriterion-id': subCriterionId,
		suppressHydrationWarning: true,
		'aria-labelledby': titleId,
		value,
		max,
		readOnly: locked,
		onChange: (event: { target: { value: string } }) => {
			if (!locked) onValue(event.target.value)
		},
	}

	if (variant === 'unified-individual') {
		return (
			<Card variant='unified-individual'>
				<div className='flex flex-col md:flex-row md:items-start justify-between gap-space-sm'>
					<div className='min-w-0'>
						<div className='flex flex-wrap items-center gap-space-xs'>
							<h3 id={titleId} className='font-headline-sm text-headline-sm text-slate-900 font-bold break-words'>
								{title}
							</h3>
							<Badge variant='unified-sub-max'>Sub max: {formatScore(max)}</Badge>
						</div>
						{parentName ? <p className='font-body-sm text-body-sm text-slate-600 mt-1'>{parentName}</p> : null}
					</div>
					<ScoreInput variant='unified-individual' label='Manual score' hint='Type a score or pick a preset' className='self-start md:self-auto' {...input} />
				</div>
				{rail()}
			</Card>
		)
	}

	if (variant === 'unified-group') {
		return (
			<Card variant='unified-group' className={wide ? 'md:col-span-2' : undefined}>
				<div className='flex flex-col gap-1.5'>
					<div className='flex flex-wrap items-center justify-between gap-2'>
						<h3 id={titleId} className='font-headline-sm text-headline-sm text-slate-900 font-bold break-words min-w-0'>
							{title}
						</h3>
						<ScoreInput variant='unified-group' label='Manual:' wide={wide} {...input} />
					</div>
					{parentName ? <p className='font-body-sm text-body-sm text-slate-600'>{parentName}</p> : null}
				</div>
				{rail()}
			</Card>
		)
	}

	if (variant === 'group') {
		return (
			<Card variant='group-rubric' scored={scored}>
				<div className='flex flex-wrap items-start justify-between gap-space-md'>
					<div className='flex items-start gap-space-md min-w-0'>
						<Badge variant='group-number'>{number}</Badge>
						<div className='min-w-0'>
							<h3 id={titleId} className='font-headline-sm text-headline-sm text-on-surface font-semibold break-words'>
								{title}
							</h3>
							<p className='font-body-sm text-body-sm text-slate-500'>Max available: {formatScore(max)} pts</p>
						</div>
					</div>
					<Badge variant='group-score'>{formatScore(parseAndClampScore(value, max))}</Badge>
				</div>
				<div className='flex flex-wrap items-center gap-1.5'>
					{rail()}
					<ScoreInput variant='group' label='Manual' {...input} />
				</div>
			</Card>
		)
	}

	return (
		<Card variant='individual-rubric' scored={scored}>
			<div className='flex flex-col gap-1 min-w-0'>
				<span className='font-label-sm text-label-sm text-slate-500 uppercase tracking-wider font-semibold'>
					Criterion {String(number).padStart(2, '0')} • Sub max: {formatScore(max)} pts
				</span>
				<h3 id={titleId} className='font-headline-sm text-headline-sm text-on-surface font-bold break-words'>
					{title}
				</h3>
				{parentName ? <p className='font-body-sm text-body-sm text-on-surface-variant'>{parentName}</p> : null}
			</div>
			<div className='flex flex-col items-start md:items-end gap-space-sm shrink-0'>
				<ScoreInput variant='individual' label='Score' {...input} />
				{rail('flex-wrap justify-end')}
			</div>
		</Card>
	)
}

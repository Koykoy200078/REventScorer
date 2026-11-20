import type { ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { formatScore } from '@/components/ui/preset-rail'
import { Tab, TabList } from '@/components/ui/tabs'
import type { Examinee } from '@/lib/judge/layout'
import type { MemberStatus } from '@/lib/judge/status'

export interface ExamineeFigures {
	status: MemberStatus
	score: number
	max: number
	entered: number
	total: number
}

function criteriaCount(n: number): string {
	return n === 1 ? '1 criterion' : `${n} criteria`
}

/** The status line of an examinee tab (spec §4.2, R19): from the inputs, never from saves. */
function statusLine(figures: ExamineeFigures, selected: boolean): string {
	if (selected) return 'Now scoring'
	if (figures.status === 'scored') return `All ${figures.total} entered`
	if (figures.status === 'partial') return `${figures.entered} of ${figures.total} entered`
	return criteriaCount(figures.total)
}

/**
 * The examinee tabs of an entry (Stage 5 Task 5, spec §2.5, §4.2): T-3 roster cards in the Unified
 * context card, T-2 in the Individual-only panel. It must sit inside the container's <Tabs>, which
 * also holds the TabPanel with the selected member-group. The tab list exists only with 2 or more
 * examinees; the Unified header row always shows (it carries the batch rail). Badges and status
 * lines come from the inputs: "{s} / {m}" while selected, "✓ {s}" when every cell is entered,
 * "{s} / {m}" part-way, "Not started" otherwise.
 */
export function ExamineeRoster({
	variant,
	examinees,
	selected,
	figures,
	batch,
}: {
	variant: 'unified' | 'individual'
	examinees: Examinee[]
	selected: string | undefined
	figures: Readonly<Record<string, ExamineeFigures>>
	batch?: ReactNode
}) {
	const many = examinees.length >= 2
	const prefix = variant === 'unified' ? 'unified' : 'individual'
	const badgeOf = (f: ExamineeFigures, isSelected: boolean) => {
		if (isSelected) return <Badge variant={`${prefix}-roster-active`}>{formatScore(f.score)} / {formatScore(f.max)}</Badge>
		if (f.status === 'scored') return <Badge variant={`${prefix}-roster-done`}>✓ {formatScore(f.score)}</Badge>
		if (f.status === 'partial') return <Badge variant={`${prefix}-roster-queued`}>{formatScore(f.score)} / {formatScore(f.max)}</Badge>
		return <Badge variant={`${prefix}-roster-queued`}>Not started</Badge>
	}
	const tabs = many ? (
		<TabList aria-label='Examinees' data-testid='examinee-tabs'>
			{examinees.map((examinee, index) => {
				const isSelected = examinee.memberLabel === selected
				const f = figures[examinee.memberLabel] ?? { status: 'not-started' as const, score: 0, max: 0, entered: 0, total: examinee.cells.length }
				return (
					<Tab
						key={examinee.memberLabel}
						value={examinee.memberLabel}
						data-testid='examinee-tab'
						data-member-label={examinee.memberLabel}
						done={f.status === 'scored'}
						tag={variant === 'unified' && isSelected ? 'Active' : undefined}
					>
						{variant === 'unified' ? (
							<>
								<span className='font-label-md text-label-md font-semibold truncate min-w-0 w-full'>
									{index + 1}. {examinee.displayLabel}
								</span>
								<span className='flex items-center justify-between gap-space-xs w-full'>
									<span className='font-label-sm text-label-sm text-slate-500 truncate min-w-0'>{examinee.memberLabel}</span>
									<span className='shrink-0 whitespace-nowrap'>{badgeOf(f, isSelected)}</span>
								</span>
								<span className='flex items-center gap-1 font-label-sm text-label-sm text-slate-500'>
									{isSelected ? <span aria-hidden className='w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse motion-reduce:animate-none' /> : null}
									{statusLine(f, isSelected)}
								</span>
							</>
						) : (
							<>
								<span className='flex items-center justify-between gap-space-xs w-full'>
									<span className='flex items-center gap-1 font-label-sm text-label-sm text-slate-500 min-w-0 truncate'>
										{isSelected ? <span aria-hidden className='w-1.5 h-1.5 rounded-full bg-primary animate-ping motion-reduce:animate-none shrink-0' /> : null}
										{String(index + 1).padStart(2, '0')} • {isSelected ? 'Now scoring' : examinee.memberLabel}
									</span>
									<span className='shrink-0 whitespace-nowrap'>{badgeOf(f, isSelected)}</span>
								</span>
								<span className='font-label-md text-label-md font-semibold text-on-surface truncate'>{examinee.displayLabel}</span>
								<span className='font-label-sm text-label-sm text-slate-500'>{isSelected ? examinee.memberLabel : statusLine(f, false)}</span>
							</>
						)}
					</Tab>
				)
			})}
		</TabList>
	) : null

	if (variant === 'unified') {
		return (
			<div className='flex flex-col gap-space-sm'>
				<div className='flex flex-wrap items-center justify-between gap-space-sm'>
					<div>
						<h2 className='font-label-md text-label-md text-slate-900 font-bold uppercase tracking-wider'>Examinees ({examinees.length})</h2>
						{many ? <p className='font-body-sm text-body-sm text-slate-500'>Pick an examinee to score their criteria</p> : null}
					</div>
					{batch}
				</div>
				{tabs}
			</div>
		)
	}

	if (!many) return null
	return (
		<Card variant='individual-panel'>
			<div className='flex flex-col gap-space-sm'>
				<div>
					<h2 className='font-label-md text-label-md text-on-surface font-bold uppercase tracking-wider'>Examinees ({examinees.length})</h2>
					<p className='font-body-sm text-body-sm text-slate-500'>Pick an examinee to score their criteria</p>
				</div>
				{tabs}
			</div>
		</Card>
	)
}

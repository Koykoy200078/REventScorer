import type { ReactNode } from 'react'

import { Card } from '@/components/ui/card'
import { Tab, TabList } from '@/components/ui/tabs'
import type { Examinee } from '@/lib/judge/layout'
import type { MemberStatus } from '@/lib/judge/status'

/**
 * The examinee tabs of an entry (Stage 5 Task 5, spec §2.5): T-3 roster cards in the Unified context
 * card, T-2 in the Individual-only panel. It must sit inside the container's <Tabs>, which also holds
 * the TabPanel with the selected member-group. The tab list exists only with 2 or more examinees;
 * the Unified header row always shows (it carries the batch rail).
 */
export function ExamineeRoster({
	variant,
	examinees,
	selected,
	statusByMember,
	batch,
}: {
	variant: 'unified' | 'individual'
	examinees: Examinee[]
	selected: string | undefined
	statusByMember: Readonly<Record<string, MemberStatus>>
	batch?: ReactNode
}) {
	const many = examinees.length >= 2
	const tabs = many ? (
		<TabList aria-label='Examinees' data-testid='examinee-tabs'>
			{examinees.map((examinee, index) => {
				const isSelected = examinee.memberLabel === selected
				return (
					<Tab
						key={examinee.memberLabel}
						value={examinee.memberLabel}
						data-testid='examinee-tab'
						data-member-label={examinee.memberLabel}
						done={statusByMember[examinee.memberLabel] === 'scored'}
						tag={variant === 'unified' && isSelected ? 'Active' : undefined}
					>
						{variant === 'unified' ? (
							<>
								<span className='font-label-md text-label-md font-semibold truncate'>
									{index + 1}. {examinee.displayLabel}
								</span>
								<span className='font-label-sm text-label-sm text-slate-500'>{examinee.memberLabel}</span>
							</>
						) : (
							<>
								<span className='font-label-sm text-label-sm text-slate-500'>
									{String(index + 1).padStart(2, '0')} • {isSelected ? 'Now scoring' : examinee.memberLabel}
								</span>
								<span className='font-label-md text-label-md font-semibold text-on-surface truncate'>{examinee.displayLabel}</span>
								<span className='font-label-sm text-label-sm text-slate-500'>{examinee.memberLabel}</span>
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

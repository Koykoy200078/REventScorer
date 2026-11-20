import type { ReactNode } from 'react'

import AppHeader, { HeaderUserChip } from '@/components/ui/app-header'
import { IconButton } from '@/components/ui/button'

/**
 * The judge page's fixed header (Stage 5 Task 5, spec §2.5): the logo lead in every view (ruling
 * R27) with the event title and description, the view switcher in the centre (unified entries, from
 * lg), and on the right the contestant stepper (always visible) around the contestant picker, then
 * the judge chip. It sits outside the score form, so nothing in it can submit scores.
 */
export function JudgeHeader({
	eventTitle,
	eventDescription,
	judgeName,
	adminEditMode,
	index,
	count,
	switcher,
	picker,
	onPrev,
	onNext,
}: {
	eventTitle: string
	eventDescription?: string
	judgeName: string
	adminEditMode: boolean
	index: number
	count: number
	switcher?: ReactNode
	picker: ReactNode
	onPrev: () => void
	onNext: () => void
}) {
	return (
		<AppHeader
			brand='EventScorer'
			title={eventTitle}
			subtitle={eventDescription || undefined}
			switcher={switcher}
			actions={
				<>
					<div className='flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200'>
						<IconButton variant='stepper' icon='chevron_left' iconClassName='text-[18px]' label='Previous entry' data-testid='prev-contestant' disabled={index <= 0} onClick={onPrev} />
						{picker}
						<IconButton variant='stepper' icon='chevron_right' iconClassName='text-[18px]' label='Next entry' data-testid='next-contestant' disabled={index >= count - 1} onClick={onNext} />
					</div>
					<HeaderUserChip name={judgeName} detail={adminEditMode ? 'Admin edit mode' : 'Judge'} />
				</>
			}
		/>
	)
}

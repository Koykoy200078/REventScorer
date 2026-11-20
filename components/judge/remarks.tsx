import { Card } from '@/components/ui/card'
import Icon from '@/components/ui/icon'
import Textarea from '@/components/ui/textarea'
import { isOverLimit, REMARK_LIMIT, remarkLength } from '@/lib/judge/remark'

const LIMIT_TEXT = REMARK_LIMIT.toLocaleString('en-US')

/**
 * Section C, the entry's additional remark (Stage 5 Task 5, spec §6, ruling R14): one remark per
 * entry, never per examinee, in each view's own card: Unified (C-1 "Section C: Remarks", TA-1),
 * Group only (C-7 "Remarks", TA-2) and Individual only and direct (C-8 "Remarks for {entry}", TA-3).
 * The field keeps the hook additional-remark and has no maxLength: 2,000 characters are counted,
 * never enforced (the server keeps the first 2,000 after trimming). The hint is worked out from the
 * whole details triple (remarkHint), so it says when an emptied remark would stay saved (B45).
 */
export function RemarksSection({
	variant,
	contestantName,
	value,
	laptopNote,
	multiExaminee,
	hint,
	onChange,
}: {
	variant: 'unified' | 'group' | 'individual'
	contestantName: string
	value: string
	laptopNote: boolean
	multiExaminee: boolean
	hint: { tone: 'muted' | 'warning'; text: string }
	onChange: (value: string) => void
}) {
	const length = remarkLength(value)
	const counter = (
		<span data-testid='remark-counter' className={isOverLimit(value) ? 'text-rose-700 font-semibold' : 'text-slate-500'}>
			{length.toLocaleString('en-US')} / {LIMIT_TEXT} {variant === 'unified' ? 'chars' : 'characters'}
		</span>
	)
	const hintNode = (
		<span data-testid='remark-hint' className={hint.tone === 'warning' ? 'flex items-center gap-1 text-amber-700' : 'text-slate-500'}>
			{hint.tone === 'warning' ? <Icon name='info' className='text-[15px] shrink-0' /> : null}
			<span>{hint.text}</span>
		</span>
	)
	const field = (
		<>
			{laptopNote ? <p className='font-body-sm text-body-sm text-slate-500'>Auto-filled from laptop availability — you may overwrite</p> : null}
			<Textarea
				variant={variant}
				label='Additional remark'
				data-testid='additional-remark'
				suppressHydrationWarning
				value={value}
				onChange={(event) => onChange(event.target.value)}
				placeholder='Enter any additional remark here...'
				hint={hintNode}
				counter={counter}
			/>
		</>
	)
	const optional = <span className='font-label-sm text-label-sm text-slate-500'>Optional</span>

	if (variant === 'unified') {
		return (
			<Card variant='unified-section' as='section'>
				<div className='flex items-center justify-between gap-space-sm'>
					<h3 className='flex items-center gap-space-xs font-headline-sm text-headline-sm text-slate-900 font-bold'>
						<Icon name='rate_review' className='text-[20px] text-emerald-600' />
						Section C: Remarks
					</h3>
					{optional}
				</div>
				{field}
			</Card>
		)
	}

	if (variant === 'group') {
		return (
			<Card variant='group-remarks' as='section'>
				<div className='flex items-center justify-between gap-space-sm'>
					<h3 className='flex items-center gap-space-xs font-headline-sm text-headline-sm text-on-surface font-semibold'>
						<Icon name='rate_review' className='text-[20px] text-primary' />
						Remarks
					</h3>
					{optional}
				</div>
				{field}
			</Card>
		)
	}

	return (
		<Card variant='individual-remarks' as='section'>
			<div className='flex flex-col gap-0.5'>
				<div className='flex items-center justify-between gap-space-sm'>
					<h3 className='font-headline-sm text-headline-sm text-on-surface font-semibold break-words min-w-0'>Remarks for {contestantName}</h3>
					{optional}
				</div>
				{multiExaminee ? <p className='font-body-sm text-body-sm text-slate-500'>This remark belongs to the whole entry, not to one examinee.</p> : null}
			</div>
			{field}
		</Card>
	)
}

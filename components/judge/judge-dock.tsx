import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { DockTotal, StickyDock, type DockVariant } from '@/components/ui/sticky-dock'
import type { DraftStatus } from '@/lib/judge/draft-state'
import type { SaveLabel } from '@/lib/judge/status'

const SECONDARY = { unified: 'unified-secondary', group: 'group-secondary', individual: 'individual-secondary' } as const
const PRIMARY = { unified: 'unified-primary', group: 'group-primary', individual: 'individual-primary' } as const

/**
 * The judge page's sticky dock (Stage 5 Task 5, spec §2.5, §7.3), inside the score form so its Save
 * button submits it. Save carries the hook save-scores and the owner's label ("Submit & next: …" /
 * "Save … scores"); only the entry name truncates, never "(k of n)". Previous and next move between
 * entries. Step 9 fills the summary with the view's own figures (§4.4).
 */
export function JudgeDock({
	variant,
	total,
	prev,
	next,
	save,
}: {
	variant: DockVariant
	total: { label: ReactNode; value: ReactNode; outOf: ReactNode }
	prev: { onClick: () => void; disabled: boolean }
	next: { onClick: () => void; disabled: boolean }
	save: { label: SaveLabel | null; isSaving: boolean; draftStatus: DraftStatus }
}) {
	const summary = variant === 'unified' ? <DockTotal variant='unified' label={total.label} value={total.value} outOf={total.outOf} /> : <DockTotal variant={variant} label={total.label} value={total.value} outOf={total.outOf} />
	const secondary = SECONDARY[variant]
	const primary = PRIMARY[variant]
	const label = save.label
	return (
		<StickyDock
			variant={variant}
			aria-label='Scoring controls'
			summary={summary}
			actions={
				<>
					<Button variant={secondary} icon='arrow_back' labelFrom='sm' data-testid='prev-entry' disabled={prev.disabled} onClick={prev.onClick}>
						Prev entry
					</Button>
					<Button variant={secondary} iconEnd='arrow_forward' labelFrom='sm' data-testid='next-entry' disabled={next.disabled} onClick={next.onClick}>
						Next entry
					</Button>
					<Button
						variant={primary}
						type='submit'
						data-testid='save-scores'
						data-draft-status={save.draftStatus}
						disabled={save.isSaving}
						suppressHydrationWarning
						title={label?.text}
						className='min-w-0 max-w-full'
					>
						{label?.position ? (
							// One gap-free row: the button's own flex gap would double the space before "(k of n)".
							<span className='inline-flex min-w-0'>
								<span className='min-w-0 truncate'>Submit &amp; next: {label.name}</span>
								<span className='shrink-0 whitespace-pre'> {label.position}</span>
							</span>
						) : (
							<span className='min-w-0 truncate'>{label?.text}</span>
						)}
					</Button>
				</>
			}
		/>
	)
}

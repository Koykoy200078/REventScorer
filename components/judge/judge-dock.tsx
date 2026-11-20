import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { formatScore } from '@/components/ui/preset-rail'
import { StickyDock, type DockVariant } from '@/components/ui/sticky-dock'
import type { DraftStatus } from '@/lib/judge/draft-state'
import type { SaveLabel } from '@/lib/judge/status'
import type { PreviewKind } from '@/lib/judge/summary'

const SECONDARY = { unified: 'unified-secondary', group: 'group-secondary', individual: 'individual-secondary' } as const
const PRIMARY = { unified: 'unified-primary', group: 'group-primary', individual: 'individual-primary' } as const

/**
 * The preview figure (spec §4.3): compile's number for this judge's row, or "—" before the entry
 * is scored (R10). Exactly one per page carries the judge-preview hook, with the raw value.
 */
export function PreviewValue({ value, kind, hook }: { value: number | null; kind: PreviewKind; hook: boolean }) {
	// Shown with 2 decimals (spec §4.3); the hook keeps compile's raw value.
	const text = value === null ? '—' : value.toFixed(2)
	return hook ? (
		<span data-testid='judge-preview' data-value={value === null ? '' : String(value)} data-kind={kind}>
			{text}
		</span>
	) : (
		<span>{text}</span>
	)
}

/** "Your preview: {v} / {max}" under a partial view's headline, visible at every width (recheck N6). */
export function PreviewLine({ value, kind, outOf }: { value: number | null; kind: PreviewKind; outOf: number }) {
	return (
		<p className='font-body-sm text-body-sm text-slate-500'>
			Your preview: <PreviewValue value={value} kind={kind} hook /> / {kind === 'total' ? `${formatScore(outOf)} pts (this entry's maximum)` : outOf.toFixed(2)}
			{value === null ? <span> · Not scored yet</span> : null}
		</p>
	)
}

export interface DockNav {
	kind: 'examinee' | 'entry'
	prev: { onClick: () => void; disabled: boolean; name?: string }
	next: { onClick: () => void; disabled: boolean; name?: string }
}

/**
 * The judge page's sticky dock (Stage 5 Task 5, spec §4.4, §7.3), inside the score form so its Save
 * button submits it. The summary is the view's own figure (the container builds it from §4.4's
 * table). Previous and next move between examinees where a view shows one examinee of several, else
 * between entries. Save carries the hook save-scores and the owner's label ("Submit & next: …" /
 * "Save … scores"); only the entry name truncates, never "(k of n)".
 */
export function JudgeDock({
	variant,
	summary,
	status,
	nav,
	save,
}: {
	variant: DockVariant
	summary: ReactNode
	status?: ReactNode
	nav: DockNav
	save: { label: SaveLabel | null; isSaving: boolean; draftStatus: DraftStatus }
}) {
	const secondary = SECONDARY[variant]
	const primary = PRIMARY[variant]
	const label = save.label
	const examinee = nav.kind === 'examinee'
	const actions = (
		<>
			{examinee ? (
				<>
					<Button variant={secondary} icon='arrow_back' labelFrom='sm' data-testid='prev-examinee' disabled={nav.prev.disabled} onClick={nav.prev.onClick}>
						{nav.prev.name ? `Prev examinee (${nav.prev.name})` : 'Prev examinee'}
					</Button>
					<Button variant={secondary} iconEnd='arrow_forward' labelFrom='sm' data-testid='next-examinee' disabled={nav.next.disabled} onClick={nav.next.onClick}>
						{nav.next.name ? `Next examinee (${nav.next.name})` : 'Next examinee'}
					</Button>
				</>
			) : (
				<>
					<Button variant={secondary} icon='arrow_back' labelFrom='sm' data-testid='prev-entry' disabled={nav.prev.disabled} onClick={nav.prev.onClick}>
						Prev entry
					</Button>
					<Button variant={secondary} iconEnd='arrow_forward' labelFrom='sm' data-testid='next-entry' disabled={nav.next.disabled} onClick={nav.next.onClick}>
						Next entry
					</Button>
				</>
			)}
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
	)
	return variant === 'unified' ? (
		<StickyDock variant='unified' aria-label='Scoring controls' summary={summary} actions={actions} />
	) : (
		<StickyDock variant={variant} aria-label='Scoring controls' summary={summary} status={status} actions={actions} />
	)
}

'use client'

import { connectionLabel, connectionTone, type ConnectionState } from '@/components/admin/connection'
import { StatusDot } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/admin/format'
import type { EventScorer } from '@/lib/types'
import { cx } from '@/lib/ui/cx'

// Each string names its border colour (a bare border is currentColor in Tailwind v4).
const CHIP: Record<'live' | 'pending' | 'off', string> = {
	live: 'bg-emerald-50 border border-emerald-200 text-emerald-800',
	pending: 'bg-amber-50 border border-amber-200 text-amber-800',
	off: 'bg-slate-100 border border-slate-200 text-slate-700',
}

const SMALL_CHIP = 'flex items-center gap-space-xs px-space-sm py-space-xs rounded-lg font-label-sm text-label-sm'

/**
 * The event band under the header (spec R43): the title, a "Created {date} by {createdBy}" pill (by only when set),
 * the description and the formula sentences (R46); on the right the live chip `connection-state` with `last-signal`
 * and `pending-count` beside it, the auto-upload chip while the queue syncs, and Force Sync (`force-sync`). Not printed.
 */
export function EventBand({
	event,
	formula,
	connectionState,
	lastSignalAt,
	pendingCount,
	autoSyncing,
	refreshing,
	onForceSync,
	onEditEvent,
}: {
	event: Pick<EventScorer, 'title' | 'description' | 'createdAt' | 'createdBy'>
	formula: string[]
	connectionState: ConnectionState
	lastSignalAt: string | null
	pendingCount: number
	autoSyncing: boolean
	refreshing: boolean
	onForceSync: () => void
	/** Opens Edit After Publish (B67); left out while the editor is open. */
	onEditEvent?: () => void
}) {
	const tone = connectionTone(connectionState)

	return (
		<section aria-label='Event' className='print:hidden w-full px-gutter-desktop py-space-lg bg-white border-b border-slate-200 shadow-xs'>
			<div className='flex flex-col lg:flex-row lg:items-center justify-between gap-space-md'>
				<div className='min-w-0 flex flex-col gap-space-xxs'>
					<div className='flex flex-wrap items-center gap-space-xs sm:gap-space-sm'>
						<h1 className='font-headline-lg-mobile text-headline-lg-mobile sm:font-headline-lg sm:text-headline-lg text-slate-900 tracking-tight font-bold break-words min-w-0'>
							{event.title}
						</h1>
						<span className='px-space-sm py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-label-sm text-label-sm uppercase tracking-wider font-semibold'>
							Created {formatDate(event.createdAt)}
							{event.createdBy ? ` by ${event.createdBy}` : ''}
						</span>
					</div>
					{event.description ? <p className='font-body-sm text-body-sm text-slate-600 break-words'>{event.description}</p> : null}
					{formula.map((sentence) => (
						<p key={sentence} className='font-body-sm text-body-sm text-slate-600'>
							{sentence}
						</p>
					))}
				</div>
				<div className='flex flex-wrap items-center gap-space-xs shrink-0'>
					<span data-testid='connection-state' data-state={connectionState} className={cx('flex items-center gap-space-xs px-space-md py-space-xs rounded-lg font-label-md text-label-md', CHIP[tone])}>
						{tone === 'live' ? <StatusDot variant='ping' /> : <span aria-hidden className={cx('inline-flex h-2 w-2 rounded-full', tone === 'pending' ? 'bg-amber-500' : 'bg-slate-400')} />}
						<span className='font-medium'>{connectionLabel(connectionState)}</span>
					</span>
					{lastSignalAt ? (
						<span data-testid='last-signal' className={cx(SMALL_CHIP, 'bg-white border border-slate-200 text-slate-600')}>
							Last update {formatDate(lastSignalAt)}
						</span>
					) : null}
					{pendingCount > 0 ? (
						<span data-testid='pending-count' className={cx(SMALL_CHIP, 'bg-amber-50 border border-amber-200 text-amber-800 font-semibold')}>
							Pending saves {pendingCount}
						</span>
					) : null}
					{autoSyncing ? <span className={cx(SMALL_CHIP, 'bg-sky-50 border border-sky-200 text-sky-800')}>Auto-uploading pending saves…</span> : null}
					{onEditEvent ? (
						<Button variant='admin-outline' icon='edit' data-testid='edit-event' onClick={onEditEvent}>
							Edit event
						</Button>
					) : null}
					<Button variant='admin-primary' icon='sync' data-testid='force-sync' onClick={onForceSync} disabled={refreshing}>
						{refreshing ? 'Syncing…' : 'Force Sync'}
					</Button>
				</div>
			</div>
		</section>
	)
}

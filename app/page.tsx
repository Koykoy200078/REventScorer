import Link from 'next/link'

import DeleteEventButton from '@/components/delete-event-button'
import UpdateDataButton from '@/components/update-data-button'
import DbBackupButtons from '@/components/db-backup-buttons'

import AppHeader from '@/components/ui/app-header'
import { buttonClassName } from '@/components/ui/button'
import { CHIP_NEUTRAL, EMPTY_STATE, EVENT_ROW, EYEBROW, H1, H2, H2_LARGE, HELP, ICON_BUTTON, LEDE, MENU, MENU_ITEM, MENU_ITEM_DANGER, PANEL } from '@/components/ui/form-styles'
import { cx } from '@/lib/ui/cx'
import { listEventSummaries } from '@/lib/storage'

export const dynamic = 'force-dynamic'

function formatDate(iso: string): string {
	return new Intl.DateTimeFormat('en-US', {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(new Date(iso))
}

export default async function HomePage() {
	const events = await listEventSummaries()

	return (
		<div className='theme-admin min-h-screen bg-slate-50 font-body-md text-body-md text-slate-900 antialiased px-4 pt-24 pb-8 sm:px-8'>
			<AppHeader variant='admin' brand='EventScorer' title='Admin Dashboard' />
			<div className='mx-auto w-full max-w-7xl space-y-6'>
				<header className={PANEL}>
					<p className={EYEBROW}>Dynamic Event Scorer</p>
					<h1 className={cx(H1, 'mt-2')}>EventScorer Admin Dashboard</h1>
					<p className={cx(LEDE, 'mt-3 max-w-3xl')}>Create dynamic tabulation sheets with parent criteria, subcriteria, contestant entries, and judges. Each judge gets a unique scoring link, while admins get live compiled rankings and winners.</p>

					<div className='mt-6 flex flex-wrap gap-3'>
						<Link href='/create' className={buttonClassName('admin-primary')}>
							Create New Scorer
						</Link>
						<Link href='/rating-sheet' className={buttonClassName('admin-outline')}>
							Create Rating Sheet
						</Link>
					</div>
				</header>

				<section className={PANEL}>
					<div className='flex flex-wrap items-center justify-between gap-4'>
						<div>
							<h2 className={H2_LARGE}>Scorer Events</h2>
							<span className={cx(CHIP_NEUTRAL, 'mt-2 inline-block')}>Total: {events.length}</span>
						</div>
						<DbBackupButtons />
					</div>

					{events.length === 0 ? (
						<div className={cx(EMPTY_STATE, 'mt-4')}>No scorer events yet. Create your first event to generate judge links and start scoring.</div>
					) : (
						<div className='mt-4 grid gap-3'>
							{events.map((event) => (
								<article key={event.id} className={EVENT_ROW}>
									<div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
										<div>
											<h3 className={H2}>{event.title}</h3>
											<p className={cx(HELP, 'mt-1')}>Created {formatDate(event.createdAt)}</p>
											<p className={cx(LEDE, 'mt-2')}>
												Contestants: {event.contestantCount} | Judges: {event.judgeCount} | Submitted: {event.submittedJudgeCount}
											</p>
										</div>
										<div className='flex flex-wrap items-center gap-2 self-center sm:self-auto'>
											<Link href={`/admin/${event.id}`} className={buttonClassName('admin-primary')}>
												Open Admin Results
											</Link>
											{event.isDirectRating ? (
												<Link href={`/rating-sheet?editEventId=${encodeURIComponent(event.id)}`} className={buttonClassName('admin-outline')}>
													Edit Rating Sheet
												</Link>
											) : null}
											<div className='group relative'>
												<button type='button' aria-label={`Open actions for ${event.title}`} aria-haspopup='menu' className={cx(ICON_BUTTON, 'inline-flex h-10 w-10 items-center justify-center')}>
													<svg viewBox='0 0 24 24' fill='currentColor' className='h-5 w-5' aria-hidden='true'>
														<circle cx='12' cy='5.5' r='1.7' />
														<circle cx='12' cy='12' r='1.7' />
														<circle cx='12' cy='18.5' r='1.7' />
													</svg>
												</button>
												<div className={cx(MENU, 'pointer-events-none absolute right-0 top-full z-20 mt-2 flex w-56 max-w-[calc(100vw-2rem)] flex-col gap-1 opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100')}>
													{!event.isDirectRating && (
														<UpdateDataButton eventId={event.id} className={cx(MENU_ITEM, 'inline-flex w-full items-center justify-start')} />
													)}
													<DeleteEventButton eventId={event.id} eventTitle={event.title} className={cx(MENU_ITEM_DANGER, 'inline-flex w-full items-center justify-start')} />
												</div>
											</div>
										</div>
									</div>
								</article>
							))}
						</div>
					)}
				</section>
			</div>
		</div>
	)
}

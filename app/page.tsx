import Link from 'next/link'

import DeleteEventButton from '@/components/delete-event-button'
import UpdateDataButton from '@/components/update-data-button'

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
		<div className='min-h-screen bg-transparent px-4 py-8 sm:px-8'>
			<div className='mx-auto w-full max-w-7xl space-y-6'>
				<header className='rounded-3xl border border-emerald-200 bg-white/95 p-6 shadow-xl shadow-emerald-900/10 sm:p-8'>
					<p className='text-xs uppercase tracking-[0.2em] text-emerald-800/80'>Dynamic Event Scorer</p>
					<h1 className='mt-2 text-4xl font-semibold tracking-tight text-emerald-950'>EventScorer Admin Dashboard</h1>
					<p className='mt-3 max-w-3xl text-sm text-emerald-900/80'>Create dynamic tabulation sheets with parent criteria, subcriteria, contestant entries, and judges. Each judge gets a unique scoring link, while admins get live compiled rankings and winners.</p>

					<div className='mt-6 flex flex-wrap gap-3'>
						<Link href='/create' className='inline-flex items-center rounded-full bg-emerald-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-800'>
							Create New Scorer
						</Link>
						<Link href='/rating-sheet' className='inline-flex items-center rounded-full border border-emerald-700/30 bg-emerald-50 px-5 py-2.5 text-sm font-medium text-emerald-900 transition hover:bg-emerald-100'>
							Create Rating Sheet
						</Link>
					</div>
				</header>

				<section className='rounded-3xl border border-cyan-200 bg-white/95 p-6 shadow-xl shadow-cyan-900/10 sm:p-8'>
					<div className='flex items-center justify-between'>
						<h2 className='text-xl font-semibold text-cyan-950'>Scorer Events</h2>
						<span className='rounded-full bg-cyan-100 px-3 py-1 text-xs font-medium text-cyan-900'>Total: {events.length}</span>
					</div>

					{events.length === 0 ? (
						<div className='mt-4 rounded-2xl border border-dashed border-cyan-300 bg-cyan-50/60 p-6 text-sm text-cyan-900/80'>No scorer events yet. Create your first event to generate judge links and start scoring.</div>
					) : (
						<div className='mt-4 grid gap-3'>
							{events.map((event) => (
								<article key={event.id} className='rounded-2xl border border-cyan-100 bg-cyan-50/40 p-4 transition hover:bg-cyan-50/70'>
									<div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
										<div>
											<h3 className='text-lg font-semibold text-cyan-950'>{event.title}</h3>
											<p className='mt-1 text-xs text-cyan-900/75'>Created {formatDate(event.createdAt)}</p>
											<p className='mt-2 text-sm text-cyan-900/85'>
												Contestants: {event.contestantCount} | Judges: {event.judgeCount} | Submitted: {event.submittedJudgeCount}
											</p>
										</div>
										<div className='flex flex-wrap items-center gap-2 self-center sm:self-auto'>
											<Link href={`/admin/${event.id}`} className='inline-flex items-center rounded-full border border-transparent bg-(--brand) px-4 py-2 text-sm font-semibold text-white shadow-(--shadow-soft) transition hover:bg-(--brand-strong)'>
												Open Admin Results
											</Link>
											{event.isDirectRating ? (
												<Link href={`/rating-sheet?editEventId=${encodeURIComponent(event.id)}`} className='inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100'>
													Edit Rating Sheet
												</Link>
											) : null}
											<div className='group relative'>
												<button type='button' aria-label={`Open actions for ${event.title}`} aria-haspopup='menu' className='inline-flex h-10 w-10 items-center justify-center rounded-full border border-cyan-200 bg-white text-cyan-900 shadow-sm transition hover:bg-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300'>
													<svg viewBox='0 0 24 24' fill='currentColor' className='h-5 w-5' aria-hidden='true'>
														<circle cx='12' cy='5.5' r='1.7' />
														<circle cx='12' cy='12' r='1.7' />
														<circle cx='12' cy='18.5' r='1.7' />
													</svg>
												</button>
												<div className='pointer-events-none absolute right-0 top-full z-20 mt-2 flex w-56 max-w-[calc(100vw-2rem)] flex-col gap-1 rounded-xl border border-cyan-200 bg-white p-2 opacity-0 shadow-lg shadow-cyan-900/10 transition duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100'>
													<UpdateDataButton eventId={event.id} className='inline-flex w-full items-center justify-start rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100' />
													<DeleteEventButton eventId={event.id} eventTitle={event.title} className='inline-flex w-full items-center justify-start rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900 transition hover:bg-rose-100' />
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

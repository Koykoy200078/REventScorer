'use client'

import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import Icon from '@/components/ui/icon'
import { KpiAvatarStack, KpiCard, KpiNote, KpiNoteValue, KpiTagRow } from '@/components/ui/kpi-card'
import { ProgressBar, ProgressCaption, ProgressHeading } from '@/components/ui/progress-bar'
import type { ProgramTopTeam } from '@/lib/admin/analytics'
import { formatScore, judgeInitials } from '@/lib/admin/format'
import type { ScoringKind } from '@/lib/admin/formula'
import type { AdminKpis, ProgramCohort } from '@/lib/admin/kpis'
import type { PodiumPlace } from '@/lib/admin/podium'
import type { ProgramLabel } from '@/lib/admin/program'
import { cx } from '@/lib/ui/cx'

const PLACE_LABEL: Record<number, string> = { 1: '1st place', 2: '2nd place', 3: '3rd place' }
const PROGRAM_TONE: Record<ProgramLabel, { cohort: BadgeVariant; podium: BadgeVariant; text: string; bar: 'sky' | 'emerald' }> = {
	BSINT: { cohort: 'admin-cohort-sky', podium: 'admin-program-sky-compact', text: 'text-sky-700', bar: 'sky' },
	BSCS: { cohort: 'admin-cohort-emerald', podium: 'admin-program-emerald-soft', text: 'text-emerald-700', bar: 'emerald' },
}

export interface DashboardJudge {
	id: string
	name: string
	saved: boolean
}

/**
 * The Live Scoring Dashboard (spec 2.1): the KPI cards (`kpi`, data-kpi and data-value), the podium (R48,
 * `podium-place`) and the program summary (R54). Data and callbacks only; the container computes them.
 */
export function DashboardTab({
	kpis,
	judges,
	kind,
	groupMaxScore,
	individualMaxScore,
	places,
	programOf,
	isIndividual,
	entryMaxOf,
	cohorts,
	topTeams,
	onShowRankings,
}: {
	kpis: AdminKpis
	judges: DashboardJudge[]
	kind: ScoringKind
	groupMaxScore?: number
	individualMaxScore?: number
	places: PodiumPlace[]
	programOf: (contestantId: string) => ProgramLabel | null
	isIndividual: (contestantId: string) => boolean
	/** The most one judge can give an entry (its own member rows, B65). */
	entryMaxOf: (contestantId: string) => number
	cohorts: Record<ProgramLabel, ProgramCohort>
	topTeams: Record<ProgramLabel, ProgramTopTeam[]>
	onShowRankings: () => void
}) {
	const figureLabel = kind === 'direct' ? 'Final rating' : 'Final score'
	const scaleMax = kpis.scale.value
	const shownPrograms = (['BSINT', 'BSCS'] as const).filter((program) => cohorts[program].entries > 0)

	return (
		<>
			{/* KpiGrid's classes without its top margin: the panel's gap spaces it. */}
			<div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md'>
				<KpiCard
					data-testid='kpi'
					data-kpi='contestants'
					data-value={kpis.entries}
					label='Entries'
					value={kpis.entries}
					suffix={kpis.allGroups ? 'Groups' : undefined}
					icon='groups'
					footer={
						kpis.byProgram.BSINT + kpis.byProgram.BSCS > 0 ? (
							<KpiTagRow>
								{kpis.byProgram.BSINT > 0 ? <Badge variant='admin-kpi-sky'>{kpis.byProgram.BSINT} BSINT</Badge> : null}
								{kpis.byProgram.BSCS > 0 ? <Badge variant='admin-kpi-emerald'>{kpis.byProgram.BSCS} BSCS</Badge> : null}
							</KpiTagRow>
						) : null
					}
				/>
				<KpiCard
					data-testid='kpi'
					data-kpi='judges'
					data-value={kpis.judgesWithSaves}
					label='Judges'
					value={`${kpis.judgesWithSaves} / ${kpis.judges}`}
					suffix='have saved'
					suffixTone='emerald'
					icon='gavel'
					tone='sky'
					footer={
						judges.length > 0 ? (
							<KpiAvatarStack
								people={judges.slice(0, 6).map((judge) => ({ initials: judgeInitials(judge.name), name: `${judge.name}: ${judge.saved ? 'has saved' : 'no saves yet'}`, tone: judge.saved ? 'emerald' : 'slate' }))}
								note={judges.length > 6 ? `+${judges.length - 6} more` : undefined}
							/>
						) : null
					}
				/>
				<KpiCard
					data-testid='kpi'
					data-kpi='complete'
					data-value={kpis.complete}
					label='Scores complete'
					value={`${kpis.complete} / ${kpis.entries}`}
					suffix='complete'
					icon='assignment_turned_in'
					fullWidth
					footer={
						<>
							<ProgressBar variant='kpi' value={kpis.percentComplete} aria-label='Entries every assigned judge has saved' />
							<ProgressCaption start={`${kpis.inProgress} in progress`} end={`${kpis.pending} not started`} />
							{kpis.noJudge > 0 ? <KpiNote>{kpis.noJudge} with no judge assigned</KpiNote> : null}
						</>
					}
				/>
				<KpiCard
					data-testid='kpi'
					data-kpi='scale'
					data-value={kpis.scale.value}
					label='Score scale'
					value={kpis.scale.unit === 'raw' ? formatScore(kpis.scale.value) : '100'}
					suffix={kpis.scale.unit === 'raw' ? 'raw points' : 'rating'}
					mono
					icon='speed'
					footer={
						kind === 'weighted' ? (
							<KpiNote>
								Raw maxima: group <KpiNoteValue>{formatScore(groupMaxScore ?? 0)}</KpiNoteValue>, individual <KpiNoteValue>{formatScore(individualMaxScore ?? 0)}</KpiNoteValue>
							</KpiNote>
						) : null
					}
				/>
			</div>

			<Card variant='admin-panel' as='section' aria-labelledby='podium-heading' className='w-full'>
				<div className='flex flex-col gap-space-xs pb-space-md border-b border-slate-100'>
					<div className='flex items-center gap-space-xs'>
						<Icon name='emoji_events' className='text-emerald-600 text-[20px]' />
						<h2 id='podium-heading' className='font-headline-md text-headline-md text-slate-900 tracking-tight font-bold'>
							Podium
						</h2>
					</div>
					<p className='font-body-sm text-body-sm text-slate-600'>The top three places from the saved scores. Tied entries share a place.</p>
				</div>
				{places.length === 0 ? (
					<p className='mt-space-md font-body-sm text-body-sm text-slate-500'>No scores yet.</p>
				) : (
					<div className='grid grid-cols-1 md:grid-cols-3 gap-space-md mt-space-md'>
						{places.map((place, index) => (
							<PodiumCard
								key={place.rank}
								place={place}
								figureLabel={figureLabel}
								outOf={podiumOutOf(place, kind, scaleMax, entryMaxOf)}
								programOf={programOf}
								isIndividual={isIndividual}
								centred={place.rank === 1 && !places.some((other) => other.rank === 2)}
								margin={index === 0 ? place.margin : undefined}
							/>
						))}
					</div>
				)}
			</Card>

			{shownPrograms.length > 0 ? (
				<Card variant='admin-panel' as='section' aria-labelledby='programs-heading' className='w-full'>
					<div className='flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs pb-space-md border-b border-slate-100'>
						<div>
							<div className='flex items-center gap-space-xs'>
								<Icon name='leaderboard' className='text-emerald-600 text-[20px]' />
								<h2 id='programs-heading' className='font-headline-md text-headline-md text-slate-900 tracking-tight font-bold'>
									Programs
								</h2>
							</div>
							<p className='font-body-sm text-body-sm text-slate-600 mt-0.5'>Each program&apos;s entries, average and top teams.</p>
						</div>
						<Button variant='admin-link' size='xs' iconEnd='arrow_forward' onClick={onShowRankings} className='self-start sm:self-auto'>
							Full rankings
						</Button>
					</div>
					<div className='grid grid-cols-1 lg:grid-cols-2 gap-space-xl mt-space-md'>
						{shownPrograms.map((program) => (
							<ProgramColumn key={program} program={program} cohort={cohorts[program]} teams={topTeams[program].slice(0, 3)} scaleMax={scaleMax} />
						))}
					</div>
				</Card>
			) : null}
		</>
	)
}

// A standard event's figure is out of the entry's own raw maximum (B65); tied entries with different maxima show none,
// since one number would be untrue for one of them. Weighted and direct figures are out of 100.
function podiumOutOf(place: PodiumPlace, kind: ScoringKind, scaleMax: number, entryMaxOf: (contestantId: string) => number): number | null {
	if (kind !== 'standard') return scaleMax
	const maxima = place.entries.map((entry) => entryMaxOf(entry.contestantId))
	return maxima.length > 0 && maxima.every((max) => max === maxima[0]) ? maxima[0] : null
}

function PodiumCard({
	place,
	figureLabel,
	outOf,
	programOf,
	isIndividual,
	centred,
	margin,
}: {
	place: PodiumPlace
	figureLabel: string
	/** The figure's "/ X", or null when tied entries have different maxima. */
	outOf: number | null
	programOf: (contestantId: string) => ProgramLabel | null
	isIndividual: (contestantId: string) => boolean
	centred: boolean
	margin?: number
}) {
	const champion = place.rank === 1
	// Layout 2nd / 1st / 3rd from md; with no second place the first stays in the middle column.
	const order = place.rank === 1 ? cx('order-1 md:order-2', centred && 'md:col-start-2') : place.rank === 2 ? 'order-2 md:order-1' : 'order-3 md:order-3'

	return (
		<Card
			variant={champion ? 'admin-podium-champion' : 'admin-podium'}
			data-testid='podium-place'
			data-rank={place.rank}
			data-contestant-ids={place.entries.map((entry) => entry.contestantId).join(',')}
			className={cx(order, champion && '-mt-2 md:-mt-3')}
		>
			<div aria-hidden className={cx('absolute pointer-events-none', champion ? '-right-6 -bottom-6 opacity-10 text-emerald-700' : '-right-4 -bottom-4 opacity-5 text-slate-800')}>
				<Icon name={champion ? 'workspace_premium' : 'military_tech'} className={champion ? 'text-[140px]' : 'text-[120px]'} />
			</div>
			<div className='relative'>
				<div className='flex items-center justify-between mb-space-sm'>
					<Badge variant={champion ? 'admin-rank-champion' : 'admin-rank'}>
						{champion ? <Icon name='trophy' className='text-[16px] text-emerald-600' /> : <span className={cx('font-mono', place.rank === 2 ? 'text-sky-600' : 'text-emerald-600')}>#{String(place.rank).padStart(2, '0')}</span>}
						{PLACE_LABEL[place.rank]}
					</Badge>
				</div>
				<ul className='flex flex-col gap-space-xs'>
					{place.entries.map((entry) => {
						const program = programOf(entry.contestantId)
						return (
							<li key={entry.contestantId}>
								<div className='flex flex-wrap items-center gap-space-xs'>
									<h3 className={cx('font-headline-sm text-headline-sm text-slate-900', champion ? 'font-extrabold' : 'font-bold')}>{entry.contestantName}</h3>
									{program ? <Badge variant={PROGRAM_TONE[program].podium}>{program}</Badge> : null}
									{isIndividual(entry.contestantId) ? <Badge variant='admin-topic-neutral'>Individual</Badge> : null}
								</div>
								{place.entries.length > 1 ? <p className='font-label-sm text-label-sm text-slate-600 mt-0.5'>Judges counted: {entry.judgeCount}</p> : null}
							</li>
						)
					})}
				</ul>
			</div>
			<Card variant={champion ? 'admin-score-box-champion' : 'admin-score-box'} className='relative mt-space-md'>
				<div className='flex items-baseline justify-between gap-space-sm'>
					<span className={cx('font-label-sm text-label-sm', champion ? 'text-emerald-800 font-semibold' : 'text-slate-500')}>{figureLabel}</span>
					<div className='flex items-baseline gap-1'>
						<span className={cx('font-score-display text-score-display font-mono font-bold', champion ? 'text-emerald-700' : 'text-slate-900')}>{formatScore(place.score)}</span>
						{outOf === null ? null : <span className='font-label-sm text-label-sm text-slate-500'>/ {formatScore(outOf)}</span>}
					</div>
				</div>
				<div className='flex flex-wrap items-center justify-between gap-x-space-sm font-label-sm text-label-sm text-slate-600 mt-1'>
					{place.entries.length === 1 ? (
						<span className='flex items-center gap-1'>
							<Icon name='verified' className='text-[14px] text-emerald-600' />
							Judges counted: <strong className='text-slate-900 font-mono'>{place.entries[0].judgeCount}</strong>
						</span>
					) : (
						<span>{place.entries.length} entries share this place</span>
					)}
					{margin !== undefined ? <span className='text-emerald-700 font-mono font-semibold'>Margin: +{formatScore(margin)}</span> : null}
				</div>
			</Card>
		</Card>
	)
}

function ProgramColumn({ program, cohort, teams, scaleMax }: { program: ProgramLabel; cohort: ProgramCohort; teams: ProgramTopTeam[]; scaleMax: number }) {
	const tone = PROGRAM_TONE[program]
	return (
		<div className='flex flex-col gap-space-md'>
			<div className='flex flex-wrap items-center justify-between gap-space-xs'>
				<div className='flex items-center gap-space-xs'>
					<Badge variant={tone.cohort}>{program}</Badge>
					<span className='font-label-sm text-label-sm text-slate-500'>
						{cohort.entries} {cohort.entries === 1 ? 'entry' : 'entries'}, {cohort.scored} scored
					</span>
				</div>
				<span className={cx('font-label-sm text-label-sm font-mono font-semibold', tone.text)}>Average: {cohort.average === null ? '—' : formatScore(cohort.average)}</span>
			</div>
			<Card variant='admin-well'>
				<span className='font-label-sm text-label-sm text-slate-500 uppercase font-bold tracking-wider'>Top {program} teams</span>
				{teams.length === 0 ? (
					<p className='font-label-sm text-label-sm text-slate-500'>No scored {program} entries yet.</p>
				) : (
					teams.map((team) => {
						const headingId = `program-team-${program}-${team.contestantName}-${team.programRank}`.replace(/[^A-Za-z0-9_-]/g, '-')
						return (
							<div key={`${team.contestantName}-${team.programRank}`}>
								<ProgressHeading id={headingId} tone={tone.bar} label={`${team.programRank}. ${team.contestantName}`} value={formatScore(team.score)} />
								<ProgressBar variant='rank' tone={tone.bar} value={Math.min(team.score, scaleMax)} max={scaleMax > 0 ? scaleMax : 100} aria-labelledby={headingId} />
							</div>
						)
					})
				)}
			</Card>
		</div>
	)
}

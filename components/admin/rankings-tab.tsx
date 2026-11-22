'use client'

import { useState } from 'react'

import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import Icon from '@/components/ui/icon'
import type { ProgramSubCriterionRankingGroup, ProgramTopParticipant, ProgramTopTeam, SectionRankingEntry } from '@/lib/admin/analytics'
import { formatPercent, formatScore } from '@/lib/admin/format'
import type { ScoringKind } from '@/lib/admin/formula'
import type { PodiumPlace } from '@/lib/admin/podium'
import type { ProgramLabel } from '@/lib/admin/program'
import { cx } from '@/lib/ui/cx'

const PREVIEW = 3
const PLACE_LABEL: Record<number, string> = { 1: '1st place', 2: '2nd place', 3: '3rd place' }
const COHORT: Record<ProgramLabel, BadgeVariant> = { BSINT: 'admin-cohort-sky', BSCS: 'admin-cohort-emerald' }
const PROGRAM_TEXT: Record<ProgramLabel, string> = { BSINT: 'text-sky-700', BSCS: 'text-emerald-700' }
const SUBHEAD = 'font-label-sm text-label-sm text-slate-500 uppercase font-bold tracking-wider'
const ROW = 'flex items-center justify-between gap-space-sm py-1.5 font-label-sm text-label-sm'

function rankCircle(rank: number): BadgeVariant {
	return rank === 1 ? 'admin-rank-circle-emerald' : 'admin-rank-circle'
}

/** The team and entry under a sub-criterion leader, leaving out what repeats the leader's own label. */
function subCriterionContext(entry: { participantLabel: string; teamName: string; contestantName: string; contestantId: string }, individualEntryIds: ReadonlySet<string>): string {
	const parts = individualEntryIds.has(entry.contestantId) ? [entry.contestantName] : [entry.teamName, entry.contestantName]
	return Array.from(new Set(parts.filter((part) => part && part !== entry.participantLabel))).join(' · ')
}

function ToggleAll({ shown, total, onToggle, label }: { shown: boolean; total: number; onToggle: () => void; label: string }) {
	if (total <= PREVIEW) return null
	return (
		<Button variant='admin-link-sky' size='xs' aria-expanded={shown} aria-label={shown ? `Show the top ${PREVIEW} ${label}` : `View all ${total} ${label}`} onClick={onToggle}>
			{shown ? `Top ${PREVIEW}` : `View all (${total})`}
		</Button>
	)
}

/**
 * Rankings (spec 2.4): the winners (the podium places as a list with their detail lines, winners-place), the program
 * analytics as a disclosure (per program the teams, program-team, and the leading participants, program-participant,
 * both with competition ranks within the program; the section is a label; then the sub-criterion leaders), and the
 * section analytics with export-sections. "Top 3 / View all" toggles are kept. Data and callbacks only.
 */
export function RankingsTab({
	kind,
	places,
	isIndividual,
	teams,
	participants,
	subCriteria,
	sections,
	individualEntryIds,
	onExportSections,
}: {
	kind: ScoringKind
	places: PodiumPlace[]
	isIndividual: (contestantId: string) => boolean
	teams: Record<ProgramLabel, ProgramTopTeam[]>
	participants: Record<ProgramLabel, ProgramTopParticipant[]>
	subCriteria: Record<ProgramLabel, ProgramSubCriterionRankingGroup[]>
	sections: Map<string, SectionRankingEntry[]>
	individualEntryIds: ReadonlySet<string>
	onExportSections: () => void
}) {
	const [showAll, setShowAll] = useState<Record<string, boolean>>({})
	const toggle = (key: string) => setShowAll((previous) => ({ ...previous, [key]: !previous[key] }))
	const figureLabel = kind === 'direct' ? 'Final rating' : kind === 'weighted' ? 'Final score' : 'Average'
	const programs = (['BSINT', 'BSCS'] as const).filter((program) => teams[program].length > 0 || participants[program].length > 0 || subCriteria[program].length > 0)

	return (
		<>
			<Card variant='admin-panel' as='section' aria-labelledby='winners-heading' className='w-full'>
				<div className='flex items-center gap-space-xs pb-space-sm mb-space-md border-b border-slate-100'>
					<Icon name='emoji_events' className='text-emerald-600 text-[20px]' />
					<h2 id='winners-heading' className='font-headline-md text-headline-md text-slate-900 tracking-tight font-bold'>
						Winners
					</h2>
				</div>
				{places.length === 0 ? (
					<p className='font-body-sm text-body-sm text-slate-500'>No scores yet.</p>
				) : (
					<ol className='flex flex-col gap-space-sm'>
						{places.map((place) => (
							<li key={place.rank} data-testid='winners-place' data-rank={place.rank}>
								<Card variant={place.rank === 1 ? 'admin-score-box-champion' : 'admin-score-box'} className='flex flex-col gap-space-xs'>
									<Badge variant={place.rank === 1 ? 'admin-rank-champion' : 'admin-rank'} className='self-start'>
										{place.rank === 1 ? <Icon name='trophy' className='text-[16px] text-emerald-600' /> : null}
										{PLACE_LABEL[place.rank]}
									</Badge>
									{place.entries.map((entry) => (
										<div key={entry.contestantId} className='flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-x-space-md gap-y-1'>
											<div className='flex flex-wrap items-center gap-space-xs min-w-0'>
												<span className='font-headline-sm text-headline-sm text-slate-900 font-bold'>{entry.contestantName}</span>
												{isIndividual(entry.contestantId) ? <Badge variant='admin-topic-sky'>Individual</Badge> : null}
											</div>
											<div className='font-label-sm text-label-sm text-slate-600 flex flex-wrap gap-x-space-sm sm:justify-end'>
												<span>
													{figureLabel}: <strong className='font-mono text-slate-900'>{formatScore(kind === 'direct' ? (entry.finalRating ?? entry.averageScore) : kind === 'weighted' ? (entry.weightedScore ?? entry.averageScore) : entry.averageScore)}</strong>
												</span>
												{kind === 'weighted' ? (
													<span>
														Group average {formatScore(entry.groupAverageScore ?? 0)} · Individual average {formatScore(entry.individualAverageScore ?? 0)}
													</span>
												) : null}
												{kind === 'direct' ? (
													<span>
														Base {formatScore(entry.baseFinalRating ?? 0)} · Interview bonus +{formatScore(entry.bonusPoints ?? 0)}
													</span>
												) : null}
												<span>Judges counted: {entry.judgeCount}</span>
											</div>
										</div>
									))}
								</Card>
							</li>
						))}
					</ol>
				)}
			</Card>

			<Card variant='admin-flush' as='section' aria-labelledby='programs-analytics-heading'>
				<details open className='group [&_summary::-webkit-details-marker]:hidden'>
					<summary className='flex items-center justify-between gap-space-sm p-space-lg bg-slate-50/70 border-b border-slate-200 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary'>
						<div>
							<div className='flex items-center gap-space-xs'>
								<Icon name='leaderboard' className='text-emerald-600 text-[20px]' />
								<h2 id='programs-analytics-heading' className='font-headline-md text-headline-md text-slate-900 font-bold'>
									Program analytics
								</h2>
							</div>
							<p className='font-body-sm text-body-sm text-slate-600 mt-0.5'>Teams and participants ranked within each program; tied scores share a rank.</p>
						</div>
						<span className='flex items-center gap-space-xs font-label-sm text-label-sm text-slate-500 uppercase font-semibold shrink-0'>
							<span className='group-open:hidden'>Show</span>
							<span className='hidden group-open:inline'>Hide</span>
							<Icon name='expand_more' className='text-[18px] transition-transform group-open:rotate-180' />
						</span>
					</summary>
					{programs.length === 0 ? (
						<p className='p-space-lg font-body-sm text-body-sm text-slate-500'>No scored entry has a program yet. Programs are set in the Score Audit Matrix.</p>
					) : null}
					<div className={cx('p-space-lg grid grid-cols-1 lg:grid-cols-2 gap-space-xl', programs.length === 0 && 'hidden')}>
						{programs.map((program) => {
							const programTeams = teams[program]
							const programParticipants = participants[program]
							const groups = subCriteria[program]
							const allTeams = showAll[`teams-${program}`] ?? false
							const allParticipants = showAll[`participants-${program}`] ?? false
							const allSubCriteria = showAll[`sub-${program}`] ?? false
							return (
								<div key={program} className='flex flex-col gap-space-md min-w-0'>
									<div className='flex items-center gap-space-xs'>
										<Badge variant={COHORT[program]}>{program}</Badge>
										<span className='font-label-sm text-label-sm text-slate-500'>
											{programTeams.length} scored {programTeams.length === 1 ? 'team' : 'teams'}
										</span>
									</div>

									<Card variant='admin-well-list'>
										<div className='flex items-center justify-between gap-space-sm'>
											<span className={SUBHEAD}>Top {program} teams</span>
											<ToggleAll shown={allTeams} total={programTeams.length} onToggle={() => toggle(`teams-${program}`)} label={`${program} teams`} />
										</div>
										{programTeams.length === 0 ? (
											<p className='font-label-sm text-label-sm text-slate-500'>No scored {program} teams yet.</p>
										) : (
											<ol className='divide-y divide-slate-200'>
												{(allTeams ? programTeams : programTeams.slice(0, PREVIEW)).map((team) => (
													<li key={team.contestantId} data-testid='program-team' data-program={program} data-contestant-id={team.contestantId} data-rank={team.programRank} className={ROW}>
														<span className='flex items-center gap-space-xs min-w-0'>
															<Badge variant={rankCircle(team.programRank)}>{team.programRank}</Badge>
															<span className='min-w-0'>
																<span className='block text-slate-900 font-semibold truncate'>{team.contestantName}</span>
																<span className='block text-slate-500'>Overall #{team.rank}</span>
															</span>
														</span>
														<span className={cx('font-mono font-bold', PROGRAM_TEXT[program])}>{formatScore(team.score)}</span>
													</li>
												))}
											</ol>
										)}
									</Card>

									<Card variant='admin-well-list'>
										<div className='flex items-center justify-between gap-space-sm'>
											<span className={SUBHEAD}>Leading participants</span>
											<ToggleAll shown={allParticipants} total={programParticipants.length} onToggle={() => toggle(`participants-${program}`)} label={`${program} participants`} />
										</div>
										{programParticipants.length === 0 ? (
											<p className='font-label-sm text-label-sm text-slate-500'>No individual scores for {program} yet.</p>
										) : (
											<ol className='divide-y divide-slate-200'>
												{(allParticipants ? programParticipants : programParticipants.slice(0, PREVIEW)).map((participant, index) => (
													<li
														key={`${participant.contestantId}-${participant.participantLabel}-${index}`}
														data-testid='program-participant'
														data-program={program}
														data-contestant-id={participant.contestantId}
														data-participant={participant.participantLabel}
														data-rank={participant.rank}
														className={ROW}
													>
														<span className='flex items-center gap-space-xs min-w-0'>
															<Badge variant={rankCircle(participant.rank)}>{participant.rank}</Badge>
															<span className='min-w-0'>
																<span className='block text-slate-900 font-semibold truncate'>{participant.participantLabel}</span>
																<span className='flex flex-wrap items-center gap-1 text-slate-500'>
																	{participant.contestantName}
																	<Badge variant='admin-topic-neutral'>{participant.section}</Badge>
																</span>
															</span>
														</span>
														<span className={cx('font-mono font-bold text-right shrink-0', PROGRAM_TEXT[program])}>
															{formatScore(participant.participantAverageScore)} / {formatScore(participant.participantMaxScore)}
															<span className='block font-normal text-slate-500'>{formatPercent(participant.participantRating)}</span>
														</span>
													</li>
												))}
											</ol>
										)}
									</Card>

									<Card variant='admin-well-list'>
										<div className='flex items-center justify-between gap-space-sm'>
											<span className={SUBHEAD}>Sub-criterion leaders</span>
											<ToggleAll shown={allSubCriteria} total={Math.max(0, ...groups.map((group) => group.entries.length))} onToggle={() => toggle(`sub-${program}`)} label='per sub-criterion' />
										</div>
										{groups.length === 0 ? (
											<p className='font-label-sm text-label-sm text-slate-500'>No sub-criterion scores for {program} yet.</p>
										) : (
											<div className='flex flex-col gap-space-sm'>
												{groups.map((group) => (
													<Card key={group.subCriterionKey} variant='admin-inset' className='bg-white'>
														<span className='font-label-sm text-label-sm text-slate-700 font-semibold block'>{group.subCriterionName}</span>
														<ol className='divide-y divide-slate-100'>
															{(allSubCriteria ? group.entries : group.entries.slice(0, PREVIEW)).map((entry, index) => (
																<li key={`${entry.contestantId}-${entry.participantLabel}-${index}`} className={ROW}>
																	<span className='flex items-center gap-space-xs min-w-0'>
																		<span className='font-mono text-slate-500 w-6 shrink-0'>#{entry.rank}</span>
																		<span className='min-w-0'>
																			<span className='block text-slate-900 truncate'>{entry.participantLabel}</span>
																			{subCriterionContext(entry, individualEntryIds) ? <span className='block text-slate-500 truncate'>{subCriterionContext(entry, individualEntryIds)}</span> : null}
																		</span>
																	</span>
																	<span className='font-mono text-slate-900 shrink-0'>
																		{formatScore(entry.averageScore)} / {formatScore(entry.maxScore)}
																	</span>
																</li>
															))}
														</ol>
													</Card>
												))}
											</div>
										)}
									</Card>
								</div>
							)
						})}
					</div>
				</details>
			</Card>

			{sections.size > 0 ? (
				<Card variant='admin-panel' as='section' aria-labelledby='sections-heading' className='w-full'>
					<div className='flex flex-wrap items-center justify-between gap-space-sm pb-space-sm mb-space-md border-b border-slate-100'>
						<div>
							<h2 id='sections-heading' className='font-headline-md text-headline-md text-slate-900 font-bold'>
								Section analytics
							</h2>
							<p className='font-body-sm text-body-sm text-slate-600 mt-0.5'>Entries ranked within their section, across both programs.</p>
						</div>
						<Button variant='admin-outline' icon='table_view' data-testid='export-sections' onClick={onExportSections}>
							Export sections
						</Button>
					</div>
					<div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-space-md'>
						{Array.from(sections.entries()).map(([section, entries]) => {
							const all = showAll[`section-${section}`] ?? false
							return (
								<Card key={section} variant='admin-well-list'>
									<div className='flex items-center justify-between gap-space-sm'>
										<span className='font-label-md text-label-md text-slate-900 font-bold'>{section}</span>
										<ToggleAll shown={all} total={entries.length} onToggle={() => toggle(`section-${section}`)} label={`entries of ${section}`} />
									</div>
									<ol className='divide-y divide-slate-200'>
										{(all ? entries : entries.slice(0, PREVIEW)).map((entry) => (
											<li key={entry.contestantId} className={ROW}>
												<span className='flex items-center gap-space-xs min-w-0'>
													<Badge variant={rankCircle(entry.rank)}>{entry.rank}</Badge>
													<span className='text-slate-900 font-semibold truncate'>{entry.contestantName}</span>
													{entry.program ? <span className={cx('font-semibold', PROGRAM_TEXT[entry.program])}>{entry.program}</span> : null}
												</span>
												<span className='font-mono font-bold text-slate-900'>{formatScore(entry.score)}</span>
											</li>
										))}
									</ol>
								</Card>
							)
						})}
					</div>
				</Card>
			) : null}
		</>
	)
}

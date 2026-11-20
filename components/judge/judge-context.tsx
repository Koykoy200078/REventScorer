import type { ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { ContextDescription, ContextEmphasis, ContextOverline, ContextSlot, ContextStrip, ContextTitle } from '@/components/ui/banner'
import { Card } from '@/components/ui/card'
import { formatScore } from '@/components/ui/preset-rail'
import { formatDate } from '@/lib/judge/matrix'
import type { EventContestant } from '@/lib/types'

/**
 * The judge meta line (Stage 5 Task 5, spec §2.5, critique B2): who is scoring, admin edit mode and
 * the last save, in every view and at every width (the header chip shows the name from xl only),
 * then the rubric legend on its own line when there is one. Small text is slate-500 (R30).
 */
export function JudgeMeta({ judgeName, adminEditMode, lastSubmittedAt, legendText }: { judgeName: string; adminEditMode: boolean; lastSubmittedAt?: string | null; legendText?: string | null }) {
	return (
		<div className='flex flex-col gap-space-xxs font-body-sm text-body-sm text-slate-500'>
			<p>
				Judge: <span className='font-semibold text-slate-700'>{judgeName}</span>
				{adminEditMode ? ' • Admin edit mode' : null}
				{lastSubmittedAt ? ` • Last submitted: ${formatDate(lastSubmittedAt)}` : null}
			</p>
			{legendText ? <p>Legend: {legendText}</p> : null}
		</div>
	)
}

function entryHeading(contestant: EventContestant): string {
	return contestant.section ? `${contestant.name} — ${contestant.section}` : contestant.name
}

/**
 * The Unified view's context card (C-1, U7): overline, the entry as the page heading, the structure
 * line, the meta line, the in-page view switcher (below lg) and the examinee roster.
 */
export function UnifiedContext({
	contestant,
	index,
	count,
	slotLabel,
	examineeCount,
	entryMax,
	meta,
	switcher,
	roster,
}: {
	contestant: EventContestant
	index: number
	count: number
	slotLabel?: string
	examineeCount: number
	entryMax: number
	meta: ReactNode
	switcher?: ReactNode
	roster: ReactNode
}) {
	const overline = ['Judge scoring ballot', slotLabel ? `Slot ${slotLabel}` : null, `Entry ${index + 1} of ${count}`].filter(Boolean).join(' • ')
	const structure = [
		contestant.programTag ? `Program: ${contestant.programTag}` : null,
		`Structure: ${examineeCount} ${examineeCount === 1 ? 'examinee' : 'examinees'} + group criteria`,
		`This entry's maximum: ${formatScore(entryMax)} pts`,
	]
		.filter(Boolean)
		.join(' • ')
	return (
		<Card variant='unified-section' as='section'>
			<div className='flex flex-col gap-space-md'>
				<div className='flex flex-col gap-space-xs min-w-0'>
					<p className='font-label-sm text-label-sm text-emerald-700 uppercase tracking-wider font-bold'>{overline}</p>
					<h1 className='font-headline-lg-mobile text-headline-lg-mobile md:font-headline-lg md:text-headline-lg text-slate-900 font-bold break-words min-w-0'>{entryHeading(contestant)}</h1>
					<p className='font-body-sm text-body-sm text-slate-500'>{structure}</p>
					{meta}
				</div>
				{switcher}
				{roster}
			</div>
		</Card>
	)
}

/** The Group-only strip (B-1 group, G6c1); the in-page switcher sits in its start (critique M6). */
export function ContextStripGroup({
	eventTitle,
	contestant,
	slotLabel,
	participantCount,
	entryMax,
	meta,
	switcher,
}: {
	eventTitle: string
	contestant: EventContestant
	slotLabel?: string
	participantCount: number
	entryMax: number
	meta: ReactNode
	switcher?: ReactNode
}) {
	return (
		<ContextStrip
			variant='group'
			start={
				<div className='flex flex-col gap-space-sm min-w-0'>
					<ContextOverline label={eventTitle} detail={slotLabel ? `Slot ${slotLabel}` : undefined} />
					<ContextTitle variant='group' subtitle={contestant.section}>
						<span className='break-words'>{contestant.name}</span>
					</ContextTitle>
					<ContextDescription variant='group'>
						Scores below apply to the whole entry
						{participantCount > 0 ? (
							<>
								{' '}
								<ContextEmphasis>
									({participantCount} {participantCount === 1 ? 'member' : 'members'})
								</ContextEmphasis>
							</>
						) : null}
						. This entry&apos;s maximum: {formatScore(entryMax)} pts.
					</ContextDescription>
					{meta}
					{switcher}
				</div>
			}
		/>
	)
}

/** The Individual-only strip (B-1 individual, I4c7547), also used by the direct-rating view. */
export function ContextStripIndividual({
	contestant,
	slotLabel,
	badge,
	description,
	formula,
	meta,
	switcher,
}: {
	contestant: EventContestant
	slotLabel?: string
	badge: string
	description: string
	formula?: string | null
	meta: ReactNode
	switcher?: ReactNode
}) {
	return (
		<ContextStrip
			variant='individual'
			start={
				<>
					{slotLabel ? <ContextSlot label={`Slot ${slotLabel}`} detail={contestant.section} /> : null}
					<div className='flex flex-col gap-space-xs min-w-0'>
						<ContextTitle variant='individual' badges={<Badge variant='individual-mode'>{badge}</Badge>}>
							<span className='break-words'>{contestant.name}</span>
						</ContextTitle>
						<ContextDescription variant='individual'>{description}</ContextDescription>
						{formula ? <ContextDescription variant='individual'>{formula}</ContextDescription> : null}
						{meta}
					</div>
				</>
			}
			end={switcher}
		/>
	)
}

import type { ComponentProps, ReactNode } from 'react'

import { Badge, type BadgeVariant } from '@/components/ui/badge'
import Icon from '@/components/ui/icon'
import type { IconName } from '@/components/ui/icon-data'
import { cx } from '@/lib/ui/cx'

const ICON_TILE = {
	emerald: 'w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0',
	sky: 'w-10 h-10 rounded-lg bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600 shrink-0',
} as const

const SUFFIX = {
	muted: 'font-body-sm text-body-sm text-slate-500 font-medium',
	emerald: 'font-body-sm text-body-sm text-emerald-700 font-semibold',
} as const

const VALUE = 'font-display text-display text-slate-900 leading-none font-bold'

type KpiCardProps = Omit<ComponentProps<'div'>, 'children' | 'title'> & {
	label: ReactNode
	value: ReactNode
	suffix?: ReactNode
	suffixTone?: keyof typeof SUFFIX
	mono?: boolean
	icon: IconName
	tone?: keyof typeof ICON_TILE
	fullWidth?: boolean
	footer?: ReactNode
}

/**
 * The admin KPI card (catalogue K-1: A46, A61, A80, A100): an uppercase label (A48), a large value
 * with a short suffix on the same baseline (A50, A51), an optional footer, and an icon tile on the
 * right (A56). Props: label, value and suffix are caller text; suffixTone is muted (A51, default) or
 * emerald (A66); mono adds the mono value face of A104; icon names the tile icon; tone is the tile
 * colour, emerald (A56, default) or sky (A75); fullWidth widens the text column for a progress footer
 * (A81); footer is any of the four mockup footers (KpiTagRow, KpiAvatarStack, a kpi ProgressBar with
 * ProgressCaption, or KpiNote). Other native div props go to the card.
 */
export function KpiCard({
	label,
	value,
	suffix,
	suffixTone = 'muted',
	mono = false,
	icon,
	tone = 'emerald',
	fullWidth = false,
	footer,
	className,
	...rest
}: KpiCardProps) {
	return (
		<div
			{...rest}
			className={cx(
				'bg-white p-space-md rounded-xl border border-slate-200 flex items-start justify-between shadow-xs',
				className,
			)}
		>
			<div className={fullWidth ? 'min-w-0 w-full pr-space-xs' : 'min-w-0'}>
				<span className='font-label-sm text-label-sm text-slate-500 uppercase tracking-wider block font-semibold'>{label}</span>
				<div className='flex items-baseline gap-space-xs mt-space-xxs'>
					<span className={mono ? VALUE + ' font-mono' : VALUE}>{value}</span>
					{suffix != null && <span className={SUFFIX[suffixTone]}>{suffix}</span>}
				</div>
				{footer}
			</div>
			<div className={ICON_TILE[tone]}>
				<Icon name={icon} className='text-[22px]' />
			</div>
		</div>
	)
}

/**
 * The grid that holds the KPI cards (catalogue A44): one column, two from sm, four from lg. Props:
 * children are the cards; other native div props go to the grid.
 */
export function KpiGrid({ className, ...rest }: ComponentProps<'div'>) {
	return <div {...rest} className={cx('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md mt-space-lg', className)} />
}

/**
 * The KPI footer row of small tags (catalogue A53, first card): sub-badges side by side.
 * Props: children are the badges (the KPI sub-badge styles of section 2a); other native div props
 * go to the row.
 */
export function KpiTagRow({ className, ...rest }: ComponentProps<'div'>) {
	return <div {...rest} className={cx('flex items-center gap-space-xs mt-space-sm font-label-sm text-label-sm', className)} />
}

/** One overlapping avatar in a KpiAvatarStack. */
export type KpiPerson = {
	initials: string
	/** Shown as a tooltip and read by screen readers in place of the initials. */
	name?: string
	tone?: 'emerald' | 'sky' | 'slate'
}

/** The avatar Badge for each tone (A69, A70, A71). */
const AVATAR = {
	emerald: 'admin-avatar-emerald',
	sky: 'admin-avatar-sky',
	slate: 'admin-avatar-slate',
} as const satisfies Record<NonNullable<KpiPerson['tone']>, BadgeVariant>

type KpiAvatarStackProps = Omit<ComponentProps<'div'>, 'children'> & {
	people: KpiPerson[]
	note?: ReactNode
}

/**
 * The KPI footer of overlapping initials circles (catalogue A68 to A72, judges card): emerald, sky
 * and slate circles with a white ring (the admin-avatar-* Badges of section 2a), then a muted note
 * (A72).
 * Props: people lists the circles in order (initials, optional name, tone, default slate); note is
 * caller text after the stack. Other native div props go to the row.
 */
export function KpiAvatarStack({ people, note, className, ...rest }: KpiAvatarStackProps) {
	return (
		<div {...rest} className={cx('flex items-center -space-x-2 mt-space-sm', className)}>
			{people.map((person, index) => (
				<Badge key={index} variant={AVATAR[person.tone ?? 'slate']} title={person.name}>
					<span aria-hidden={person.name ? true : undefined}>{person.initials}</span>
					{person.name && <span className='sr-only'>{person.name}</span>}
				</Badge>
			))}
			{note != null && <span className='pl-3 font-label-sm text-label-sm text-slate-500'>{note}</span>}
		</div>
	)
}

/**
 * The KPI footer line of small print (catalogue A107, scale card). Props: children are the caller
 * text, with KpiNoteValue around the figures to emphasise; other native p props go to the line.
 */
export function KpiNote({ className, ...rest }: ComponentProps<'p'>) {
	return <p {...rest} className={cx('font-label-sm text-label-sm text-slate-600 mt-space-sm', className)} />
}

/**
 * A strong mono figure inside a KpiNote (catalogue A107 inner span). Props: children are the figure;
 * other native span props go to the span.
 */
export function KpiNoteValue({ className, ...rest }: ComponentProps<'span'>) {
	return <span {...rest} className={cx('text-slate-900 font-semibold font-mono', className)} />
}

const READOUT_VALUE = {
	emerald: 'font-score-display text-score-display text-emerald-600 font-bold',
	teal: 'font-score-display text-score-display text-teal-700 font-bold',
} as const

type KpiReadoutProps = Omit<ComponentProps<'div'>, 'children'> & {
	label: ReactNode
	value: ReactNode
	outOf: ReactNode
	tone?: keyof typeof READOUT_VALUE
}

/**
 * The judge subtotal readout, an inline stat box (catalogue K-2: U42c949 with the emerald value
 * U42c1169, U186c1061 with the teal value): a muted label, the score in the score-display face, and
 * the out-of text. Props: label, value and outOf are caller text (outOf is the whole tail, for
 * example a slash, the maximum and a unit); tone is emerald (default) or teal. Other native div
 * props go to the box.
 */
export function KpiReadout({ label, value, outOf, tone = 'emerald', className, ...rest }: KpiReadoutProps) {
	return (
		<div
			{...rest}
			className={cx(
				'flex items-baseline gap-space-xs text-right bg-slate-50 border border-slate-200 px-space-md py-space-xs rounded-lg',
				className,
			)}
		>
			<span className='font-label-sm text-label-sm text-slate-500 font-medium'>{label}</span>
			<span className={READOUT_VALUE[tone]}>{value}</span>
			<span className='font-body-sm text-body-sm text-slate-500 font-medium'>{outOf}</span>
		</div>
	)
}

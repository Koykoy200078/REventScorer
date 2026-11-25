'use client'

import { useEffect, useRef, type ComponentProps, type ReactNode } from 'react'

import { StatusDot } from '@/components/ui/badge'
import Icon from '@/components/ui/icon'
import type { IconName } from '@/components/ui/icon-data'
import { cx } from '@/lib/ui/cx'

/** The three judge views, each with its own dock in the mockups (the admin console has none). */
export type DockVariant = 'unified' | 'group' | 'individual'

/** Custom property on the html element holding the measured dock height, read by DockSpacer. */
const HEIGHT_VAR = '--es-dock-height'

const SHELL = {
	unified: {
		aside: 'fixed bottom-0 left-0 right-0 z-40 bg-white/95 border-t border-slate-200 shadow-2xl',
		inner:
			'w-full max-w-5xl mx-auto px-margin md:px-margin-desktop py-space-sm flex flex-col md:flex-row items-center justify-between gap-space-md',
		lead: 'flex items-center gap-space-lg w-full md:w-auto justify-between md:justify-start',
		divider: 'hidden sm:flex h-8 w-px bg-slate-200',
		actions: 'flex flex-wrap items-center gap-2 w-full md:w-auto justify-end',
	},
	group: {
		aside:
			'fixed bottom-0 left-0 right-0 w-full z-40 bg-surface/95 border-t border-surface-container-high shadow-lg px-gutter-desktop py-space-md',
		inner: 'max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-space-md',
		lead: 'flex items-center gap-space-md w-full sm:w-auto justify-between sm:justify-start',
		divider: 'h-8 w-px bg-surface-container-high hidden md:block',
		actions: 'flex flex-wrap items-center gap-space-sm w-full sm:w-auto justify-end',
	},
	individual: {
		aside: 'fixed bottom-0 left-0 right-0 w-full z-40 bg-surface/95 border-t border-slate-200 shadow-xl',
		inner:
			'max-w-5xl mx-auto px-gutter-desktop py-space-sm flex flex-col md:flex-row md:items-center md:justify-between gap-space-md',
		lead: 'flex items-center gap-space-lg',
		divider: 'h-8 w-px bg-outline-variant/20 hidden sm:block',
		actions: 'flex flex-wrap items-center gap-space-sm',
	},
} as const

type StickyDockProps = Omit<ComponentProps<'aside'>, 'children'> & {
	summary: ReactNode
	actions?: ReactNode
} & ({ variant: 'unified'; status?: never } | { variant: 'group' | 'individual'; status?: ReactNode })

/**
 * The fixed bottom totalizer bar of the judge screens (catalogue section 9): D-1 unified (U336),
 * D-2 group only (G260) or D-3 individual only (I4c31962), picked by variant. It lays out a lead
 * block (the summary, the vertical divider, then the status) and the action buttons on the right,
 * stacking them below md (sm for group). It writes its own rendered height to a custom property on
 * the html element while mounted, so DockSpacer can reserve exactly that much room even when the
 * dock grows taller on a phone; mount one dock per page. Props: summary is a DockTotal; status is a
 * DockStatus (group and individual only, as in the mockups); actions are the buttons. Other native
 * aside props (aria-label, ref) go to the aside.
 */
export function StickyDock({ variant, summary, status, actions, className, ...rest }: StickyDockProps) {
	const innerRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		const dock = innerRef.current?.parentElement
		if (!dock) return
		const root = document.documentElement
		const write = () => root.style.setProperty(HEIGHT_VAR, Math.ceil(dock.getBoundingClientRect().height) + 'px')
		write()
		const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(write)
		observer?.observe(dock)
		return () => {
			observer?.disconnect()
			root.style.removeProperty(HEIGHT_VAR)
		}
	}, [])

	const shell = SHELL[variant]
	return (
		<aside {...rest} className={cx(shell.aside, className)}>
			<div ref={innerRef} className={shell.inner}>
				<div className={shell.lead}>
					{summary}
					<div className={shell.divider} />
					{status}
				</div>
				{actions != null && <div className={shell.actions}>{actions}</div>}
			</div>
		</aside>
	)
}

const SPACER = {
	unified: 'h-24',
	group: 'h-28',
	individual: 'h-32',
} as const

type DockSpacerProps = Omit<ComponentProps<'div'>, 'children'> & {
	variant: DockVariant
}

/**
 * The empty block that keeps page content clear of the fixed dock (catalogue section 9: the U333
 * spacer h-24, and the room G8 mb-28 and I4c9442 pb-32 leave). Its height is the mockup value or
 * the measured height of the mounted StickyDock, whichever is larger. Put it last in the scrolling
 * content. Props: variant matches the dock; other native div props go to the block, which is hidden
 * from assistive technology.
 */
export function DockSpacer({ variant, className, style, ...rest }: DockSpacerProps) {
	return (
		<div
			aria-hidden='true'
			{...rest}
			className={cx(SPACER[variant], className)}
			style={{ minHeight: 'var(' + HEIGHT_VAR + ', 0px)', ...style }}
		/>
	)
}

type DockTotalProps = Omit<ComponentProps<'div'>, 'children'> & {
	label: ReactNode
	value: ReactNode
	outOf: ReactNode
} & (
		| { variant: 'unified'; breakdown?: ReactNode; percent?: never }
		| { variant: 'group' | 'individual'; percent?: ReactNode; breakdown?: never }
	)

/**
 * The score readout at the left of the dock (catalogue section 9). Unified (U337c271): label, score
 * and out-of on one baseline, then an optional breakdown line (U337c626) built from DockTerm, DockSum
 * and DockSaved. Group (G265 to G269): label above, then score, out-of and a rounded-full percent
 * pill. Individual (I4c32295 to I4c32819): the same with a square percent pill. Props: variant
 * matches the dock; label, value and outOf are caller text (outOf is the whole tail, a slash, the
 * maximum and any unit); percent is the caller-formatted percentage (group and individual);
 * breakdown is the unified sum line. Other native div props go to the readout.
 */
export function DockTotal({ variant, label, value, outOf, percent, breakdown, className, ...rest }: DockTotalProps) {
	if (variant === 'unified') {
		return (
			<div {...rest} className={cx('flex flex-col', className)}>
				<div className='flex flex-wrap items-baseline gap-space-xs'>
					<span className='font-label-sm text-label-sm text-slate-500 uppercase font-semibold'>{label}</span>
					<span className='font-score-display text-score-display text-emerald-600 font-bold'>{value}</span>
					<span className='font-headline-sm text-headline-sm text-slate-900 font-bold'>{outOf}</span>
				</div>
				{breakdown != null && (
					<div className='flex flex-wrap items-center gap-space-xs font-label-sm text-label-sm text-slate-500'>{breakdown}</div>
				)}
			</div>
		)
	}
	if (variant === 'group') {
		return (
			<div {...rest} className={cx('flex flex-col', className)}>
				<span className='font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold'>{label}</span>
				<div className='flex items-baseline gap-1.5'>
					<span className='font-score-display text-score-display font-extrabold text-primary leading-none'>{value}</span>
					<span className='font-headline-sm text-headline-sm text-on-surface-variant font-medium'>{outOf}</span>
					{percent != null && (
						<span className='ml-1 text-label-sm font-label-sm font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full'>
							{percent}
						</span>
					)}
				</div>
			</div>
		)
	}
	return (
		<div {...rest} className={cx('flex items-center gap-space-sm', className)}>
			<div className='flex flex-col'>
				<span className='font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-semibold'>{label}</span>
				<div className='flex items-baseline gap-space-xs'>
					<span className='font-score-display text-score-display text-primary font-bold tracking-tight'>{value}</span>
					<span className='font-headline-sm text-headline-sm text-on-surface-variant font-semibold'>{outOf}</span>
					{percent != null && (
						<span className='font-label-sm text-label-sm px-2 py-0.5 rounded bg-primary/10 text-primary-container font-bold ml-1'>
							{percent}
						</span>
					)}
				</div>
			</div>
		</div>
	)
}

/**
 * One figure in the unified breakdown line (catalogue U337c626 children): caller text followed by a
 * strong slate value. Props: label (include any colon) and value; other native span props go to the
 * span.
 */
export function DockTerm({ label, value, ...rest }: Omit<ComponentProps<'span'>, 'children'> & { label: ReactNode; value: ReactNode }) {
	return (
		<span {...rest}>
			{label} <strong className='text-slate-800'>{value}</strong>
		</span>
	)
}

/**
 * The emphasised result in the unified breakdown line (catalogue U337c929). Props: children are the
 * caller text; other native span props go to the span.
 */
export function DockSum({ className, ...rest }: ComponentProps<'span'>) {
	return <span {...rest} className={cx('font-semibold text-emerald-700', className)} />
}

/**
 * The save indicator at the end of the unified breakdown line (catalogue U337c1023): an icon and
 * caller text in emerald. Props: icon (default cloud_done) and children; other native span props
 * (role status, for one) go to the span.
 */
export function DockSaved({
	icon = 'cloud_done',
	children,
	className,
	...rest
}: ComponentProps<'span'> & { icon?: IconName }) {
	return (
		<span {...rest} className={cx('text-emerald-700 font-medium flex items-center gap-0.5', className)}>
			<Icon name={icon} className='text-[15px]' />
			{children}
		</span>
	)
}

type DockStatusProps = Omit<ComponentProps<'div'>, 'children'> & { children: ReactNode } & (
		| { variant: 'group'; detail?: never; indicator?: never }
		| { variant: 'individual'; detail?: ReactNode; indicator?: ReactNode }
	)

/**
 * The status block after the divider in the dock, hidden on small screens (catalogue section 9).
 * Group (G273 to G275, shown from md): a pulsing primary dot (the pulse-primary StatusDot, G274,
 * hidden from assistive technology) and one line of muted text. Individual
 * (I4c33049 to I4c33894, shown from sm): an indicator (the ProgressRing of PB-4), a strong line and
 * a muted detail line. Props: variant matches the dock; children are the main line; detail and
 * indicator are individual only. Other native div props go to the block.
 */
export function DockStatus({ variant, children, detail, indicator, className, ...rest }: DockStatusProps) {
	if (variant === 'group') {
		return (
			<div {...rest} className={cx('hidden md:flex items-center gap-2', className)}>
				<StatusDot variant='pulse-primary' />
				<span className='font-label-sm text-label-sm text-on-surface-variant font-medium'>{children}</span>
			</div>
		)
	}
	return (
		<div {...rest} className={cx('hidden sm:flex items-center gap-space-sm', className)}>
			{indicator}
			<div className='flex flex-col'>
				<span className='font-label-sm text-label-sm text-on-surface font-semibold'>{children}</span>
				{detail != null && <span className='font-label-sm text-label-sm text-on-surface-variant'>{detail}</span>}
			</div>
		</div>
	)
}

import { useId, type ComponentProps, type HTMLAttributes, type ReactNode } from 'react'

import { Badge, StatusDot } from '@/components/ui/badge'
import Icon from '@/components/ui/icon'
import type { IconName } from '@/components/ui/icon-data'
import { CLICKABLE, DISABLED, FOCUS_RING } from '@/components/ui/styles'
import { cx } from '@/lib/ui/cx'

const STRIP = {
	group: {
		root: 'w-full bg-surface border-b border-surface-container-high py-space-md px-gutter-desktop',
		inner: 'max-w-5xl mx-auto flex flex-col gap-space-md',
		start: '',
		end: '',
	},
	individual: {
		root: 'w-full bg-surface border-b border-outline-variant/15 py-space-sm px-gutter-desktop',
		inner: 'max-w-5xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-space-sm',
		start: 'flex items-center gap-space-md',
		end: 'flex items-center gap-space-md',
	},
	admin: {
		root: 'w-full px-gutter-desktop py-space-lg bg-white border-b border-slate-200 shadow-xs',
		inner: 'flex flex-col lg:flex-row lg:items-center justify-between gap-space-md',
		start: 'min-w-0',
		end: 'flex flex-wrap items-center gap-space-xs shrink-0',
	},
} as const

type ContextStripProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & { start: ReactNode } & (
		| { variant: 'group'; end?: never; below?: never }
		| { variant: 'individual'; end?: ReactNode; below?: never }
		| { variant: 'admin'; end?: ReactNode; below?: ReactNode }
	)

/**
 * The full-bleed page context strip under the header, with a bottom rule (catalogue B-1). Group
 * (G6c1, a section) centres one column; individual (I4c7547) puts start and end side by side from
 * md; admin (A4) puts them side by side from lg and adds a block below the row (the KPI grid A44).
 * Props: variant; start is the title block; end is the right-hand cluster (individual and admin);
 * below is the admin block under the row. Other native props go to the strip. Build start and end
 * from the pieces below:
 * - group start: ContextOverline, ContextTitle and ContextDescription (variant group), with
 *   ContextEmphasis around the strong figures;
 * - individual start: ContextSlot, then a column (a div with the mockup's flex flex-col) holding
 *   ContextTitle and ContextDescription (variant individual); individual end: ContextTimer,
 *   ContextDivider and ContextMode;
 * - admin start: ContextTitle and ContextDescription (variant admin); admin end: a StatusStrip and
 *   the buttons.
 */
export function ContextStrip({ variant, start, end, below, className, ...rest }: ContextStripProps) {
	const strip = STRIP[variant]
	const Tag = variant === 'group' ? 'section' : 'div'
	return (
		<Tag {...rest} className={cx(strip.root, className)}>
			<div className={strip.inner}>
				{variant === 'group' ? (
					<div>{start}</div>
				) : (
					<>
						<div className={strip.start}>{start}</div>
						{end != null && <div className={strip.end}>{end}</div>}
					</>
				)}
			</div>
			{below}
		</Tag>
	)
}

type ContextOverlineProps = Omit<ComponentProps<'div'>, 'children'> & {
	label: ReactNode
	detail?: ReactNode
}

/**
 * The overline above the group page title (catalogue G6c168): a bold uppercase primary label
 * (G6c225), a bullet (G6c343, hidden from assistive technology) and a muted detail (G6c417). Props:
 * label and detail are caller text; other native div props go to the row.
 */
export function ContextOverline({ label, detail, className, ...rest }: ContextOverlineProps) {
	return (
		<div {...rest} className={cx('flex items-center gap-space-xs mb-space-xxs', className)}>
			<span className='font-label-sm text-label-sm uppercase tracking-wider text-primary font-bold'>{label}</span>
			{detail != null && (
				<>
					<span className='text-on-surface-variant font-label-sm text-label-sm' aria-hidden='true'>
						•
					</span>
					<span className='font-label-sm text-label-sm text-on-surface-variant'>{detail}</span>
				</>
			)}
		</div>
	)
}

const TITLE = {
	group: {
		row: 'flex items-baseline gap-space-sm flex-wrap',
		heading: 'font-headline-md text-headline-md text-on-surface font-extrabold tracking-tight',
	},
	individual: {
		row: 'flex items-center gap-space-xs flex-wrap',
		heading: 'font-headline-sm text-headline-sm text-on-surface font-bold tracking-tight',
	},
	admin: {
		row: 'flex flex-wrap items-center gap-space-xs sm:gap-space-sm mb-space-xxs',
		heading: 'font-headline-lg text-headline-lg text-slate-900 tracking-tight font-bold',
	},
} as const

type ContextTitleProps = Omit<ComponentProps<'div'>, 'children'> & {
	children: ReactNode
	as?: 'h1' | 'h2' | 'h3' | 'span'
} & (
		| { variant: 'group'; subtitle?: ReactNode; badges?: never }
		| { variant: 'individual' | 'admin'; badges?: ReactNode; subtitle?: never }
	)

/**
 * The page title row of the context strip (catalogue B-1). Group: G6c515 with the h1 G6c571 and a
 * muted subtitle on the same baseline (G6c687). Individual: I4c8165 with the h1 I4c8219 and room for
 * the individual-mode Badge (I4c8401). Admin: A8 with the title A9 and room for the admin-created and
 * admin-live badges (A10, A11). Props: variant; children are the title text; subtitle (group) is
 * caller text; badges (individual and admin) are Badge elements; as picks the title element, h1 by
 * default in every variant (the admin mockup draws A9 as a span, but neither it nor AppHeader has an
 * h1, so the event title is promoted to the page heading; pass span to keep the markup). Other native
 * div props go to the row.
 */
export function ContextTitle({ variant, as: Title = 'h1', children, subtitle, badges, className, ...rest }: ContextTitleProps) {
	const title = TITLE[variant]
	return (
		<div {...rest} className={cx(title.row, className)}>
			<Title className={title.heading}>{children}</Title>
			{subtitle != null && <span className='font-body-md text-body-md text-on-surface-variant font-medium'>{subtitle}</span>}
			{badges}
		</div>
	)
}

const DESCRIPTION = {
	group: 'font-body-sm text-body-sm text-on-surface-variant mt-0.5',
	individual: 'font-body-sm text-body-sm text-on-surface-variant',
	admin: 'font-body-sm text-body-sm text-slate-600',
} as const

/**
 * The description line under the page title (catalogue G6c822 group, I4c8563 individual, A16 admin).
 * Props: variant; children are the caller text, with ContextEmphasis around the strong parts; other
 * native p props go to the paragraph.
 */
export function ContextDescription({ variant, className, ...rest }: ComponentProps<'p'> & { variant: keyof typeof DESCRIPTION }) {
	return <p {...rest} className={cx(DESCRIPTION[variant], className)} />
}

const EMPHASIS = {
	default: 'font-semibold text-on-surface',
	primary: 'font-semibold text-primary',
} as const

/**
 * A strong part of a ContextDescription (catalogue G6c822 inner spans): semibold on-surface text, or
 * primary for the scope figure. Props: tone (default or primary); children are the caller text;
 * other native span props go to the span.
 */
export function ContextEmphasis({ tone = 'default', className, ...rest }: ComponentProps<'span'> & { tone?: keyof typeof EMPHASIS }) {
	return <span {...rest} className={cx(EMPHASIS[tone], className)} />
}

type ContextSlotProps = Omit<ComponentProps<'span'>, 'children'> & {
	label: ReactNode
	detail?: ReactNode
}

/**
 * The slot chip at the start of the individual strip (catalogue I4c7792, the individual-slot Badge):
 * an uppercase secondary label (I4c7893), a bullet hidden from assistive technology, and a muted
 * detail (I4c8042). Props: label and detail are caller text; other native span props go to the chip.
 */
export function ContextSlot({ label, detail, ...rest }: ContextSlotProps) {
	return (
		<Badge {...rest} variant='individual-slot'>
			<span className='font-label-sm text-label-sm font-semibold uppercase text-secondary'>{label}</span>
			{detail != null && (
				<>
					<span className='text-outline text-label-sm' aria-hidden='true'>
						•
					</span>
					<span className='font-label-sm text-label-sm text-on-surface-variant font-medium'>{detail}</span>
				</>
			)}
		</Badge>
	)
}

type ContextTimerProps = Omit<ComponentProps<'div'>, 'children'> & {
	label: ReactNode
	value: ReactNode
}

/**
 * The timer pill at the end of the individual strip (catalogue I4c8772; its v3 shadow-sm is the v4
 * shadow-xs): a pulsing primary dot (the pulse-primary StatusDot, I4c8874), a muted label (I4c8943)
 * and the bold time (I4c9029). Props: label and value are caller text; other native div props go to
 * the pill (role timer, for one).
 */
export function ContextTimer({ label, value, className, ...rest }: ContextTimerProps) {
	return (
		<div
			{...rest}
			className={cx('flex items-center gap-2 bg-surface-container-low px-space-md py-1.5 rounded-lg shadow-xs', className)}
		>
			<StatusDot variant='pulse-primary' />
			<span className='font-label-sm text-label-sm text-on-surface-variant'>{label}</span>
			<span className='font-label-md text-label-md font-bold text-on-surface ml-1'>{value}</span>
		</div>
	)
}

/**
 * The thin vertical rule between the timer and the mode in the individual strip (catalogue I4c9120),
 * shown from sm and hidden from assistive technology. Props: native div props go to the rule.
 */
export function ContextDivider({ className, ...rest }: Omit<ComponentProps<'div'>, 'children'>) {
	return <div aria-hidden='true' {...rest} className={cx('h-6 w-px bg-outline-variant/20 hidden sm:block', className)} />
}

/**
 * The mode note at the end of the individual strip, shown from sm (catalogue I4c9186): an icon
 * (verified_user by default, at text-[18px]) and medium label text (I4c9336). Props: icon replaces
 * the icon; children are the caller text; other native div props go to the note.
 */
export function ContextMode({
	icon = 'verified_user',
	children,
	className,
	...rest
}: ComponentProps<'div'> & { icon?: IconName }) {
	return (
		<div {...rest} className={cx('hidden sm:flex items-center gap-space-xs text-on-surface-variant', className)}>
			<Icon name={icon} className='text-[18px]' />
			<span className='font-label-sm text-label-sm font-medium'>{children}</span>
		</div>
	)
}

type StatusStripProps = Omit<ComponentProps<'div'>, 'children'> & { children: ReactNode } & (
		| { variant: 'session' | 'socket'; detail?: never }
		| { variant: 'header'; detail?: ReactNode }
	)

/**
 * A compact live-status strip with an animated dot (catalogue B-2). Session (U15): emerald box,
 * pulsing dot, emerald-900 label. Socket (A22): emerald box, ping dot, mono emerald text. Header
 * (A2c4864): slate rounded-full pill, shown from xl only as in the admin header, with ping dot,
 * uppercase emerald label, a bullet and a muted mono detail. Props: variant; children are the main
 * text; detail is the header pill tail. Other native div props go to the strip (add role status
 * when its text should be announced as it changes).
 */
export function StatusStrip({ variant, children, detail, className, ...rest }: StatusStripProps) {
	if (variant === 'session') {
		return (
			<div
				{...rest}
				className={cx('flex items-center gap-space-xs bg-emerald-50 border border-emerald-200 px-space-sm py-1 rounded-md', className)}
			>
				<StatusDot variant='pulse' />
				<span className='font-label-sm text-label-sm text-emerald-900 font-medium'>{children}</span>
			</div>
		)
	}
	if (variant === 'socket') {
		return (
			<div
				{...rest}
				className={cx(
					'flex items-center gap-space-xs px-space-md py-space-xs rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-label-md text-label-md',
					className,
				)}
			>
				<StatusDot variant='ping' />
				<span className='font-mono text-emerald-700 font-medium'>{children}</span>
			</div>
		)
	}
	return (
		<div
			{...rest}
			className={cx(
				'hidden xl:flex items-center gap-space-sm px-space-md py-space-xs rounded-full bg-slate-100 border border-slate-200/80',
				className,
			)}
		>
			<StatusDot variant='ping-header' />
			<span className='font-label-sm text-label-sm text-emerald-700 uppercase tracking-wider font-semibold'>{children}</span>
			{detail != null && (
				<>
					<span className='text-slate-300 text-label-sm' aria-hidden='true'>
						•
					</span>
					<span className='font-label-sm text-label-sm text-slate-500 font-mono'>{detail}</span>
				</>
			)}
		</div>
	)
}

const INFO = {
	emerald: { icon: 'check', className: 'text-emerald-600 text-[18px] shrink-0 mt-0.5' },
	sky: { icon: 'info', className: 'text-sky-600 text-[18px] shrink-0 mt-0.5' },
} as const satisfies Record<string, { icon: IconName; className: string }>

type InfoRowProps = Omit<ComponentProps<'div'>, 'children' | 'title'> & {
	heading: ReactNode
	children?: ReactNode
	tone?: keyof typeof INFO
	icon?: IconName
}

/**
 * A rule or info row with a leading icon (catalogue B-3: A908 and A915 with the emerald check A909,
 * A922 with the sky info icon A923): a bold line and a muted description in a slate box. Props:
 * heading and children (the description) are caller text; tone is emerald (default) or sky and sets
 * the icon colour and its default icon; icon replaces that icon. Other native div props go to the
 * row.
 */
export function InfoRow({ heading, children, tone = 'emerald', icon, className, ...rest }: InfoRowProps) {
	const info = INFO[tone]
	return (
		<div
			{...rest}
			className={cx('p-space-sm rounded-lg bg-slate-50 border border-slate-200 flex items-start gap-space-xs', className)}
		>
			<Icon name={icon ?? info.icon} className={info.className} />
			<div>
				<span className='font-label-md text-label-md text-slate-900 font-bold block'>{heading}</span>
				{children != null && <span className='font-body-sm text-body-sm text-slate-600'>{children}</span>}
			</div>
		</div>
	)
}

type DisclosureBarProps = Omit<ComponentProps<'button'>, 'children' | 'type' | 'title'> & {
	expanded: boolean
	icon: IconName
	heading: ReactNode
	description?: ReactNode
	toggleLabel?: ReactNode
	headingLevel?: 2 | 3 | 4
}

/**
 * The clickable header bar that shows or hides a section (catalogue B-4, A232): an emerald icon tile
 * (A234), a bold title (A238) over a muted description (A239), and on the right a small uppercase
 * label (A243) with a caret that reads expand_less when open and expand_more when closed (A244).
 * The mockup div becomes a real button inside a heading (the accordion pattern), so it works from
 * the keyboard and reports its state: the button and the heading are named by the title alone, the
 * description is the button's description, and the toggle label is hidden from assistive technology
 * because aria-expanded already says whether the section is open. Props: expanded (sets
 * aria-expanded and the caret); icon; heading, description and toggleLabel are caller text;
 * headingLevel (default 3, the mockup h3). Pass onClick to toggle and aria-controls with the id of
 * the section it shows. Other native button props go to the button, and aria-labelledby or
 * aria-describedby passed there replace the built-in ones.
 */
export function DisclosureBar({
	expanded,
	icon,
	heading,
	description,
	toggleLabel,
	headingLevel = 3,
	className,
	...rest
}: DisclosureBarProps) {
	const titleId = useId()
	const descriptionId = useId()
	const Heading = headingLevel === 2 ? 'h2' : headingLevel === 4 ? 'h4' : 'h3'
	return (
		<Heading>
			<button
				type='button'
				aria-expanded={expanded}
				aria-labelledby={titleId}
				aria-describedby={description != null ? descriptionId : undefined}
				{...rest}
				className={cx(
					'w-full text-left px-space-lg py-space-md bg-slate-50 border-b border-slate-200 flex items-center justify-between',
					CLICKABLE,
					FOCUS_RING,
					DISABLED,
					className,
				)}
			>
				<span className='flex items-center gap-space-sm'>
					<span className='w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600'>
						<Icon name={icon} className='text-[18px]' />
					</span>
					<span>
						<span id={titleId} className='block font-headline-sm text-headline-sm text-slate-900 font-bold'>
							{heading}
						</span>
						{description != null && (
							<span id={descriptionId} className='block font-body-sm text-body-sm text-slate-600'>
								{description}
							</span>
						)}
					</span>
				</span>
				<span className='flex items-center gap-space-sm'>
					{toggleLabel != null && (
						<span className='font-label-sm text-label-sm text-slate-500 uppercase font-semibold' aria-hidden='true'>
							{toggleLabel}
						</span>
					)}
					<Icon name={expanded ? 'expand_less' : 'expand_more'} className='text-slate-600 transition-transform duration-300' />
				</span>
			</button>
		</Heading>
	)
}

const FOOTER = {
	judge: {
		root: 'w-full bg-white border-t border-slate-200 mt-space-2xl',
		inner: 'w-full px-gutter-desktop py-space-md flex flex-col sm:flex-row items-center justify-between gap-space-sm',
		start: 'flex items-center gap-space-sm text-slate-500',
		end: 'flex items-center gap-space-lg text-slate-500',
	},
	admin: {
		root: 'w-full bg-white border-t border-slate-200 mt-auto py-space-md',
		inner: 'w-full px-gutter-desktop flex flex-col md:flex-row items-center justify-between gap-space-sm',
		start: 'flex items-center gap-space-md font-label-sm text-label-sm text-slate-500',
		end: 'flex items-center gap-space-md font-label-sm text-label-sm text-slate-500',
	},
} as const

type StatusFooterProps = Omit<ComponentProps<'footer'>, 'children'> & {
	variant: keyof typeof FOOTER
	start?: ReactNode
	end?: ReactNode
}

/**
 * The page footer status line (catalogue B-5): judge is the unified footer (U477c10, with groups
 * U477 start and end), admin is the console footer (A1224c14), whose top margin is auto so it sits
 * at the bottom of a column layout. Props: variant; start and end are the left and right clusters
 * (caller markup: status dot, label spans, strong figures); other native footer props go to the
 * footer.
 */
export function StatusFooter({ variant, start, end, className, ...rest }: StatusFooterProps) {
	const footer = FOOTER[variant]
	return (
		<footer {...rest} className={cx(footer.root, className)}>
			<div className={footer.inner}>
				{start != null && <div className={footer.start}>{start}</div>}
				{end != null && <div className={footer.end}>{end}</div>}
			</div>
		</footer>
	)
}

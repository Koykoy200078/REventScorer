import Link from 'next/link'
import type { ComponentPropsWithRef, ReactNode } from 'react'

import Icon from '@/components/ui/icon'
import { FOCUS_RING } from '@/components/ui/styles'
import { cx } from '@/lib/ui/cx'

type HeaderBaseProps = Omit<ComponentPropsWithRef<'header'>, 'title'> & {
	/** The wordmark beside the logo tile (G4c4200 judge, A2c4264 admin). */
	brand?: ReactNode
	/** Judge: the event line (G4c4389). Admin: the current breadcrumb (A2c4770). */
	title?: ReactNode
	/** The right-hand cluster (G4c5417 judge, A2c5483 admin): switchers, chips, buttons, avatar. */
	actions?: ReactNode
}

type JudgeOnlyProps = {
	/**
	 * Replaces the logo cluster G4c3985 (gavel tile and brand) at the start of the left cluster, for
	 * example the group switcher that opens the unified mockup's header (U3c3988). Left out, the logo
	 * shows; null shows nothing there. When given, brand is ignored.
	 */
	lead?: ReactNode
	/** The grey line under the event line (G4c4514). */
	subtitle?: ReactNode
	/** The centre slot (G4c4624), shown from md up: the route switcher (SC-2). */
	switcher?: ReactNode
}

type AdminOnlyProps = {
	/** The first breadcrumb (A2c4595). */
	breadcrumbParent?: ReactNode
	/** Where the first breadcrumb links to. Without it the crumb is plain text. */
	breadcrumbHref?: string
	/** Accessible name of the breadcrumb nav (A2c4465). */
	breadcrumbLabel?: string
	/** Rendered between the two clusters as given: the live pill (B-2, A2c4864). */
	status?: ReactNode
	/** The page tabs of the second row (T-1 nav A2c7585, the RouteTabs of tabs.tsx). The header draws the row A2c7454 around them. */
	subnav?: ReactNode
	/** Text of the compact live indicator at the right end of the second row (A2c8612, A2c8756), shown below xl where the status pill is hidden. */
	subnavStatus?: ReactNode
}

type Without<T> = { [K in keyof T]?: never }

export type AppHeaderProps = HeaderBaseProps &
	(
		| ({ variant?: 'judge' } & JudgeOnlyProps & Without<AdminOnlyProps>)
		| ({ variant: 'admin' } & AdminOnlyProps & Without<JudgeOnlyProps>)
	)

/**
 * The fixed top bar of catalogue section 18. variant judge (default) is H-1: shell G4c3709, row
 * G4c3829, left cluster G4c3919 with the gavel logo tile G4c4029, the brand, the divider G4c4312 and
 * the title block G4c4353, then the centre slot G4c4624 and the right cluster G4c5417. It serves all
 * three judge views. The logo is the default start of the left cluster; the unified mockup has no
 * logo there and opens with its group switcher instead (U3c3988, repeated in U3c6299), which lead
 * reproduces. Which of the two the unified view shows is pending the owner (catalogue section G).
 * variant admin is H-2: shell A2c3760, row A2c3873, left cluster A2c3963 with the tonal analytics
 * tile A2c4068, the brand, the divider A2c4399 and the breadcrumb nav A2c4465, then status and the
 * right cluster A2c5483; the second row A2c7454 holds subnav and the compact live indicator A2c8612.
 * Props: variant, brand, title, actions; judge also lead, subtitle and switcher; admin also
 * breadcrumbParent, breadcrumbHref, breadcrumbLabel, status, subnav and subnavStatus. Other native header props
 * and className go on the header. The header is fixed and leaves no space behind it: give the main
 * element pt-16 (judge) or pt-28 (admin, two rows).
 * Deviations: the breadcrumb nav A2c4465 adds p-1 -m-1. Its truncate clips overflow at the padding
 * edge, which cut off the focus ring of the breadcrumb link; the padding gives the ring room and the
 * negative margin cancels it, so the text does not move.
 */
export default function AppHeader({
	variant = 'judge',
	brand,
	title,
	lead,
	subtitle,
	switcher,
	breadcrumbParent,
	breadcrumbHref,
	breadcrumbLabel = 'Breadcrumb',
	status,
	actions,
	subnav,
	subnavStatus,
	className,
	...rest
}: AppHeaderProps) {
	if (variant === 'admin') {
		return (
			<header
				className={cx(
					'fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs',
					className,
				)}
				{...rest}
			>
				<div className='h-16 w-full px-gutter-desktop flex items-center justify-between gap-space-md'>
					<div className='flex items-center gap-space-lg min-w-0'>
						<div className='flex items-center gap-space-sm shrink-0'>
							<div className='w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600'>
								<Icon name='analytics' className='text-[20px]' />
							</div>
							{brand ? (
								<span className='font-headline-sm text-headline-sm tracking-tight text-slate-900 font-bold hidden sm:inline-block'>
									{brand}
								</span>
							) : null}
						</div>
						{breadcrumbParent || title ? (
							<>
								<div aria-hidden className='h-4 w-px bg-slate-200 hidden md:block shrink-0' />
								<nav
									aria-label={breadcrumbLabel}
									className='hidden md:flex items-center gap-space-xs font-label-md text-label-md truncate text-slate-500 p-1 -m-1'
								>
									{breadcrumbParent ? (
										<>
											{breadcrumbHref ? (
												<Link
													href={breadcrumbHref}
													className={cx('hover:text-slate-900 transition-colors cursor-pointer', FOCUS_RING)}
												>
													{breadcrumbParent}
												</Link>
											) : (
												<span>{breadcrumbParent}</span>
											)}
											<Icon name='chevron_right' className='text-[14px] text-slate-400' />
										</>
									) : null}
									{title ? (
										<span aria-current='page' className='text-slate-800 truncate font-medium'>
											{title}
										</span>
									) : null}
								</nav>
							</>
						) : null}
					</div>
					{status}
					<div className='flex items-center gap-space-sm shrink-0'>{actions}</div>
				</div>
				{subnav || subnavStatus ? (
					<div className='bg-slate-50 border-t border-slate-200 px-gutter-desktop py-space-xs flex items-center justify-between overflow-x-auto'>
						{subnav}
						{subnavStatus ? (
							<div className='xl:hidden flex items-center gap-space-xs pl-space-md shrink-0'>
								<span aria-hidden className='inline-flex h-2 w-2 rounded-full bg-emerald-500' />
								<span className='font-label-sm text-label-sm text-slate-500 font-mono'>{subnavStatus}</span>
							</div>
						) : null}
					</div>
				) : null}
			</header>
		)
	}

	return (
		<header
			className={cx(
				'fixed top-0 left-0 right-0 w-full z-50 bg-white/95 backdrop-blur-xl border-b border-slate-200 shadow-xs',
				className,
			)}
			{...rest}
		>
			<div className='h-16 w-full px-gutter-desktop flex items-center justify-between gap-space-md'>
				<div className='flex items-center gap-space-md min-w-0 shrink-0'>
					{lead === undefined ? (
						<div className='flex items-center gap-space-xs'>
							<div className='w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-xs'>
								<Icon name='gavel' className='text-[19px]' />
							</div>
							{brand ? (
								<span className='font-headline-sm text-headline-sm text-slate-900 font-bold tracking-tight'>{brand}</span>
							) : null}
						</div>
					) : (
						lead
					)}
					{title || subtitle ? (
						<>
							<div aria-hidden className='h-5 w-px bg-slate-200' />
							<div className='flex flex-col truncate'>
								{title ? (
									<span className='font-label-md text-label-md text-slate-800 font-medium truncate'>{title}</span>
								) : null}
								{subtitle ? (
									<span className='font-label-sm text-label-sm text-slate-500 truncate'>{subtitle}</span>
								) : null}
							</div>
						</>
					) : null}
				</div>
				<div className='hidden md:flex items-center justify-center flex-1'>{switcher}</div>
				<div className='flex items-center gap-space-md shrink-0'>{actions}</div>
			</div>
		</header>
	)
}

/**
 * The judge header room chip (G4c6340): a small slate box with teal text, shown from sm up.
 * Children are the text. Other native div props and className go on the box.
 */
export function HeaderChip({ className, children, ...rest }: ComponentPropsWithRef<'div'>) {
	return (
		<div
			className={cx('hidden sm:flex items-center bg-slate-100 px-space-sm py-1 rounded-md border border-slate-200', className)}
			{...rest}
		>
			<span className='font-label-sm text-label-sm font-semibold text-teal-700'>{children}</span>
		</div>
	)
}

type HeaderUserChipProps = Omit<ComponentPropsWithRef<'div'>, 'children'> & {
	/** The signed-in name (G4c7157). */
	name: ReactNode
	/** The emerald line under it, for example the judge number (G4c7259). */
	detail?: ReactNode
}

/**
 * The judge header user chip (G4c6837): round emerald person avatar (G4c6946) and, from xl up, the
 * name and detail lines (G4c7110). Props: name, detail; other native div props and className go on
 * the chip.
 */
export function HeaderUserChip({ name, detail, className, ...rest }: HeaderUserChipProps) {
	return (
		<div
			className={cx(
				'flex items-center gap-space-xs bg-slate-100 pl-1 pr-3 py-1 rounded-full border border-slate-200',
				className,
			)}
			{...rest}
		>
			<div className='w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-white'>
				<Icon name='person' className='text-[16px]' />
			</div>
			<div className='hidden xl:flex flex-col text-left'>
				<span className='font-label-sm text-label-sm text-slate-900 font-semibold leading-tight'>{name}</span>
				{detail ? (
					<span className='font-label-sm text-label-sm text-emerald-700 font-medium leading-none'>{detail}</span>
				) : null}
			</div>
		</div>
	)
}

type HeaderAvatarProps = Omit<ComponentPropsWithRef<'div'>, 'children'> & {
	/** Who is signed in. Given, it names the avatar for screen readers and as a tooltip; without it the avatar is decorative. */
	label?: string
}

/**
 * The admin header avatar (A2c7225): an emerald circle with a person icon. Props: label; other
 * native div props and className go on the circle.
 */
export function HeaderAvatar({ label, className, ...rest }: HeaderAvatarProps) {
	return (
		<div
			className={cx(
				'w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center shrink-0 ml-space-xs text-white font-semibold text-xs shadow-xs',
				className,
			)}
			{...(label ? { role: 'img', 'aria-label': label, title: label } : { 'aria-hidden': true })}
			{...rest}
		>
			<Icon name='person' className='text-[18px]' />
		</div>
	)
}

/**
 * The thin vertical rule between admin header actions (A2c5998), shown from sm up. Other native div
 * props and className go on the rule.
 */
export function HeaderDivider({ className, ...rest }: ComponentPropsWithRef<'div'>) {
	return <div aria-hidden className={cx('h-4 w-px bg-slate-200 hidden sm:block', className)} {...rest} />
}

import type { ComponentProps, ReactNode } from 'react'

import Icon from '@/components/ui/icon'
import type { IconName } from '@/components/ui/icon-data'
import { cx } from '@/lib/ui/cx'

/** Fill colours the mockup bars use. */
export type ProgressTone = 'emerald' | 'sky' | 'amber' | 'slate'

/** The share of max that value covers, as 0 to 100; 0 when either number is unusable. */
function percentOf(value: number, max: number): number {
	if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0
	return Math.min(100, Math.max(0, (value / max) * 100))
}

/** The value reported to assistive technology, kept inside 0 and max. */
function clampedValue(value: number, max: number): number {
	if (!Number.isFinite(value)) return 0
	return Math.min(Math.max(value, 0), Math.max(max, 0))
}

const TRACK = {
	kpi: 'w-full bg-slate-100 h-2 rounded-full mt-space-sm overflow-hidden flex border border-slate-200/50',
	rank: 'w-full bg-slate-200 h-2 rounded-full overflow-hidden',
	mini: 'w-24 bg-slate-200 h-1.5 rounded-full mt-1.5 overflow-hidden',
} as const

const KPI_FILL = 'bg-emerald-500 h-full transition-all duration-500 rounded-full'

const FILL: Record<ProgressTone, string> = {
	emerald: 'bg-emerald-500 h-full rounded-full',
	sky: 'bg-sky-500 h-full rounded-full',
	amber: 'bg-amber-500 h-full rounded-full',
	slate: 'bg-slate-300 h-full rounded-full',
}

type ProgressBarProps = Omit<ComponentProps<'div'>, 'children' | 'role'> & {
	value: number
	max?: number
} & (
		| { variant: 'kpi'; tone?: never }
		| { variant: 'rank'; tone?: 'sky' | 'emerald' }
		| { variant: 'mini'; tone?: ProgressTone }
	)

/**
 * A horizontal progress bar from the admin console (catalogue section 17). The variant picks the
 * track: kpi is PB-1 (A87 track, A88 emerald fill that animates its width), rank is PB-2 (A266 track,
 * A267 sky or A354 emerald fill), mini is PB-3 (A528 track, fills A529 emerald, A580 sky, A689 amber,
 * A775 slate). Props: value and max (default 100) set the fill width and the aria values; tone picks
 * the fill colour for rank and mini (default emerald). The track carries role progressbar, so give it
 * an accessible name through aria-label or aria-labelledby (aria-valuetext is passed through too).
 * Other native div props go to the track.
 */
export function ProgressBar({ variant, tone, value, max = 100, className, ...rest }: ProgressBarProps) {
	const percent = percentOf(value, max)
	const fill = variant === 'kpi' ? KPI_FILL : FILL[tone ?? 'emerald']
	return (
		<div
			role='progressbar'
			aria-valuemin={0}
			aria-valuemax={max}
			aria-valuenow={clampedValue(value, max)}
			{...rest}
			className={cx(TRACK[variant], className)}
		>
			<div className={fill} style={{ width: percent + '%' }} />
		</div>
	)
}

type ProgressCaptionProps = Omit<ComponentProps<'div'>, 'children'> & {
	start: ReactNode
	end?: ReactNode
}

/**
 * The caption row under the KPI progress bar (catalogue PB-1, A90): an emerald mono figure on the left
 * (A91) and a muted mono figure on the right (A92). Props: start and end are the two texts, both
 * written by the caller. Other native div props go to the row.
 */
export function ProgressCaption({ start, end, className, ...rest }: ProgressCaptionProps) {
	return (
		<div {...rest} className={cx('flex justify-between items-center mt-1', className)}>
			<span className='font-label-sm text-label-sm text-emerald-700 font-mono font-semibold'>{start}</span>
			{end != null && <span className='font-label-sm text-label-sm text-slate-500 font-mono'>{end}</span>}
		</div>
	)
}

const HEADING_VALUE = {
	sky: 'font-mono text-sky-700 font-bold',
	emerald: 'font-mono text-emerald-700 font-bold',
} as const

type ProgressHeadingProps = Omit<ComponentProps<'div'>, 'children'> & {
	label: ReactNode
	value: ReactNode
	tone?: 'sky' | 'emerald'
}

/**
 * The label row above a leaderboard rank bar (catalogue PB-2, A262): the entry name on the left and its
 * points on the right, in sky (A263) or emerald (A351) mono. Props: label and value are caller text;
 * tone matches the bar below it (default emerald). Give the row an id and point the bar at it with
 * aria-labelledby to name the bar. Other native div props go to the row.
 */
export function ProgressHeading({ label, value, tone = 'emerald', className, ...rest }: ProgressHeadingProps) {
	return (
		<div {...rest} className={cx('flex justify-between items-center text-label-sm font-label-sm mb-1', className)}>
			<span className='text-slate-800 font-semibold'>{label}</span>
			<span className={HEADING_VALUE[tone]}>{value}</span>
		</div>
	)
}

/** The ring path from the mockup: a circle of circumference 100 starting at the top. */
const RING_PATH = 'M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831'

type ProgressRingProps = Omit<ComponentProps<'div'>, 'children' | 'role'> & {
	value: number
	max?: number
	icon?: IconName
}

/**
 * The circular progress indicator in the individual-only dock (catalogue PB-4, I4c33103): a 2rem ring
 * whose primary arc (I4c33401) grows with the value over a surface-container track (I4c33224; that
 * token is white in the judge palette, so the track is invisible on the white dock, as in the
 * mockup), with an optional centred icon (I4c33674, done in the mockup). Props: value and max
 * (default 100); icon is shown only when given. The wrapper carries role progressbar, so name it
 * with aria-label or aria-labelledby. Other native div props go to the wrapper.
 */
export function ProgressRing({ value, max = 100, icon, className, ...rest }: ProgressRingProps) {
	const percent = percentOf(value, max)
	return (
		<div
			role='progressbar'
			aria-valuemin={0}
			aria-valuemax={max}
			aria-valuenow={clampedValue(value, max)}
			{...rest}
			className={cx('relative w-8 h-8 flex items-center justify-center', className)}
		>
			<svg className='w-full h-full -rotate-90' viewBox='0 0 36 36' aria-hidden='true' focusable='false'>
				<path className='text-surface-container' d={RING_PATH} fill='none' stroke='currentColor' strokeWidth='4' />
				<path
					className='text-primary transition-all duration-300'
					d={RING_PATH}
					fill='none'
					stroke='currentColor'
					strokeDasharray={percent + ', 100'}
					strokeLinecap='round'
					strokeWidth='4'
				/>
			</svg>
			{icon && <Icon name={icon} className='text-[14px] text-primary absolute' />}
		</div>
	)
}

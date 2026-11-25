import type { ComponentPropsWithRef } from 'react'

import Icon from '@/components/ui/icon'
import type { IconName } from '@/components/ui/icon-data'
import { CLICKABLE, DISABLED, FOCUS_RING } from '@/components/ui/styles'
import { cx } from '@/lib/ui/cx'

// Class strings are copied from the mockups (docs/designs, see the UI catalogue section 2) and
// translated to Tailwind v4. Every string is written out in full so Tailwind can find it.
// Classes that only place a badge among its siblings (ml-1, self-start, absolute offsets,
// responsive hiding) and the mockup script hooks are left to the caller.
// The roster badges of U were written with py-0.2, which no Tailwind version generates (the
// screenshot shows no vertical padding); the hairline they ask for is py-px here.
// Animated badges and dots stop animating when the viewer asks for reduced motion.

const BADGES = {
	// Admin console, section 2a.
	/** Participant score pill, neutral: A500 and the other 24. */
	'admin-score':
		'px-space-xs py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-800 font-label-sm text-label-sm font-mono',
	/** Participant score pill, highest score: A607, A655. */
	'admin-score-top':
		'px-space-xs py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-label-sm text-label-sm font-mono font-bold',
	/** Participant score pill, not scored yet: A754 to A757. */
	'admin-score-pending':
		'px-space-xs py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-500 font-label-sm text-label-sm font-mono',
	/** Judge status pill, scored: A509 and the other 10. */
	'admin-judge-scored':
		'inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-label-sm text-label-sm font-medium',
	/** Judge status pill, scoring now: A668. */
	'admin-judge-scoring':
		'inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300 font-label-sm text-label-sm font-medium animate-pulse motion-reduce:animate-none',
	/** Programme badge, solid sky: A514, A617, A674, A760. */
	'admin-program-sky': 'px-space-xs py-1 rounded bg-sky-700 text-white font-label-sm text-label-sm font-bold shadow-2xs',
	/** Programme badge, solid emerald: A565, A717. */
	'admin-program-emerald':
		'px-space-xs py-1 rounded bg-emerald-700 text-white font-label-sm text-label-sm font-bold shadow-2xs',
	/** Programme badge, solid sky, podium size: A176. */
	'admin-program-sky-compact':
		'px-space-xs py-0.5 rounded bg-sky-700 text-white font-label-sm text-label-sm font-bold shadow-2xs',
	/** Programme badge, soft emerald: A146. */
	'admin-program-emerald-soft':
		'px-space-xs py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-label-sm text-label-sm font-semibold',
	/** Programme badge, soft sky: A210. */
	'admin-program-sky-soft':
		'px-space-xs py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 font-label-sm text-label-sm font-semibold',
	/** Topic tag in the table, emerald: A495, A598, A650. */
	'admin-topic-emerald':
		'px-space-xs py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-label-sm text-label-sm font-mono font-semibold',
	/** Topic tag in the table, sky: A547, A707. */
	'admin-topic-sky':
		'px-space-xs py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 font-label-sm text-label-sm font-mono font-semibold',
	/** Topic tag in the table, neutral (pending row): A750. */
	'admin-topic-neutral':
		'px-space-xs py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 font-label-sm text-label-sm font-mono',
	/** Status micro-badge, live: A437, A825, A848. */
	'admin-status-live':
		'px-space-xs py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono text-label-sm font-semibold',
	/** Status micro-badge, idle (warning): A871. */
	'admin-status-idle':
		'px-space-xs py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-mono text-label-sm font-semibold',
	/** Version badge: A946. */
	'admin-version':
		'px-space-xs py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 font-mono text-label-sm font-semibold',
	/** Progress percentage badge, emerald: A839, A862. */
	'admin-progress-emerald':
		'px-space-sm py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-label-sm text-label-sm font-bold',
	/** Progress percentage badge, sky: A885. */
	'admin-progress-sky':
		'px-space-sm py-1 rounded bg-sky-50 text-sky-700 border border-sky-200 font-label-sm text-label-sm font-bold',
	/** KPI sub-badge, sky: A53. */
	'admin-kpi-sky': 'px-space-xs py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 font-mono font-semibold',
	/** KPI sub-badge, emerald: A54. */
	'admin-kpi-emerald':
		'px-space-xs py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono font-semibold',
	/** Cohort heading badge, sky: A252. */
	'admin-cohort-sky':
		'px-space-sm py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 font-label-md text-label-md font-bold',
	/** Cohort heading badge, emerald: A339. */
	'admin-cohort-emerald':
		'px-space-sm py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-label-md text-label-md font-bold',
	/** Leaderboard score badge, sky: A303, A310, A317. */
	'admin-leader-sky': 'px-space-xs py-0.5 rounded bg-sky-50 border border-sky-200 text-sky-700 font-mono font-bold',
	/** Leaderboard score badge, emerald: A390, A397, A404. */
	'admin-leader-emerald':
		'px-space-xs py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 font-mono font-bold',
	/** Remark feed group tag, emerald: A1058, A1086. */
	'admin-remark-emerald':
		'px-space-xs py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-label-sm text-label-sm font-semibold',
	/** Remark feed group tag, sky: A1072. */
	'admin-remark-sky':
		'px-space-xs py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200 font-label-sm text-label-sm font-semibold',
	/** Mono info chip: A131 (the mockup adds self-start sm:self-auto). */
	'admin-info':
		'font-label-sm text-label-sm text-slate-600 px-space-sm py-1 rounded bg-slate-100 border border-slate-200 font-mono',
	/** Round neutral pill: A10. */
	'admin-created':
		'px-space-sm py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-label-sm text-label-sm uppercase tracking-wider font-semibold',
	/** Round live pill: A11. Put a StatusDot variant stream before the text. */
	'admin-live':
		'inline-flex items-center gap-1.5 px-space-sm py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-label-sm text-label-sm font-semibold',
	/** Podium rank pill, neutral: A143, A207 (the rank number is a child span in sky or emerald mono). */
	'admin-rank':
		'px-space-sm py-0.5 rounded-full bg-white border border-slate-200 text-slate-800 font-label-md text-label-md font-bold flex items-center gap-1 shadow-2xs',
	/** Podium rank pill, champion: A172 (its icon is trophy-fill at text-[16px] text-emerald-600). */
	'admin-rank-champion':
		'px-space-sm py-0.5 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-800 font-label-md text-label-md font-bold flex items-center gap-1.5 shadow-2xs',
	/** Rank circle, top emerald: A490, A593. */
	'admin-rank-circle-emerald':
		'inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-mono font-bold text-label-md',
	/** Rank circle, top sky: A542. */
	'admin-rank-circle-sky':
		'inline-flex items-center justify-center w-7 h-7 rounded-full bg-sky-50 border border-sky-200 text-sky-700 font-mono font-bold text-label-md',
	/** Rank circle, neutral: A645, A702. */
	'admin-rank-circle':
		'inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-mono font-semibold text-label-md',
	/** Rank circle, pending: A745. */
	'admin-rank-circle-pending':
		'inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 border border-slate-200 text-slate-600 font-mono font-semibold text-label-md',
	/** Avatar initials, emerald: A69. */
	'admin-avatar-emerald':
		'w-6 h-6 rounded-full bg-emerald-700 text-white font-label-sm text-[11px] flex items-center justify-center font-bold ring-2 ring-white',
	/** Avatar initials, sky: A70. */
	'admin-avatar-sky':
		'w-6 h-6 rounded-full bg-sky-700 text-white font-label-sm text-[11px] flex items-center justify-center font-bold ring-2 ring-white',
	/** Avatar initials, slate: A71. */
	'admin-avatar-slate':
		'w-6 h-6 rounded-full bg-slate-700 text-white font-label-sm text-[11px] flex items-center justify-center font-bold ring-2 ring-white',

	// Unified judge view, section 2b.
	/** Criterion sub maximum: U52, U86, U120, U154. */
	'unified-sub-max':
		'font-label-sm text-label-sm text-emerald-800 font-semibold px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded',
	/** Section maximum, teal: U42c562. */
	'unified-section-teal':
		'bg-teal-50 text-teal-800 border border-teal-200 px-space-xs py-0.5 rounded font-label-sm text-label-sm font-semibold',
	/** Section maximum, emerald: U186c570. */
	'unified-section-emerald':
		'bg-emerald-50 text-emerald-800 border border-emerald-200 px-space-xs py-0.5 rounded font-label-sm text-label-sm font-semibold',
	/** Roster score, done: U37c1921. */
	'unified-roster-done':
		'px-1.5 py-px bg-emerald-100 border border-emerald-200 text-emerald-800 rounded font-label-sm text-[11px] font-semibold flex items-center gap-0.5',
	/** Roster score, active: U37c2773. */
	'unified-roster-active': 'px-1.5 py-px bg-emerald-700 text-white rounded font-label-sm text-[11px] font-bold',
	/** Roster queued: U37c3496, U37c4126, U37c4749, U37c5372. */
	'unified-roster-queued':
		'px-1.5 py-px bg-slate-100 border border-slate-200 text-slate-600 rounded font-label-sm text-[11px] font-medium',
	/** Floating active tag: U37c2458 (the mockup places it with absolute -top-1.5 right-2). */
	'unified-active-tag':
		'px-1.5 py-px rounded-full bg-emerald-700 text-white font-label-sm text-[10px] font-bold uppercase tracking-wider',
	/**
	 * Room chip: U3c7423, G4c6340, I4c6368. The mockup is a div with an inner text span; here it is
	 * one span carrying both class sets. The mockup hides it below sm: wrap it in an element with
	 * hidden sm:contents to do that, since this string already sets inline-flex.
	 */
	'unified-room':
		'inline-flex items-center bg-slate-100 px-space-sm py-1 rounded-md border border-slate-200 font-label-sm text-label-sm font-semibold text-teal-700',

	// Group-only judge view, section 2c.
	/** Mode badge: G10c377. */
	'group-mode':
		'inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-primary/10 text-primary uppercase tracking-wide',
	/** Completion badge: G19. */
	'group-completion': 'font-label-sm text-label-sm font-bold text-primary bg-primary/10 px-2 py-0.5 rounded',
	/** Current score tag: G33, G71, G109, G147, G185 (a div in the mockup). */
	'group-score': 'bg-surface-variant px-2 py-0.5 rounded text-on-surface font-score-display text-label-md font-bold',
	/** Dock percentage pill: G269 (the mockup adds ml-1). */
	'group-dock-percent': 'text-label-sm font-label-sm font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full',
	/** Criterion number circle: G28, G66, G104, G142, G180. */
	'group-number':
		'w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-label-sm text-label-sm font-bold',

	// Individual-only judge view, section 2c.
	/** Mode badge: I4c8401. */
	'individual-mode': 'font-label-sm text-label-sm bg-primary/10 text-primary-container font-semibold px-2 py-0.5 rounded',
	/** Roster score, done: I4c10737 (its icon is check_circle at text-[12px]). */
	'individual-roster-done':
		'font-label-sm text-label-sm px-1.5 py-0.5 rounded bg-primary/10 text-primary-container font-semibold flex items-center gap-0.5',
	/** Roster score, active: I4c11681. */
	'individual-roster-active': 'font-label-sm text-label-sm px-1.5 py-0.5 rounded bg-primary text-on-primary font-bold',
	/** Roster queued, next up: I4c12442. */
	'individual-roster-next':
		'font-label-sm text-label-sm px-1.5 py-0.5 rounded bg-surface-variant text-on-surface font-semibold',
	/** Roster queued: I4c13208, I4c13966, I4c14726. */
	'individual-roster-queued': 'font-label-sm text-label-sm px-1.5 py-0.5 rounded bg-surface-variant text-on-surface-variant',
	/** Part overline: I4c15544. */
	'individual-part':
		'font-label-sm text-label-sm bg-primary/10 text-primary-container px-2 py-0.5 rounded font-semibold uppercase',
	/** Subtotal, solid: I4c15718. */
	'individual-subtotal': 'font-label-sm text-label-sm px-2 py-0.5 rounded bg-primary text-on-primary font-bold',
	/** ID pill: I4c16022. */
	'individual-id': 'font-label-sm text-label-sm px-2.5 py-0.5 rounded-full bg-secondary/15 text-on-surface font-semibold',
	/** Role mono chip: I4c16175. */
	'individual-role': 'font-label-sm text-label-sm text-on-surface-variant bg-surface-container px-2 py-0.5 rounded font-mono',
	/** Dock percentage: I4c32819 (the mockup adds ml-1). */
	'individual-dock-percent':
		'font-label-sm text-label-sm px-2 py-0.5 rounded bg-primary/10 text-primary-container font-bold',
	/** Slot chip: I4c7792 (a div in the mockup). */
	'individual-slot': 'flex items-center gap-space-xs bg-surface-container-high/60 px-space-sm py-1 rounded-md',
} as const satisfies Record<string, string>

export type BadgeVariant = keyof typeof BADGES

export type BadgeProps = ComponentPropsWithRef<'span'> & {
	variant: BadgeVariant
}

/**
 * Badge reproduces the status pills, chips and small tags of the mockups (catalogue 2a, 2b and 2c):
 * the admin raw-colour badges (admin-*, including the rank circles and avatar initials), the unified
 * judge badges (unified-*) and the token-coloured group-only and individual-only badges (group-*,
 * individual-*). The comment on each entry of BADGES names the catalogue locations it copies.
 * Props: variant, plus every native span prop; the text, numbers and any icon come as children.
 * className is added after the variant classes, so it can extend them but cannot reliably override
 * a conflicting one.
 */
export function Badge({ variant, className, ...rest }: BadgeProps) {
	return <span {...rest} className={cx(BADGES[variant], className)} />
}

type ChipLooks = {
	/** Not pressed, or an action chip. */
	idle: string
	idleWarning: string
	/** Pressed (selected). */
	pressed: string
	pressedWarning: string
}

const TAG_CHIPS = {
	// U310, U313, U316, U319. The mockup script stacks the selected colours on top of the slate
	// ones (catalogue F4 item 3); here the selected look replaces them, hover included.
	unified: {
		idle: 'px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-label-sm text-label-sm font-medium transition-colors flex items-center gap-1',
		idleWarning:
			'px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-label-sm text-label-sm font-medium transition-colors flex items-center gap-1',
		pressed:
			'px-3 py-1 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-900 font-label-sm text-label-sm font-semibold transition-colors flex items-center gap-1',
		pressedWarning:
			'px-3 py-1 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-900 font-label-sm text-label-sm font-semibold transition-colors flex items-center gap-1',
	},
	// G228 (pressed), G237 (pressed warning), G240 (idle). The mockup draws its tags already on and
	// has no script for them, so the neutral add-custom chip stands for the idle look.
	group: {
		idle: 'px-3 py-1 rounded-full text-label-sm font-label-sm font-medium border border-surface-container-high bg-surface-variant/40 text-on-surface-variant hover:text-on-surface hover:bg-surface-variant transition-colors flex items-center gap-1',
		idleWarning:
			'px-3 py-1 rounded-full text-label-sm font-label-sm font-medium border border-surface-container-high bg-surface-variant/40 text-on-surface-variant hover:text-on-surface hover:bg-surface-variant transition-colors flex items-center gap-1',
		pressed:
			'px-3 py-1 rounded-full text-label-sm font-label-sm font-medium border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center gap-1',
		pressedWarning:
			'px-3 py-1 rounded-full text-label-sm font-label-sm font-medium border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors flex items-center gap-1',
	},
	// I4c29949, I4c30212, I4c30500 (idle) and I4c30806 (idle warning). These quick-remark chips add
	// text to the remarks and have no selected look in the mockup, so they cannot be pressed.
	individual: {
		idle: 'font-label-sm text-label-sm px-3 py-1 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors',
		idleWarning:
			'font-label-sm text-label-sm px-3 py-1 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface-variant transition-colors',
		pressed:
			'font-label-sm text-label-sm px-3 py-1 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors',
		pressedWarning:
			'font-label-sm text-label-sm px-3 py-1 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface-variant transition-colors',
	},
} as const satisfies Record<string, ChipLooks>

export type TagChipVariant = keyof typeof TAG_CHIPS

export type TagChipProps = Omit<ComponentPropsWithRef<'button'>, 'aria-pressed'> & {
	/** warning is the amber tag of the group-only view and the muted one of the individual-only view. */
	tone?: 'default' | 'warning'
	/** A Material Symbols icon before the label, drawn at text-[14px] like the group-only tags. */
	icon?: IconName
} & (
		| {
				variant: 'unified' | 'group'
				/** Selected or not; rendered as aria-pressed. Leave it out for an action chip such as add tag. */
				pressed?: boolean
		  }
		| {
				variant: 'individual'
				pressed?: never
		  }
	)

/**
 * TagChip reproduces the round remark tag chips of the judge mockups (catalogue 2d) as a toggle
 * button: unified (U310), group (G228, G237, G240) and individual (I4c29949, I4c30806).
 * Props: variant; pressed (unified and group only) sets aria-pressed and the selected look, and
 * leaving it out makes a plain action chip; tone picks the warning colours; icon adds a leading
 * Material Symbols icon; every native button prop passes through (onClick toggles), and type
 * defaults to button. The label comes as children.
 */
export function TagChip({ variant, pressed, tone = 'default', icon, type, className, children, ...rest }: TagChipProps) {
	const looks: ChipLooks = TAG_CHIPS[variant]
	const warning = tone === 'warning'
	const look = pressed ? (warning ? looks.pressedWarning : looks.pressed) : warning ? looks.idleWarning : looks.idle
	return (
		<button
			{...rest}
			type={type ?? 'button'}
			aria-pressed={pressed}
			className={cx(look, CLICKABLE, FOCUS_RING, DISABLED, className)}
		>
			{icon ? <Icon name={icon} className='text-[14px]' /> : null}
			{children}
		</button>
	)
}

const DOTS = {
	/** Pulsing emerald dot: U16, U477c258. */
	pulse: 'inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse motion-reduce:animate-none',
	/** Small pulsing emerald dot: U37c3073. */
	'pulse-sm': 'inline-block w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse motion-reduce:animate-none',
	/** Pinging primary dot on the active tab: I4c11592. */
	'ping-primary': 'inline-block w-1.5 h-1.5 rounded-full bg-primary animate-ping motion-reduce:animate-none',
	/** Pulsing primary dot: G274, I4c8874 (divs in the mockup). */
	'pulse-primary': 'inline-block w-2.5 h-2.5 rounded-full bg-primary animate-pulse motion-reduce:animate-none',
	/** Static primary roster dot: G10c2110 and the other 5. */
	primary: 'inline-block w-2 h-2 rounded-full bg-primary shrink-0',
	/** Static emerald status dot: A823, A846. */
	emerald: 'inline-block w-2 h-2 rounded-full bg-emerald-500',
	/** Static amber status dot: A869. */
	amber: 'inline-block w-2 h-2 rounded-full bg-amber-500',
	/** Streaming dot: A1043, and the dot inside the admin-live badge (A11). */
	stream: 'inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse motion-reduce:animate-none',
	/** Static live dot for small screens: A2c8687. */
	'live-static': 'inline-flex h-2 w-2 rounded-full bg-emerald-500',
} as const satisfies Record<string, string>

// A23 to A25 (inner dot emerald-600) and the header A2c5139 (inner dot emerald-500): a pinging halo
// behind a steady dot.
const PING_PAIR = {
	ping: 'relative inline-flex rounded-full h-2 w-2 bg-emerald-600',
	'ping-header': 'relative inline-flex rounded-full h-2 w-2 bg-emerald-500',
} as const satisfies Record<string, string>

export type StatusDotVariant = keyof typeof DOTS | keyof typeof PING_PAIR

export type StatusDotProps = Omit<ComponentPropsWithRef<'span'>, 'children'> & {
	variant: StatusDotVariant
	/** What the dot means, for screen readers. Without it the dot is decorative and hidden from them. */
	label?: string
}

function isPingPair(variant: StatusDotVariant): variant is keyof typeof PING_PAIR {
	return variant in PING_PAIR
}

/**
 * StatusDot reproduces the live and status dots of the mockups (catalogue 2e): the pulsing,
 * pinging and static dots of the judge views and the admin console, and the admin ping pair
 * (ping and ping-header), which it draws as the nested halo and dot of the markup.
 * Props: variant; label (optional) gives the dot an accessible name, otherwise it is aria-hidden;
 * every other native span prop passes through. The dots are inline-block so their size holds
 * outside a flex row.
 */
export function StatusDot({ variant, label, className, ...rest }: StatusDotProps) {
	const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true }
	if (isPingPair(variant)) {
		return (
			<span {...rest} {...a11y} className={cx('relative flex h-2 w-2', className)}>
				<span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 motion-reduce:animate-none' />
				<span className={PING_PAIR[variant]} />
			</span>
		)
	}
	return <span {...rest} {...a11y} className={cx(DOTS[variant], className)} />
}

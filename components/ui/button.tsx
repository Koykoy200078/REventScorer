import type { ComponentPropsWithRef, ReactNode } from 'react'

import Icon from '@/components/ui/icon'
import type { IconName } from '@/components/ui/icon-data'
import { CLICKABLE, DISABLED, FOCUS_RING } from '@/components/ui/styles'
import { cx } from '@/lib/ui/cx'

// Class strings are copied from the mockups (docs/designs, see the UI catalogue section 1) and
// translated to Tailwind v4. Tailwind finds classes by scanning this file, so every string is
// written out in full. Classes that only place a button among its siblings (margins, flex-1,
// responsive hiding) are left to the caller, who adds them through className.

type Recipe = {
	/** The button classes. */
	className: string
	/** Default classes of a leading or trailing icon (its size, and its colour where the mockup sets one). */
	icon: string
	/**
	 * The disabled look where a mockup draws one (catalogue 1f). It replaces the shared DISABLED
	 * state, which only fills in for buttons whose disabled look no mockup shows.
	 */
	disabled?: string
}

/** The size scale observed in the mockups (catalogue 1g); each variant offers only the sizes it was drawn at. */
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'

// For each variant the first size listed is its default.
const BUTTON_RECIPES = {
	// Unified judge view (raw Tailwind colours).
	'unified-primary': {
		// P-1, U337c1647: dock submit. While it submits the mockup sets disabled and adds no
		// disabled classes, so it does not fade.
		lg: {
			className:
				'px-space-md py-2.5 rounded-lg bg-emerald-600 text-white font-label-md text-label-md font-bold hover:bg-emerald-700 active:scale-[0.99] transition-all flex items-center gap-1.5 shadow-md ring-2 ring-emerald-600/20',
			icon: 'text-[18px]',
			disabled: 'disabled:cursor-not-allowed',
		},
	},
	'unified-secondary': {
		// S-6, U337c1328: dock previous.
		md: {
			className:
				'px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-label-md text-label-md font-semibold transition-colors flex items-center gap-1',
			icon: 'text-[18px]',
		},
		// U37c664: batch preset button in the context bar.
		xs: {
			className:
				'px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-label-sm text-label-sm font-medium flex items-center gap-1 transition-colors',
			icon: 'text-[14px]',
		},
	},
	'unified-tertiary': {
		// S-7, U337c2050: dock save group.
		md: {
			className:
				'px-3 py-2 rounded-lg bg-teal-50 hover:bg-teal-100 border border-teal-300 text-teal-800 font-label-md text-label-md font-bold transition-colors flex items-center gap-1 shadow-xs',
			icon: 'text-[18px] text-teal-700',
		},
	},
	'unified-reset': {
		// U37c1252: reset scores, slate tonal with a red hover.
		xs: {
			className:
				'px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 hover:text-red-600 font-label-sm text-label-sm font-medium transition-colors',
			icon: 'text-[14px]',
		},
	},

	// Group-only judge view (theme tokens).
	'group-primary': {
		// P-2, G284: dock submit. The mockup adds flex-1 sm:flex-none for the dock layout. While it
		// submits the mockup dims it to opacity-80 (its pointer-events-none only blocks clicks, which
		// the disabled attribute does here).
		lg: {
			className:
				'px-space-xl py-2.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md font-bold shadow-md hover:shadow transition-all flex items-center justify-center gap-2',
			icon: 'text-[18px]',
			disabled: 'disabled:cursor-not-allowed disabled:opacity-80',
		},
	},
	'group-secondary': {
		// S-8, G280 and G288: dock previous and next group.
		lg: {
			className:
				'px-space-md py-2.5 rounded-lg border border-surface-container-high text-on-surface font-label-md text-label-md font-semibold hover:bg-surface-variant transition-colors flex items-center gap-1',
			icon: 'text-[18px]',
		},
	},
	'group-reset': {
		// G10c1626: ghost reset in the batch preset tray.
		xs: {
			className:
				'px-2 py-1 text-label-sm font-label-sm font-medium rounded text-on-surface-variant hover:text-error transition-colors flex items-center gap-1',
			icon: 'text-[14px]',
		},
	},

	// Individual-only judge view (theme tokens).
	'individual-primary': {
		// P-3, I4c34849: dock submit (the mockup puts the icon last: use iconEnd).
		lg: {
			className:
				'font-label-md text-label-md px-space-lg py-2.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-bold shadow-md transition-all flex items-center gap-space-xs',
			icon: 'text-[18px]',
		},
	},
	'individual-secondary': {
		// S-9, I4c34053: dock previous.
		lg: {
			className:
				'font-label-md text-label-md px-space-md py-2.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-semibold transition-colors flex items-center gap-1 shadow-xs border border-slate-200',
			icon: 'text-[18px]',
		},
	},
	'individual-save': {
		// S-9, I4c34474: dock save, the same button with primary text.
		lg: {
			className:
				'font-label-md text-label-md px-space-md py-2.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-primary font-semibold transition-colors flex items-center gap-1 shadow-xs border border-slate-200',
			icon: 'text-[18px]',
		},
	},
	'individual-reset': {
		// I4c17513: reset in the batch preset tray, permanent error text.
		sm: {
			className:
				'font-label-md text-label-md px-space-sm py-1 rounded bg-surface hover:bg-surface-container text-error font-semibold shadow-xs transition-colors',
			icon: 'text-[14px] align-middle',
		},
	},

	// Admin console (raw Tailwind colours).
	'admin-primary': {
		// P-4, A2c6861 and A37: header and toolbar primary.
		sm: {
			className:
				'flex items-center gap-space-xs px-space-md py-space-xs rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 font-label-md text-label-md font-semibold transition-colors shadow-xs',
			icon: 'text-[16px]',
		},
		// P-6, A694: table row primary.
		xs: {
			className:
				'px-space-sm py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-label-sm text-label-sm font-semibold transition-colors shadow-2xs',
			icon: 'text-[15px]',
		},
	},
	'admin-confirm': {
		// P-5, A1151: modal confirm.
		sm: {
			className:
				'px-space-md py-space-xs rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-label-md text-label-md font-semibold transition-colors shadow-2xs',
			icon: 'text-[16px]',
		},
	},
	'admin-outline': {
		// S-1, A29 and A33. A2c6055 and A2c6459 are hidden below sm in the header: this string already
		// sets flex, so wrap the button in an element with hidden sm:contents instead of adding classes.
		sm: {
			className:
				'flex items-center gap-space-xs px-space-md py-space-xs rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-label-md text-label-md transition-colors shadow-xs',
			icon: 'text-[16px] text-slate-500',
		},
		// S-2, A534, A585, A637, A737: table row action.
		xs: {
			className:
				'px-space-sm py-1 rounded bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 font-label-sm text-label-sm font-medium transition-colors shadow-2xs',
			icon: 'text-[15px]',
		},
	},
	'admin-queued': {
		// A780 (catalogue 1f): the greyed "In Queue" table row action. The mockup draws it with classes
		// only; here the caller renders it with the disabled attribute, and the mockup's
		// cursor-not-allowed applies through disabled: so it does not fight the pointer cursor.
		xs: {
			className:
				'px-space-sm py-1 rounded bg-slate-100 border border-slate-200 text-slate-400 font-label-sm text-label-sm font-medium',
			icon: 'text-[15px]',
			disabled: 'disabled:cursor-not-allowed',
		},
	},
	'admin-tonal': {
		// S-3, A1148: modal cancel.
		sm: {
			className:
				'px-space-md py-space-xs rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 font-label-md text-label-md font-medium transition-colors',
			icon: 'text-[16px]',
		},
	},
	'admin-block': {
		// S-4, A931: full-width block button (it has no side padding, so w-full stays). The mockup adds mt-space-md.
		sm: {
			className:
				'w-full py-space-xs rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 font-label-md text-label-md font-semibold transition-colors flex items-center justify-center gap-space-xs shadow-2xs',
			icon: 'text-[16px]',
		},
	},
	'admin-sky': {
		// S-5, A810: sky tonal.
		xs: {
			className:
				'flex items-center gap-space-xxs px-space-sm py-1 rounded bg-sky-50 border border-sky-200 hover:bg-sky-100 text-sky-700 font-label-sm text-label-sm font-semibold transition-colors shadow-2xs',
			icon: 'text-[15px]',
		},
	},
	'admin-link': {
		// A891: emerald text link.
		xs: {
			className: 'font-label-sm text-label-sm text-emerald-700 hover:underline flex items-center gap-1 font-semibold',
			icon: 'text-[15px]',
		},
	},
	'admin-link-sky': {
		// A1096: sky text link.
		xs: {
			className: 'font-label-sm text-label-sm text-sky-700 hover:underline flex items-center gap-1 font-semibold',
			icon: 'text-[15px]',
		},
	},
	'admin-link-inline': {
		// A669: compact sky text link beside a value. The mockup adds ml-2.
		xs: {
			className: 'font-label-sm text-label-sm text-sky-700 hover:underline flex items-center gap-0.5',
			icon: 'text-[13px]',
		},
	},
} satisfies Record<string, Partial<Record<ButtonSize, Recipe>>>

export type ButtonVariant = keyof typeof BUTTON_RECIPES

/** The sizes a variant was drawn at. */
export type ButtonSizeOf<V extends ButtonVariant> = Extract<keyof (typeof BUTTON_RECIPES)[V], ButtonSize>

function recipeOf(variant: ButtonVariant, size?: ButtonSize): Recipe {
	const sizes: Partial<Record<ButtonSize, Recipe>> = BUTTON_RECIPES[variant]
	const chosen = size ? sizes[size] : undefined
	return chosen ?? (Object.values(sizes)[0] as Recipe)
}

// The label is read by screen readers at every width and shown from the breakpoint on.
const LABEL_FROM = {
	sm: 'sr-only sm:not-sr-only',
	md: 'sr-only md:not-sr-only',
	xl: 'sr-only xl:not-sr-only',
} as const

/** The variant classes plus the pointer, focus and disabled states, in the order every button uses. */
function classesOf(recipe: Recipe): string {
	return cx(recipe.className, CLICKABLE, FOCUS_RING, recipe.disabled ?? DISABLED)
}

/**
 * The full class string of a Button variant and size, with the focus, disabled and pointer states.
 * Use it to give a link the look of a button.
 */
export function buttonClassName<V extends ButtonVariant>(variant: V, size?: ButtonSizeOf<V>): string {
	return classesOf(recipeOf(variant, size))
}

export type ButtonProps<V extends ButtonVariant = ButtonVariant> = ComponentPropsWithRef<'button'> & {
	/** Which mockup button to draw: see BUTTON_RECIPES for the catalogue id of each one. */
	variant: V
	/** One of the sizes this variant was drawn at; the default is the first one listed. */
	size?: ButtonSizeOf<V>
	/** An icon before the label. */
	icon?: IconName
	/** An icon after the label (the mockups put arrow_forward last on the next buttons). */
	iconEnd?: IconName
	/** Replaces the variant default icon classes (size and colour). */
	iconClassName?: string
	/**
	 * Shows the label only from this breakpoint on, like the mockup hidden sm:inline spans, while
	 * screen readers still read it at every width.
	 */
	labelFrom?: keyof typeof LABEL_FROM
	children?: ReactNode
}

/**
 * Button reproduces the text buttons of the mockups (catalogue section 1): the filled primaries
 * P-1 to P-6, the secondary, outline and tonal buttons S-1 to S-9, the ghost and link buttons of 1c,
 * the reset buttons of 1d and the greyed "In Queue" row action of 1f (admin-queued, A780: render it
 * with disabled, since its look is the disabled one). Props: variant (unified-*, group-*,
 * individual-* or admin-*) and size (only the sizes of the 1g scale that variant appears at) pick
 * the class string; icon and iconEnd add a Material Symbols icon before or after the label, set off
 * by a space as in the mockups, iconClassName replaces its default size and colour, and labelFrom
 * (sm, md or xl) hides the label visually below that breakpoint. All native button props pass
 * through; type defaults to button. className is added after the variant classes, so it can extend
 * them but cannot reliably override a conflicting one. Focus and pointer states come from
 * components/ui/styles; the disabled state is the one a mockup draws for that variant (P-1, P-2,
 * A780) and the shared DISABLED otherwise.
 */
export function Button<V extends ButtonVariant>({
	variant,
	size,
	icon,
	iconEnd,
	iconClassName,
	labelFrom,
	type,
	className,
	children,
	...rest
}: ButtonProps<V>) {
	const recipe = recipeOf(variant, size)
	const iconClasses = iconClassName ?? recipe.icon
	// The mockups set an icon off from its label with a space (I4c17513 "<icon/> Reset"); recipes that
	// are not flex containers need it. Inside a flex recipe a run of only white space is not rendered.
	const space = children === undefined || children === null || children === false ? null : ' '
	return (
		<button {...rest} type={type ?? 'button'} className={cx(classesOf(recipe), className)}>
			{icon ? (
				<>
					<Icon name={icon} className={iconClasses} />
					{space}
				</>
			) : null}
			{labelFrom ? <span className={LABEL_FROM[labelFrom]}>{children}</span> : children}
			{iconEnd ? (
				<>
					{space}
					<Icon name={iconEnd} className={iconClasses} />
				</>
			) : null}
		</button>
	)
}

const ICON_BUTTON_RECIPES = {
	// U3c4848 and U3c4093 (16px icon), G4c5560 (18px icon: pass iconClassName), I4c5592: header group
	// stepper. Disabled is U3c4093 and U3c6404: slate-400 text that keeps a hover, no fade.
	stepper: {
		className:
			'w-7 h-7 flex items-center justify-center rounded text-slate-600 hover:text-slate-900 hover:bg-white transition-colors',
		icon: 'text-[16px]',
		disabled: 'disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:text-slate-700',
	},
	// U3c7620, G4c6537, I4c6565: colour mode toggle.
	toggle: {
		className:
			'w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 hover:text-slate-900 flex items-center justify-center transition-colors',
		icon: 'text-[18px]',
	},
	// A1112: round modal close.
	close: {
		className:
			'w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors',
		icon: 'text-[18px]',
	},
	// A829, A852, A875: inline icon link (copy).
	inline: {
		className: 'text-sky-600 hover:text-slate-900 transition-colors',
		icon: 'text-[16px]',
	},
} satisfies Record<string, Recipe>

export type IconButtonVariant = keyof typeof ICON_BUTTON_RECIPES

export type IconButtonProps = Omit<ComponentPropsWithRef<'button'>, 'children' | 'aria-label'> & {
	variant: IconButtonVariant
	icon: IconName
	/** The accessible name (aria-label). The mockups only set a title, which is not one. */
	label: string
	/** Replaces the variant default icon classes, for example text-[18px] for the group-only stepper. */
	iconClassName?: string
}

/**
 * IconButton reproduces the icon-only buttons of the mockups (catalogue 1e): the header group
 * stepper (stepper, the icon-sm box of 1g), the colour mode toggle (toggle, icon-md), the round
 * modal close (close, icon-md) and the inline copy link (inline). Props: variant, icon (a Material
 * Symbols name), label (required, becomes aria-label), iconClassName (replaces the default icon
 * size), plus every native button prop; type defaults to button. A disabled stepper takes the look
 * of U3c4093 (text-slate-400, a slate-700 hover, cursor-not-allowed, no fade); the other variants
 * use the shared DISABLED state, since no mockup draws them disabled.
 */
export function IconButton({ variant, icon, label, iconClassName, type, className, ...rest }: IconButtonProps) {
	const recipe: Recipe = ICON_BUTTON_RECIPES[variant]
	return (
		<button {...rest} type={type ?? 'button'} aria-label={label} className={cx(classesOf(recipe), className)}>
			<Icon name={icon} className={iconClassName ?? recipe.icon} />
		</button>
	)
}

import type { ComponentPropsWithRef } from 'react'

import { cx } from '@/lib/ui/cx'

// Class strings are copied from the mockups (docs/designs, see the UI catalogue section 3) and
// translated to Tailwind v4. Every string is written out in full so Tailwind can find it.
// Classes that only place a card in its grid or row (order, col-span, top or bottom margins,
// md:col-span-2 on the wide group card) and the mockup script hooks are left to the caller.
// Admin cards take the admin radius when they sit inside an element with the theme-admin class.

type CardRecipe = {
	className: string
	/** The decorative accent bar the mockup draws as the first child of the card. */
	accent?: string
	/** The card is a rubric card with no permanent stripe, so scored draws the DESIGN.md stripe. */
	scoredStripe?: boolean
}

const CARDS = {
	// Unified judge view, section 3a.
	/** C-1, U7 and U300: page section card (context bar, remarks). Render it with as section. */
	'unified-section': {
		className: 'bg-white rounded-xl p-space-lg flex flex-col gap-space-md border border-slate-200 shadow-xs',
	},
	/** C-2, U42c1 and U186c1: Part A and Part B header bar. */
	'unified-header': {
		className:
			'bg-white rounded-xl px-space-lg py-space-md flex flex-wrap items-center justify-between gap-space-sm border border-slate-200 shadow-xs',
	},
	/** C-3, U46, U80, U114, U148: individual criterion card with its emerald accent (U47). */
	'unified-individual': {
		className:
			'bg-white rounded-xl p-space-lg flex flex-col gap-space-md relative overflow-hidden transition-all duration-150 border border-slate-200 shadow-xs hover:shadow',
		accent: 'absolute left-0 top-0 bottom-0 w-1.5 bg-emerald-600',
	},
	/** C-4, U190, U212, U234, U256, U277: group criterion card with its teal accent (U191). */
	'unified-group': {
		className:
			'bg-white rounded-xl p-space-lg flex flex-col justify-between gap-space-md relative overflow-hidden border border-slate-200 shadow-xs hover:shadow',
		accent: 'absolute left-0 top-0 bottom-0 w-1.5 bg-teal-600',
	},

	// Group-only judge view, section 3a.
	/** C-5, G10c1: callout card with its primary accent (G10c119). */
	'group-callout': {
		className: 'bg-surface rounded-xl p-space-lg shadow-xs border border-surface-container-high relative overflow-hidden',
		accent: 'absolute left-0 top-0 bottom-0 w-1.5 bg-primary',
	},
	/** C-6, G25, G63, G101, G139, G177: rubric card. */
	'group-rubric': {
		className: 'bg-surface rounded-xl p-space-lg border border-surface-container-high shadow-xs transition-all duration-200',
		scoredStripe: true,
	},
	/** C-7, G216: remarks card. */
	'group-remarks': {
		className: 'bg-surface rounded-xl p-space-lg border border-surface-container-high shadow-xs space-y-space-md',
	},

	// Individual-only judge view, section 3a (C-8).
	/** I4c9543: roster panel, with a shadow and no outline, as drawn. */
	'individual-panel': {
		className: 'w-full bg-surface p-space-md rounded-xl shadow-xs flex flex-col gap-space-sm',
	},
	/** I4c15056: candidate header card. */
	'individual-header': {
		className:
			'w-full bg-surface p-space-lg rounded-xl shadow-xs border border-slate-200/80 flex flex-col lg:flex-row lg:items-center justify-between gap-space-lg',
	},
	/** I4c17845, I4c20657, I4c23495, I4c26315: rubric card. */
	'individual-rubric': {
		className:
			'w-full bg-surface p-space-lg rounded-xl shadow-xs border border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-space-lg transition-all duration-150',
		scoredStripe: true,
	},
	/** I4c29127: remarks card. */
	'individual-remarks': {
		className: 'w-full bg-surface p-space-lg rounded-xl shadow-xs border border-slate-200/80 flex flex-col gap-space-md',
	},

	// Admin console, section 3b.
	/**
	 * A940: standard panel. A898 and A1035 add flex flex-col justify-between, A803 also lg:col-span-2,
	 * and A120 adds w-full: pass those as className.
	 */
	'admin-panel': {
		className: 'bg-white rounded-xl p-space-lg border border-slate-200 shadow-xs',
	},
	/** A231: flush panel around a table or a collapsible body. A425 adds flex flex-col. */
	'admin-flush': {
		className: 'w-full bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden',
	},
	/** A137 and A201: podium card, runner-up and third (the mockup orders them with order-* classes). */
	'admin-podium': {
		className:
			'bg-slate-50 rounded-xl p-space-md flex flex-col justify-between border border-slate-200 shadow-xs relative overflow-hidden',
	},
	/** A165: podium card, champion, with its top accent (A166). The mockup lifts it with -mt-2 md:-mt-3. */
	'admin-podium-champion': {
		className:
			'bg-linear-to-b from-emerald-50/50 to-white rounded-xl p-space-md flex flex-col justify-between border-2 border-emerald-400 shadow-xs relative overflow-hidden',
		accent: 'absolute top-0 right-0 left-0 h-1.5 bg-emerald-500',
	},
	/** A153 and A217: score box inside a podium card (the mockup adds mt-space-md). */
	'admin-score-box': {
		className: 'pt-space-sm bg-white p-space-sm rounded-lg border border-slate-200 shadow-2xs',
	},
	/** A183: score box inside the champion card (the mockup adds mt-space-md). */
	'admin-score-box-champion': {
		className: 'pt-space-sm bg-white p-space-sm rounded-lg border border-emerald-200 shadow-xs',
	},
	/** A258 and A345: inset well, column. */
	'admin-well': {
		className: 'bg-slate-50 border border-slate-200 p-space-md rounded-lg flex flex-col gap-space-sm',
	},
	/** A292 and A379: inset well, list. */
	'admin-well-list': {
		className: 'bg-slate-50 border border-slate-200 p-space-md rounded-lg flex flex-col gap-space-xs',
	},
	/**
	 * A323, A328, A410, A415 (tile) and A1052, A1066, A1080 (plain): inset. A952 adds mb-space-md,
	 * A984 and A1009 add text-label-sm font-label-sm space-y-1, A908 adds flex items-start gap-space-xs.
	 */
	'admin-inset': {
		className: 'bg-slate-50 border border-slate-200 p-space-sm rounded-lg',
	},
	/** A820, A843, A866: inset row card (judge link). */
	'admin-inset-row': {
		className:
			'p-space-sm rounded-lg bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm',
	},
	/** A955, A959, A963, A967, A971: legend cell. */
	'admin-legend-cell': {
		className: 'bg-white border border-slate-200 p-1 rounded shadow-2xs',
	},
} satisfies Record<string, CardRecipe>

// DESIGN.md, Rubric Cards: once scored, the left edge becomes a solid 3px stripe of 059669 (primary).
const SCORED_STRIPE = 'border-l-[3px] border-l-primary'

export type CardVariant = keyof typeof CARDS

/** The elements a card may render as. */
export type CardElement = 'div' | 'section' | 'article' | 'aside' | 'li'

export type CardProps = ComponentPropsWithRef<'div'> & {
	variant: CardVariant
	/** The element to render; the default is div (the unified section card is a section in the mockup). */
	as?: CardElement
	/**
	 * The rubric card holds a score. On group-rubric and individual-rubric it draws the DESIGN.md
	 * scored stripe. The unified criterion cards keep their permanent accent stripe and draw no second
	 * one, and the other variants draw nothing; every variant gets data-scored for styling and tests.
	 */
	scored?: boolean
}

/**
 * Card reproduces the containers of the mockups (catalogue section 3): the judge cards C-1 to C-8
 * (unified-*, group-*, individual-*), drawing the U and G accent bars itself as hidden decoration,
 * and the admin panels, podium cards, score boxes, wells, insets and legend cells (admin-*). The
 * comment on each entry of CARDS names the catalogue locations it copies and the layout classes a
 * caller adds for the other instances. Props: variant; as (div, section, article, aside or li);
 * scored, the DESIGN.md scored state of a rubric card (a 3px primary stripe on the left edge); and
 * every native element prop. Content comes as children. className is added after the variant
 * classes, so it can extend them but cannot reliably override a conflicting one.
 */
export function Card({ variant, as = 'div', scored = false, className, children, ...rest }: CardProps) {
	const recipe: CardRecipe = CARDS[variant]
	// Every allowed element takes the same props as a div.
	const Element = as as 'div'
	return (
		<Element
			{...rest}
			data-scored={scored ? 'true' : undefined}
			className={cx(recipe.className, scored && recipe.scoredStripe ? SCORED_STRIPE : null, className)}
		>
			{recipe.accent ? <div aria-hidden='true' className={recipe.accent} /> : null}
			{children}
		</Element>
	)
}

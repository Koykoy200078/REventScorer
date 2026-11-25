import { CLICKABLE, FOCUS_RING } from '@/components/ui/styles'
import { cx } from '@/lib/ui/cx'

// Stage 5 Task 8: the class roles of the setup screens (home, create, rating sheet and their dialogs).
// The design guide has no mockup of these screens, so each role takes the admin console's look:
// the editor of Task 7 (panels, wells, fields, section labels) and the UI kit (Dialog, Badge,
// SearchInput). Each role holds only the look (colour, type, border, radius, shadow and, for boxes,
// padding); the caller keeps its own layout classes (margins, widths, grids, display). Tailwind finds
// the classes by scanning this file, so every string is written out in full.

// Boxes
/** A page card: the editor panel (bg-white rounded-xl p-space-lg, slate border). */
export const PANEL = 'bg-white rounded-xl p-space-lg border border-slate-200 shadow-xs'
/** A page card in the sky tone (preview and published results). */
export const PANEL_SKY = 'bg-sky-50/40 rounded-xl p-space-lg border border-sky-200 shadow-xs'
/** A section inside a card: the editor's well. */
export const WELL = 'bg-slate-50 border border-slate-200 p-space-md rounded-lg'
/** A well in the sky tone. */
export const WELL_SKY = 'bg-sky-50 border border-sky-200 p-space-md rounded-lg'
/** A white box inside a card or well. */
export const BOX = 'bg-white border border-slate-200 rounded-lg p-3'
/** A white box inside a sky card. */
export const BOX_SKY = 'bg-white border border-sky-200 rounded-lg p-3'
/** A tinted group inside a box. */
export const GROUP_BOX = 'bg-slate-50 border border-slate-200 rounded-lg p-2'
/** A white scrolling list box (the caller keeps its height and overflow). */
export const LIST_BOX = 'bg-white border border-slate-200 rounded-lg px-2 py-2'
/** Nothing to list yet. */
export const EMPTY_STATE = 'rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 font-body-md text-body-md text-slate-600'
/** An error message box: the editor's error line. */
export const ERROR_BOX = 'rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 font-body-sm text-body-sm text-rose-800'
/** A note box: the editor's notice line. */
export const NOTE_BOX = 'rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 font-body-sm text-body-sm text-emerald-800'
/** An event in the home list. */
export const EVENT_ROW = 'bg-white border border-slate-200 rounded-lg p-4 transition-colors hover:bg-slate-50'

// Tables (the matrix ledger's head and rows)
export const TABLE_SHELL = 'bg-white border border-slate-200 rounded-lg'
export const TABLE_CAPTION = 'border-b border-slate-200 bg-slate-50 px-3 py-2'
export const TABLE_HEAD = 'bg-slate-50 px-3 py-2 font-label-sm text-label-sm text-slate-500 uppercase font-bold tracking-wider'
export const TABLE_ROW = 'px-3 py-2 font-body-sm text-body-sm text-slate-700'
export const TABLE_DIVIDE = 'divide-y divide-slate-100'
export const THEAD_ROW = 'bg-slate-50 font-label-sm text-label-sm text-slate-500 uppercase font-bold tracking-wider'
export const TH_FIRST = 'rounded-l-lg'
export const TH_LAST = 'rounded-r-lg'
export const TBODY_ROW = 'border-b border-slate-100 bg-white'

// Type
/** The page title: the event band's h1. */
export const H1 = 'font-headline-lg-mobile text-headline-lg-mobile sm:font-headline-lg sm:text-headline-lg text-slate-900 tracking-tight font-bold'
/** A card title at the old text-xl size. */
export const H2_LARGE = 'font-headline-md text-headline-md text-slate-900 font-bold'
/** A card title (the old text-lg). */
export const H2 = 'font-headline-sm text-headline-sm text-slate-900 font-bold'
/** A small heading (the old text-sm semibold). */
export const H3 = 'font-label-lg text-label-lg text-slate-900 font-semibold'
/** A section label: the editor's h3 and the Dialog's ledger title. */
export const EYEBROW = 'font-label-sm text-label-sm text-slate-500 uppercase font-bold tracking-wider'
/** A card's description. */
export const LEDE = 'font-body-md text-body-md text-slate-600'
/** Body text. */
export const BODY = 'font-body-md text-body-md text-slate-700'
/** Small body text. */
export const BODY_SM = 'font-body-sm text-body-sm text-slate-700'
/** Helper text, slate-500 for projectors (owner, 2026-11-20). */
export const HELP = 'font-body-sm text-body-sm text-slate-500'
/** A value under a label (the preview figures). */
export const VALUE = 'font-body-md text-body-md text-slate-900 font-semibold'
/** A field label. */
export const LABEL = 'font-label-lg text-label-lg text-slate-700'
/** A small field label. */
export const LABEL_SM = 'font-label-md text-label-md text-slate-700'
/** The label a table cell shows on phones, where the table head is hidden. */
export const CELL_LABEL = 'font-semibold text-slate-500'
/** A link that shows its address. */
export const LINK = 'font-body-md text-body-md text-sky-700 underline hover:text-sky-800'
/** An error line under a field: the unlock dialog's. */
export const ERROR_TEXT = 'font-body-sm text-body-sm text-rose-600'
/** Emerald inline text. */
export const TEXT_EMERALD = 'text-emerald-700'
/** Muted inline text. */
export const TEXT_MUTED = 'text-slate-500'

// Fields (the caller keeps its padding and width)
/** A text field, select or textarea: the editor's field at the old text-sm size. */
export const FIELD =
	'rounded-lg border border-slate-200 bg-white font-body-md text-body-md text-slate-900 placeholder:text-slate-500 outline-hidden focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500'
/** A field whose value is emphasised (the direct-rating maxima). */
export const FIELD_STRONG =
	'rounded-lg border border-slate-200 bg-white font-body-md text-body-md text-slate-900 font-semibold placeholder:text-slate-500 outline-hidden focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500'
/** A field for pasted data. */
export const FIELD_MONO =
	'rounded-lg border border-slate-200 bg-white font-mono text-body-md text-slate-900 placeholder:text-slate-500 outline-hidden focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500'
/** A field that confirms a destructive action. */
export const FIELD_DANGER =
	'rounded-lg border border-slate-200 bg-white font-body-md text-body-md text-slate-900 placeholder:text-slate-500 outline-hidden focus:border-rose-500 focus:ring-2 focus:ring-rose-500'
/** A read-only value drawn as a field. */
export const FIELD_STATIC = 'rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-body-md text-body-md text-slate-700'
/** A checkbox. */
export const CHECKBOX = 'rounded border-slate-300 text-emerald-600 focus:ring-emerald-500'
/** A choice row with its checkbox (the strand lists). */
export const OPTION_ROW = cx('rounded-lg px-2 py-1 font-body-sm text-body-sm text-slate-800 transition-colors hover:bg-slate-50', CLICKABLE)
/** A checkbox chip (the schedule's judges). */
export const OPTION_CHIP = 'rounded-full border border-slate-200 bg-white px-3 py-1 font-label-md text-label-md text-slate-700'

// Chips (Badge looks)
/** A count: "Total: n". */
export const CHIP_NEUTRAL = 'rounded-full bg-slate-100 border border-slate-200 px-3 py-1 font-label-sm text-label-sm text-slate-700 font-semibold'
/** An emerald note chip. */
export const CHIP_EMERALD = 'rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 font-label-sm text-label-sm text-emerald-800 font-semibold'
/** A small sky tag (program, record count). */
export const CHIP_SKY_XS = 'rounded-full bg-sky-50 border border-sky-200 px-1.5 py-0.5 text-[10px] text-sky-800 font-semibold'
/** The entry type tag: individual (sky) or group (emerald). */
export const ENTRY_TYPE_INDIVIDUAL = 'rounded-full px-2 py-0.5 font-label-sm text-label-sm bg-sky-100 text-sky-800'
export const ENTRY_TYPE_GROUP = 'rounded-full px-2 py-0.5 font-label-sm text-label-sm bg-emerald-100 text-emerald-800'

// Controls
/** A pressed toggle button (Bulk Add, Import JSON open): the admin-sky button, filled. */
export const TOGGLE_ON = cx(
	'flex items-center gap-space-xxs px-space-sm py-1 rounded bg-sky-700 border border-sky-700 hover:bg-sky-800 text-white font-label-sm text-label-sm font-semibold transition-colors shadow-2xs',
	CLICKABLE,
	FOCUS_RING,
)
/** The home list's actions button (three dots). */
export const ICON_BUTTON = cx(
	'h-10 w-10 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-xs transition-colors',
	CLICKABLE,
	FOCUS_RING,
)
/** The home list's actions menu. */
export const MENU = 'rounded-lg border border-slate-200 bg-white p-2 shadow-lg transition-opacity duration-150'
/** A menu item. */
export const MENU_ITEM = cx(
	'rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 font-label-md text-label-md font-semibold text-slate-800 transition-colors',
	CLICKABLE,
	FOCUS_RING,
)
/** A destructive menu item. */
export const MENU_ITEM_DANGER = cx(
	'rounded-lg border border-rose-200 bg-white hover:bg-rose-50 px-3 py-2 font-label-md text-label-md font-semibold text-rose-700 transition-colors',
	CLICKABLE,
	FOCUS_RING,
)

// Hand-made dialogs (the Dialog primitive's overlay, panel and title; the markup stays as it is)
export const OVERLAY = 'bg-slate-900/40 backdrop-blur-xs p-4'
export const DIALOG_PANEL = 'bg-white border border-slate-200 rounded-xl shadow-2xl p-space-lg'
export const DIALOG_TITLE = 'font-headline-md text-headline-md text-slate-900 font-bold'
export const DIALOG_TEXT = 'font-body-sm text-body-sm text-slate-600'
/** The database import log. */
export const LOG_BOX = 'rounded-lg bg-slate-900 p-3 font-body-sm text-body-sm text-slate-300 shadow-inner'

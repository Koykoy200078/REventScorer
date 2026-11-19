// States the mockups leave out, taken from the docs/designs DESIGN.md component rules.

/** Keyboard focus: a crisp 2px #059669 stroke with a 1px offset, no glow. */
export const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary'

/** Disabled controls: 50% opacity, and the pointer says they cannot be used. */
export const DISABLED = 'disabled:cursor-not-allowed disabled:opacity-50'

/** Tailwind v4 no longer gives buttons a pointer cursor; the mockups (Tailwind v3) do. */
export const CLICKABLE = 'cursor-pointer'

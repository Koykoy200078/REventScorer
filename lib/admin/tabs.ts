// The admin console's tabs (spec R40) and the editor flag (R45), as app/admin/[eventId]/page.tsx reads them from the
// URL (Stage 5 Task 7 step 3), so the first render matches the server.

export const ADMIN_TABS = ['dashboard', 'matrix', 'telemetry', 'rankings'] as const

export type AdminTab = (typeof ADMIN_TABS)[number]

/** Exactly one of the four tab names; anything else (other case, '', an array, missing) is the dashboard. */
export function parseAdminTabParam(raw: unknown): AdminTab {
	return (ADMIN_TABS as readonly unknown[]).includes(raw) ? (raw as AdminTab) : 'dashboard'
}

/**
 * The query string for showing `tab`: the editor flags are dropped (any tab leaves the editor view), ?tab= names the tab
 * (once) and is dropped for the dashboard, every other key is kept. Returns '' or '?…'.
 */
export function searchForTab(search: string, tab: AdminTab): string {
	const params = new URLSearchParams(search)
	params.delete('update')
	params.delete('editor')
	params.delete('tab')
	if (tab !== 'dashboard') params.set('tab', tab)
	const query = params.toString()
	return query ? `?${query}` : ''
}

/** ?update= or ?editor= set to '1' or 'true' (as before the redesign); arrays and other values do not count. */
export function isEditorRequested(params: { update?: unknown; editor?: unknown } | undefined): boolean {
	const set = (value: unknown) => value === '1' || value === 'true'
	return Boolean(params && (set(params.update) || set(params.editor)))
}

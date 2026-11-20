import { SegmentedControl } from '@/components/ui/segmented-control'
import type { JudgeView } from '@/lib/judge/layout'
import { cx } from '@/lib/ui/cx'

/**
 * The Unified / Group only / Individual only switch of a unified entry (Stage 5 Task 5, spec §2.5,
 * ruling R3): 'header' is SC-2 in the header (shown from lg), 'toggle' is SC-1 in the page (below
 * lg), so exactly one is visible at any width. Both are radio groups named "Scoring view" with the
 * current view in emerald (aria-checked, aria-current); a switch makes no request.
 */
export function ViewSwitcher({ variant, value, onChange, weighted, className }: { variant: 'toggle' | 'header'; value: JudgeView; onChange: (view: JudgeView) => void; weighted: boolean; className?: string }) {
	const items = [
		{ value: 'unified' as const, label: variant === 'header' ? 'Unified (Group + Individual)' : weighted ? 'Unified (60/40)' : 'Unified' },
		{ value: 'group' as const, label: 'Group only' },
		{ value: 'individual' as const, label: 'Individual only' },
	]
	return (
		<SegmentedControl
			variant={variant}
			items={items}
			value={value}
			onChange={onChange}
			aria-label='Scoring view'
			data-testid={variant === 'header' ? 'view-switcher-header' : 'view-switcher'}
			data-view={value}
			className={cx(variant === 'toggle' ? 'lg:hidden' : undefined, className)}
		/>
	)
}

import { BatchRail, type BatchRailAction } from '@/components/ui/preset-rail'
import { batchPercentsFor, type BatchPercent, type BatchRailVariant } from '@/lib/judge/presets'

const MARKER: Record<BatchPercent, { marker?: string; tone?: 'primary' | 'secondary' }> = {
	90: { marker: '⚡', tone: 'primary' },
	75: { marker: '⚖', tone: 'secondary' },
	50: {},
}

/**
 * Batch Fill and Reset for the cells a view shows (Stage 5 Task 5, spec §5, ruling R8): BR-1 in the
 * Unified roster header, BR-2 in the Group-only callout, BR-3 in the Individual-only candidate
 * header (with 50%). Batch Fill overwrites without asking; Reset asks first (the container's
 * confirm). The buttons are disabled when there is nothing to fill or reset.
 */
export function JudgeBatchRail({
	variant,
	label,
	scopeSize,
	enteredCount,
	onFill,
	onReset,
}: {
	variant: BatchRailVariant
	label: string
	scopeSize: number
	enteredCount: number
	onFill: (percent: BatchPercent) => void
	onReset: () => void
}) {
	// Test ids go through a spread: a typed object literal does not take data-* keys.
	const testId = (id: string) => ({ 'data-testid': id }) as Record<string, string>
	const actions: BatchRailAction[] = batchPercentsFor(variant).map((percent) => ({
		...testId(`batch-fill-${percent}`),
		label: `${percent}%`,
		...MARKER[percent],
		kind: 'preset' as const,
		disabled: scopeSize === 0,
		onClick: () => onFill(percent),
	}))
	actions.push({
		...testId('batch-reset'),
		kind: 'reset',
		...(variant === 'unified' ? { 'aria-label': 'Reset the scores shown', title: 'Reset the scores shown' } : { label: 'Reset' }),
		disabled: enteredCount === 0,
		onClick: onReset,
	})
	return <BatchRail variant={variant} label={label} actions={actions} />
}

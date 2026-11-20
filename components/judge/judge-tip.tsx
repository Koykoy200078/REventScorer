/**
 * Today's tip line (Stage 5 Task 5, ruling R23): the Unified footer position, and a slate-500 line
 * after Section C in the other views.
 */
export function JudgeTip({ variant }: { variant: 'unified' | 'group' | 'individual' }) {
	const text = 'Tip: Save each contestant right after the presentation. If internet/service fails, scores are kept locally and auto-upload when connection is back.'
	return variant === 'unified' ? (
		<footer className='border-t border-slate-200 pt-space-md font-body-sm text-body-sm text-slate-500'>{text}</footer>
	) : (
		<p className='font-body-sm text-body-sm text-slate-500'>{text}</p>
	)
}

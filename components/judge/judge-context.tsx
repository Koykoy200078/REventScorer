import { formatDate } from '@/lib/judge/matrix'

/**
 * The judge meta line (Stage 5 Task 5, spec §2.5, critique B2): who is scoring, admin edit mode and
 * the last save, in every view and at every width (the header chip shows the name from xl only),
 * then the rubric legend on its own line when there is one. Small text is slate-500 (R30).
 */
export function JudgeMeta({ judgeName, adminEditMode, lastSubmittedAt, legendText }: { judgeName: string; adminEditMode: boolean; lastSubmittedAt?: string | null; legendText?: string | null }) {
	return (
		<div className='flex flex-col gap-space-xxs font-body-sm text-body-sm text-slate-500'>
			<p>
				Judge: <span className='font-semibold text-slate-700'>{judgeName}</span>
				{adminEditMode ? ' • Admin edit mode' : null}
				{lastSubmittedAt ? ` • Last submitted: ${formatDate(lastSubmittedAt)}` : null}
			</p>
			{legendText ? <p>Legend: {legendText}</p> : null}
		</div>
	)
}

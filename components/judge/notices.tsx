// Stage 5 Task 5 Step 5: the judge page's error and success lines, moved verbatim out of
// components/judge-scoring-form.tsx. Step 6 restyles them and moves the pending-upload line here.
export function JudgeNotices({ error, successMessage }: { error: string | null; successMessage: string | null }) {
	return (
		<>
					{error ? <p data-testid='judge-error' className='rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700'>{error}</p> : null}
					{successMessage ? <p data-testid='judge-success' className='rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700'>{successMessage}</p> : null}
		</>
	)
}

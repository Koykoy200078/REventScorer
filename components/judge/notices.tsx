import { InfoRow } from '@/components/ui/banner'
import Icon from '@/components/ui/icon'

/**
 * The judge page's notices (Stage 5 Task 5, spec §2.5), rendered once under the context region, with
 * today's texts: the success row (B-3, emerald), the error row (the same shape in rose), the
 * pending-uploads row (amber, only while saves are queued) and the auto-upload line. The test ids
 * sit on rows whose only text is the message (the icons are SVG without text).
 */
export function JudgeNotices({ error, successMessage, queuedCount, isAutoSyncing }: { error: string | null; successMessage: string | null; queuedCount: number; isAutoSyncing: boolean }) {
	return (
		<>
			{successMessage ? <InfoRow data-testid='judge-success' role='status' tone='emerald' icon='check_circle' heading={successMessage} /> : null}
			{error ? (
				<div data-testid='judge-error' role='alert' className='p-space-sm rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-space-xs'>
					<Icon name='warning' className='text-rose-600 text-[18px] shrink-0 mt-0.5' />
					<span className='font-label-md text-label-md text-rose-700 font-bold'>{error}</span>
				</div>
			) : null}
			{queuedCount > 0 ? (
				<div data-testid='pending-uploads' className='p-space-sm rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-space-xs'>
					<Icon name='sync' className='text-amber-600 text-[18px] shrink-0 mt-0.5' />
					<span className='font-label-md text-label-md text-amber-800 font-semibold'>Pending uploads: {queuedCount}. Saved locally and waiting to sync.</span>
				</div>
			) : null}
			{isAutoSyncing ? <p className='font-body-sm text-body-sm text-slate-500'>Auto-uploading pending saves...</p> : null}
		</>
	)
}

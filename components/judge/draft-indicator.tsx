import Icon from '@/components/ui/icon'
import type { DraftStatus } from '@/lib/judge/draft-state'

/**
 * Whether this device keeps a draft of the judge's unsaved scores (Stage 5 Task 5, spec §7.1, D30):
 * the same state as save-scores[data-draft-status]. Always mounted, once per page, in the dock's
 * summary so it is visible wherever the judge is (R15). save_as, not the mockup's cloud_done: the
 * draft never leaves the device.
 */
export function DraftIndicator({ status, className }: { status: DraftStatus; className?: string }) {
	return (
		<span role='status' data-testid='draft-indicator' data-status={status} className={className}>
			{status === 'kept' ? (
				<span className='inline-flex items-center gap-0.5 font-label-sm text-label-sm text-emerald-700 font-medium'>
					<Icon name='save_as' className='text-[15px]' />
					Draft kept on this device
				</span>
			) : status === 'failed' ? (
				<span className='inline-flex items-center gap-0.5 font-label-sm text-label-sm text-rose-700 font-semibold'>
					<Icon name='warning' className='text-[15px]' />
					Draft not kept on this device (storage refused it). Save before leaving.
				</span>
			) : null}
		</span>
	)
}

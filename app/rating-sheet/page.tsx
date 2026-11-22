import Link from 'next/link'
import { Suspense } from 'react'

import { RatingSheet } from '@/components/rating-sheet'
import AppHeader from '@/components/ui/app-header'
import { buttonClassName } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import { LEDE } from '@/components/ui/form-styles'
import { cx } from '@/lib/ui/cx'

export const dynamic = 'force-dynamic'

export default function RatingSheetPage() {
	return (
		<div className='theme-admin min-h-screen bg-slate-50 font-body-md text-body-md text-slate-900 antialiased pt-16 pb-10'>
			<AppHeader
				variant='admin'
				brand='EventScorer'
				breadcrumbParent='Admin Dashboard'
				title='Rating Sheet'
				actions={
					<Link href='/' className={buttonClassName('admin-primary')}>
						<Icon name='arrow_back' className='text-[16px]' />
						<span className='sr-only md:not-sr-only'>Back to Dashboard</span>
					</Link>
				}
			/>
			<Suspense fallback={<div className={cx(LEDE, 'text-center p-8')}>Loading...</div>}>
				<RatingSheet />
			</Suspense>
		</div>
	)
}

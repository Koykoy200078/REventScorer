import Link from 'next/link'

import { CreateScorerForm } from '@/components/create-scorer-form'
import AppHeader from '@/components/ui/app-header'
import { buttonClassName } from '@/components/ui/button'
import Icon from '@/components/ui/icon'

export const dynamic = 'force-dynamic'

export default function CreateScorerPage() {
	return (
		<div className='theme-admin min-h-screen bg-slate-50 font-body-md text-body-md text-slate-900 antialiased pt-16 pb-10'>
			<AppHeader
				variant='admin'
				brand='EventScorer'
				breadcrumbParent='Admin Dashboard'
				title='Create Scorer Event'
				actions={
					<Link href='/' className={buttonClassName('admin-primary')}>
						<Icon name='arrow_back' className='text-[16px]' />
						<span className='sr-only md:not-sr-only'>Back to Dashboard</span>
					</Link>
				}
			/>
			<CreateScorerForm />
		</div>
	)
}

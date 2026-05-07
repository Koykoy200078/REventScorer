import Link from 'next/link'

import { CreateScorerForm } from '@/components/create-scorer-form'

export const dynamic = 'force-dynamic'

export default function CreateScorerPage() {
	return (
		<div className='min-h-screen bg-transparent pb-10'>
			<div className='mx-auto w-full max-w-6xl px-4 pt-6 sm:px-8'>
				<Link href='/' className='inline-flex items-center rounded-full border border-emerald-700/30 bg-emerald-50 px-4 py-2 text-sm text-emerald-900 transition hover:bg-emerald-100'>
					Back to Dashboard
				</Link>
			</div>
			<CreateScorerForm />
		</div>
	)
}

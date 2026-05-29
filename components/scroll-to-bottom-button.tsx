'use client'

import { useEffect, useState } from 'react'

export default function ScrollToBottomButton() {
	const [isVisible, setIsVisible] = useState(false)

	useEffect(() => {
		const handleScroll = () => {
			// Show the button if we are not at the bottom already
			const isAtBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 100
			
			// Only show if the page is actually scrollable
			const isScrollable = document.body.scrollHeight > window.innerHeight

			setIsVisible(isScrollable && !isAtBottom)
		}

		window.addEventListener('scroll', handleScroll, { passive: true })
		handleScroll() // Check initial state

		// Re-check when window resizes or DOM mutations happen that change height
		const resizeObserver = new ResizeObserver(handleScroll)
		resizeObserver.observe(document.body)

		return () => {
			window.removeEventListener('scroll', handleScroll)
			resizeObserver.disconnect()
		}
	}, [])

	if (!isVisible) return null

	return (
		<button
			onClick={() => {
				window.scrollTo({
					top: document.body.scrollHeight,
					behavior: 'smooth',
				})
			}}
			className='fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-white shadow-lg shadow-slate-900/20 transition-all hover:scale-110 hover:bg-slate-700 focus:outline-none focus:ring-4 focus:ring-slate-300 print:hidden'
			aria-label='Scroll to bottom'
			title='Scroll to bottom'
		>
			<svg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' strokeWidth={2.5} stroke='currentColor' className='h-6 w-6'>
				<path strokeLinecap='round' strokeLinejoin='round' d='M19.5 8.25l-7.5 7.5-7.5-7.5' />
			</svg>
		</button>
	)
}

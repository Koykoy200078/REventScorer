'use client'

import { useEffect, useState } from 'react'

export default function ScrollToBottomButton() {
	const [isAtBottom, setIsAtBottom] = useState(false)
	const [isScrollable, setIsScrollable] = useState(false)

	useEffect(() => {
		const handleScroll = () => {
			const scrollPos = window.scrollY
			const maxScroll = document.body.scrollHeight - window.innerHeight
			
			// We consider "at bottom" if they are within 100px of the bottom
			const bottomReached = maxScroll > 0 && scrollPos >= maxScroll - 100
			
			// Only show if the page is actually scrollable
			const scrollable = document.body.scrollHeight > window.innerHeight

			setIsScrollable(scrollable)
			setIsAtBottom(bottomReached)
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

	if (!isScrollable) return null

	return (
		<button
			onClick={() => {
				window.scrollTo({
					top: isAtBottom ? 0 : document.body.scrollHeight,
					behavior: 'smooth',
				})
			}}
			className='fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-white shadow-lg shadow-slate-900/20 transition-all hover:scale-110 hover:bg-slate-700 focus:outline-none focus:ring-4 focus:ring-slate-300 print:hidden'
			aria-label={isAtBottom ? 'Scroll to top' : 'Scroll to bottom'}
			title={isAtBottom ? 'Scroll to top' : 'Scroll to bottom'}
		>
			<svg 
				xmlns='http://www.w3.org/2000/svg' 
				fill='none' 
				viewBox='0 0 24 24' 
				strokeWidth={2.5} 
				stroke='currentColor' 
				className={`h-6 w-6 transition-transform duration-300 ${isAtBottom ? 'rotate-180' : ''}`}
			>
				<path strokeLinecap='round' strokeLinejoin='round' d='M19.5 8.25l-7.5 7.5-7.5-7.5' />
			</svg>
		</button>
	)
}

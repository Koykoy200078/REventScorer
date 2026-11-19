import type { Metadata } from 'next'
import localFont from 'next/font/local'

import './globals.css'
import ScrollToBottomButton from '@/components/scroll-to-bottom-button'

// Fonts are files in app/fonts (OFL-1.1, see the OFL-*.txt beside them), so nothing is fetched
// from the internet at build or run time. Manrope is the headline face and Geist the body face.
const manrope = localFont({
	src: './fonts/manrope-latin-wght-normal.woff2',
	variable: '--font-manrope',
	weight: '200 800',
	display: 'swap',
})

const geist = localFont({
	src: './fonts/geist-latin-wght-normal.woff2',
	variable: '--font-geist',
	weight: '100 900',
	display: 'swap',
})

export const metadata: Metadata = {
	title: 'EventScorer',
	description: 'Dynamic event tabulation, judge scoring links, and winner compilation',
}

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode
}>) {
	return (
		<html lang='en' suppressHydrationWarning className={`${manrope.variable} ${geist.variable} h-full antialiased`}>
			<head />
			<body className='min-h-full'>
				<div className='relative flex min-h-full flex-col'>
					{children}
					<ScrollToBottomButton />
				</div>
			</body>
		</html>
	)
}

import type { Metadata } from 'next'
import { Plus_Jakarta_Sans, Space_Grotesk } from 'next/font/google'

import './globals.css'

const plusJakartaSans = Plus_Jakarta_Sans({
	variable: '--font-jakarta',
	subsets: ['latin'],
})

const spaceGrotesk = Space_Grotesk({
	variable: '--font-space',
	subsets: ['latin'],
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
		<html lang='en' suppressHydrationWarning className={`${plusJakartaSans.variable} ${spaceGrotesk.variable} h-full antialiased`}>
			<head />
			<body className='min-h-full'>
				<div className='relative flex min-h-full flex-col'>{children}</div>
			</body>
		</html>
	)
}

'use client'

import Link from 'next/link'
import type { MouseEvent } from 'react'

import { connectionLabel, connectionTone, type ConnectionState } from '@/components/admin/connection'
import AppHeader from '@/components/ui/app-header'
import { StatusDot } from '@/components/ui/badge'
import { Button, buttonClassName } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import { Tab, TabList } from '@/components/ui/tabs'
import { ADMIN_TABS, type AdminTab } from '@/lib/admin/tabs'
import { cx } from '@/lib/ui/cx'

export const ADMIN_TAB_LABELS: Record<AdminTab, string> = {
	dashboard: 'Live Scoring Dashboard',
	matrix: 'Score Audit Matrix',
	telemetry: 'Judge Telemetry',
	rankings: 'Rankings',
}

const PILL_TEXT: Record<'live' | 'pending' | 'off', string> = {
	live: 'text-emerald-700',
	pending: 'text-amber-700',
	off: 'text-slate-600',
}

/**
 * The admin console's fixed header (spec R41): brand, breadcrumb "Admin Console › {title}", the compact live
 * indicator (a pill from xl, text in the second row below xl; no test hook, those are in the event band), the
 * actions Print Tabulation, Export Excel, Export CSV (labelled from xl as in the mockup, named icon buttons below
 * it, never hidden) and Admin Hub, and the four tabs in the second row. It must sit inside the page's `Tabs`. Not
 * printed.
 */
export function AdminHeader({
	title,
	connectionState,
	onPrint,
	onExportExcel,
	onExportCsv,
	onLeavePage,
}: {
	title: string
	connectionState: ConnectionState
	onPrint: () => void
	onExportExcel: () => void
	onExportCsv: () => void
	/** Called on an Admin Hub click before Next navigates; it may preventDefault() (the editor's unsaved edits). */
	onLeavePage?: (event: MouseEvent<HTMLAnchorElement>) => void
}) {
	const tone = connectionTone(connectionState)
	const label = connectionLabel(connectionState)

	return (
		<AppHeader
			variant='admin'
			className='print:hidden'
			brand='EventScorer'
			breadcrumbParent='Admin Console'
			title={title}
			status={
				<div className='hidden xl:flex items-center gap-space-sm px-space-md py-space-xs rounded-full bg-slate-100 border border-slate-200/80'>
					{tone === 'live' ? <StatusDot variant='ping-header' /> : <span aria-hidden className={cx('inline-flex h-2 w-2 rounded-full', tone === 'pending' ? 'bg-amber-500' : 'bg-slate-400')} />}
					<span className={cx('font-label-sm text-label-sm uppercase tracking-wider font-semibold', PILL_TEXT[tone])}>{label}</span>
				</div>
			}
			actions={
				<>
					<Button variant='admin-outline' icon='print' labelFrom='xl' aria-label='Print Tabulation' data-testid='print-results' onClick={onPrint}>
						Print Tabulation
					</Button>
					<Button variant='admin-outline' icon='table_view' labelFrom='xl' aria-label='Export Excel' data-testid='export-excel' onClick={onExportExcel}>
						Export Excel
					</Button>
					<Button variant='admin-outline' icon='file_download' labelFrom='xl' aria-label='Export CSV' data-testid='export-csv' onClick={onExportCsv}>
						Export CSV
					</Button>
					<Link href='/' aria-label='Admin Hub' className={buttonClassName('admin-primary')} onClick={onLeavePage}>
						<Icon name='arrow_back' className='text-[16px]' />
						<span className='sr-only md:not-sr-only'>Admin Hub</span>
					</Link>
				</>
			}
			subnav={
				<TabList aria-label='Admin console sections'>
					{ADMIN_TABS.map((tab) => (
						<Tab key={tab} value={tab} data-testid='admin-tab' data-tab={tab} className='whitespace-nowrap'>
							{ADMIN_TAB_LABELS[tab]}
						</Tab>
					))}
				</TabList>
			}
			subnavStatus={label}
			subnavStatusTone={tone}
		/>
	)
}

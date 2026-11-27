// Print Tabulation, a score sheet per judge (design 2026-11-27-judge-score-sheets; owner: "each judge signs their own
// sheet with only their scores", "By parent criterion"). Printed only: the dashboard draws it inside its print view.
// The type follows the Tabulation Sheet: the event title, the date, the sheet's name, a bordered table, a signature.

import type { JudgeSheet } from '@/lib/admin/judge-sheet'
import { formatScore } from '@/lib/admin/format'
import { cx } from '@/lib/ui/cx'

const heading = (label: string, max: number | null) => (max === null ? label : `${label} (${max})`)

export function JudgeScoreSheet({ eventTitle, date, sheet, className }: { eventTitle: string; date: string; sheet: JudgeSheet; className?: string }) {
	return (
		<section data-testid='judge-sheet' data-judge-id={sheet.judgeId} className={cx('w-full bg-white p-12 text-black', className)}>
			<div className='text-center font-serif leading-tight'>
				<h1 className='text-xl font-bold uppercase'>{eventTitle}</h1>
				<p>Date: {date}</p>
				<br />
				<h2 className='text-2xl font-bold uppercase tracking-widest'>Judge&apos;s Score Sheet</h2>
				<p data-testid='judge-sheet-judge' className='mt-1 text-lg font-bold uppercase'>{sheet.judgeName}</p>
				<div className='mx-auto mb-6 mt-2 w-1/2 border-b-2 border-black'></div>
			</div>

			<table className='mt-8 w-full border-collapse border border-black text-center text-sm'>
				<thead>
					<tr>
						<th className='border border-black p-2 font-bold uppercase'>Contestant No. / Name</th>
						{sheet.columns.map((column) => (
							<th key={column.key} className='border border-black p-2 font-bold uppercase'>
								{heading(column.label, column.max)}
							</th>
						))}
						<th className='border border-black p-2 font-bold uppercase'>{heading(sheet.totalLabel, sheet.totalMax)}</th>
					</tr>
				</thead>
				<tbody>
					{sheet.rows.map((row) => (
						<tr key={row.contestantId} data-testid='judge-sheet-row' data-contestant-id={row.contestantId}>
							<td data-col='name' className='border border-black p-2 text-left font-semibold uppercase'>{row.contestantName}</td>
							{row.cells.map((cell, index) => (
								<td key={sheet.columns[index].key} data-col='part' data-key={sheet.columns[index].key} className='border border-black p-2'>
									{formatScore(cell)}
								</td>
							))}
							<td data-col='total' className='border border-black p-2 font-bold'>{formatScore(row.total)}</td>
						</tr>
					))}
				</tbody>
			</table>

			<div className='mt-24 flex justify-center'>
				<div data-testid='judge-sheet-signature' className='text-center'>
					<div className='mb-1 w-48 border-b border-black'></div>
					<p className='font-bold uppercase'>{sheet.judgeName}</p>
					<p className='text-sm'>Judge</p>
				</div>
			</div>
		</section>
	)
}

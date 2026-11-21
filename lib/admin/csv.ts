// The Score Matrix CSV export (spec R52, Stage 5 Task 7 step 2): every entry in rank order, whatever the filters, with the
// matrix columns of the event's kind plus "Judges saved" and "Status".

import { scoringKind } from '@/lib/admin/formula'
import type { ProgramLabel } from '@/lib/admin/program'
import { type EntryStatus, entryStatusLabel } from '@/lib/admin/status'
import type { EventCompiledResults, EventScorer } from '@/lib/types'

export type CsvCell = string | number | null | undefined

// A text starting with one of these would run as a formula in a spreadsheet; it gets a leading apostrophe.
const FORMULA_START = /^[=+\-@\t\r]/

export function csvField(value: CsvCell): string {
	if (value === null || value === undefined) {
		return '""'
	}

	const text = typeof value === 'number' ? String(value) : FORMULA_START.test(value) ? `'${value}` : value
	return `"${text.replace(/"/g, '""')}"`
}

// UTF-8 with a byte order mark (spreadsheets read the accents right), CRLF line ends.
export function toCsv(rows: CsvCell[][]): string {
	return '﻿' + rows.map((row) => row.map(csvField).join(',') + '\r\n').join('')
}

// Two decimals, the same as the matrix shows them (formatScore uses toFixed(2)).
function figure(value: number | undefined): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(2)) : null
}

export function scoreMatrixRows(
	event: Pick<EventScorer, 'contestants'>,
	compiled: Pick<EventCompiledResults, 'hasWeightedScores' | 'rankings'>,
	programOf: (contestantId: string) => ProgramLabel | null,
	statusOf: (contestantId: string) => EntryStatus,
): CsvCell[][] {
	const kind = scoringKind(compiled)
	const contestants = new Map(event.contestants.map((contestant) => [contestant.id, contestant]))
	const kindHeaders =
		kind === 'weighted'
			? ['Group score', 'Group rating', 'Individual score', 'Individual rating', 'Weighted']
			: kind === 'direct'
				? ['AVE/GPA', 'NOAT', 'Interview', 'Final rating', 'Total', 'Strand', 'Remark', 'Additional remark']
				: ['Average', 'Total']

	const rows: CsvCell[][] = [['Rank', 'Entry', 'Section', 'Program', ...kindHeaders, 'Judges', 'Judges saved', 'Status']]

	for (const result of [...compiled.rankings].sort((left, right) => left.rank - right.rank)) {
		const kindCells: CsvCell[] =
			kind === 'weighted'
				? [figure(result.groupAverageScore), figure(result.groupRating), figure(result.individualAverageScore), figure(result.individualRating), figure(result.weightedScore)]
				: kind === 'direct'
					? [
							figure(result.directDetails?.aveGpa),
							figure(result.directDetails?.noat),
							figure(result.directDetails?.totalInterview),
							figure(result.finalRating),
							figure(result.totalScore),
							result.directDetails?.strand ?? '',
							result.directDetails?.remark ?? '',
							result.directDetails?.additionalInfo ?? '',
						]
					: [figure(result.averageScore), figure(result.totalScore)]
		const status = statusOf(result.contestantId)

		rows.push([
			result.rank,
			result.contestantName,
			contestants.get(result.contestantId)?.section?.trim() ?? '',
			programOf(result.contestantId) ?? '',
			...kindCells,
			result.judgeCount,
			`${status.saved} / ${status.assigned}`,
			entryStatusLabel(status),
		])
	}

	return rows
}

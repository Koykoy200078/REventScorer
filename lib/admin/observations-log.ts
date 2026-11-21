// The Judge Telemetry remarks list and its "Observations Log" text export (spec 2.3, Stage 5 Task 7 step 2).

import type { EventScorer } from '@/lib/types'

export interface RemarkItem {
	judgeId: string
	judgeName: string
	contestantId: string
	contestantName: string
	label: string
	text: string
	submittedAt: string
}

function time(iso: string): number {
	const value = Date.parse(iso)
	return Number.isFinite(value) ? value : 0
}

// One item per non-blank remark and additional remark a judge saved: newest submission first, then by the entry's rank
// within a judge. For direct-rating events the additional remark holds the applicant's laptop answer.
export function remarkItems(event: Pick<EventScorer, 'contestants' | 'judges' | 'submissions'>, rankOf: (contestantId: string) => number | undefined, isDirect: boolean): RemarkItem[] {
	const judges = new Map(event.judges.map((judge) => [judge.id, judge]))
	const contestants = new Map(event.contestants.map((contestant) => [contestant.id, contestant]))
	const rank = (contestantId: string) => rankOf(contestantId) ?? Number.POSITIVE_INFINITY
	const additionalLabel = isDirect ? 'Laptop / remark' : 'Additional remark'
	const items: RemarkItem[] = []

	const submissions = event.submissions.filter((submission) => judges.has(submission.judgeId)).sort((left, right) => time(right.submittedAt) - time(left.submittedAt))

	for (const submission of submissions) {
		const judge = judges.get(submission.judgeId)!
		const contestantIds = Object.keys(submission.contestantDetails ?? {})
			.filter((contestantId) => contestants.has(contestantId))
			.sort((left, right) => rank(left) - rank(right) || contestants.get(left)!.name.localeCompare(contestants.get(right)!.name))

		for (const contestantId of contestantIds) {
			const details = submission.contestantDetails?.[contestantId] ?? {}
			for (const [label, value] of [['Remark', details.remark], [additionalLabel, details.additionalInfo]] as const) {
				const text = typeof value === 'string' ? value.trim() : ''
				if (text) {
					items.push({ judgeId: judge.id, judgeName: judge.name, contestantId, contestantName: contestants.get(contestantId)!.name, label, text, submittedAt: submission.submittedAt })
				}
			}
		}
	}

	return items
}

// "{title} - Observations Log": one block per item (entry, judge, label: text), CRLF line ends.
export function observationsLog(title: string, items: RemarkItem[]): string {
	const header = `${title} - Observations Log\r\n\r\n`
	if (items.length === 0) {
		return `${header}No remarks yet.\r\n`
	}

	return header + items.map((item) => `Entry: ${item.contestantName}\r\nJudge: ${item.judgeName}\r\n${item.label}: ${item.text.replace(/\r?\n/g, '\r\n')}\r\n`).join('\r\n')
}

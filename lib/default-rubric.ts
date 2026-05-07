import type { CriterionInput } from '@/lib/types'

export const PAPER_PRESENTATION_CRITERIA: CriterionInput[] = [
	{
		name: 'Quality of Work, Creativity, and Originality',
		subCriteria: [
			{ name: 'Rationale / State of the Art', maxScore: 10 },
			{ name: 'Objectives', maxScore: 5 },
			{ name: 'Methodology', maxScore: 15 },
		],
	},
	{
		name: 'Significance of Findings',
		subCriteria: [
			{ name: 'Social Acceptability', maxScore: 10 },
			{ name: 'Technical Feasibility', maxScore: 10 },
			{ name: 'Financial Viability', maxScore: 10 },
			{ name: 'Environmental Soundness', maxScore: 10 },
		],
	},
	{
		name: 'Manuscript / Write-up',
		subCriteria: [
			{ name: 'Accuracy of figures and language', maxScore: 5 },
			{ name: 'Clarity and style', maxScore: 5 },
			{ name: 'Cogency and logic (coherence)', maxScore: 5 },
		],
	},
	{
		name: 'Proper Presentation',
		subCriteria: [
			{
				name: 'Clarity of presentation, use of visual aids, stage presence, voice modulation',
				maxScore: 5,
			},
			{ name: 'Response to inquiries', maxScore: 10 },
		],
	},
]

export const PAPER_PRESENTATION_CONTESTANT_SAMPLES = ['Entry 1', 'Entry 2', 'Entry 3']

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

export const FINAL_ORAL_DEFENSE_GROUP_CRITERIA = {
	name: 'Group Presentation',
	subCriteria: [
		{ name: 'Project Context and societal impact', maxScore: 10 },
		{ name: 'Problem Statement', maxScore: 10 },
		{ name: 'Objectives', maxScore: 10 },
		{ name: 'Proposed Methodology', maxScore: 10 },
		{ name: 'Requirement Analysis', maxScore: 10 },
		{ name: 'Standards of the study', maxScore: 10 },
		{ name: 'Team Organization', maxScore: 10 },
		{ name: 'Solution Approach', maxScore: 10 },
		{ name: 'Spelling, Punctuation, Grammar', maxScore: 10 },
		{ name: 'Overall Presentation', maxScore: 10 },
		{ name: 'Question and Answer', maxScore: 10 },
	],
}

export const FINAL_ORAL_DEFENSE_INDIVIDUAL_CRITERIA = [
	{ name: 'Delivery (Voice Projection and Modulation)', maxScore: 20 },
	{ name: 'Grammar, Syntax, and Understandability', maxScore: 20 },
	{ name: 'Preparedness (Professionalism and Demeanor)', maxScore: 20 },
	{ name: 'Ability to present the assigned topic(s) clearly', maxScore: 20 },
	{ name: 'Participation in the defense', maxScore: 20 },
	{ name: 'Ability to answer questions', maxScore: 20 },
	{ name: 'Ability to convince the panelists of the ideas being presented', maxScore: 20 },
]

export const FINAL_ORAL_DEFENSE_CONTESTANT_SAMPLES = ['Team Alpha (BSCS)', 'Team Bravo (BSINT)', 'Team Charlie']

export const DIRECT_RATING_CRITERIA: CriterionInput[] = [
	{
		name: 'Direct Rating',
		subCriteria: [
			{ name: 'AVE/GPA', maxScore: 100 },
			{ name: 'NOAT', maxScore: 100 },
			{ name: 'Interview', maxScore: 100 },
		],
	},
]

export const DIRECT_RATING_CONTESTANT_SAMPLES = ['Applicant 1', 'Applicant 2', 'Applicant 3']

export function buildFinalOralDefenseCriteria(): CriterionInput[] {
	return [
		FINAL_ORAL_DEFENSE_GROUP_CRITERIA,
		{
			name: 'Individual Presentation',
			subCriteria: FINAL_ORAL_DEFENSE_INDIVIDUAL_CRITERIA,
		},
	]
}

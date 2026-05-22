export type ScoreMatrix = Record<string, Record<string, number>>

export interface JudgeContestantDetails {
	strand?: string
	remark?: string
	additionalInfo?: string
}

export type JudgeContestantDetailsMap = Record<string, JudgeContestantDetails>

export interface JudgeInput {
	name: string
	email?: string
}

export type EventScoringType = 'standard' | 'final-oral-defense'
export type EventProgramTag = 'BSINT' | 'BSCS'

export type DirectScoreFieldKey = 'aveGpa' | 'noat' | 'interview'

export interface DirectRatingMaxScores {
	aveGpa: number
	noat: number
	interview: number
}

export interface DirectRatingStrandBonusConfig {
	singleAlignedBonusPoints: number
	multiAlignedBonusPoints: number
	singleAlignedStrands: string[]
	multiAlignedStrands: string[]
}

export interface DirectRatingConfig {
	maxScores: DirectRatingMaxScores
	scoreWeights?: Record<DirectScoreFieldKey, number>
	strandBonus: DirectRatingStrandBonusConfig
}

export type ContestantEntryType = 'group' | 'individual'

export interface ContestantInput {
	name: string
	entryType?: ContestantEntryType
	participants?: string[]
	programTag?: EventProgramTag | null
	section?: string
}

export interface SubCriterionInput {
	name: string
	maxScore: number
}

export interface RubricLegendItem {
	score: number
	label: string
}

export interface CriterionInput {
	name: string
	subCriteria: SubCriterionInput[]
}

export interface PresentationSlotInput {
	label: string
	contestantIndex: number
	judgeNames: string[]
}

export interface AdminContestantEditorInput {
	id?: string
	name: string
	entryType?: ContestantEntryType
	participants?: string[]
	programTag?: EventProgramTag | null
	section?: string
}

export interface AdminJudgeEditorInput {
	id?: string
	name: string
	email?: string
	token?: string
}

export interface AdminSubCriterionEditorInput {
	id?: string
	name: string
	maxScore: number
}

export interface AdminCriterionEditorInput {
	id?: string
	name: string
	subCriteria: AdminSubCriterionEditorInput[]
}

export interface AdminPresentationSlotEditorInput {
	id?: string
	label: string
	contestantId?: string
	contestantIndex?: number
	judgeIds?: string[]
	judgeNames?: string[]
}

export interface AdminEventEditorInput {
	title: string
	description?: string
	createdBy?: string
	eventScoringType?: EventScoringType
	rubricLegend?: RubricLegendItem[]
	showRubricLegend?: boolean
	directRatingConfig?: DirectRatingConfig
	resetScores?: boolean
	contestants: AdminContestantEditorInput[]
	judges: AdminJudgeEditorInput[]
	criteria: AdminCriterionEditorInput[]
	presentationSlots?: AdminPresentationSlotEditorInput[]
}

export interface CreateEventInput {
	title: string
	description?: string
	createdBy?: string
	eventScoringType?: EventScoringType
	rubricLegend?: RubricLegendItem[]
	showRubricLegend?: boolean
	directRatingConfig?: DirectRatingConfig
	contestants: Array<string | ContestantInput>
	judges: JudgeInput[]
	criteria: CriterionInput[]
	presentationSlots?: PresentationSlotInput[]
}

export interface EventContestant {
	id: string
	name: string
	entryType?: ContestantEntryType
	participants?: string[]
	programTag?: EventProgramTag | null
	section?: string
}

export interface EventJudge {
	id: string
	name: string
	email?: string
	token: string
}

export interface EventSubCriterion {
	id: string
	name: string
	maxScore: number
}

export interface EventCriterion {
	id: string
	name: string
	maxScore: number
	subCriteria: EventSubCriterion[]
}

export interface EventPresentationSlot {
	id: string
	label: string
	contestantId: string
	judgeIds: string[]
}

export interface JudgeSubmission {
	judgeId: string
	submittedAt: string
	scores: ScoreMatrix
	savedContestantIds?: string[]
	contestantDetails?: JudgeContestantDetailsMap
}

export interface EventScorer {
	id: string
	title: string
	description?: string
	createdBy?: string
	eventScoringType?: EventScoringType
	rubricLegend?: RubricLegendItem[]
	showRubricLegend?: boolean
	directRatingConfig?: DirectRatingConfig
	createdAt: string
	contestants: EventContestant[]
	judges: EventJudge[]
	criteria: EventCriterion[]
	presentationSlots?: EventPresentationSlot[]
	submissions: JudgeSubmission[]
}

export interface EventSummary {
	id: string
	title: string
	createdAt: string
	contestantCount: number
	judgeCount: number
	submittedJudgeCount: number
	isDirectRating?: boolean
}

export interface JudgeProfile {
	id: string
	name: string
	email?: string
}

export interface JudgeSessionData {
	event: Pick<EventScorer, 'id' | 'title' | 'description' | 'eventScoringType' | 'rubricLegend' | 'showRubricLegend' | 'directRatingConfig' | 'contestants' | 'criteria' | 'presentationSlots'>
	judge: JudgeProfile
	submission?: JudgeSubmission
}

export interface JudgeLinkItem {
	judgeId: string
	judgeName: string
	token: string
	url: string
}

export interface CreateEventResponse {
	eventId: string
	adminUrl: string
	judgeLinks: JudgeLinkItem[]
}

export interface CompiledContestantResult {
	rank: number
	contestantId: string
	contestantName: string
	averageScore: number
	finalRating?: number
	baseFinalRating?: number
	bonusPoints?: number
	groupAverageScore?: number
	individualAverageScore?: number
	groupRating?: number
	individualRating?: number
	weightedScore?: number
	totalScore: number
	judgeCount: number
	perJudgeTotals: Record<string, number>
	participantScores?: Array<{
		participantLabel: string
		averageScore: number
		maxScore: number
		rating?: number
	}>
}

export interface JudgeBreakdown {
	judgeId: string
	judgeName: string
	submitted: boolean
	submittedAt?: string
	totalsByContestant: Record<string, number>
}

export interface EventCompiledResults {
	maxPossibleScore: number
	groupMaxScore?: number
	individualMaxScore?: number
	hasWeightedScores?: boolean
	submittedJudgeCount: number
	totalJudgeCount: number
	rankings: CompiledContestantResult[]
	judgeBreakdown: JudgeBreakdown[]
}

export interface AdminScoreRealtimeUpdate {
	eventId: string
	judgeId: string
	judgeName: string
	submittedAt: string
	submittedJudgeCount: number
	totalJudgeCount: number
}

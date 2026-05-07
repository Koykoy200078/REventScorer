export type ScoreMatrix = Record<string, Record<string, number>>

export interface JudgeInput {
	name: string
	email?: string
}

export interface SubCriterionInput {
	name: string
	maxScore: number
}

export interface CriterionInput {
	name: string
	subCriteria: SubCriterionInput[]
}

export interface CreateEventInput {
	title: string
	description?: string
	createdBy?: string
	contestants: string[]
	judges: JudgeInput[]
	criteria: CriterionInput[]
}

export interface EventContestant {
	id: string
	name: string
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

export interface JudgeSubmission {
	judgeId: string
	submittedAt: string
	scores: ScoreMatrix
}

export interface EventScorer {
	id: string
	title: string
	description?: string
	createdBy?: string
	createdAt: string
	contestants: EventContestant[]
	judges: EventJudge[]
	criteria: EventCriterion[]
	submissions: JudgeSubmission[]
}

export interface EventSummary {
	id: string
	title: string
	createdAt: string
	contestantCount: number
	judgeCount: number
	submittedJudgeCount: number
}

export interface JudgeProfile {
	id: string
	name: string
	email?: string
}

export interface JudgeSessionData {
	event: Pick<EventScorer, 'id' | 'title' | 'description' | 'contestants' | 'criteria'>
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
	totalScore: number
	judgeCount: number
	perJudgeTotals: Record<string, number>
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

'use client'

import { useMemo, useRef, useState } from 'react'

import type { EventContestant, EventCriterion, EventPresentationSlot, JudgeProfile, ScoreMatrix } from '@/lib/types'

type InputScoreMatrix = Record<string, Record<string, string>>

interface JudgeScoringFormProps {
	token: string
	eventTitle: string
	contestants: EventContestant[]
	criteria: EventCriterion[]
	judge: JudgeProfile
	presentationSlots?: EventPresentationSlot[]
	existingScores?: ScoreMatrix
	existingSavedContestantIds?: string[]
	submittedAt?: string
}

function round(value: number): number {
	return Math.round(value * 1000) / 1000
}

function criterionMaxScore(criterion: EventCriterion): number {
	const directMaxScore = Number(criterion.maxScore)

	if (Number.isFinite(directMaxScore) && directMaxScore > 0) {
		return directMaxScore
	}

	return criterion.subCriteria.reduce((sum, subCriterion) => {
		const maxScore = Number(subCriterion.maxScore)
		return sum + (Number.isFinite(maxScore) ? maxScore : 0)
	}, 0)
}

function parseAndClampScore(rawValue: string, maxScore: number): number {
	const parsedValue = Number.parseFloat(rawValue)
	const finiteValue = Number.isFinite(parsedValue) ? parsedValue : 0
	return Math.max(0, Math.min(finiteValue, maxScore))
}

function normalizeScoreInput(rawValue: string, maxScore: number): string {
	if (rawValue.trim() === '') {
		return ''
	}

	const parsedValue = Number.parseFloat(rawValue)
	if (!Number.isFinite(parsedValue)) {
		return '0'
	}

	if (parsedValue < 0) {
		return '0'
	}

	if (parsedValue > maxScore) {
		return String(round(maxScore))
	}

	return rawValue
}

function isIndividualCriterion(criterion: EventCriterion): boolean {
	return criterion.name.trim().toLowerCase() === 'individual presentation'
}

function splitMemberCriterionName(name: string): { memberLabel: string; displayName: string } {
	const separatorIndex = name.indexOf(' - ')
	if (separatorIndex === -1) {
		return { memberLabel: 'Individual', displayName: name }
	}

	const memberLabel = name.slice(0, separatorIndex).trim()
	const displayName = name.slice(separatorIndex + 3).trim()
	return { memberLabel: memberLabel || 'Individual', displayName: displayName || name }
}

function memberIndexFromLabel(memberLabel: string): number | null {
	const match = memberLabel.match(/(\d+)\s*$/)
	if (!match) {
		return null
	}

	const index = Number.parseInt(match[1], 10)
	return Number.isFinite(index) && index > 0 ? index : null
}

function normalizedParticipants(contestant?: EventContestant): string[] {
	if (!contestant?.participants) {
		return []
	}

	return contestant.participants.map((participant) => participant.trim()).filter((participant) => participant.length > 0)
}

function defaultMemberCountFromSubCriteria(subCriteria: EventCriterion['subCriteria']): number {
	let maxMemberCount = 0

	for (const subCriterion of subCriteria) {
		const memberIndex = memberIndexFromLabel(splitMemberCriterionName(subCriterion.name).memberLabel)
		if (memberIndex && memberIndex > maxMemberCount) {
			maxMemberCount = memberIndex
		}
	}

	return maxMemberCount > 0 ? maxMemberCount : 1
}

function allowedMemberCountForContestant(contestant: EventContestant | undefined, subCriteria: EventCriterion['subCriteria']): number {
	const defaultMemberCount = defaultMemberCountFromSubCriteria(subCriteria)

	if (!contestant) {
		return defaultMemberCount
	}

	if (contestant.entryType === 'individual') {
		return 1
	}

	const participants = normalizedParticipants(contestant)
	return participants.length > 0 ? participants.length : defaultMemberCount
}

function resolvedMemberLabel(memberLabel: string, contestant?: EventContestant): string {
	const participants = normalizedParticipants(contestant)
	if (participants.length === 0) {
		const memberIndex = memberIndexFromLabel(memberLabel)
		if (contestant?.entryType === 'individual' && memberIndex === 1) {
			return contestant.name
		}

		return memberLabel
	}

	const memberIndex = memberIndexFromLabel(memberLabel)
	if (!memberIndex) {
		return memberLabel
	}

	const participantName = participants[memberIndex - 1]?.trim()
	return participantName && participantName.length > 0 ? participantName : memberLabel
}

function groupSubCriteriaByMember(subCriteria: EventCriterion['subCriteria'], contestant?: EventContestant): Array<{ memberLabel: string; memberDisplayLabel: string; items: Array<{ subCriterion: EventCriterion['subCriteria'][number]; displayName: string }> }> {
	const allowedMemberCount = allowedMemberCountForContestant(contestant, subCriteria)
	const grouped = new Map<string, Array<{ subCriterion: EventCriterion['subCriteria'][number]; displayName: string }>>()

	for (const subCriterion of subCriteria) {
		const { memberLabel, displayName } = splitMemberCriterionName(subCriterion.name)
		const memberIndex = memberIndexFromLabel(memberLabel)
		if (memberIndex && memberIndex > allowedMemberCount) {
			continue
		}

		const existing = grouped.get(memberLabel)
		if (existing) {
			existing.push({ subCriterion, displayName })
		} else {
			grouped.set(memberLabel, [{ subCriterion, displayName }])
		}
	}

	return Array.from(grouped.entries()).map(([memberLabel, items]) => ({
		memberLabel,
		memberDisplayLabel: resolvedMemberLabel(memberLabel, contestant),
		items,
	}))
}

function applicableSubCriteriaForContestant(criterion: EventCriterion, contestant?: EventContestant): EventCriterion['subCriteria'] {
	if (!isIndividualCriterion(criterion)) {
		return criterion.subCriteria
	}

	const allowedMemberCount = allowedMemberCountForContestant(contestant, criterion.subCriteria)
	return criterion.subCriteria.filter((subCriterion) => {
		const memberIndex = memberIndexFromLabel(splitMemberCriterionName(subCriterion.name).memberLabel)
		return !memberIndex || memberIndex <= allowedMemberCount
	})
}

function hasPositiveDraftScore(scores: InputScoreMatrix, contestantId: string, criteria: EventCriterion[]): boolean {
	for (const criterion of criteria) {
		for (const subCriterion of criterion.subCriteria) {
			const rawValue = scores[contestantId]?.[subCriterion.id] ?? ''
			const parsedValue = Number.parseFloat(rawValue)
			if (Number.isFinite(parsedValue) && parsedValue > 0) {
				return true
			}
		}
	}

	return false
}

function detectInitiallyScoredContestants(contestants: EventContestant[], criteria: EventCriterion[], existingScores?: ScoreMatrix, existingSavedContestantIds?: string[]): Set<string> {
	if (Array.isArray(existingSavedContestantIds) && existingSavedContestantIds.length > 0) {
		const validContestantIds = new Set(contestants.map((contestant) => contestant.id))
		const filteredSavedIds = existingSavedContestantIds.filter((contestantId) => validContestantIds.has(contestantId))
		return new Set(filteredSavedIds)
	}

	if (!existingScores) {
		return new Set<string>()
	}

	const initialScored = contestants
		.filter((contestant) => {
			for (const criterion of criteria) {
				for (const subCriterion of criterion.subCriteria) {
					const rawScore = existingScores[contestant.id]?.[subCriterion.id]
					if (typeof rawScore === 'number' && rawScore > 0) {
						return true
					}
				}
			}

			return false
		})
		.map((contestant) => contestant.id)

	return new Set(initialScored)
}

function buildInputMatrix(contestants: EventContestant[], criteria: EventCriterion[], existingScores?: ScoreMatrix): InputScoreMatrix {
	const matrix: InputScoreMatrix = {}

	for (const contestant of contestants) {
		matrix[contestant.id] = {}

		for (const criterion of criteria) {
			for (const subCriterion of criterion.subCriteria) {
				const existingValue = existingScores?.[contestant.id]?.[subCriterion.id]
				matrix[contestant.id][subCriterion.id] = typeof existingValue === 'number' ? String(existingValue) : '0'
			}
		}
	}

	return matrix
}

function formatDate(iso: string): string {
	return new Intl.DateTimeFormat('en-US', {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(new Date(iso))
}

export function JudgeScoringForm({ token, eventTitle, contestants, criteria, judge, presentationSlots, existingScores, existingSavedContestantIds, submittedAt }: JudgeScoringFormProps) {
	const topRef = useRef<HTMLDivElement>(null)
	const [scores, setScores] = useState<InputScoreMatrix>(() => buildInputMatrix(contestants, criteria, existingScores))
	const [savedContestantIds, setSavedContestantIds] = useState<Set<string>>(() => detectInitiallyScoredContestants(contestants, criteria, existingScores, existingSavedContestantIds))
	const [activeContestantIndex, setActiveContestantIndex] = useState(0)
	const [isSaving, setIsSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [successMessage, setSuccessMessage] = useState<string | null>(null)
	const [lastSubmittedAt, setLastSubmittedAt] = useState<string | undefined>(submittedAt)
	const activeContestant = contestants[activeContestantIndex]
	const activeContestantId = activeContestant?.id ?? ''

	const maxPossibleScore = useMemo(() => round(criteria.reduce((sum, criterion) => sum + applicableSubCriteriaForContestant(criterion, activeContestant).reduce((subTotal, subCriterion) => subTotal + Number(subCriterion.maxScore), 0), 0)), [criteria, activeContestant])
	const totalSubCriterionCount = useMemo(() => criteria.reduce((sum, criterion) => sum + applicableSubCriteriaForContestant(criterion, activeContestant).length, 0), [criteria, activeContestant])
	const slotLabelsByContestant = useMemo(() => {
		const labels = new Map<string, string>()
		if (!presentationSlots) {
			return labels
		}

		for (const slot of presentationSlots) {
			labels.set(slot.contestantId, slot.label)
		}

		return labels
	}, [presentationSlots])

	const activeSlotLabel = activeContestantId ? slotLabelsByContestant.get(activeContestantId) : undefined
	const draftScoredContestantIds = useMemo(() => {
		const ids = contestants.filter((contestant) => hasPositiveDraftScore(scores, contestant.id, criteria)).map((contestant) => contestant.id)
		return new Set(ids)
	}, [contestants, criteria, scores])

	const activeContestantTotal = useMemo(() => {
		if (!activeContestantId) {
			return 0
		}

		return round(
			criteria.reduce((total, criterion) => {
				const criterionTotal = applicableSubCriteriaForContestant(criterion, activeContestant).reduce((subTotal, subCriterion) => {
					const rawValue = scores[activeContestantId]?.[subCriterion.id] ?? '0'
					return subTotal + parseAndClampScore(rawValue, subCriterion.maxScore)
				}, 0)

				return total + criterionTotal
			}, 0),
		)
	}, [activeContestant, activeContestantId, criteria, scores])

	const scoredFieldCount = useMemo(() => {
		if (!activeContestantId) {
			return 0
		}

		return criteria.reduce((sum, criterion) => {
			const countInCriterion = applicableSubCriteriaForContestant(criterion, activeContestant).reduce((count, subCriterion) => {
				const rawValue = scores[activeContestantId]?.[subCriterion.id] ?? '0'
				const parsedValue = Number.parseFloat(rawValue)
				return count + (Number.isFinite(parsedValue) && parsedValue > 0 ? 1 : 0)
			}, 0)

			return sum + countInCriterion
		}, 0)
	}, [activeContestant, activeContestantId, criteria, scores])

	function updateScore(contestantId: string, subCriterionId: string, value: string, maxScore: number): void {
		const normalizedValue = normalizeScoreInput(value, maxScore)

		setScores((previous) => ({
			...previous,
			[contestantId]: {
				...(previous[contestantId] ?? {}),
				[subCriterionId]: normalizedValue,
			},
		}))
	}

	function goToContestant(index: number): void {
		setActiveContestantIndex(Math.max(0, Math.min(index, contestants.length - 1)))
		setError(null)
		setSuccessMessage(null)
	}

	function scrollToTopAfterSubmit(): void {
		window.requestAnimationFrame(() => {
			topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
		})
	}

	async function submitScores(event: React.FormEvent<HTMLFormElement>): Promise<void> {
		event.preventDefault()
		if (!activeContestant) {
			setError('No contestant is selected.')
			return
		}

		const isResubmission = savedContestantIds.has(activeContestant.id)
		const confirmationMessage = isResubmission ? `Resubmit scores for ${activeContestant.name}? This will overwrite your previously saved scores for this entry.` : `Submit scores for ${activeContestant.name}?`

		if (!window.confirm(confirmationMessage)) {
			return
		}

		setIsSaving(true)
		setError(null)
		setSuccessMessage(null)

		const payload: ScoreMatrix = {}

		for (const contestant of contestants) {
			payload[contestant.id] = {}

			for (const criterion of criteria) {
				const applicableSubCriterionIds = new Set(applicableSubCriteriaForContestant(criterion, contestant).map((subCriterion) => subCriterion.id))

				for (const subCriterion of criterion.subCriteria) {
					if (!applicableSubCriterionIds.has(subCriterion.id)) {
						payload[contestant.id][subCriterion.id] = 0
						continue
					}

					const rawValue = scores[contestant.id]?.[subCriterion.id] ?? '0'
					payload[contestant.id][subCriterion.id] = round(parseAndClampScore(rawValue, subCriterion.maxScore))
				}
			}
		}

		try {
			const response = await fetch(`/api/judge/${token}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ scores: payload, contestantId: activeContestant.id }),
			})

			const responseBody = (await response.json()) as { error?: string; submittedAt?: string }

			if (!response.ok) {
				throw new Error(responseBody.error ?? 'Unable to submit scores.')
			}

			if (responseBody.submittedAt) {
				setLastSubmittedAt(responseBody.submittedAt)
			}

			setSavedContestantIds((previous) => {
				const next = new Set(previous)
				next.add(activeContestant.id)
				return next
			})

			const currentName = activeContestant.name
			const nextIndex = activeContestantIndex + 1

			if (nextIndex < contestants.length) {
				setActiveContestantIndex(nextIndex)
				setSuccessMessage(`Saved scores for ${currentName}. Continue with ${contestants[nextIndex].name}.`)
			} else {
				setSuccessMessage(`Saved scores for ${currentName}. You can still review entries and resubmit if needed.`)
			}

			scrollToTopAfterSubmit()
		} catch (submitError) {
			setError(submitError instanceof Error ? submitError.message : 'Unable to submit scores.')
		} finally {
			setIsSaving(false)
		}
	}

	if (contestants.length === 0) {
		return (
			<div className='mx-auto w-full max-w-7xl px-4 py-8 sm:px-8'>
				<div className='rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-800'>No contestants found for this event.</div>
			</div>
		)
	}

	return (
		<div ref={topRef} className='mx-auto w-full max-w-7xl px-4 py-8 sm:px-8'>
			<div className='rounded-3xl border border-cyan-200 bg-white/95 p-6 shadow-xl shadow-cyan-950/10 sm:p-8'>
				<div className='flex flex-col gap-2'>
					<p className='text-xs uppercase tracking-[0.18em] text-cyan-800/80'>Judge Session</p>
					<h1 className='text-3xl font-semibold tracking-tight text-cyan-950'>{eventTitle}</h1>
					<p className='text-sm text-cyan-900/80'>
						Judge: <span className='font-semibold'>{judge.name}</span>
					</p>
					<p className='text-sm text-cyan-900/80'>Max possible score: {maxPossibleScore.toFixed(2)}</p>
					{lastSubmittedAt ? <p className='text-xs text-emerald-700'>Last submitted: {formatDate(lastSubmittedAt)}</p> : null}
				</div>

				<div className='mt-6 rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4'>
					<p className='text-xs uppercase tracking-[0.16em] text-cyan-900'>Score One Entry At A Time</p>
					<p className='mt-1 text-xs text-cyan-900/80'>Entries marked as Scored already have saved scores.</p>
					<div className='mt-3 flex flex-wrap gap-2'>
						{contestants.map((contestant, index) => {
							const isActive = index === activeContestantIndex
							const isSaved = savedContestantIds.has(contestant.id)
							const hasDraft = draftScoredContestantIds.has(contestant.id)
							const slotLabel = slotLabelsByContestant.get(contestant.id)
							const isIndividual = contestant.entryType === 'individual'
							return (
								<button key={contestant.id} type='button' onClick={() => goToContestant(index)} className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${isActive ? 'border-cyan-800 bg-cyan-900 text-white' : 'border-cyan-300 bg-white text-cyan-900 hover:bg-cyan-100'}`}>
									<div className='flex flex-col items-start'>
										<span>
											{index + 1}. {contestant.name}
										</span>
										{isIndividual ? <span className={`text-[10px] ${isActive ? 'text-white/80' : 'text-sky-700'}`}>Individual</span> : null}
										{slotLabel ? <span className={`text-[10px] ${isActive ? 'text-white/80' : 'text-cyan-800/70'}`}>{slotLabel}</span> : null}
									</div>
									{isSaved ? (
										<span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${isActive ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'}`}>Scored</span>
									) : hasDraft ? (
										<span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${isActive ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'}`}>Draft</span>
									) : null}
								</button>
							)
						})}
					</div>
				</div>

				<form onSubmit={submitScores} className='mt-6 flex flex-col gap-4'>
					<section className='rounded-2xl border border-cyan-100 bg-white p-4 sm:p-5'>
						<div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
							<div>
								<div className='flex items-center gap-2'>
									<h2 className='text-xl font-semibold text-cyan-950'>Now Scoring: {activeContestant.name}</h2>
									{activeContestant.entryType === 'individual' ? <span className='rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800'>Individual</span> : null}
								</div>
								<p className='mt-1 text-sm text-cyan-900/90'>
									Entry {activeContestantIndex + 1} of {contestants.length}
								</p>
								{activeSlotLabel ? <p className='text-xs text-cyan-900/80'>Slot: {activeSlotLabel}</p> : null}
							</div>
							<div className='flex flex-wrap items-center gap-2'>
								<span className='rounded-full bg-cyan-100 px-3 py-1 text-xs font-medium text-cyan-900'>
									Current Total: {activeContestantTotal.toFixed(2)} / {maxPossibleScore.toFixed(2)}
								</span>
								<span className='rounded-full bg-white px-3 py-1 text-xs font-medium text-cyan-900 ring-1 ring-cyan-200'>
									Scored Fields: {scoredFieldCount} / {totalSubCriterionCount}
								</span>
							</div>
						</div>

						<div className='mt-4 space-y-4'>
							{criteria.map((criterion) => {
								const applicableSubCriteria = applicableSubCriteriaForContestant(criterion, activeContestant)
								const parentMaxScore = round(applicableSubCriteria.reduce((sum, subCriterion) => sum + Number(subCriterion.maxScore), 0))
								const parentCurrentTotal = round(
									applicableSubCriteria.reduce((sum, subCriterion) => {
										const rawValue = scores[activeContestantId]?.[subCriterion.id] ?? '0'
										return sum + parseAndClampScore(rawValue, subCriterion.maxScore)
									}, 0),
								)

								return (
									<article key={criterion.id} className='rounded-2xl border border-cyan-100 bg-cyan-50/40 p-4'>
										<div className='flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between'>
											<h3 className='text-base font-semibold text-cyan-950'>{criterion.name}</h3>
											<p className='text-xs text-cyan-900/90'>
												Parent Max: {parentMaxScore.toFixed(2)} | Current: {parentCurrentTotal.toFixed(2)}
											</p>
										</div>

										{isIndividualCriterion(criterion) ? (
											<div className='mt-3 space-y-4'>
												{groupSubCriteriaByMember(criterion.subCriteria, activeContestant).map((group) => {
													const groupMaxScore = round(group.items.reduce((sum, item) => sum + item.subCriterion.maxScore, 0))
													const groupCurrentTotal = round(
														group.items.reduce((sum, item) => {
															const rawValue = scores[activeContestantId]?.[item.subCriterion.id] ?? '0'
															return sum + parseAndClampScore(rawValue, item.subCriterion.maxScore)
														}, 0),
													)

													return (
														<div key={group.memberLabel} className='rounded-2xl border border-cyan-200 bg-white p-3'>
															<div className='flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between'>
																<h4 className='text-sm font-semibold text-cyan-950'>{group.memberDisplayLabel}</h4>
																<p className='text-xs text-cyan-900/90'>
																	Max: {groupMaxScore.toFixed(2)} | Current: {groupCurrentTotal.toFixed(2)}
																</p>
															</div>

															<div className='mt-3 grid gap-3 xl:grid-cols-2'>
																{group.items.map(({ subCriterion, displayName }) => (
																	<label key={subCriterion.id} className='rounded-xl border border-cyan-200 bg-white p-3 text-sm font-medium text-slate-900'>
																		<span className='block text-sm font-semibold text-cyan-950'>{displayName}</span>
																		<span className='mt-1 block text-xs text-cyan-900/90'>Sub Max: {subCriterion.maxScore.toFixed(2)}</span>
																		<input
																			value={scores[activeContestantId]?.[subCriterion.id] ?? '0'}
																			onChange={(inputEvent) => updateScore(activeContestantId, subCriterion.id, inputEvent.target.value, subCriterion.maxScore)}
																			type='number'
																			inputMode='decimal'
																			min={0}
																			max={subCriterion.maxScore}
																			step='0.01'
																			className='mt-2 w-full rounded-lg border border-cyan-300 bg-white px-3 py-2 text-base font-semibold text-slate-900 placeholder:text-slate-500 caret-slate-900 [color:#0f172a] [-webkit-text-fill-color:#0f172a] outline-none ring-cyan-600 transition focus:border-cyan-500 focus:ring-2'
																		/>
																		<span className='mt-1 block text-xs font-medium text-slate-700'>Entered Score: {scores[activeContestantId]?.[subCriterion.id] ?? '0'}</span>
																	</label>
																))}
															</div>
														</div>
													)
												})}
											</div>
										) : (
											<div className='mt-3 grid gap-3 xl:grid-cols-2'>
												{criterion.subCriteria.map((subCriterion) => (
													<label key={subCriterion.id} className='rounded-xl border border-cyan-200 bg-white p-3 text-sm font-medium text-slate-900'>
														<span className='block text-sm font-semibold text-cyan-950'>{subCriterion.name}</span>
														<span className='mt-1 block text-xs text-cyan-900/90'>Sub Max: {subCriterion.maxScore.toFixed(2)}</span>
														<input
															value={scores[activeContestantId]?.[subCriterion.id] ?? '0'}
															onChange={(inputEvent) => updateScore(activeContestantId, subCriterion.id, inputEvent.target.value, subCriterion.maxScore)}
															type='number'
															inputMode='decimal'
															min={0}
															max={subCriterion.maxScore}
															step='0.01'
															className='mt-2 w-full rounded-lg border border-cyan-300 bg-white px-3 py-2 text-base font-semibold text-slate-900 placeholder:text-slate-500 caret-slate-900 [color:#0f172a] [-webkit-text-fill-color:#0f172a] outline-none ring-cyan-600 transition focus:border-cyan-500 focus:ring-2'
														/>
														<span className='mt-1 block text-xs font-medium text-slate-700'>Entered Score: {scores[activeContestantId]?.[subCriterion.id] ?? '0'}</span>
													</label>
												))}
											</div>
										)}
									</article>
								)
							})}
						</div>
					</section>

					{error ? <p className='rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700'>{error}</p> : null}
					{successMessage ? <p className='rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700'>{successMessage}</p> : null}

					<div className='flex flex-wrap gap-3'>
						<button type='button' onClick={() => goToContestant(activeContestantIndex - 1)} disabled={activeContestantIndex === 0} className='rounded-full border border-cyan-300 bg-white px-5 py-2 text-sm font-medium text-cyan-900 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50'>
							Previous Entry
						</button>
						<button type='button' onClick={() => goToContestant(activeContestantIndex + 1)} disabled={activeContestantIndex >= contestants.length - 1} className='rounded-full border border-cyan-300 bg-white px-5 py-2 text-sm font-medium text-cyan-900 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50'>
							Next Entry
						</button>
						<button type='submit' disabled={isSaving} className='rounded-full bg-cyan-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-60'>
							{isSaving ? `Saving ${activeContestant.name}...` : `Save ${activeContestant.name} Scores`}
						</button>
					</div>

					<p className='text-xs text-cyan-900/90'>Tip: Save each contestant right after the presentation. You can revisit any entry and resubmit anytime.</p>
				</form>
			</div>
		</div>
	)
}

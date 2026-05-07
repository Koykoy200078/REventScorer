'use client'

import { useMemo, useState } from 'react'

import { PAPER_PRESENTATION_CONTESTANT_SAMPLES, PAPER_PRESENTATION_CRITERIA } from '@/lib/default-rubric'
import type { CreateEventResponse, CriterionInput } from '@/lib/types'

type JudgeDraft = {
	id: string
	name: string
	email: string
}

type SubCriterionDraft = {
	id: string
	name: string
	maxScore: string
}

type CriterionDraft = {
	id: string
	name: string
	subCriteria: SubCriterionDraft[]
}

function localId(): string {
	return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}`
}

function createJudge(): JudgeDraft {
	return { id: localId(), name: '', email: '' }
}

function createSubCriterion(): SubCriterionDraft {
	return { id: localId(), name: '', maxScore: '10' }
}

function createCriterion(): CriterionDraft {
	return {
		id: localId(),
		name: '',
		subCriteria: [createSubCriterion()],
	}
}

function toCriterionDraft(criteria: CriterionInput[]): CriterionDraft[] {
	return criteria.map((criterion) => ({
		id: localId(),
		name: criterion.name,
		subCriteria: criterion.subCriteria.map((subCriterion) => ({
			id: localId(),
			name: subCriterion.name,
			maxScore: String(subCriterion.maxScore),
		})),
	}))
}

function toNumber(value: string): number {
	const numeric = Number.parseFloat(value)
	return Number.isFinite(numeric) ? numeric : 0
}

function criterionMaxScore(criterion: CriterionDraft): number {
	return criterion.subCriteria.reduce((sum, subCriterion) => sum + toNumber(subCriterion.maxScore), 0)
}

function dateDisplay(iso: string): string {
	return new Intl.DateTimeFormat('en-US', {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(new Date(iso))
}

export function CreateScorerForm() {
	const [title, setTitle] = useState('')
	const [description, setDescription] = useState('')
	const [createdBy, setCreatedBy] = useState('')
	const [contestants, setContestants] = useState<string[]>(['', ''])
	const [judges, setJudges] = useState<JudgeDraft[]>([createJudge()])
	const [criteria, setCriteria] = useState<CriterionDraft[]>([createCriterion()])
	const [isSaving, setIsSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [created, setCreated] = useState<CreateEventResponse | null>(null)
	const [copiedValue, setCopiedValue] = useState<string | null>(null)

	const totalEventMaxScore = useMemo(() => {
		return criteria.reduce((sum, criterion) => sum + criterionMaxScore(criterion), 0)
	}, [criteria])

	function loadPaperTemplate(): void {
		setTitle('Paper Presentation')
		setDescription('Dynamic scoring rubric based on paper presentation criteria.')
		setContestants([...PAPER_PRESENTATION_CONTESTANT_SAMPLES])
		setCriteria(toCriterionDraft(PAPER_PRESENTATION_CRITERIA))
		setError(null)
	}

	function updateContestant(index: number, value: string): void {
		setContestants((previous) => previous.map((contestant, contestantIndex) => (contestantIndex === index ? value : contestant)))
	}

	function addContestant(): void {
		setContestants((previous) => [...previous, ''])
	}

	function removeContestant(index: number): void {
		setContestants((previous) => previous.filter((_, contestantIndex) => contestantIndex !== index))
	}

	function updateJudge(judgeId: string, value: Partial<Pick<JudgeDraft, 'name' | 'email'>>): void {
		setJudges((previous) => previous.map((judge) => (judge.id === judgeId ? { ...judge, ...value } : judge)))
	}

	function addJudge(): void {
		setJudges((previous) => [...previous, createJudge()])
	}

	function removeJudge(judgeId: string): void {
		setJudges((previous) => previous.filter((judge) => judge.id !== judgeId))
	}

	function updateCriterion(criterionId: string, value: Partial<Pick<CriterionDraft, 'name'>>): void {
		setCriteria((previous) => previous.map((criterion) => (criterion.id === criterionId ? { ...criterion, ...value } : criterion)))
	}

	function addCriterion(): void {
		setCriteria((previous) => [...previous, createCriterion()])
	}

	function removeCriterion(criterionId: string): void {
		setCriteria((previous) => previous.filter((criterion) => criterion.id !== criterionId))
	}

	function addSubCriterion(criterionId: string): void {
		setCriteria((previous) =>
			previous.map((criterion) => {
				if (criterion.id !== criterionId) {
					return criterion
				}

				return {
					...criterion,
					subCriteria: [...criterion.subCriteria, createSubCriterion()],
				}
			}),
		)
	}

	function removeSubCriterion(criterionId: string, subCriterionId: string): void {
		setCriteria((previous) =>
			previous.map((criterion) => {
				if (criterion.id !== criterionId) {
					return criterion
				}

				return {
					...criterion,
					subCriteria: criterion.subCriteria.filter((sub) => sub.id !== subCriterionId),
				}
			}),
		)
	}

	function updateSubCriterion(criterionId: string, subCriterionId: string, value: Partial<Pick<SubCriterionDraft, 'name' | 'maxScore'>>): void {
		setCriteria((previous) =>
			previous.map((criterion) => {
				if (criterion.id !== criterionId) {
					return criterion
				}

				return {
					...criterion,
					subCriteria: criterion.subCriteria.map((subCriterion) => (subCriterion.id === subCriterionId ? { ...subCriterion, ...value } : subCriterion)),
				}
			}),
		)
	}

	async function copyLink(value: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(value)
			setCopiedValue(value)
			window.setTimeout(() => {
				setCopiedValue((currentValue) => (currentValue === value ? null : currentValue))
			}, 1800)
		} catch {
			setCopiedValue(null)
		}
	}

	async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
		event.preventDefault()
		setError(null)
		setCreated(null)
		setIsSaving(true)

		const payload = {
			title,
			description,
			createdBy,
			contestants,
			judges: judges.map((judge) => ({
				name: judge.name,
				email: judge.email,
			})),
			criteria: criteria.map((criterion) => ({
				name: criterion.name,
				subCriteria: criterion.subCriteria.map((subCriterion) => ({
					name: subCriterion.name,
					maxScore: toNumber(subCriterion.maxScore),
				})),
			})),
		}

		try {
			const response = await fetch('/api/events', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			})

			const responseData = (await response.json()) as CreateEventResponse & { error?: string }

			if (!response.ok) {
				throw new Error(responseData.error ?? 'Unable to create scorer event.')
			}

			setCreated(responseData)
		} catch (submitError) {
			setError(submitError instanceof Error ? submitError.message : 'Unable to create scorer event.')
		} finally {
			setIsSaving(false)
		}
	}

	return (
		<div className='mx-auto w-full max-w-6xl px-4 py-8 sm:px-8'>
			<div className='rounded-3xl border border-emerald-200 bg-white/90 p-6 shadow-xl shadow-emerald-900/10 backdrop-blur sm:p-8'>
				<div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
					<div>
						<h1 className='text-3xl font-semibold tracking-tight text-emerald-950'>Create Scorer Event</h1>
						<p className='mt-2 max-w-3xl text-sm text-emerald-800/80'>Build a fully dynamic rubric with parent criteria, subcriteria, judges, and contestant entries.</p>
					</div>
					<button type='button' onClick={loadPaperTemplate} className='rounded-full border border-emerald-700/30 bg-emerald-50 px-5 py-2 text-sm font-medium text-emerald-900 transition hover:bg-emerald-100'>
						Use Paper Presentation Template
					</button>
				</div>

				<form onSubmit={onSubmit} className='mt-8 space-y-8'>
					<section className='grid gap-4 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 sm:grid-cols-2 sm:p-5'>
						<label className='text-sm font-medium text-emerald-950'>
							Event Title
							<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder='Example: Science Fair Finals' className='mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 placeholder:text-emerald-700/70 outline-none ring-emerald-500 transition focus:ring-2' />
						</label>
						<label className='text-sm font-medium text-emerald-950'>
							Created By (Admin)
							<input value={createdBy} onChange={(event) => setCreatedBy(event.target.value)} placeholder='Example: Event Committee' className='mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 placeholder:text-emerald-700/70 outline-none ring-emerald-500 transition focus:ring-2' />
						</label>
						<label className='text-sm font-medium text-emerald-950 sm:col-span-2'>
							Description
							<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder='Optional context for judges' className='mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 placeholder:text-emerald-700/70 outline-none ring-emerald-500 transition focus:ring-2' />
						</label>
					</section>

					<section className='rounded-2xl border border-emerald-100 bg-white p-4 sm:p-5'>
						<div className='mb-4 flex items-center justify-between'>
							<h2 className='text-lg font-semibold text-emerald-950'>Contestants / Entries</h2>
							<button type='button' onClick={addContestant} className='rounded-full border border-emerald-700/30 px-4 py-1.5 text-sm text-emerald-900 transition hover:bg-emerald-50'>
								Add Entry
							</button>
						</div>
						<div className='space-y-3'>
							{contestants.map((contestant, index) => (
								<div key={`contestant-${index}`} className='flex gap-2'>
									<input value={contestant} onChange={(event) => updateContestant(index, event.target.value)} placeholder={`Entry ${index + 1}`} className='w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 placeholder:text-emerald-700/70 outline-none ring-emerald-500 transition focus:ring-2' />
									{contestants.length > 1 ? (
										<button type='button' onClick={() => removeContestant(index)} className='rounded-xl border border-rose-300 px-3 py-2 text-sm text-rose-700 transition hover:bg-rose-50'>
											Remove
										</button>
									) : null}
								</div>
							))}
						</div>
					</section>

					<section className='rounded-2xl border border-emerald-100 bg-white p-4 sm:p-5'>
						<div className='mb-4 flex items-center justify-between'>
							<h2 className='text-lg font-semibold text-emerald-950'>Judges</h2>
							<button type='button' onClick={addJudge} className='rounded-full border border-emerald-700/30 px-4 py-1.5 text-sm text-emerald-900 transition hover:bg-emerald-50'>
								Add Judge
							</button>
						</div>
						<div className='space-y-3'>
							{judges.map((judge, index) => (
								<div key={judge.id} className='grid gap-2 sm:grid-cols-[1fr_1fr_auto]'>
									<input value={judge.name} onChange={(event) => updateJudge(judge.id, { name: event.target.value })} placeholder={`Judge ${index + 1} name`} className='rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 placeholder:text-emerald-700/70 outline-none ring-emerald-500 transition focus:ring-2' />
									<input value={judge.email} onChange={(event) => updateJudge(judge.id, { email: event.target.value })} placeholder='Email (optional)' className='rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 placeholder:text-emerald-700/70 outline-none ring-emerald-500 transition focus:ring-2' />
									{judges.length > 1 ? (
										<button type='button' onClick={() => removeJudge(judge.id)} className='rounded-xl border border-rose-300 px-3 py-2 text-sm text-rose-700 transition hover:bg-rose-50 sm:self-center'>
											Remove
										</button>
									) : null}
								</div>
							))}
						</div>
					</section>

					<section className='rounded-2xl border border-emerald-100 bg-white p-4 sm:p-5'>
						<div className='mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
							<h2 className='text-lg font-semibold text-emerald-950'>Rubric Criteria</h2>
							<div className='flex items-center gap-3'>
								<span className='rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-900'>Event Max Score: {totalEventMaxScore.toFixed(2)}</span>
								<button type='button' onClick={addCriterion} className='rounded-full border border-emerald-700/30 px-4 py-1.5 text-sm text-emerald-900 transition hover:bg-emerald-50'>
									Add Parent Criterion
								</button>
							</div>
						</div>

						<div className='space-y-5'>
							{criteria.map((criterion, criterionIndex) => {
								const parentMaxScore = criterionMaxScore(criterion)

								return (
									<div key={criterion.id} className='rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4'>
										<div className='mb-3 grid gap-2 sm:grid-cols-[1fr_180px_auto]'>
											<input
												value={criterion.name}
												onChange={(event) =>
													updateCriterion(criterion.id, {
														name: event.target.value,
													})
												}
												placeholder={`Parent criterion ${criterionIndex + 1}`}
												className='rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 placeholder:text-emerald-700/70 outline-none ring-emerald-500 transition focus:ring-2'
											/>
											<div className='flex items-center rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-900'>Parent Max: {parentMaxScore.toFixed(2)}</div>
											{criteria.length > 1 ? (
												<button type='button' onClick={() => removeCriterion(criterion.id)} className='rounded-xl border border-rose-300 px-3 py-2 text-sm text-rose-700 transition hover:bg-rose-50'>
													Remove Parent
												</button>
											) : null}
										</div>

										<div className='mb-3 flex items-center justify-between'>
											<span className='text-xs text-emerald-900/80'>Subcriteria total max score: {parentMaxScore.toFixed(2)}</span>
											<button type='button' onClick={() => addSubCriterion(criterion.id)} className='rounded-full border border-emerald-700/30 px-3 py-1 text-xs text-emerald-900 transition hover:bg-emerald-100'>
												Add Subcriterion
											</button>
										</div>

										<div className='space-y-2'>
											{criterion.subCriteria.map((subCriterion, subCriterionIndex) => (
												<div key={subCriterion.id} className='grid gap-2 rounded-xl border border-emerald-100 bg-white p-3 sm:grid-cols-[1fr_160px_auto]'>
													<input
														value={subCriterion.name}
														onChange={(event) =>
															updateSubCriterion(criterion.id, subCriterion.id, {
																name: event.target.value,
															})
														}
														placeholder={`Subcriterion ${subCriterionIndex + 1}`}
														className='rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 placeholder:text-emerald-700/70 outline-none ring-emerald-500 transition focus:ring-2'
													/>
													<input
														value={subCriterion.maxScore}
														onChange={(event) =>
															updateSubCriterion(criterion.id, subCriterion.id, {
																maxScore: event.target.value,
															})
														}
														type='number'
														min={0}
														step='0.01'
														placeholder='Subcriterion max score'
														className='rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 placeholder:text-emerald-700/70 outline-none ring-emerald-500 transition focus:ring-2'
													/>
													{criterion.subCriteria.length > 1 ? (
														<button type='button' onClick={() => removeSubCriterion(criterion.id, subCriterion.id)} className='rounded-xl border border-rose-300 px-3 py-2 text-sm text-rose-700 transition hover:bg-rose-50'>
															Remove
														</button>
													) : null}
												</div>
											))}
										</div>
									</div>
								)
							})}
						</div>
					</section>

					{error ? <div className='rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700'>{error}</div> : null}

					<button type='submit' disabled={isSaving} className='rounded-full bg-emerald-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60'>
						{isSaving ? 'Creating Scorer...' : 'Create Scorer and Generate Judge Links'}
					</button>
				</form>

				{created ? (
					<section className='mt-8 rounded-2xl border border-cyan-200 bg-cyan-50/70 p-4 sm:p-5'>
						<h2 className='text-lg font-semibold text-cyan-950'>Scorer Created Successfully</h2>
						<p className='mt-1 text-sm text-cyan-900/80'>Share each judge link privately.</p>

						<div className='mt-4 rounded-xl border border-cyan-200 bg-white p-3'>
							<p className='text-xs uppercase tracking-wide text-cyan-800/80'>Admin Results Page</p>
							<a href={created.adminUrl} className='mt-1 block text-sm font-medium text-cyan-900 underline'>
								{created.adminUrl}
							</a>
						</div>

						<div className='mt-4 space-y-3'>
							{created.judgeLinks.map((link) => (
								<div key={link.judgeId} className='rounded-xl border border-cyan-200 bg-white p-3'>
									<div className='mb-2 flex items-center justify-between gap-2'>
										<p className='text-sm font-semibold text-cyan-950'>{link.judgeName}</p>
										<button type='button' onClick={() => copyLink(link.url)} className='rounded-full border border-cyan-300 px-3 py-1 text-xs text-cyan-900 transition hover:bg-cyan-100'>
											{copiedValue === link.url ? 'Copied' : 'Copy Link'}
										</button>
									</div>
									<a href={link.url} className='block break-all text-sm text-cyan-900 underline'>
										{link.url}
									</a>
								</div>
							))}
						</div>

						<p className='mt-3 text-xs text-cyan-900/80'>Generated at {dateDisplay(new Date().toISOString())}</p>
					</section>
				) : null}
			</div>
		</div>
	)
}

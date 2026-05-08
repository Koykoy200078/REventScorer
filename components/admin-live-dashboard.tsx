'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { AdminScoreRealtimeUpdate, EventCompiledResults, EventCriterion, EventScorer } from '@/lib/types'

type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
type ProgramLabel = 'BSINT' | 'BSCS'

interface ProgramTopTeam {
	program: ProgramLabel
	teamName: string
	contestantName: string
	rank: number
	averageScore: number
	totalScore: number
	judgeCount: number
}

interface AdminLiveDashboardProps {
	initialEvent: EventScorer
	initialCompiled: EventCompiledResults
	baseUrl: string
}

interface AdminEventResponse {
	event: EventScorer
	compiled: EventCompiledResults
	error?: string
}

function formatDate(iso: string): string {
	return new Intl.DateTimeFormat('en-US', {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(new Date(iso))
}

function formatScore(value: number): string {
	return value.toFixed(2)
}

function criterionMaxScore(criterion: EventCriterion): number {
	const directMaxScore = Number(criterion.maxScore)

	if (Number.isFinite(directMaxScore) && directMaxScore > 0) {
		return directMaxScore
	}

	return criterion.subCriteria.reduce((sum, subCriterion) => {
		const subCriterionMaxScore = Number(subCriterion.maxScore)
		return sum + (Number.isFinite(subCriterionMaxScore) ? subCriterionMaxScore : 0)
	}, 0)
}

function connectionLabel(state: ConnectionState): string {
	if (state === 'connected') {
		return 'Live connected'
	}

	if (state === 'reconnecting') {
		return 'Reconnecting'
	}

	if (state === 'connecting') {
		return 'Connecting'
	}

	return 'Live offline'
}

function connectionBadgeClass(state: ConnectionState): string {
	if (state === 'connected') {
		return 'rounded-full border border-emerald-300 bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow-sm'
	}

	return 'rounded-full border border-rose-300 bg-rose-600 px-3 py-1 text-xs font-semibold text-white shadow-sm'
}

function detectProgramLabel(contestantName: string): ProgramLabel | null {
	const uppercaseName = contestantName.toUpperCase()

	if (/\bBSINT\b/.test(uppercaseName)) {
		return 'BSINT'
	}

	if (/\bBSCS\b/.test(uppercaseName)) {
		return 'BSCS'
	}

	return null
}

function extractDynamicTeamName(contestantName: string): string {
	const cleanedName = contestantName
		.replace(/\bBSINT\b|\bBSCS\b/gi, ' ')
		.replace(/[|_]+/g, ' ')
		.replace(/\s{2,}/g, ' ')
		.replace(/^[\s\-:|/\\]+|[\s\-:|/\\]+$/g, '')
		.trim()

	return cleanedName.length > 0 ? cleanedName : contestantName
}

function topTeamsByProgram(rankings: EventCompiledResults['rankings']): Record<ProgramLabel, ProgramTopTeam | null> {
	const topByProgram: Record<ProgramLabel, ProgramTopTeam | null> = {
		BSINT: null,
		BSCS: null,
	}

	for (const result of rankings) {
		const detectedProgram = detectProgramLabel(result.contestantName)
		if (!detectedProgram) {
			continue
		}

		const candidate: ProgramTopTeam = {
			program: detectedProgram,
			teamName: extractDynamicTeamName(result.contestantName),
			contestantName: result.contestantName,
			rank: result.rank,
			averageScore: result.averageScore,
			totalScore: result.totalScore,
			judgeCount: result.judgeCount,
		}

		const existing = topByProgram[detectedProgram]

		if (!existing) {
			topByProgram[detectedProgram] = candidate
			continue
		}

		if (candidate.rank < existing.rank) {
			topByProgram[detectedProgram] = candidate
			continue
		}

		if (candidate.rank === existing.rank && candidate.averageScore > existing.averageScore) {
			topByProgram[detectedProgram] = candidate
		}
	}

	return topByProgram
}

export function AdminLiveDashboard({ initialEvent, initialCompiled, baseUrl }: AdminLiveDashboardProps) {
	const [event, setEvent] = useState(initialEvent)
	const [compiled, setCompiled] = useState(initialCompiled)
	const [connectionState, setConnectionState] = useState<ConnectionState>('connecting')
	const [lastSignalAt, setLastSignalAt] = useState<string | null>(null)
	const [refreshError, setRefreshError] = useState<string | null>(null)
	const [isRefreshing, setIsRefreshing] = useState(false)
	const [copiedLink, setCopiedLink] = useState<string | null>(null)
	const refreshInFlight = useRef(false)

	const winners = useMemo(() => compiled.rankings.slice(0, 3), [compiled.rankings])
	const analyticsByProgram = useMemo(() => topTeamsByProgram(compiled.rankings), [compiled.rankings])

	const copyLink = useCallback(async (value: string) => {
		try {
			if (navigator.clipboard && window.isSecureContext) {
				await navigator.clipboard.writeText(value)
			} else {
				const textArea = document.createElement('textarea')
				textArea.value = value
				textArea.style.position = 'fixed'
				textArea.style.left = '-999999px'
				textArea.style.top = '-999999px'
				document.body.appendChild(textArea)
				textArea.focus()
				textArea.select()
				const success = document.execCommand('copy')
				textArea.remove()
				if (!success) throw new Error('Copy command failed')
			}
			setCopiedLink(value)
			window.setTimeout(() => {
				setCopiedLink((currentValue) => (currentValue === value ? null : currentValue))
			}, 1800)
		} catch (err) {
			console.error('Clipboard copy failed:', err)
			setCopiedLink(null)
		}
	}, [])

	const refreshDashboard = useCallback(async () => {
		if (refreshInFlight.current) {
			return
		}

		refreshInFlight.current = true
		setIsRefreshing(true)
		setRefreshError(null)

		try {
			const response = await fetch(`/api/admin/events/${event.id}`, {
				cache: 'no-store',
			})

			const responseBody = (await response.json()) as AdminEventResponse

			if (!response.ok) {
				throw new Error(responseBody.error ?? 'Unable to refresh results.')
			}

			setEvent(responseBody.event)
			setCompiled(responseBody.compiled)
		} catch (error) {
			setRefreshError(error instanceof Error ? error.message : 'Unable to refresh results.')
		} finally {
			refreshInFlight.current = false
			setIsRefreshing(false)
		}
	}, [event.id])

	useEffect(() => {
		const eventId = event.id
		let socket: WebSocket | null = null
		let reconnectTimer: number | null = null
		let isDisposed = false

		const parsePort = (value: string | undefined, fallback: number) => {
			const parsed = Number.parseInt(value || '', 10)
			return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
		}

		const backendPort = parsePort(process.env.NEXT_PUBLIC_BACKEND_PORT, 3007)
		const backendHttpPort = parsePort(process.env.NEXT_PUBLIC_BACKEND_HTTP_PORT, backendPort)

		function buildSocketCandidates(): string[] {
			const host = window.location.hostname
			const isSecurePage = window.location.protocol === 'https:'
			const query = `?eventId=${encodeURIComponent(eventId)}`
			const path = `/ws/admin-scores${query}`

			const candidates: string[] = []
			const pushUnique = (url: string) => {
				if (!candidates.includes(url)) candidates.push(url)
			}

			if (isSecurePage) {
				pushUnique(`wss://${host}:${backendPort}${path}`)
				return candidates
			}

			const portCandidates = Array.from(new Set([backendHttpPort, backendPort]))

			// On HTTP pages, prefer the backend's plain HTTP listener first.
			for (const port of portCandidates) {
				pushUnique(`ws://${host}:${port}${path}`)
			}

			return candidates
		}

		function connectSocket() {
			if (isDisposed) {
				return
			}

			setConnectionState((current) => (current === 'connected' ? 'reconnecting' : 'connecting'))
			const candidates = buildSocketCandidates()

			const openCandidate = (index: number) => {
				if (isDisposed) {
					return
				}

				if (index >= candidates.length) {
					setConnectionState('reconnecting')
					reconnectTimer = window.setTimeout(connectSocket, 1700)
					return
				}

				const socketUrl = candidates[index]
				let opened = false
				let advanced = false

				const advance = () => {
					if (advanced || isDisposed) {
						return
					}
					advanced = true
					openCandidate(index + 1)
				}

				try {
					const currentSocket = new WebSocket(socketUrl)
					socket = currentSocket

					currentSocket.onopen = () => {
						if (isDisposed) {
							return
						}

						opened = true
						setConnectionState('connected')
					}

					currentSocket.onmessage = async (messageEvent) => {
						try {
							const decoded = JSON.parse(String(messageEvent.data)) as {
								type?: string
								data?: AdminScoreRealtimeUpdate
							}

							if (decoded.type !== 'score:update' || !decoded.data) {
								return
							}

							setLastSignalAt(decoded.data.submittedAt ?? new Date().toISOString())
							await refreshDashboard()
						} catch {
							// Ignore malformed websocket frames and keep session alive.
						}
					}

					currentSocket.onerror = () => {
						if (!opened) {
							try {
								currentSocket.close()
							} catch {
								// ignore close failures
							}
							advance()
							return
						}

						currentSocket.close()
					}

					currentSocket.onclose = () => {
						if (isDisposed) {
							return
						}

						if (!opened) {
							advance()
							return
						}

						setConnectionState('reconnecting')
						reconnectTimer = window.setTimeout(connectSocket, 1700)
					}
				} catch {
					advance()
				}
			}

			openCandidate(0)
		}

		connectSocket()

		return () => {
			isDisposed = true
			setConnectionState('disconnected')

			if (reconnectTimer !== null) {
				window.clearTimeout(reconnectTimer)
			}

			if (socket) {
				if (socket.readyState === WebSocket.CONNECTING) {
					socket.onopen = () => {
						if (socket) {
							socket.close()
						}
					}
				} else {
					socket.close()
				}
			}
		}
	}, [event.id, refreshDashboard])

	return (
		<>
			{/* SCREEN VIEW */}
			<div className='min-h-screen bg-transparent px-4 py-8 sm:px-8 print:hidden'>
				<div className='mx-auto w-full max-w-7xl space-y-6'>
					<header className='rounded-[30px] border border-[var(--border-soft)] bg-[var(--surface-strong)] p-6 shadow-[var(--shadow-soft)] backdrop-blur-xl sm:p-8'>
						<div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
							<div>
								<p className='text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]'>Admin Console</p>
								<h1 className='mt-2 text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl'>{event.title}</h1>
								{event.description ? <p className='mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]'>{event.description}</p> : null}
								<p className='mt-3 text-xs text-[var(--text-muted)]'>
									Created {formatDate(event.createdAt)}
									{event.createdBy ? ` by ${event.createdBy}` : ''}
								</p>
							</div>

							<div className='flex flex-wrap items-center gap-2 print:hidden'>
								<span className={connectionBadgeClass(connectionState)}>{connectionLabel(connectionState)}</span>
								{lastSignalAt ? <span className='rounded-full border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-1 text-xs text-[var(--text-secondary)]'>Last update {formatDate(lastSignalAt)}</span> : null}
								<button type='button' onClick={() => window.print()} className='rounded-full border border-[var(--border-strong)] bg-[var(--surface-muted)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface)]'>
									Print Results
								</button>
								{/* <button type='button' onClick={refreshDashboard} disabled={isRefreshing} className='rounded-full border border-[var(--border-strong)] bg-[var(--surface-muted)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-70'>
									{isRefreshing ? 'Refreshing...' : 'Refresh now'}
								</button> */}
								<Link href='/' className='inline-flex items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-muted)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface)]'>
									Back to Dashboard
								</Link>
							</div>
						</div>

						<div className='mt-5 grid gap-3 sm:grid-cols-4'>
							<div className='rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] p-3'>
								<p className='text-xs text-[var(--text-muted)]'>Contestants</p>
								<p className='text-xl font-semibold text-[var(--text-primary)]'>{event.contestants.length}</p>
							</div>
							<div className='rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] p-3'>
								<p className='text-xs text-[var(--text-muted)]'>Judges</p>
								<p className='text-xl font-semibold text-[var(--text-primary)]'>{event.judges.length}</p>
							</div>
							<div className='rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] p-3'>
								<p className='text-xs text-[var(--text-muted)]'>Submitted</p>
								<p className='text-xl font-semibold text-[var(--text-primary)]'>{compiled.submittedJudgeCount}</p>
							</div>
							<div className='rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] p-3'>
								<p className='text-xs text-[var(--text-muted)]'>Score Scale</p>
								<p className='text-xl font-semibold text-[var(--text-primary)]'>{formatScore(compiled.maxPossibleScore)}</p>
							</div>
						</div>
					</header>

					{refreshError ? <section className='rounded-2xl border border-rose-400/40 bg-rose-300/15 px-4 py-3 text-sm text-rose-100 dark:text-rose-200'>{refreshError}</section> : null}

					<section className='rounded-[28px] border border-[var(--border-soft)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)] sm:p-8'>
						<h2 className='text-xl font-semibold text-[var(--text-primary)]'>Winners</h2>
						<p className='mt-1 text-sm text-[var(--text-secondary)]'>Based on average score across submitted judges.</p>

						{winners.length > 0 ? (
							<div className='mt-4 grid gap-3 sm:grid-cols-3'>
								{winners.map((winner) => (
									<article key={winner.contestantId} className='rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] p-4'>
										<p className='text-xs uppercase tracking-wide text-[var(--text-muted)]'>Rank #{winner.rank}</p>
										<p className='mt-1 text-lg font-semibold text-[var(--text-primary)]'>{winner.contestantName}</p>
										<p className='mt-2 text-sm text-[var(--text-secondary)]'>
											Average: <span className='font-semibold'>{formatScore(winner.averageScore)}</span>
										</p>
										<p className='text-xs text-[var(--text-muted)]'>Judges counted: {winner.judgeCount}</p>
									</article>
								))}
							</div>
						) : (
							<p className='mt-3 text-sm text-[var(--text-secondary)]'>No contestant data available.</p>
						)}
					</section>

					<section className='rounded-[28px] border border-[var(--border-soft)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)] sm:p-8'>
						<h2 className='text-xl font-semibold text-[var(--text-primary)]'>Program Analytics</h2>
						<p className='mt-1 text-sm text-[var(--text-secondary)]'>Top teams from Compiled Scores for BSINT and BSCS.</p>

						<div className='mt-4 grid gap-3 sm:grid-cols-2'>
							{(['BSINT', 'BSCS'] as ProgramLabel[]).map((program) => {
								const topTeam = analyticsByProgram[program]

								return (
									<article key={program} className='rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] p-4'>
										<p className='text-xs uppercase tracking-wide text-[var(--text-muted)]'>{program}</p>
										{topTeam ? (
											<>
												<p className='mt-1 text-lg font-semibold text-[var(--text-primary)]'>{topTeam.teamName}</p>
												<p className='text-xs text-[var(--text-muted)]'>Source: {topTeam.contestantName}</p>
												<p className='mt-2 text-sm text-[var(--text-secondary)]'>
													Rank: <span className='font-semibold'>#{topTeam.rank}</span>
												</p>
												<p className='text-sm text-[var(--text-secondary)]'>
													Average: <span className='font-semibold'>{formatScore(topTeam.averageScore)}</span>
												</p>
												<p className='text-xs text-[var(--text-muted)]'>
													Total: {formatScore(topTeam.totalScore)} | Judges Counted: {topTeam.judgeCount}
												</p>
											</>
										) : (
											<p className='mt-2 text-sm text-[var(--text-secondary)]'>No {program} team found in Compiled Scores.</p>
										)}
									</article>
								)
							})}
						</div>
					</section>

					<section className='rounded-[28px] border border-[var(--border-soft)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)] sm:p-8'>
						<h2 className='text-xl font-semibold text-[var(--text-primary)]'>Compiled Scores</h2>
						<div className='mt-4 overflow-x-auto rounded-2xl border border-[var(--border-soft)]'>
							<table className='min-w-full border-collapse text-sm'>
								<thead>
									<tr className='bg-[var(--surface-muted)] text-left text-[var(--text-primary)]'>
										<th className='border-b border-[var(--border-soft)] px-3 py-3 font-semibold'>Rank</th>
										<th className='border-b border-[var(--border-soft)] px-3 py-3 font-semibold'>Contestant</th>
										<th className='border-b border-[var(--border-soft)] px-3 py-3 font-semibold'>Average Score</th>
										<th className='border-b border-[var(--border-soft)] px-3 py-3 font-semibold'>Total Score</th>
										<th className='border-b border-[var(--border-soft)] px-3 py-3 font-semibold'>Judges Counted</th>
									</tr>
								</thead>
								<tbody>
									{compiled.rankings.map((result, index) => (
										<tr key={result.contestantId} className={index % 2 === 0 ? 'bg-[var(--surface)]' : 'bg-[var(--surface-muted)]'}>
											<td className='border-b border-[var(--border-soft)] px-3 py-3 font-medium'>#{result.rank}</td>
											<td className='border-b border-[var(--border-soft)] px-3 py-3'>{result.contestantName}</td>
											<td className='border-b border-[var(--border-soft)] px-3 py-3'>{formatScore(result.averageScore)}</td>
											<td className='border-b border-[var(--border-soft)] px-3 py-3'>{formatScore(result.totalScore)}</td>
											<td className='border-b border-[var(--border-soft)] px-3 py-3'>{result.judgeCount}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</section>

					<section className='print:hidden rounded-[28px] border border-[var(--border-soft)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)] sm:p-8'>
						<h2 className='text-xl font-semibold text-[var(--text-primary)]'>Judge Links and Submission Status</h2>
						<div className='mt-4 space-y-3'>
							{event.judges.map((judge) => {
								const judgeResult = compiled.judgeBreakdown.find((item) => item.judgeId === judge.id)
								const judgePath = `/judge/${judge.token}`
								const fullJudgeUrl = baseUrl ? `${baseUrl}${judgePath}` : judgePath
								const copyValue = baseUrl || typeof window === 'undefined' ? fullJudgeUrl : `${window.location.origin}${judgePath}`

								return (
									<article key={judge.id} className='rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] p-4'>
										<div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
											<div>
												<p className='text-sm font-semibold text-[var(--text-primary)]'>{judge.name}</p>
												<a href={fullJudgeUrl} className='block break-all text-sm text-[var(--text-secondary)] underline'>
													{fullJudgeUrl}
												</a>
											</div>
											<div className='flex flex-wrap items-center gap-2'>
												<button type='button' onClick={() => copyLink(copyValue)} className='rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface-muted)]'>
													{copiedLink === copyValue ? 'Copied' : 'Copy Link'}
												</button>
												<div className='text-sm text-[var(--text-secondary)]'>{judgeResult?.submitted ? <span>Submitted {judgeResult.submittedAt ? formatDate(judgeResult.submittedAt) : ''}</span> : <span>Not submitted yet</span>}</div>
											</div>
										</div>
									</article>
								)
							})}
						</div>
					</section>

					<section className='print:hidden rounded-[28px] border border-[var(--border-soft)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)] sm:p-8'>
						<h2 className='text-xl font-semibold text-[var(--text-primary)]'>Rubric Breakdown</h2>
						<div className='mt-4 grid gap-4'>
							{event.criteria.map((criterion) => (
								<article key={criterion.id} className='rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] p-4'>
									<p className='text-sm font-semibold text-[var(--text-primary)]'>
										{criterion.name} (Max: {formatScore(criterionMaxScore(criterion))})
									</p>
									<div className='mt-2 space-y-2'>
										{criterion.subCriteria.map((subCriterion) => (
											<div key={subCriterion.id} className='grid gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm sm:grid-cols-2'>
												<span className='text-[var(--text-primary)]'>{subCriterion.name}</span>
												<span className='text-[var(--text-secondary)]'>Max Score: {formatScore(subCriterion.maxScore)}</span>
											</div>
										))}
									</div>
								</article>
							))}
						</div>
					</section>
				</div>
			</div>

			{/* PRINT VIEW (TABULATION SHEET) */}
			<style>{`
				@media print {
					@page {
						margin: 0;
					}
				}
			`}</style>
			<div className='hidden w-full bg-white p-12 text-black print:block min-h-screen'>
				<div className='text-center font-serif leading-tight'>
					<h1 className='text-xl font-bold uppercase'>{event.title}</h1>
					<p>Date: {formatDate(event.createdAt)}</p>
					<br />
					<h2 className='text-2xl font-bold uppercase tracking-widest'>Tabulation Sheet</h2>
					<div className='mx-auto mb-6 mt-2 w-1/2 border-b-2 border-black'></div>
				</div>

				<table className='mt-8 w-full border-collapse border border-black text-center text-sm'>
					<thead>
						<tr>
							<th className='border border-black p-2 font-bold uppercase'>Contestant No. / Name</th>
							{event.judges.map((j) => (
								<th key={j.id} className='whitespace-nowrap border border-black p-2 font-bold uppercase'>
									{j.name}
								</th>
							))}
							<th className='border border-black p-2 font-bold uppercase'>Total</th>
							<th className='border border-black p-2 font-bold uppercase'>Rank</th>
						</tr>
					</thead>
					<tbody>
						{compiled.rankings.map((result) => (
							<tr key={result.contestantId}>
								<td className='border border-black p-2 text-left font-semibold uppercase'>{result.contestantName}</td>
								{event.judges.map((j) => (
									<td key={j.id} className='border border-black p-2'>
										{result.perJudgeTotals[j.id] !== undefined ? formatScore(result.perJudgeTotals[j.id]) : ''}
									</td>
								))}
								<td className='border border-black p-2 font-bold'>{formatScore(result.totalScore)}</td>
								<td className='border border-black p-2 font-bold'>{result.rank}</td>
							</tr>
						))}
					</tbody>
				</table>

				<div className='mt-24 flex flex-wrap justify-around gap-y-16'>
					{event.judges.map((j) => (
						<div key={j.id} className='text-center'>
							<div className='mb-1 w-48 border-b border-black'></div>
							<p className='font-bold uppercase'>{j.name}</p>
							<p className='text-sm'>Judge</p>
						</div>
					))}
				</div>
			</div>
		</>
	)
}

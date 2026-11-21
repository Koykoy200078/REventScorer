// The live connection's states and how the admin console names them (Stage 5 Task 7 step 4).

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

export function connectionLabel(state: ConnectionState): string {
	if (state === 'connected') return 'Live connected'
	if (state === 'reconnecting') return 'Reconnecting'
	if (state === 'connecting') return 'Connecting'
	return 'Live offline'
}

/** The dot colour: live, waiting for the socket, or off. */
export function connectionTone(state: ConnectionState): 'live' | 'pending' | 'off' {
	if (state === 'connected') return 'live'
	return state === 'disconnected' ? 'off' : 'pending'
}

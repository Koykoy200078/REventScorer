import { createServer } from 'node:http'
import next from 'next'
import { WebSocket, WebSocketServer } from 'ws'

const port = Number.parseInt(process.env.PORT || '3000', 10)
const lifecycleEvent = process.env.npm_lifecycle_event
const dev = process.env.NODE_ENV ? process.env.NODE_ENV !== 'production' : lifecycleEvent !== 'start'
const app = next({ dev, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
	const handleUpgrade = app.getUpgradeHandler()
	const server = createServer((request, response) => {
		handle(request, response)
	})

	const webSocketServer = new WebSocketServer({ noServer: true })
	const clientsByEventId = new Map()

	function addClient(eventId, socket) {
		const clients = clientsByEventId.get(eventId) ?? new Set()
		clients.add(socket)
		clientsByEventId.set(eventId, clients)
	}

	function removeClient(eventId, socket) {
		const clients = clientsByEventId.get(eventId)
		if (!clients) {
			return
		}

		clients.delete(socket)

		if (clients.size === 0) {
			clientsByEventId.delete(eventId)
		}
	}

	function broadcastScoreUpdate(payload) {
		if (!payload || typeof payload.eventId !== 'string') {
			return
		}

		const clients = clientsByEventId.get(payload.eventId)
		if (!clients || clients.size === 0) {
			return
		}

		const encodedPayload = JSON.stringify({
			type: 'score:update',
			data: payload,
		})

		for (const client of clients) {
			if (client.readyState === WebSocket.OPEN) {
				client.send(encodedPayload)
			}
		}
	}

	globalThis.__eventScorerRealtimeBroadcast = broadcastScoreUpdate

	webSocketServer.on('connection', (socket, _request, context) => {
		const eventId = context.eventId
		addClient(eventId, socket)

		socket.send(
			JSON.stringify({
				type: 'connection',
				data: {
					eventId,
					connectedAt: new Date().toISOString(),
				},
			}),
		)

		socket.on('close', () => {
			removeClient(eventId, socket)
		})
	})

	server.on('upgrade', (request, socket, head) => {
		const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`)

		if (url.pathname !== '/ws/admin-scores') {
			handleUpgrade(request, socket, head)
			return
		}

		const eventId = (url.searchParams.get('eventId') || '').trim()

		if (!eventId) {
			socket.destroy()
			return
		}

		webSocketServer.handleUpgrade(request, socket, head, (upgradedSocket) => {
			webSocketServer.emit('connection', upgradedSocket, request, { eventId })
		})
	})

	server.listen(port, () => {
		console.log(`> Server listening at http://localhost:${port} as ${dev ? 'development' : 'production'}`)
	})
})

import os from 'node:os'
import path from 'node:path'
import type { NextConfig } from 'next'

// Driven by startup scripts.
const rawOrigin = process.env.NEXT_PROXY_API_ORIGIN || process.env.UNIFIED_API_ORIGIN || 'http://127.0.0.1:3007'
const backendOrigin = rawOrigin.replace('localhost', '127.0.0.1') // Use IP for better internal routing
// Extract just the port number for NEXT_PUBLIC_ exposure to client code
const backendPort = new URL(backendOrigin).port || '3007'
const backendHttpPort = process.env.NEXT_PUBLIC_BACKEND_HTTP_PORT || process.env.BACKEND_HTTP_PORT || backendPort
const turbopackRoot = path.resolve(process.cwd(), '..', '..')

function getAllowedDevOrigins() {
	const origins = new Set<string>(['localhost', '127.0.0.1'])

	const configuredOrigins = (process.env.NEXT_ALLOWED_DEV_ORIGINS || '')
		.split(',')
		.map((value) => value.trim())
		.filter(Boolean)

	for (const origin of configuredOrigins) {
		origins.add(origin)
	}

	for (const interfaces of Object.values(os.networkInterfaces())) {
		for (const iface of interfaces || []) {
			if (iface.family === 'IPv4' && !iface.internal) {
				origins.add(iface.address)
			}
		}
	}

	return [...origins]
}

const nextConfig: NextConfig = {
	// Turbopack must include the workspace root so it can resolve the hoisted
	// next package from C:\Projects\ShareME\node_modules in npm workspaces.
	turbopack: {
		root: turbopackRoot,
	},
	// Expose the backend port to browser-side code.
	env: {
		NEXT_PUBLIC_BACKEND_PORT: process.env.NEXT_PUBLIC_BACKEND_PORT || backendPort,
		NEXT_PUBLIC_BACKEND_HTTP_PORT: backendHttpPort,
	},
	allowedDevOrigins: getAllowedDevOrigins(),
	async rewrites() {
		return [
			{
				source: '/api/eventscorer/:path*',
				destination: `${backendOrigin}/api/eventscorer/:path*`,
			},
		]
	},
}

export default nextConfig

/// <reference types="vite/client" />

import type { MdnsSessionAnnouncement } from './types/mdns'
import type { SocketMessagePayload, SocketStatusPayload } from './types/socket'
import type { UdpAnnouncement } from './types/udp'

interface Window {
	hivebeats: {
		startDiscovery: () => Promise<{ ok: boolean }>
		stopDiscovery: () => Promise<{ ok: boolean }>
		advertiseSession: (sessionCode: string, port: number) => Promise<{ ok: boolean }>
		stopAdvertise: () => Promise<{ ok: boolean }>
		onServiceUp: (callback: (service: MdnsSessionAnnouncement) => void) => () => void
		onServiceDown: (callback: (service: MdnsSessionAnnouncement) => void) => () => void
		startHost: (port: number) => Promise<{ ok: boolean }>
		stopHost: () => Promise<{ ok: boolean }>
		connectToHost: (host: string, port: number) => Promise<{ ok: boolean }>
		disconnectFromHost: () => Promise<{ ok: boolean }>
		sendToHost: (message: unknown) => Promise<{ ok: boolean }>
		sendToGuest: (clientId: string, message: unknown) => Promise<{ ok: boolean }>
		broadcastToGuests: (message: unknown) => Promise<{ ok: boolean }>
		onSocketStatus: (callback: (status: SocketStatusPayload) => void) => () => void
		onSocketMessage: (callback: (message: SocketMessagePayload) => void) => () => void
		pickAudioFile: () => Promise<
			| { canceled: true }
			| { canceled: false; filePath: string; fileName: string; mimeType: string }
		>
		startStream: (
			filePath: string,
			fileName: string,
			mimeType: string,
			trackId: string,
		) => Promise<{ ok: boolean }>
		startStreamForGuest: (
			clientId: string,
			filePath: string,
			fileName: string,
			mimeType: string,
			trackId: string,
		) => Promise<{ ok: boolean }>
		stopStream: () => Promise<{ ok: boolean }>
		startUdpBroadcast: (
			sessionCode: string,
			hostPort: number,
			broadcastPort: number,
			intervalMs: number,
			deviceId: string,
		) => Promise<{ ok: boolean }>
		stopUdpBroadcast: () => Promise<{ ok: boolean }>
		startUdpListen: (broadcastPort: number, deviceId: string) => Promise<{ ok: boolean }>
		stopUdpListen: () => Promise<{ ok: boolean }>
		onUdpAnnouncement: (callback: (announcement: UdpAnnouncement) => void) => () => void
		onUdpError: (callback: (error: { message: string }) => void) => () => void
	}
}

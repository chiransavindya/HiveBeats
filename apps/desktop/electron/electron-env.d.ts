/// <reference types="vite-plugin-electron/electron-env" />

import type { MdnsSessionAnnouncement } from '../src/types/mdns'
import type { SocketMessagePayload, SocketStatusPayload } from '../src/types/socket'
import type { UdpAnnouncement } from '../src/types/udp'

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

declare global {
  // Used in Renderer process, expose in `preload.ts`
  interface Window {
    ipcRenderer: import('electron').IpcRenderer
    hivebeats: {
      startDiscovery: () => Promise<{ ok: true }>
      stopDiscovery: () => Promise<{ ok: true }>
      advertiseSession: (sessionCode: string, port: number) => Promise<{ ok: true }>
      stopAdvertise: () => Promise<{ ok: true }>
      onServiceUp: (
        callback: (service: MdnsSessionAnnouncement) => void,
      ) => () => void
      onServiceDown: (
        callback: (service: MdnsSessionAnnouncement) => void,
      ) => () => void
      startHost: (port: number) => Promise<{ ok: true }>
      stopHost: () => Promise<{ ok: true }>
      connectToHost: (host: string, port: number) => Promise<{ ok: true }>
      disconnectFromHost: () => Promise<{ ok: true }>
      sendToHost: (message: unknown) => Promise<{ ok: boolean }>
      sendToGuest: (clientId: string, message: unknown) => Promise<{ ok: boolean }>
      broadcastToGuests: (message: unknown) => Promise<{ ok: true }>
      onSocketStatus: (
        callback: (status: SocketStatusPayload) => void,
      ) => () => void
      onSocketMessage: (
        callback: (message: SocketMessagePayload) => void,
      ) => () => void
      pickAudioFile: () => Promise<
        | { canceled: true }
        | {
            canceled: false
            filePath: string
            fileName: string
            mimeType: string
          }
      >
      startStream: (filePath: string, fileName: string, mimeType: string, trackId: string) => Promise<{ ok: true }>
      startStreamForGuest: (
        clientId: string,
        filePath: string,
        fileName: string,
        mimeType: string,
        trackId: string,
      ) => Promise<{ ok: true }>
      stopStream: () => Promise<{ ok: true }>
      startUdpBroadcast: (
        sessionCode: string,
        hostPort: number,
        broadcastPort: number,
        intervalMs: number,
        deviceId: string,
      ) => Promise<{ ok: true }>
      stopUdpBroadcast: () => Promise<{ ok: true }>
      startUdpListen: (broadcastPort: number, deviceId: string) => Promise<{ ok: true }>
      stopUdpListen: () => Promise<{ ok: true }>
      onUdpAnnouncement: (
        callback: (announcement: UdpAnnouncement) => void,
      ) => () => void
      onUdpError: (callback: (error: { message: string }) => void) => () => void
    }
  }
}

export {}

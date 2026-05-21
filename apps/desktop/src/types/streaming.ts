export type StreamInitMessage = {
  type: 'STREAM_INIT'
  trackId: string
  fileName: string
  mimeType: string
}

export type StreamChunkMessage = {
  type: 'STREAM_CHUNK'
  trackId: string
  seq: number
  data: string
}

export type StreamEndMessage = {
  type: 'STREAM_END'
  trackId: string
}

export type SyncPingMessage = {
  type: 'SYNC_PING'
  t0: number
}

export type SyncPongMessage = {
  type: 'SYNC_PONG'
  t0: number
  t1: number
  t2: number
}

export type PlayCommandMessage = {
  type: 'CMD_PLAY'
  trackId: string
  playAt: number
  positionMs: number
}

export type PauseCommandMessage = {
  type: 'CMD_PAUSE'
  pauseAt: number
  positionMs: number
}

export type SeekCommandMessage = {
  type: 'CMD_SEEK'
  trackId: string
  playAt: number
  positionMs: number
}

export type StreamMessage =
  | StreamInitMessage
  | StreamChunkMessage
  | StreamEndMessage
  | SyncPingMessage
  | SyncPongMessage
  | PlayCommandMessage
  | PauseCommandMessage
  | SeekCommandMessage

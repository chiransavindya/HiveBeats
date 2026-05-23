import fs from 'node:fs'

export type StreamController = {
  stop: () => void
}

export type StreamCallbacks = {
  onChunk: (chunk: Buffer, seq: number) => void
  onEnd: () => void
  onError: (error: Error) => void
}

export function startFileStream(
  filePath: string,
  chunkSize: number,
  callbacks: StreamCallbacks,
): StreamController {
  let sequence = 0
  const stream = fs.createReadStream(filePath, { highWaterMark: chunkSize })

  stream.on('data', (chunk) => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    callbacks.onChunk(buffer, sequence)
    sequence += 1
  })

  stream.on('end', () => {
    callbacks.onEnd()
  })

  stream.on('error', (error) => {
    callbacks.onError(error)
  })

  return {
    stop: () => {
      stream.close()
    },
  }
}

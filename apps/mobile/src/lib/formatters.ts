// ─── Time formatting ────────────────────────────────────────────────────────

export function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00'
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

// ─── Track label ────────────────────────────────────────────────────────────

export function formatTrackLabel(title: string, artist?: string): string {
  return artist ? `${title} • ${artist}` : title
}

// ─── ID generator ───────────────────────────────────────────────────────────

export function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`
}

// ─── Session code generator ─────────────────────────────────────────────────

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateSessionCode(): string {
  let code = 'HIVE-'
  for (let i = 0; i < 4; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  }
  return code
}

// ─── File name helpers ──────────────────────────────────────────────────────

export function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, '')
}

export function getFileExtension(fileName: string): string {
  const match = fileName.match(/\.([^/.]+)$/)
  return match ? match[1].toLowerCase() : ''
}

export function inferMimeType(fileName: string): string {
  const ext = getFileExtension(fileName)
  const map: Record<string, string> = {
    mp3: 'audio/mpeg',
    aac: 'audio/aac',
    flac: 'audio/flac',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
  }
  return map[ext] ?? 'audio/*'
}

// ─── Device alias ───────────────────────────────────────────────────────────

export function generateDeviceAlias(): string {
  const suffix = Math.floor(Math.random() * 9000 + 1000)
  return `Mobile-${suffix}`
}

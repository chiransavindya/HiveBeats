const DEFAULT_PREFIX = 'HIVE'
const DEFAULT_LENGTH = 4
const SESSION_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateSessionCode(
  prefix: string = DEFAULT_PREFIX,
  length: number = DEFAULT_LENGTH,
): string {
  const buffer = new Uint32Array(length)
  crypto.getRandomValues(buffer)

  let code = `${prefix}-`
  for (let i = 0; i < length; i += 1) {
    code += SESSION_CHARS[buffer[i] % SESSION_CHARS.length]
  }

  return code
}

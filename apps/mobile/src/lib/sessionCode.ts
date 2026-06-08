const DEFAULT_PREFIX = 'HIVE'
const DEFAULT_LENGTH = 4
const SESSION_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateSessionCode(prefix: string = DEFAULT_PREFIX, length: number = DEFAULT_LENGTH): string {
  let code = `${prefix}-`

  for (let index = 0; index < length; index += 1) {
    code += SESSION_CHARS[Math.floor(Math.random() * SESSION_CHARS.length)]
  }

  return code
}

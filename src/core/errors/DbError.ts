export class DbError extends Error {
  readonly code: string

  constructor(message: string, code: string) {
    super(`[#${code}] ${message}`)
    this.code = code
    this.name = 'DbError'
  }
}

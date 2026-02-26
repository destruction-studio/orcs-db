import { DbError } from './DbError'

export interface QueryErrorParams {
  message: string
  code: string
  query: string
  sqlState: string
  errno: number
}

export class QueryError extends DbError {
  readonly query: string
  readonly sqlState: string
  readonly errno: number

  constructor(params: QueryErrorParams) {
    super(params.message, params.code)
    this.name = 'QueryError'
    this.query = params.query
    this.sqlState = params.sqlState
    this.errno = params.errno
  }
}

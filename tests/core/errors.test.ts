import { describe, it, expect } from 'vitest'
import { DbError } from '../../src/core/errors/DbError'
import { QueryError } from '../../src/core/errors/QueryError'

describe('DbError', () => {
  it('stores message and code', () => {
    const err = new DbError('connection failed', 'CONN_ERR')
    expect(err.message).toBe('[#CONN_ERR] connection failed')
    expect(err.code).toBe('CONN_ERR')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('DbError')
  })

  it('has stack trace', () => {
    const err = new DbError('test', 'TEST')
    expect(err.stack).toBeDefined()
  })
})

describe('QueryError', () => {
  it('stores query details', () => {
    const err = new QueryError({
      message: 'syntax error',
      code: 'ER_PARSE',
      query: 'SELECT * FORM users',
      sqlState: '42000',
      errno: 1064,
    })
    expect(err.message).toContain('syntax error')
    expect(err.code).toBe('ER_PARSE')
    expect(err.query).toBe('SELECT * FORM users')
    expect(err.sqlState).toBe('42000')
    expect(err.errno).toBe(1064)
    expect(err).toBeInstanceOf(DbError)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('QueryError')
  })
})

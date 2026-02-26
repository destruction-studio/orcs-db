import { describe, it, expect } from 'vitest'
import { Sql } from '../../src/core/Sql'

describe('Sql', () => {
  it('stores raw SQL string', () => {
    const sql = new Sql('NOW()')
    expect(sql.toString()).toBe('NOW()')
  })

  it('returns raw string via template literal', () => {
    const sql = new Sql('COUNT(*)')
    expect(`${sql}`).toBe('COUNT(*)')
  })

  it('works with different SQL expressions', () => {
    expect(new Sql('UNIX_TIMESTAMP()').toString()).toBe('UNIX_TIMESTAMP()')
    expect(new Sql('count + 1').toString()).toBe('count + 1')
  })
})

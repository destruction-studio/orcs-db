import { describe, it, expect } from 'vitest'
import { Pool } from '../../src/core/Pool'

// Pool wraps mysql2.createPool which is synchronous and lazy —
// actual connections are not opened until getConnection() is called.
// These tests verify the public API shape and config acceptance
// without requiring a real MySQL instance.

describe('Pool', () => {
  it('constructor accepts config', () => {
    const pool = new Pool({
      host: 'localhost',
      user: 'test',
      password: 'test',
      database: 'test',
    })
    expect(pool).toBeDefined()
    expect(pool).toBeInstanceOf(Pool)
  })

  it('exports PoolConfig and ExecuteOptions types', async () => {
    const config: import('../../src/core/Pool').PoolConfig = {
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'test',
    }
    const opts: import('../../src/core/Pool').ExecuteOptions = {
      onError: (err) => {},
      name: 'test',
    }
    expect(config).toBeDefined()
    expect(opts).toBeDefined()
  })

  it('has stats method', () => {
    const pool = new Pool({
      host: 'localhost',
      user: 'test',
      password: 'test',
      database: 'test',
    })
    const s = pool.stats()
    expect(s).toHaveProperty('acquiring')
    expect(s).toHaveProperty('total')
    expect(s).toHaveProperty('free')
    expect(s).toHaveProperty('queued')
  })

  it('has execute method', () => {
    const pool = new Pool({
      host: 'localhost',
      user: 'test',
      password: 'test',
      database: 'test',
    })
    expect(typeof pool.execute).toBe('function')
  })

  it('has transaction method', () => {
    const pool = new Pool({
      host: 'localhost',
      user: 'test',
      password: 'test',
      database: 'test',
    })
    expect(typeof pool.transaction).toBe('function')
  })

  it('has getConnection method', () => {
    const pool = new Pool({
      host: 'localhost',
      user: 'test',
      password: 'test',
      database: 'test',
    })
    expect(typeof pool.getConnection).toBe('function')
  })

  it('has end method', () => {
    const pool = new Pool({
      host: 'localhost',
      user: 'test',
      password: 'test',
      database: 'test',
    })
    expect(typeof pool.end).toBe('function')
  })
})

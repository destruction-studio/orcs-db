import { describe, it, expect, vi } from 'vitest'
import { Connection } from '../../src/core/Connection'
import { SelectResult } from '../../src/core/result/SelectResult'
import { EditResult } from '../../src/core/result/EditResult'
import { QueryError } from '../../src/core/errors/QueryError'
import { Sql } from '../../src/core/Sql'

function createMockConnection(queryResult: any = [[], []]) {
  return {
    query: vi.fn((_sql: string, _bind: any, cb: Function) => {
      cb(null, queryResult[0], queryResult[1])
    }),
    escape: vi.fn((v: any) => `'${v}'`),
    release: vi.fn(),
    beginTransaction: vi.fn((cb: Function) => cb(null)),
    commit: vi.fn((cb: Function) => cb(null)),
    rollback: vi.fn((cb: Function) => cb(null)),
  }
}

describe('Connection', () => {
  describe('select', () => {
    it('returns SelectResult', async () => {
      const rows = [{ id: 1, name: 'Alice' }]
      const fields = [{ name: 'id' }, { name: 'name' }]
      const mock = createMockConnection([rows, fields])
      const conn = new Connection(mock as any)

      const result = await conn.select('*', 'users')
      expect(result).toBeInstanceOf(SelectResult)
      expect(result.all()).toEqual(rows)
    })

    it('generates correct SQL', async () => {
      const mock = createMockConnection([[], []])
      const conn = new Connection(mock as any)

      await conn.select(['id', 'name'], 'users', { active: 1 }, { limit: 10 })
      const sql = mock.query.mock.calls[0][0] as string
      expect(sql).toContain('SELECT')
      expect(sql).toContain('FROM `users`')
      expect(sql).toContain("WHERE")
      expect(sql).toContain('LIMIT 10')
    })
  })

  describe('insert', () => {
    it('returns EditResult with insertId', async () => {
      const mock = createMockConnection([{ insertId: 5, affectedRows: 1, changedRows: 0 }, undefined])
      const conn = new Connection(mock as any)

      const result = await conn.insert({ name: 'Bob' }, 'users')
      expect(result).toBeInstanceOf(EditResult)
      expect(result.getInsertId()).toBe(5)
    })
  })

  describe('insertMulti', () => {
    it('returns EditResult', async () => {
      const mock = createMockConnection([{ insertId: 10, affectedRows: 3, changedRows: 0 }, undefined])
      const conn = new Connection(mock as any)

      const result = await conn.insertMulti([{ name: 'A' }, { name: 'B' }, { name: 'C' }], 'users')
      expect(result).toBeInstanceOf(EditResult)
      expect(result.getAffectedRows()).toBe(3)
    })
  })

  describe('update', () => {
    it('returns EditResult', async () => {
      const mock = createMockConnection([{ insertId: 0, affectedRows: 1, changedRows: 1 }, undefined])
      const conn = new Connection(mock as any)

      const result = await conn.update({ name: 'Jane' }, 'users', { id: 1 })
      expect(result).toBeInstanceOf(EditResult)
      expect(result.getChangedRows()).toBe(1)
    })
  })

  describe('deleteFrom', () => {
    it('returns EditResult', async () => {
      const mock = createMockConnection([{ insertId: 0, affectedRows: 1, changedRows: 0 }, undefined])
      const conn = new Connection(mock as any)

      const result = await conn.deleteFrom('users', { id: 1 })
      expect(result).toBeInstanceOf(EditResult)
      expect(result.getAffectedRows()).toBe(1)
    })
  })

  describe('replace', () => {
    it('returns EditResult', async () => {
      const mock = createMockConnection([{ insertId: 1, affectedRows: 1, changedRows: 0 }, undefined])
      const conn = new Connection(mock as any)

      const result = await conn.replace({ id: 1, name: 'test' }, 'users')
      expect(result).toBeInstanceOf(EditResult)
    })
  })

  describe('count', () => {
    it('returns number', async () => {
      const mock = createMockConnection([[{ 'COUNT(*)': 42 }], [{ name: 'COUNT(*)' }]])
      const conn = new Connection(mock as any)

      const count = await conn.count('users')
      expect(count).toBe(42)
    })
  })

  describe('sum', () => {
    it('returns number', async () => {
      const mock = createMockConnection([[{ 'SUM(`balance`)': 1500 }], [{ name: 'SUM(`balance`)' }]])
      const conn = new Connection(mock as any)

      const sum = await conn.sum('balance', 'users')
      expect(sum).toBe(1500)
    })
  })

  describe('transactions', () => {
    it('startTransaction calls beginTransaction', async () => {
      const mock = createMockConnection()
      const conn = new Connection(mock as any)

      await conn.startTransaction()
      expect(mock.beginTransaction).toHaveBeenCalled()
    })

    it('commit calls commit', async () => {
      const mock = createMockConnection()
      const conn = new Connection(mock as any)

      await conn.commit()
      expect(mock.commit).toHaveBeenCalled()
    })

    it('rollback calls rollback', async () => {
      const mock = createMockConnection()
      const conn = new Connection(mock as any)

      await conn.rollback()
      expect(mock.rollback).toHaveBeenCalled()
    })
  })

  describe('release', () => {
    it('calls underlying release', () => {
      const mock = createMockConnection()
      const conn = new Connection(mock as any)
      conn.release()
      expect(mock.release).toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('wraps mysql errors into QueryError', async () => {
      const mock = {
        ...createMockConnection(),
        query: vi.fn((_sql: string, _bind: any, cb: Function) => {
          cb({ code: 'ER_PARSE', message: 'syntax error', sqlState: '42000', errno: 1064, stack: 'stack' })
        }),
      }
      const conn = new Connection(mock as any)

      try {
        await conn.select('*', 'users')
        expect.fail('should throw')
      } catch (err) {
        expect(err).toBeInstanceOf(QueryError)
        expect((err as QueryError).code).toBe('ER_PARSE')
        expect((err as QueryError).query).toContain('SELECT')
      }
    })
  })

  describe('sql helper', () => {
    it('creates Sql instance', () => {
      const mock = createMockConnection()
      const conn = new Connection(mock as any)
      const raw = conn.sql('NOW()')
      expect(raw).toBeInstanceOf(Sql)
      expect(raw.toString()).toBe('NOW()')
    })
  })

  describe('quote', () => {
    it('escapes normal values via connection.escape', () => {
      const mock = createMockConnection()
      const conn = new Connection(mock as any)
      const result = conn.quote('test')
      expect(mock.escape).toHaveBeenCalledWith('test')
    })

    it('passes Sql instances through as raw', () => {
      const mock = createMockConnection()
      const conn = new Connection(mock as any)
      const result = conn.quote(new Sql('NOW()'))
      expect(result).toBe('NOW()')
      expect(mock.escape).not.toHaveBeenCalled()
    })
  })
})

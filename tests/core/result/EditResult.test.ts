import { describe, it, expect } from 'vitest'
import { EditResult } from '../../../src/core/result/EditResult'

describe('EditResult', () => {
  it('returns insertId', () => {
    const result = new EditResult({ insertId: 42, affectedRows: 1, changedRows: 0 })
    expect(result.getInsertId()).toBe(42)
  })

  it('returns affectedRows', () => {
    const result = new EditResult({ insertId: 0, affectedRows: 5, changedRows: 3 })
    expect(result.getAffectedRows()).toBe(5)
  })

  it('returns changedRows', () => {
    const result = new EditResult({ insertId: 0, affectedRows: 5, changedRows: 3 })
    expect(result.getChangedRows()).toBe(3)
  })

  it('handles zero values', () => {
    const result = new EditResult({ insertId: 0, affectedRows: 0, changedRows: 0 })
    expect(result.getInsertId()).toBe(0)
    expect(result.getAffectedRows()).toBe(0)
    expect(result.getChangedRows()).toBe(0)
  })
})

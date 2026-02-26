import { describe, it, expect } from 'vitest'
import { SelectResult } from '../../../src/core/result/SelectResult'

const rows = [
  { id: 1, name: 'Alice', email: 'alice@test.com' },
  { id: 2, name: 'Bob', email: 'bob@test.com' },
  { id: 3, name: 'Carol', email: 'carol@test.com' },
]
const fields = [{ name: 'id' }, { name: 'name' }, { name: 'email' }]

describe('SelectResult', () => {
  it('all() returns all rows', () => {
    const r = new SelectResult(rows, fields)
    expect(r.all()).toEqual(rows)
  })

  it('row() returns first row', () => {
    const r = new SelectResult(rows, fields)
    expect(r.row()).toEqual({ id: 1, name: 'Alice', email: 'alice@test.com' })
  })

  it('row() returns null for empty result', () => {
    const r = new SelectResult([], [])
    expect(r.row()).toBeNull()
  })

  it('field() returns first field of first row', () => {
    const r = new SelectResult(rows, fields)
    expect(r.field()).toBe(1)
  })

  it('field(name) returns named field of first row', () => {
    const r = new SelectResult(rows, fields)
    expect(r.field('name')).toBe('Alice')
  })

  it('field() returns null for empty result', () => {
    const r = new SelectResult([], [])
    expect(r.field()).toBeNull()
  })

  it('column() returns first column values', () => {
    const r = new SelectResult(rows, fields)
    expect(r.column()).toEqual([1, 2, 3])
  })

  it('column(name) returns named column values', () => {
    const r = new SelectResult(rows, fields)
    expect(r.column('email')).toEqual(['alice@test.com', 'bob@test.com', 'carol@test.com'])
  })

  it('column() returns empty array for empty result', () => {
    const r = new SelectResult([], [])
    expect(r.column()).toEqual([])
  })

  it('allIndexed(key) indexes rows by field', () => {
    const r = new SelectResult(rows, fields)
    const indexed = r.allIndexed('id')
    expect(indexed['1']).toEqual(rows[0])
    expect(indexed['2']).toEqual(rows[1])
    expect(indexed['3']).toEqual(rows[2])
  })

  it('columnIndexed(key, col) maps key to column value', () => {
    const r = new SelectResult(rows, fields)
    const map = r.columnIndexed('id', 'email')
    expect(map['1']).toBe('alice@test.com')
    expect(map['2']).toBe('bob@test.com')
    expect(map['3']).toBe('carol@test.com')
  })

  it('fields() returns field metadata', () => {
    const r = new SelectResult(rows, fields)
    expect(r.fields()).toEqual(fields)
  })
})

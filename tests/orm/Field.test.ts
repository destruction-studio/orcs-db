import { describe, it, expect } from 'vitest'
import { Field } from '../../src/orm/Field'

describe('Field', () => {
  it('creates int field', () => {
    const f = Field.int('id').compile()
    expect(f.getName()).toBe('id')
    expect(f.getType()).toBe('number')
  })
  it('creates string field', () => {
    const f = Field.string('name').compile()
    expect(f.getName()).toBe('name')
    expect(f.getType()).toBe('string')
  })
  it('creates double field', () => {
    const f = Field.double('balance').compile()
    expect(f.getType()).toBe('number')
  })
  it('creates date field', () => {
    const f = Field.date('createdAt').compile()
    expect(f.getType()).toBe('Date')
  })
  it('primary()', () => {
    const f = Field.int('id').primary().compile()
    expect(f.isPrimary()).toBe(true)
    expect(f.isIndex()).toBe(false)
  })
  it('index()', () => {
    const f = Field.string('email').index().compile()
    expect(f.isIndex()).toBe(true)
    expect(f.isPrimary()).toBe(false)
  })
  it('helpJson()', () => {
    const f = Field.string('data').helpJson().compile()
    expect(f.hasHelpJson()).toBe(true)
  })
  it('helpGetCols()', () => {
    const f = Field.int('id').helpGetCols().compile()
    expect(f.hasHelpGetCols()).toBe(true)
  })
  it('helpGetReadOnlyMulti()', () => {
    const f = Field.int('id').helpGetReadOnlyMulti().compile()
    expect(f.hasHelpGetReadOnlyMulti()).toBe(true)
  })
  it('all modifiers chainable', () => {
    const f = Field.int('id').primary().helpGetCols().helpGetReadOnlyMulti().compile()
    expect(f.isPrimary()).toBe(true)
    expect(f.hasHelpGetCols()).toBe(true)
    expect(f.hasHelpGetReadOnlyMulti()).toBe(true)
  })
  it('defaults are false', () => {
    const f = Field.string('name').compile()
    expect(f.isPrimary()).toBe(false)
    expect(f.isIndex()).toBe(false)
    expect(f.hasHelpJson()).toBe(false)
    expect(f.hasHelpGetCols()).toBe(false)
    expect(f.hasHelpGetReadOnlyMulti()).toBe(false)
  })
})

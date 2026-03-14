import { describe, it, expect } from 'vitest'
import { Func } from '../../src/core/Func'

function createFunc(): Func {
  const quote = (v: any) => `'${v}'`
  const quoteField = (v: string) => `\`${v}\``
  return new Func(quote, quoteField)
}

describe('Func', () => {
  describe('dateSub', () => {
    it('dateSub with NOW() default', () => {
      const func = createFunc()
      const sql = func.dateSub(30, 'SECOND')
      expect(sql.toString()).toBe("DATE_SUB(NOW(), INTERVAL '30' SECOND)")
    })

    it('dateSub with column', () => {
      const func = createFunc()
      const sql = func.dateSub(1, 'HOUR', 'createdAt')
      expect(sql.toString()).toBe("DATE_SUB(`createdAt`, INTERVAL '1' HOUR)")
    })

    it('dateSub with each unit', () => {
      const func = createFunc()
      const units = ['SECOND', 'MINUTE', 'HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR'] as const
      for (const unit of units) {
        const sql = func.dateSub(1, unit)
        expect(sql.toString()).toContain(unit)
      }
    })

    it('dateSub normalizes lowercase unit', () => {
      const func = createFunc()
      const sql = func.dateSub(5, 'day' as any)
      expect(sql.toString()).toBe("DATE_SUB(NOW(), INTERVAL '5' DAY)")
    })

    it('dateSub throws on invalid unit', () => {
      const func = createFunc()
      expect(() => func.dateSub(1, 'INVALID' as any)).toThrow('Invalid INTERVAL unit: INVALID')
    })

    it('dateSub throws on non-string unit', () => {
      const func = createFunc()
      expect(() => func.dateSub(1, null as any)).toThrow('Invalid INTERVAL unit: null')
      expect(() => func.dateSub(1, undefined as any)).toThrow('Invalid INTERVAL unit: undefined')
      expect(() => func.dateSub(1, 123 as any)).toThrow('Invalid INTERVAL unit: 123')
    })
  })

  describe('dateAdd', () => {
    it('dateAdd with NOW() default', () => {
      const func = createFunc()
      const sql = func.dateAdd(7, 'DAY')
      expect(sql.toString()).toBe("DATE_ADD(NOW(), INTERVAL '7' DAY)")
    })

    it('dateAdd with column', () => {
      const func = createFunc()
      const sql = func.dateAdd(30, 'MINUTE', 'updatedAt')
      expect(sql.toString()).toBe("DATE_ADD(`updatedAt`, INTERVAL '30' MINUTE)")
    })

    it('dateAdd normalizes lowercase unit', () => {
      const func = createFunc()
      const sql = func.dateAdd(1, 'week' as any)
      expect(sql.toString()).toBe("DATE_ADD(NOW(), INTERVAL '1' WEEK)")
    })

    it('dateAdd throws on invalid unit', () => {
      const func = createFunc()
      expect(() => func.dateAdd(1, 'CENTURIES' as any)).toThrow('Invalid INTERVAL unit: CENTURIES')
    })
  })
})

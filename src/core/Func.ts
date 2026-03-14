import { Sql } from './Sql'

export type IntervalUnit = 'SECOND' | 'MINUTE' | 'HOUR' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'

const validUnits = new Set<string>(['SECOND', 'MINUTE', 'HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR'])

export class Func {
  #quote: (value: any) => string
  #quoteField: (name: string) => string

  constructor(quote: (value: any) => string, quoteField: (name: string) => string) {
    this.#quote = quote
    this.#quoteField = quoteField
  }

  dateSub(value: number, unit: IntervalUnit, column?: string): Sql {
    const normalized = Func.#validateUnit(unit)
    const base = column ? this.#quoteField(column) : 'NOW()'
    return new Sql('DATE_SUB(' + base + ', INTERVAL ' + this.#quote(value) + ' ' + normalized + ')')
  }

  dateAdd(value: number, unit: IntervalUnit, column?: string): Sql {
    const normalized = Func.#validateUnit(unit)
    const base = column ? this.#quoteField(column) : 'NOW()'
    return new Sql('DATE_ADD(' + base + ', INTERVAL ' + this.#quote(value) + ' ' + normalized + ')')
  }

  static #validateUnit(unit: string): string {
    if (typeof unit !== 'string') {
      throw new Error('Invalid INTERVAL unit: ' + String(unit))
    }
    const upper = unit.toUpperCase()
    if (!validUnits.has(upper)) {
      throw new Error('Invalid INTERVAL unit: ' + unit)
    }
    return upper
  }
}

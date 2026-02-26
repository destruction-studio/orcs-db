export class SelectResult<T extends Record<string, any> = Record<string, any>> {
  readonly #rows: T[]
  readonly #fields: any[]

  constructor(rows: T[], fields: any[]) {
    this.#rows = rows
    this.#fields = fields
  }

  all(): T[] {
    return this.#rows
  }

  row(): T | null {
    return this.#rows.length > 0 ? this.#rows[0] : null
  }

  field(name?: string): any {
    const row = this.row()
    if (!row) return null
    if (name) return (row as any)[name]
    const firstKey = this.#fields.length > 0 ? this.#fields[0].name : Object.keys(row)[0]
    return (row as any)[firstKey]
  }

  column(name?: string): any[] {
    if (this.#rows.length === 0) return []
    const key = name ?? (this.#fields.length > 0 ? this.#fields[0].name : Object.keys(this.#rows[0])[0])
    return this.#rows.map(row => (row as any)[key])
  }

  allIndexed(indexField: string): Record<string, T> {
    const result: Record<string, T> = {}
    for (const row of this.#rows) {
      result[String((row as any)[indexField])] = row
    }
    return result
  }

  columnIndexed(indexField: string, columnField: string): Record<string, any> {
    const result: Record<string, any> = {}
    for (const row of this.#rows) {
      result[String((row as any)[indexField])] = (row as any)[columnField]
    }
    return result
  }

  fields(): any[] {
    return this.#fields
  }
}

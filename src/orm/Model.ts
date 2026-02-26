import { Connection } from '../core/Connection'
import { EditResult } from '../core/result/EditResult'
import type { Where, QueryOptions, InsertOptions } from '../core/types'

export class Model {
  #db: Connection | null
  #tableName: string
  #data: Record<string, any>
  #touched: Map<string, boolean> = new Map()
  #deleted = false
  #readonly: boolean
  #detached = false

  constructor(db: Connection | null, tableName: string, data: Record<string, any> = {}, readonly_: boolean = false) {
    this.#db = db
    this.#tableName = tableName
    this.#data = { ...data }
    this.#readonly = readonly_
  }

  protected get db(): Connection {
    if (this.#detached) throw new Error('Model is detached, cannot perform write operations')
    if (!this.#db) throw new Error('No database connection')
    return this.#db
  }

  get __data(): Record<string, any> {
    return this.#data
  }

  get primaryKeys(): string[] {
    return ['id']
  }

  __touch(field: string): void {
    this.#touched.set(field, true)
  }

  // CRUD operations

  async insert(options: InsertOptions = {}): Promise<EditResult> {
    this.#assertWritable()
    await this.beforeInsert()
    const result = await this.db.insert(this.#data, this.#tableName, options)
    await this.afterInsert(result)
    return result
  }

  async update(options: QueryOptions = {}): Promise<EditResult> {
    this.#assertWritable()
    await this.beforeUpdate()
    const where = this.#primaryWhere()
    const data = { ...this.#data }
    for (const pk of this.primaryKeys) {
      delete data[pk]
    }
    const result = await this.db.update(data, this.#tableName, where, options)
    await this.afterUpdate(result)
    return result
  }

  async updateTouched(): Promise<number> {
    this.#assertWritable()
    if (this.#touched.size === 0) return 0
    await this.beforeUpdate()
    const touchedData: Record<string, any> = {}
    for (const [field] of this.#touched) {
      touchedData[field] = this.#data[field]
    }
    const where = this.#primaryWhere()
    const result = await this.db.update(touchedData, this.#tableName, where)
    this.#touched.clear()
    await this.afterUpdate(result)
    return result.getAffectedRows()
  }

  async updateTouchedWhere(where: Where = {}): Promise<number> {
    this.#assertWritable()
    if (this.#touched.size === 0) return 0
    await this.beforeUpdate()
    const touchedData: Record<string, any> = {}
    for (const [field] of this.#touched) {
      touchedData[field] = this.#data[field]
    }
    const fullWhere = { ...this.#primaryWhere(), ...where }
    const result = await this.db.update(touchedData, this.#tableName, fullWhere)
    this.#touched.clear()
    await this.afterUpdate(result)
    return result.getAffectedRows()
  }

  async updateWhere(where: Where = {}, options: QueryOptions = {}): Promise<EditResult> {
    this.#assertWritable()
    await this.beforeUpdate()
    const fullWhere = { ...this.#primaryWhere(), ...where }
    const data = { ...this.#data }
    for (const pk of this.primaryKeys) {
      delete data[pk]
    }
    const result = await this.db.update(data, this.#tableName, fullWhere, options)
    await this.afterUpdate(result)
    return result
  }

  async deleteRow(): Promise<EditResult> {
    this.#assertWritable()
    if (this.#deleted) throw new Error('Row already deleted')
    await this.beforeDelete()
    const where = this.#primaryWhere()
    const result = await this.db.deleteFrom(this.#tableName, where)
    this.#deleted = true
    await this.afterDelete(result)
    return result
  }

  detach(): void {
    this.#db = null
    this.#readonly = true
    this.#detached = true
  }

  // Lifecycle hooks - override in subclasses
  protected async beforeInsert(): Promise<void> {}
  protected async afterInsert(_result: EditResult): Promise<void> {}
  protected async beforeUpdate(): Promise<void> {}
  protected async afterUpdate(_result: EditResult): Promise<void> {}
  protected async beforeDelete(): Promise<void> {}
  protected async afterDelete(_result: EditResult): Promise<void> {}

  #assertWritable(): void {
    if (this.#detached) throw new Error('Model is detached, cannot perform write operations')
    if (this.#readonly) throw new Error('Row read only')
    if (!this.#db) throw new Error('No database connection')
  }

  #primaryWhere(): Record<string, any> {
    const where: Record<string, any> = {}
    for (const pk of this.primaryKeys) {
      where[pk] = this.#data[pk]
    }
    return where
  }
}

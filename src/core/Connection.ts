import { Sql } from './Sql'
import { Func } from './Func'
import { SqlGenerator } from './SqlGenerator'
import { SelectResult } from './result/SelectResult'
import { EditResult } from './result/EditResult'
import { QueryError } from './errors/QueryError'
import type { Where, QueryOptions, InsertOptions } from './types'

type ResultClass<T> = new (...args: any[]) => T

export class Connection {
  readonly #connection: any
  readonly #sqlGenerator: SqlGenerator
  #func?: Func

  constructor(connection: any) {
    this.#connection = connection
    this.#sqlGenerator = new SqlGenerator()
    this.#sqlGenerator.setQuote((value: any) => this.quote(value))
    this.#sqlGenerator.setTableQuote((value: string) => this.quoteField(value))
  }

  quote(variable: any): string {
    if (variable instanceof Sql) {
      return variable.toString()
    }
    return this.#connection.escape(variable)
  }

  quoteField(variable: string | Sql): string {
    if (variable instanceof Sql) {
      return variable.toString()
    }
    return '`' + variable + '`'
  }

  get func(): Func {
    if (!this.#func) this.#func = new Func(this.quote.bind(this), this.quoteField.bind(this))
    return this.#func
  }

  #query<T>(queryString: string, bind: any[], resultClass: ResultClass<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.#connection.query(queryString, bind, (error: any, results: any, fields: any) => {
        if (error) {
          reject(new QueryError({
            message: error.message || String(error),
            code: error.code || 'UNKNOWN',
            query: queryString,
            sqlState: error.sqlState || '',
            errno: error.errno || 0,
          }))
          return
        }
        resolve(new resultClass(results, fields))
      })
    })
  }

  async query(queryString: string, bind?: any[], resultClass?: ResultClass<any>): Promise<any> {
    const cls = resultClass ?? SelectResult
    return this.#query(queryString, bind ?? [], cls)
  }

  async select(
    columns: string | string[] | Record<string, any> | Sql,
    table: string,
    where?: Where,
    options?: QueryOptions,
  ): Promise<SelectResult> {
    const sql = this.#sqlGenerator.select(columns, table, where, options)
    return this.#query(sql, [], SelectResult)
  }

  async insert(row: Record<string, any>, table: string, options?: InsertOptions): Promise<EditResult> {
    const sql = this.#sqlGenerator.insert(row, table, options)
    return this.#query(sql, [], EditResult)
  }

  async insertMulti(rows: Record<string, any>[], table: string, options?: InsertOptions): Promise<EditResult> {
    const sql = this.#sqlGenerator.insertMulti(rows, table, options)
    return this.#query(sql, [], EditResult)
  }

  async replace(row: Record<string, any>, table: string, options?: InsertOptions): Promise<EditResult> {
    const sql = this.#sqlGenerator.replace(row, table)
    return this.#query(sql, [], EditResult)
  }

  async replaceMulti(rows: Record<string, any>[], table: string): Promise<EditResult> {
    const sql = this.#sqlGenerator.replaceMulti(rows, table)
    return this.#query(sql, [], EditResult)
  }

  async update(
    columns: Record<string, any>,
    table: string,
    where?: Where,
    options?: QueryOptions,
  ): Promise<EditResult> {
    const sql = this.#sqlGenerator.update(columns, table, where, options)
    return this.#query(sql, [], EditResult)
  }

  async deleteFrom(table: string, where?: Where, options?: QueryOptions): Promise<EditResult> {
    const sql = this.#sqlGenerator.deleteFrom(table, where, options)
    return this.#query(sql, [], EditResult)
  }

  async count(table: string, where?: Where, options?: QueryOptions): Promise<number> {
    const result = await this.select(new Sql('COUNT(*)'), table, where, options)
    return result.field() as number
  }

  async sum(field: string, table: string, where?: Where, options?: QueryOptions): Promise<number> {
    const result = await this.select(new Sql('SUM(`' + field + '`)'), table, where, options)
    return result.field() as number
  }

  startTransaction(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.#connection.beginTransaction((error: any) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  }

  commit(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.#connection.commit((error: any) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  }

  rollback(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.#connection.rollback((error: any) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  }

  sql(raw: string): Sql {
    return new Sql(raw)
  }

  async ping(): Promise<SelectResult> {
    return this.query('SELECT 1+1')
  }

  release(): void {
    this.#connection.release()
  }
}

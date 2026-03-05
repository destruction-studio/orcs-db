import { Sql } from './Sql'
import type { Where, QueryOptions, InsertOptions } from './types'

export class SqlGenerator {
  #quoteFunction: ((value: any) => string) | null = null
  #quoteTableFunction: ((value: string) => string) | null = null

  setQuote(fn: (value: any) => string): void {
    if (typeof fn !== 'function') throw new Error('Quote callback must be a function!')
    this.#quoteFunction = fn
  }

  setTableQuote(fn: (value: string) => string): void {
    if (typeof fn !== 'function') throw new Error('Quote callback must be a function!')
    this.#quoteTableFunction = fn
  }

  deleteFrom(table: string, where?: Where, options?: QueryOptions): string {
    let limit = ''
    const opts = SqlGenerator.checkOptions(options)
    let whereStr = this.#whereToString(where)
    whereStr = whereStr === '' ? '' : 'WHERE ' + whereStr
    if (opts.limit !== undefined) {
      if (typeof opts.limit === 'number') {
        limit = ' LIMIT ' + parseInt(String(opts.limit))
      } else if (typeof opts.limit === 'object') {
        limit = ' LIMIT ' + opts.limit[0] + ',' + opts.limit[1]
      }
    }
    let order = ''
    if (opts.order !== undefined) order = ' ORDER BY ' + opts.order
    return 'DELETE FROM `' + table + '` ' + whereStr + order + limit
  }

  update(columns: Record<string, any>, table: string, where?: Where, options?: QueryOptions): string {
    const values: string[] = []
    let limit = ''
    let order = ''
    const opts = SqlGenerator.checkOptions(options)
    let whereStr = this.#whereToString(where)
    whereStr = whereStr === '' ? '' : ' WHERE ' + whereStr
    for (const field in columns) {
      if (!Object.prototype.hasOwnProperty.call(columns, field)) continue
      if (columns[field] instanceof Sql) {
        values.push(columns[field].toString())
      } else {
        values.push('`' + field + '` = ' + this.quote(columns[field]))
      }
    }
    if (opts.limit !== undefined) limit = ' LIMIT ' + parseInt(String(opts.limit))
    if (opts.order !== undefined) order = ' ORDER BY ' + opts.order
    return 'UPDATE `' + table + '` SET ' + values.join(', ') + whereStr + order + limit
  }

  insert(row: Record<string, any>, table: string, options?: InsertOptions): string {
    const opts = SqlGenerator.checkOptions(options) as InsertOptions
    const keys: string[] = []
    let values: string[] = []
    for (const key in row) {
      if (Object.prototype.hasOwnProperty.call(row, key)) {
        keys.push(key)
        values.push(this.quote(row[key]))
      }
    }
    const cc = keys.length > 0 ? '`' + keys.join('`, `') + '`' : ''
    let query = opts.ignore
      ? 'INSERT IGNORE `' + table + '` (' + cc + ') VALUES'
      : 'INSERT INTO `' + table + '` (' + cc + ') VALUES'
    query += '(' + values.join(', ') + ')'
    if (opts.onDuplicateUpdate) {
      query += ' ON DUPLICATE KEY UPDATE '
      if (typeof opts.onDuplicateUpdate === 'object') {
        values = []
        for (const key in opts.onDuplicateUpdate) {
          if (!Object.prototype.hasOwnProperty.call(opts.onDuplicateUpdate, key)) continue
          if (opts.onDuplicateUpdate[key] instanceof Sql) {
            values.push(opts.onDuplicateUpdate[key].toString())
          } else {
            values.push('`' + key + '` = ' + this.quote(opts.onDuplicateUpdate[key]))
          }
        }
        query += values.join(', ')
      } else {
        query += keys.map(key => '`' + key + '` = VALUES(`' + key + '`)').join(', ')
      }
    }
    return query
  }

  insertMulti(rows: Record<string, any>[], table: string, options?: InsertOptions): string {
    const opts = SqlGenerator.checkOptions(options) as InsertOptions
    const keys = Object.keys(rows[0])
    const cc = keys.length > 0 ? '`' + keys.join('`, `') + '`' : ''
    let query = opts.ignore
      ? 'INSERT IGNORE `' + table + '` (' + cc + ') VALUES'
      : 'INSERT INTO `' + table + '` (' + cc + ') VALUES'
    const insertRows: string[] = []
    for (const row of rows) {
      const values: string[] = []
      for (const key of keys) {
        values.push(this.quote(row[key]))
      }
      insertRows.push(values.join(', '))
    }
    query += ' (' + insertRows.join('), (') + ')'
    if (opts.onDuplicateUpdate) {
      query += ' ON DUPLICATE KEY UPDATE '
      if (typeof opts.onDuplicateUpdate === 'object') {
        const vals: string[] = []
        for (const key in opts.onDuplicateUpdate) {
          if (!Object.prototype.hasOwnProperty.call(opts.onDuplicateUpdate, key)) continue
          if (opts.onDuplicateUpdate[key] instanceof Sql) {
            vals.push(opts.onDuplicateUpdate[key].toString())
          } else {
            vals.push('`' + key + '` = ' + this.quote(opts.onDuplicateUpdate[key]))
          }
        }
        query += vals.join(', ')
      } else {
        query += keys.map(key => '`' + key + '` = VALUES(`' + key + '`)').join(', ')
      }
    }
    return query
  }

  replace(row: Record<string, any>, table: string): string {
    const keys = Object.keys(row)
    const values = keys.map(field => row[field])
    let query = 'REPLACE INTO ' + this.quoteTable(table) + ' (`' + keys.join('`, `') + '`) VALUES '
    query += '(' + values.map(value => this.quote(value)).join(', ') + ')'
    return query
  }

  replaceMulti(rows: Record<string, any>[], table: string): string {
    const keys = Object.keys(rows[0])
    let query = 'REPLACE INTO ' + this.quoteTable(table) + ' (`' + keys.join('`, `') + '`) VALUES '
    query += rows.map(row => {
      const values = keys.map(field => row[field])
      return '(' + values.map(value => this.quote(value)).join(', ') + ')'
    }).join(',')
    return query
  }

  select(
    columns: string | string[] | Record<string, any> | Sql,
    from: string,
    where?: Where,
    options?: QueryOptions
  ): string {
    const opts = options === undefined ? {} : options
    let columnsStr: string

    if (columns instanceof Sql) {
      columnsStr = columns.toString()
    } else if (Array.isArray(columns)) {
      if (columns.length === 1) {
        // Single-element array: treat as single column string
        const col = columns[0]
        if (col instanceof Sql) {
          columnsStr = col.toString()
        } else {
          columnsStr = '`' + col + '`'
        }
      } else {
        const cols: string[] = []
        for (let i = columns.length - 1; i >= 0; i--) {
          const value = columns[i] instanceof Sql
            ? (columns[i] as Sql).toString()
            : '`' + columns[i] + '`'
          cols.push(value)
        }
        columnsStr = cols.join(',')
      }
    } else if (typeof columns === 'object' && columns !== null) {
      // Plain object — alias mapping
      const cols: string[] = []
      for (const i in columns) {
        const value = (columns as Record<string, any>)[i] instanceof Sql
          ? ((columns as Record<string, any>)[i] as Sql).toString()
          : '`' + (columns as Record<string, any>)[i] + '`'
        cols.push(typeof i === 'string' ? value + ' AS `' + i + '`' : value)
      }
      columnsStr = cols.join(',')
    } else if (columns === '*') {
      columnsStr = '*'
    } else {
      columnsStr = '`' + columns + '`'
    }

    from = from.split('.').join('`.`')
    let whereStr = this.#whereToString(where)
    whereStr = whereStr === '' ? '' : 'WHERE ' + whereStr
    const group = opts.group === undefined ? '' : ' GROUP BY `' + opts.group + '`'
    const order = opts.order === undefined ? '' : ' ORDER BY ' + opts.order
    const limit = opts.limit === undefined ? '' : ' LIMIT ' + opts.limit
    const forUpdate = opts.forUpdate ? ' FOR UPDATE' : ''
    return 'SELECT ' + columnsStr + ' FROM `' + from + '` ' + whereStr + group + order + limit + forUpdate
  }

  #whereToString(where?: Where): string {
    const whereA: string[] = []
    if (!(where instanceof Object)) return ''
    for (const i in where) {
      if (!Object.prototype.hasOwnProperty.call(where, i)) continue
      if (i === '$or') {
        const orClauses = (where[i] as Where[])
          .map(w => this.#whereToString(w))
          .filter(s => s !== '')
        if (orClauses.length > 0) {
          whereA.push('(' + orClauses.join(' OR ') + ')')
        }
        continue
      }
      if (where[i] === null) {
        whereA.push('ISNULL(`' + i + '`)')
      } else if (where[i] instanceof Sql) {
        whereA.push((where[i] as Sql).toString())
      } else if (Array.isArray(where[i])) {
        const arr = where[i] as any[]
        if (arr[0].toUpperCase() === 'IN' || arr[0].toUpperCase() === 'NOT IN') {
          whereA.push('`' + i + '` ' + arr[0].toUpperCase() + '(' + (arr[1] as any[]).map((v: any) => this.quote(v)).join(',') + ')')
        } else if (['<', '>', '!=', '>=', '<='].includes(arr[0])) {
          whereA.push('`' + i + '` ' + arr[0] + ' ' + this.quote(arr[1]))
        } else if (arr[0].toUpperCase() === 'BETWEEN') {
          whereA.push('`' + i + '` BETWEEN ' + this.quote(arr[1]) + ' AND ' + this.quote(arr[2]))
        } else {
          whereA.push('`' + i + '` ' + arr[0] + ' ' + this.quote(arr[1]))
        }
      } else {
        whereA.push('`' + i + '` = ' + this.quote(where[i]))
      }
    }
    return whereA.length > 0 ? whereA.join(' AND ') : ''
  }

  quote(variable: any): string {
    if (this.#quoteFunction === null) throw new Error('quoteFunctionNotSet')
    return this.#quoteFunction(variable)
  }

  quoteTable(variable: string): string {
    if (this.#quoteTableFunction === null) throw new Error('quoteTableFunctionNotSet')
    return this.#quoteTableFunction(variable)
  }

  static checkOptions(options: any): Record<string, any> {
    return (options === undefined || options === null) ? {} : (typeof options === 'object' ? options : {})
  }
}

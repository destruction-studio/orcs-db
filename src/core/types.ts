import { Sql } from './Sql'

export type WhereValue =
  | string | number | boolean | null
  | Sql
  | ['>' | '<' | '>=' | '<=' | '!=', string | number | Sql]
  | ['IN' | 'NOT IN', (string | number)[]]
  | ['BETWEEN', string | number | Sql, string | number | Sql]

export type Where = {
  [key: string]: WhereValue | Where[] | undefined
  $or?: Where[]
  $and?: Where[]
}

export type OrderDirection = 'ASC' | 'DESC' | 'asc' | 'desc'
export type OrderOption =
  | string
  | Sql
  | [string, OrderDirection]
  | [string, OrderDirection][]
  | Record<string, OrderDirection>

export interface QueryOptions {
  limit?: number | [number, number]
  order?: OrderOption
  group?: string
  forUpdate?: boolean
}

export interface InsertOptions {
  ignore?: boolean
  onDuplicateUpdate?: boolean | Record<string, any>
}

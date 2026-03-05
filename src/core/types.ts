import { Sql } from './Sql'

export type WhereValue =
  | string | number | boolean | null
  | Sql
  | ['>' | '<' | '>=' | '<=' | '!=', string | number]
  | ['IN' | 'NOT IN', (string | number)[]]
  | ['BETWEEN', string | number, string | number]

export type Where = Record<string, WhereValue> & {
  $or?: Where[]
}

export interface QueryOptions {
  limit?: number | [number, number]
  order?: string
  group?: string
  forUpdate?: boolean
}

export interface InsertOptions {
  ignore?: boolean
  onDuplicateUpdate?: boolean | Record<string, any>
}

# orcs-db Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build `orcs-db` — a TypeScript MySQL library with query builder, ORM code generation, hooks, migrations, and CLI.

**Architecture:** Layered single-package: core (Pool, Connection, SqlGenerator, results, errors) → orm (Model, Field, hooks) → generator (codegen for JS/TS) → migration (Migrator) → cli. mysql2 only.

**Tech Stack:** TypeScript, mysql2, vitest (testing), tsup (bundling), commander (CLI)

**Design doc:** `docs/plans/2026-02-27-orcs-db-design.md`

**Reference implementations:**
- SQL/Connection: `node-common/src/source/pdb/`
- ORM/Codegen: `node-db-orm/src/generator/DBAutoGenerator.js`

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `vitest.config.ts`
- Create: `src/index.ts`

**Step 1: Initialize package.json**

```json
{
  "name": "orcs-db",
  "version": "0.1.0",
  "description": "TypeScript MySQL library with query builder, ORM codegen, and migrations",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "orcs-db": "dist/cli/index.js"
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "files": ["dist"],
  "keywords": ["mysql", "orm", "query-builder", "typescript"],
  "license": "MIT",
  "dependencies": {
    "mysql2": "^3.9.0",
    "commander": "^12.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "tsup": "^8.0.0",
    "vitest": "^1.6.0",
    "@types/node": "^20.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Step 3: Create tsup.config.ts**

```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/cli/index.ts'],
  format: ['cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
})
```

**Step 4: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
  },
})
```

**Step 5: Create empty src/index.ts**

```typescript
// orcs-db — main entry point
```

**Step 6: Install dependencies**

Run: `npm install`
Expected: node_modules created, lock file generated

**Step 7: Verify build works**

Run: `npm run build`
Expected: dist/ created with index.js and index.d.ts

---

### Task 2: Sql (raw SQL marker)

**Files:**
- Create: `src/core/Sql.ts`
- Create: `tests/core/Sql.test.ts`

**Step 1: Write failing test**

```typescript
// tests/core/Sql.test.ts
import { describe, it, expect } from 'vitest'
import { Sql } from '../../src/core/Sql'

describe('Sql', () => {
  it('stores raw SQL string', () => {
    const sql = new Sql('NOW()')
    expect(sql.toString()).toBe('NOW()')
  })

  it('returns raw string via toString', () => {
    const sql = new Sql('COUNT(*)')
    expect(`${sql}`).toBe('COUNT(*)')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/Sql.test.ts`
Expected: FAIL — module not found

**Step 3: Implement Sql**

```typescript
// src/core/Sql.ts
export class Sql {
  readonly #value: string

  constructor(value: string) {
    this.#value = value
  }

  toString(): string {
    return this.#value
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/Sql.test.ts`
Expected: PASS

---

### Task 3: Error classes

**Files:**
- Create: `src/core/errors/DbError.ts`
- Create: `src/core/errors/QueryError.ts`
- Create: `tests/core/errors.test.ts`

**Step 1: Write failing tests**

```typescript
// tests/core/errors.test.ts
import { describe, it, expect } from 'vitest'
import { DbError } from '../../src/core/errors/DbError'
import { QueryError } from '../../src/core/errors/QueryError'

describe('DbError', () => {
  it('stores message and code', () => {
    const err = new DbError('connection failed', 'CONN_ERR')
    expect(err.message).toBe('[#CONN_ERR] connection failed')
    expect(err.code).toBe('CONN_ERR')
    expect(err).toBeInstanceOf(Error)
  })
})

describe('QueryError', () => {
  it('stores query details', () => {
    const err = new QueryError({
      message: 'syntax error',
      code: 'ER_PARSE',
      query: 'SELECT * FORM users',
      sqlState: '42000',
      errno: 1064,
    })
    expect(err.message).toContain('syntax error')
    expect(err.code).toBe('ER_PARSE')
    expect(err.query).toBe('SELECT * FORM users')
    expect(err.sqlState).toBe('42000')
    expect(err.errno).toBe(1064)
    expect(err).toBeInstanceOf(DbError)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/errors.test.ts`
Expected: FAIL

**Step 3: Implement errors**

```typescript
// src/core/errors/DbError.ts
export class DbError extends Error {
  readonly code: string

  constructor(message: string, code: string) {
    super(`[#${code}] ${message}`)
    this.code = code
    this.name = 'DbError'
  }
}
```

```typescript
// src/core/errors/QueryError.ts
import { DbError } from './DbError'

export interface QueryErrorParams {
  message: string
  code: string
  query: string
  sqlState: string
  errno: number
}

export class QueryError extends DbError {
  readonly query: string
  readonly sqlState: string
  readonly errno: number

  constructor(params: QueryErrorParams) {
    super(params.message, params.code)
    this.name = 'QueryError'
    this.query = params.query
    this.sqlState = params.sqlState
    this.errno = params.errno
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/errors.test.ts`
Expected: PASS

---

### Task 4: EditResult

**Files:**
- Create: `src/core/result/EditResult.ts`
- Create: `tests/core/result/EditResult.test.ts`

**Step 1: Write failing test**

```typescript
// tests/core/result/EditResult.test.ts
import { describe, it, expect } from 'vitest'
import { EditResult } from '../../../src/core/result/EditResult'

describe('EditResult', () => {
  it('returns insertId', () => {
    const result = new EditResult({ insertId: 42, affectedRows: 1, changedRows: 0 })
    expect(result.getInsertId()).toBe(42)
  })

  it('returns affectedRows', () => {
    const result = new EditResult({ insertId: 0, affectedRows: 5, changedRows: 3 })
    expect(result.getAffectedRows()).toBe(5)
  })

  it('returns changedRows', () => {
    const result = new EditResult({ insertId: 0, affectedRows: 5, changedRows: 3 })
    expect(result.getChangedRows()).toBe(3)
  })
})
```

**Step 2: Run to fail, implement, run to pass**

```typescript
// src/core/result/EditResult.ts
export interface EditResultData {
  insertId: number
  affectedRows: number
  changedRows: number
}

export class EditResult {
  readonly #data: EditResultData

  constructor(data: EditResultData) {
    this.#data = data
  }

  getInsertId(): number {
    return this.#data.insertId
  }

  getAffectedRows(): number {
    return this.#data.affectedRows
  }

  getChangedRows(): number {
    return this.#data.changedRows
  }
}
```

---

### Task 5: SelectResult

**Files:**
- Create: `src/core/result/SelectResult.ts`
- Create: `tests/core/result/SelectResult.test.ts`

**Step 1: Write failing tests**

```typescript
// tests/core/result/SelectResult.test.ts
import { describe, it, expect } from 'vitest'
import { SelectResult } from '../../../src/core/result/SelectResult'

const rows = [
  { id: 1, name: 'Alice', email: 'alice@test.com' },
  { id: 2, name: 'Bob', email: 'bob@test.com' },
  { id: 3, name: 'Carol', email: 'carol@test.com' },
]

const fields = [
  { name: 'id' }, { name: 'name' }, { name: 'email' },
]

describe('SelectResult', () => {
  it('all() returns all rows', () => {
    const r = new SelectResult(rows, fields as any)
    expect(r.all()).toEqual(rows)
  })

  it('row() returns first row', () => {
    const r = new SelectResult(rows, fields as any)
    expect(r.row()).toEqual({ id: 1, name: 'Alice', email: 'alice@test.com' })
  })

  it('row() returns null for empty result', () => {
    const r = new SelectResult([], [])
    expect(r.row()).toBeNull()
  })

  it('field() returns first field of first row', () => {
    const r = new SelectResult(rows, fields as any)
    expect(r.field()).toBe(1)
  })

  it('field(name) returns named field of first row', () => {
    const r = new SelectResult(rows, fields as any)
    expect(r.field('name')).toBe('Alice')
  })

  it('column() returns first column values', () => {
    const r = new SelectResult(rows, fields as any)
    expect(r.column()).toEqual([1, 2, 3])
  })

  it('column(name) returns named column values', () => {
    const r = new SelectResult(rows, fields as any)
    expect(r.column('email')).toEqual(['alice@test.com', 'bob@test.com', 'carol@test.com'])
  })

  it('allIndexed(key) indexes rows by field', () => {
    const r = new SelectResult(rows, fields as any)
    const indexed = r.allIndexed('id')
    expect(indexed[1]).toEqual(rows[0])
    expect(indexed[2]).toEqual(rows[1])
    expect(indexed[3]).toEqual(rows[2])
  })

  it('columnIndexed(key, col) maps key to column', () => {
    const r = new SelectResult(rows, fields as any)
    const map = r.columnIndexed('id', 'email')
    expect(map[1]).toBe('alice@test.com')
    expect(map[2]).toBe('bob@test.com')
  })

  it('fields() returns field metadata', () => {
    const r = new SelectResult(rows, fields as any)
    expect(r.fields()).toEqual(fields)
  })
})
```

**Step 2: Implement**

Port from `node-common/src/source/pdb/result/SelectResult.js`. Key: add generic `<T>` type parameter.

```typescript
// src/core/result/SelectResult.ts
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
    const key = name ?? (this.#fields.length > 0 ? this.#fields[0].name : Object.keys(this.#rows[0] ?? {})[0])
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
```

**Step 3: Run tests**

Run: `npx vitest run tests/core/result/SelectResult.test.ts`
Expected: PASS

---

### Task 6: SqlGenerator

**Files:**
- Create: `src/core/SqlGenerator.ts`
- Create: `src/core/types.ts`
- Create: `tests/core/SqlGenerator.test.ts`

This is the largest core class. Port from `node-common/src/source/pdb/SQLGenerator.js`.

**Step 1: Create shared types**

```typescript
// src/core/types.ts
import { Sql } from './Sql'

export type WhereValue =
  | string | number | boolean | null
  | Sql
  | ['>' | '<' | '>=' | '<=' | '!=', string | number]
  | ['IN' | 'NOT IN', (string | number)[]]
  | ['BETWEEN', string | number, string | number]

export type Where = Record<string, WhereValue>

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
```

**Step 2: Write tests for SELECT generation**

```typescript
// tests/core/SqlGenerator.test.ts
import { describe, it, expect } from 'vitest'
import { SqlGenerator } from '../../src/core/SqlGenerator'
import { Sql } from '../../src/core/Sql'

function createGenerator(): SqlGenerator {
  const gen = new SqlGenerator()
  gen.setQuote((v: string) => `'${v}'`)
  gen.setTableQuote((t: string) => `\`${t}\``)
  return gen
}

describe('SqlGenerator', () => {
  describe('select', () => {
    it('simple select *', () => {
      const gen = createGenerator()
      expect(gen.select('*', 'users')).toContain('SELECT * FROM `users`')
    })

    it('select with array of columns', () => {
      const gen = createGenerator()
      const sql = gen.select(['id', 'name'], 'users')
      expect(sql).toContain('SELECT `id`,`name` FROM `users`')
    })

    it('select with where', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', { id: 1 })
      expect(sql).toContain("WHERE `id` = '1'")
    })

    it('select with limit', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', {}, { limit: 10 })
      expect(sql).toContain('LIMIT 10')
    })

    it('select with order', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', {}, { order: 'id DESC' })
      expect(sql).toContain('ORDER BY id DESC')
    })

    it('select with forUpdate', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', {}, { forUpdate: true })
      expect(sql).toContain('FOR UPDATE')
    })

    it('select with Sql in columns', () => {
      const gen = createGenerator()
      const sql = gen.select({ count: new Sql('COUNT(*)') }, 'users')
      expect(sql).toContain('SELECT COUNT(*) AS `count`')
    })
  })

  describe('where', () => {
    it('null value → ISNULL', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', { deleted: null })
      expect(sql).toContain('ISNULL(`deleted`)')
    })

    it('comparison operators', () => {
      const gen = createGenerator()
      expect(gen.select('*', 'users', { age: ['>', 18] })).toContain("`age` > '18'")
      expect(gen.select('*', 'users', { age: ['<', 65] })).toContain("`age` < '65'")
      expect(gen.select('*', 'users', { age: ['!=', 21] })).toContain("`age` != '21'")
      expect(gen.select('*', 'users', { age: ['>=', 18] })).toContain("`age` >= '18'")
    })

    it('IN operator', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', { id: ['IN', [1, 2, 3]] })
      expect(sql).toContain("`id` IN('1','2','3')")
    })

    it('NOT IN operator', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', { id: ['NOT IN', [1, 2]] })
      expect(sql).toContain("`id` NOT IN('1','2')")
    })

    it('BETWEEN operator', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', { age: ['BETWEEN', 18, 65] })
      expect(sql).toContain("`age` BETWEEN '18' AND '65'")
    })

    it('raw Sql in where', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', { $custom: new Sql('created_at > NOW()') })
      expect(sql).toContain('created_at > NOW()')
    })

    it('multiple conditions joined with AND', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', { name: 'John', age: ['>', 18] })
      expect(sql).toContain("`name` = 'John'")
      expect(sql).toContain("`age` > '18'")
      expect(sql).toContain(' AND ')
    })
  })

  describe('insert', () => {
    it('basic insert', () => {
      const gen = createGenerator()
      const sql = gen.insert({ name: 'John', email: 'j@t.com' }, 'users')
      expect(sql).toContain('INSERT INTO `users`')
      expect(sql).toContain("`name`")
      expect(sql).toContain("'John'")
    })

    it('insert ignore', () => {
      const gen = createGenerator()
      const sql = gen.insert({ id: 1 }, 'users', { ignore: true })
      expect(sql).toContain('INSERT IGNORE')
    })

    it('on duplicate key update', () => {
      const gen = createGenerator()
      const sql = gen.insert({ id: 1, name: 'John' }, 'users', { onDuplicateUpdate: true })
      expect(sql).toContain('ON DUPLICATE KEY UPDATE')
      expect(sql).toContain('VALUES(`id`)')
      expect(sql).toContain('VALUES(`name`)')
    })
  })

  describe('insertMulti', () => {
    it('generates multi-row insert', () => {
      const gen = createGenerator()
      const sql = gen.insertMulti([{ name: 'A' }, { name: 'B' }], 'users')
      expect(sql).toContain('INSERT INTO `users`')
      expect(sql).toContain("'A'")
      expect(sql).toContain("'B'")
    })
  })

  describe('update', () => {
    it('basic update', () => {
      const gen = createGenerator()
      const sql = gen.update({ name: 'Jane' }, 'users', { id: 1 })
      expect(sql).toContain("UPDATE `users` SET `name` = 'Jane'")
      expect(sql).toContain("WHERE `id` = '1'")
    })

    it('update with Sql value', () => {
      const gen = createGenerator()
      const sql = gen.update({ updated_at: new Sql('NOW()') }, 'users', { id: 1 })
      expect(sql).toContain('SET updated_at = NOW()')
    })
  })

  describe('deleteFrom', () => {
    it('basic delete', () => {
      const gen = createGenerator()
      const sql = gen.deleteFrom('users', { id: 1 })
      expect(sql).toContain("DELETE FROM `users`")
      expect(sql).toContain("WHERE `id` = '1'")
    })

    it('delete with limit', () => {
      const gen = createGenerator()
      const sql = gen.deleteFrom('users', { active: 0 }, { limit: 100 })
      expect(sql).toContain('LIMIT 100')
    })
  })

  describe('replace', () => {
    it('basic replace', () => {
      const gen = createGenerator()
      const sql = gen.replace({ id: 1, name: 'John' }, 'users')
      expect(sql).toContain('REPLACE INTO `users`')
    })
  })
})
```

**Step 3: Implement SqlGenerator**

Port from `node-common/src/source/pdb/SQLGenerator.js`. Convert to TypeScript with proper types. Key methods:
- `setQuote(fn)`, `setTableQuote(fn)`
- `select(columns, table, where?, options?)`
- `insert(row, table, options?)`
- `insertMulti(rows, table, options?)`
- `replace(row, table)`, `replaceMulti(rows, table)`
- `update(columns, table, where, options?)`
- `deleteFrom(table, where, options?)`
- Private: `_whereToString(where)`, `_optionsToString(options)`

Reference implementation line-by-line: `node-common/src/source/pdb/SQLGenerator.js`

**Step 4: Run tests**

Run: `npx vitest run tests/core/SqlGenerator.test.ts`
Expected: PASS

---

### Task 7: Connection

**Files:**
- Create: `src/core/Connection.ts`
- Create: `tests/core/Connection.test.ts`

**Step 1: Write tests with mocked mysql2 connection**

```typescript
// tests/core/Connection.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Connection } from '../../src/core/Connection'

function createMockConnection(queryResult: any = [[], []]) {
  return {
    query: vi.fn((_sql: string, _bind: any, cb: Function) => {
      cb(null, queryResult[0], queryResult[1])
    }),
    escape: vi.fn((v: any) => `'${v}'`),
    release: vi.fn(),
    beginTransaction: vi.fn((cb: Function) => cb(null)),
    commit: vi.fn((cb: Function) => cb(null)),
    rollback: vi.fn((cb: Function) => cb(null)),
  }
}

describe('Connection', () => {
  it('select returns SelectResult', async () => {
    const rows = [{ id: 1, name: 'Alice' }]
    const fields = [{ name: 'id' }, { name: 'name' }]
    const mock = createMockConnection([rows, fields])
    const conn = new Connection(mock as any)

    const result = await conn.select('*', 'users')
    expect(result.all()).toEqual(rows)
    expect(mock.query).toHaveBeenCalled()
  })

  it('insert returns EditResult', async () => {
    const mock = createMockConnection([{ insertId: 5, affectedRows: 1, changedRows: 0 }])
    const conn = new Connection(mock as any)

    const result = await conn.insert({ name: 'Bob' }, 'users')
    expect(result.getInsertId()).toBe(5)
  })

  it('update returns EditResult', async () => {
    const mock = createMockConnection([{ insertId: 0, affectedRows: 1, changedRows: 1 }])
    const conn = new Connection(mock as any)

    const result = await conn.update({ name: 'Jane' }, 'users', { id: 1 })
    expect(result.getAffectedRows()).toBe(1)
  })

  it('deleteFrom returns EditResult', async () => {
    const mock = createMockConnection([{ insertId: 0, affectedRows: 1, changedRows: 0 }])
    const conn = new Connection(mock as any)

    const result = await conn.deleteFrom('users', { id: 1 })
    expect(result.getAffectedRows()).toBe(1)
  })

  it('count returns number', async () => {
    const mock = createMockConnection([[{ 'COUNT(*)': 42 }], [{ name: 'COUNT(*)' }]])
    const conn = new Connection(mock as any)

    const count = await conn.count('users')
    expect(count).toBe(42)
  })

  it('transaction methods call underlying connection', async () => {
    const mock = createMockConnection()
    const conn = new Connection(mock as any)

    await conn.startTransaction()
    expect(mock.beginTransaction).toHaveBeenCalled()

    await conn.commit()
    expect(mock.commit).toHaveBeenCalled()
  })

  it('release calls underlying release', () => {
    const mock = createMockConnection()
    const conn = new Connection(mock as any)
    conn.release()
    expect(mock.release).toHaveBeenCalled()
  })

  it('wraps mysql errors into QueryError', async () => {
    const mock = {
      ...createMockConnection(),
      query: vi.fn((_sql: string, _bind: any, cb: Function) => {
        cb({ code: 'ER_PARSE', message: 'syntax error', sqlState: '42000', errno: 1064 })
      }),
    }
    const conn = new Connection(mock as any)

    await expect(conn.select('*', 'users')).rejects.toThrow('syntax error')
  })
})
```

**Step 2: Implement Connection**

Port from `node-common/src/source/pdb/DBConnection.js`. Key changes:
- TypeScript types for all methods
- `release()` instead of `end()`
- `sql(raw)` returns `new Sql(raw)`
- Uses `SqlGenerator` internally
- Wraps errors in `QueryError`

**Step 3: Run tests**

Run: `npx vitest run tests/core/Connection.test.ts`
Expected: PASS

---

### Task 8: Pool

**Files:**
- Create: `src/core/Pool.ts`
- Create: `tests/core/Pool.test.ts`

**Step 1: Write tests**

```typescript
// tests/core/Pool.test.ts
import { describe, it, expect, vi } from 'vitest'
import { Pool } from '../../src/core/Pool'

// These tests use a mock mysql2 pool
// Integration tests with real MySQL are separate

describe('Pool', () => {
  function createMockPool() {
    const mockConn = {
      query: vi.fn((_sql: string, _bind: any, cb: Function) => cb(null, [], [])),
      escape: vi.fn((v: any) => `'${v}'`),
      release: vi.fn(),
      beginTransaction: vi.fn((cb: Function) => cb(null)),
      commit: vi.fn((cb: Function) => cb(null)),
      rollback: vi.fn((cb: Function) => cb(null)),
    }
    return {
      mockConn,
      pool: {
        getConnection: vi.fn((cb: Function) => cb(null, mockConn)),
        pool: {
          _acquiringConnections: { length: 0 },
          _allConnections: { length: 1 },
          _freeConnections: { length: 1 },
          _connectionQueue: { length: 0 },
        },
      },
    }
  }

  it('execute acquires connection, runs action, releases', async () => {
    // Test the execute pattern with mocked internals
    // Actual implementation test — verify release is called
  })

  it('execute with onError swallows error', async () => {
    // Verify onError is called, no throw
  })

  it('execute without onError throws error', async () => {
    // Verify error propagates
  })

  it('transaction commits on success', async () => {
    // Verify commit called
  })

  it('transaction rolls back on error', async () => {
    // Verify rollback called, connection released
  })

  it('stats returns pool statistics', () => {
    // Verify stats shape
  })
})
```

**Step 2: Implement Pool**

```typescript
// src/core/Pool.ts
import mysql from 'mysql2'
import { Connection } from './Connection'

export interface PoolConfig {
  host: string
  user: string
  password: string
  database: string
  connectionLimit?: number
  port?: number
}

export interface ExecuteOptions {
  onError?: (err: Error) => void
  name?: string
}

export class Pool {
  readonly #pool: mysql.Pool

  constructor(config: PoolConfig) {
    this.#pool = mysql.createPool({
      host: config.host,
      user: config.user,
      password: config.password,
      database: config.database,
      connectionLimit: config.connectionLimit ?? 50,
      port: config.port ?? 3306,
      waitForConnections: true,
    })
  }

  async getConnection(): Promise<Connection> {
    return new Promise((resolve, reject) => {
      this.#pool.getConnection((err, conn) => {
        if (err) return reject(err)
        resolve(new Connection(conn))
      })
    })
  }

  async execute<T>(action: (db: Connection) => Promise<T>, options?: ExecuteOptions): Promise<T | undefined> {
    const db = await this.getConnection()
    try {
      const result = await action(db)
      db.release()
      return result
    } catch (err) {
      try { db.release() } catch {}
      if (options?.onError) {
        options.onError(err as Error)
        return undefined
      }
      throw err
    }
  }

  async transaction<T>(action: (db: Connection) => Promise<T>, options?: ExecuteOptions): Promise<T | undefined> {
    const db = await this.getConnection()
    try {
      await db.startTransaction()
      const result = await action(db)
      await db.commit()
      db.release()
      return result
    } catch (err) {
      try { await db.rollback() } catch {}
      try { db.release() } catch {}
      if (options?.onError) {
        options.onError(err as Error)
        return undefined
      }
      throw err
    }
  }

  stats() {
    const p = (this.#pool as any).pool
    return {
      acquiring: p._acquiringConnections.length,
      total: p._allConnections.length,
      free: p._freeConnections.length,
      queued: p._connectionQueue.length,
    }
  }
}
```

**Step 3: Run tests**

Run: `npx vitest run tests/core/Pool.test.ts`
Expected: PASS

---

### Task 9: Main exports + build verification

**Files:**
- Modify: `src/index.ts`

**Step 1: Add all core exports**

```typescript
// src/index.ts
export { Pool } from './core/Pool'
export type { PoolConfig, ExecuteOptions } from './core/Pool'
export { Connection } from './core/Connection'
export { Sql } from './core/Sql'
export { SqlGenerator } from './core/SqlGenerator'
export { SelectResult } from './core/result/SelectResult'
export { EditResult } from './core/result/EditResult'
export type { EditResultData } from './core/result/EditResult'
export { DbError } from './core/errors/DbError'
export { QueryError } from './core/errors/QueryError'
export type { Where, WhereValue, QueryOptions, InsertOptions } from './core/types'
```

**Step 2: Verify full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 3: Verify build**

Run: `npm run build`
Expected: dist/ created with .js and .d.ts files

---

### Task 10: Field definition builder

**Files:**
- Create: `src/orm/Field.ts`
- Create: `tests/orm/Field.test.ts`

**Step 1: Write failing tests**

```typescript
// tests/orm/Field.test.ts
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
    expect(f.getName()).toBe('balance')
    expect(f.getType()).toBe('number')
  })

  it('creates date field', () => {
    const f = Field.date('createdAt').compile()
    expect(f.getName()).toBe('createdAt')
    expect(f.getType()).toBe('Date')
  })

  it('primary() marks as primary', () => {
    const f = Field.int('id').primary().compile()
    expect(f.isPrimary()).toBe(true)
  })

  it('index() marks as indexed', () => {
    const f = Field.string('email').index().compile()
    expect(f.isIndex()).toBe(true)
  })

  it('helpers are chainable', () => {
    const f = Field.int('id').primary().helpGetCols().helpGetReadOnlyMulti().compile()
    expect(f.isPrimary()).toBe(true)
    expect(f.hasHelpGetCols()).toBe(true)
    expect(f.hasHelpGetReadOnlyMulti()).toBe(true)
  })

  it('helpJson()', () => {
    const f = Field.string('data').helpJson().compile()
    expect(f.hasHelpJson()).toBe(true)
  })
})
```

**Step 2: Implement Field and FieldCompiled**

Port from `node-db-orm/src/generator/DBAutoGenerator.js` (DBField and DBFieldCompiled classes).

```typescript
// src/orm/Field.ts
export class FieldCompiled {
  readonly #data: {
    name: string
    type: string
    primary: boolean
    index: boolean
    helpJson: boolean
    helpGetCols: boolean
    helpGetReadOnlyMulti: boolean
  }

  constructor(data: typeof FieldCompiled.prototype['#data']) {
    this.#data = data
  }

  getName(): string { return this.#data.name }
  getType(): string { return this.#data.type }
  isPrimary(): boolean { return this.#data.primary }
  isIndex(): boolean { return this.#data.index }
  hasHelpJson(): boolean { return this.#data.helpJson }
  hasHelpGetCols(): boolean { return this.#data.helpGetCols }
  hasHelpGetReadOnlyMulti(): boolean { return this.#data.helpGetReadOnlyMulti }
}

export class Field {
  #name: string
  #type: string
  #primary = false
  #index = false
  #helpJson = false
  #helpGetCols = false
  #helpGetReadOnlyMulti = false

  private constructor(name: string, type: string) {
    this.#name = name
    this.#type = type
  }

  static int(name: string): Field { return new Field(name, 'number') }
  static string(name: string): Field { return new Field(name, 'string') }
  static double(name: string): Field { return new Field(name, 'number') }
  static date(name: string): Field { return new Field(name, 'Date') }

  primary(): this { this.#primary = true; return this }
  index(): this { this.#index = true; return this }
  helpJson(): this { this.#helpJson = true; return this }
  helpGetCols(): this { this.#helpGetCols = true; return this }
  helpGetReadOnlyMulti(): this { this.#helpGetReadOnlyMulti = true; return this }

  compile(): FieldCompiled {
    return new FieldCompiled({
      name: this.#name,
      type: this.#type,
      primary: this.#primary,
      index: this.#index,
      helpJson: this.#helpJson,
      helpGetCols: this.#helpGetCols,
      helpGetReadOnlyMulti: this.#helpGetReadOnlyMulti,
    })
  }
}
```

**Step 3: Run tests**

Run: `npx vitest run tests/orm/Field.test.ts`
Expected: PASS

---

### Task 11: Model base class

**Files:**
- Create: `src/orm/Model.ts`
- Create: `src/orm/hooks.ts`
- Create: `tests/orm/Model.test.ts`

**Step 1: Write failing tests**

```typescript
// tests/orm/Model.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Model } from '../../src/orm/Model'
import { Connection } from '../../src/core/Connection'
import { EditResult } from '../../src/core/result/EditResult'

// Concrete test model
class TestModel extends Model {
  static readonly tableName = 'test_table'
  get primaryKeys(): string[] { return ['id'] }
}

function createMockDb() {
  return {
    insert: vi.fn(async () => new EditResult({ insertId: 1, affectedRows: 1, changedRows: 0 })),
    update: vi.fn(async () => new EditResult({ insertId: 0, affectedRows: 1, changedRows: 1 })),
    deleteFrom: vi.fn(async () => new EditResult({ insertId: 0, affectedRows: 1, changedRows: 0 })),
    select: vi.fn(async () => ({ all: () => [], row: () => null })),
  } as unknown as Connection
}

describe('Model', () => {
  it('insert calls db.insert with data', async () => {
    const db = createMockDb()
    const model = new TestModel(db, 'test_table', { id: 1, name: 'test' })
    await model.insert()
    expect(db.insert).toHaveBeenCalledWith({ id: 1, name: 'test' }, 'test_table', {})
  })

  it('update calls db.update with all data', async () => {
    const db = createMockDb()
    const model = new TestModel(db, 'test_table', { id: 1, name: 'test' })
    await model.update()
    expect(db.update).toHaveBeenCalled()
  })

  it('touch tracking works', async () => {
    const db = createMockDb()
    const model = new TestModel(db, 'test_table', { id: 1, name: 'old' })
    model.__touch('name')
    model.__data.name = 'new'
    const affected = await model.updateTouched()
    expect(db.update).toHaveBeenCalledWith(
      { name: 'new' },
      'test_table',
      { id: 1 },
    )
  })

  it('deleteRow calls db.deleteFrom', async () => {
    const db = createMockDb()
    const model = new TestModel(db, 'test_table', { id: 1 })
    await model.deleteRow()
    expect(db.deleteFrom).toHaveBeenCalledWith('test_table', { id: 1 })
  })

  it('deleteRow throws if already deleted', async () => {
    const db = createMockDb()
    const model = new TestModel(db, 'test_table', { id: 1 })
    await model.deleteRow()
    await expect(model.deleteRow()).rejects.toThrow()
  })

  it('readonly model throws on write', async () => {
    const db = createMockDb()
    const model = new TestModel(db, 'test_table', { id: 1 }, true)
    await expect(model.insert()).rejects.toThrow('read only')
  })

  it('detach() makes model readonly and clears db', () => {
    const db = createMockDb()
    const model = new TestModel(db, 'test_table', { id: 1, name: 'test' })
    model.detach()
    expect(model.__data.name).toBe('test')  // read works
  })

  it('detach() prevents writes', async () => {
    const db = createMockDb()
    const model = new TestModel(db, 'test_table', { id: 1 })
    model.detach()
    await expect(model.insert()).rejects.toThrow('detached')
  })
})

describe('Model hooks', () => {
  it('beforeInsert is called', async () => {
    const spy = vi.fn()
    class HookedModel extends TestModel {
      protected async beforeInsert() { spy() }
    }
    const db = createMockDb()
    const model = new HookedModel(db, 'test_table', { id: 1 })
    await model.insert()
    expect(spy).toHaveBeenCalled()
    expect(db.insert).toHaveBeenCalled()
  })

  it('afterInsert receives result', async () => {
    let received: any
    class HookedModel extends TestModel {
      protected async afterInsert(result: EditResult) { received = result }
    }
    const db = createMockDb()
    const model = new HookedModel(db, 'test_table', { id: 1 })
    await model.insert()
    expect(received).toBeInstanceOf(EditResult)
  })

  it('beforeDelete is called before delete', async () => {
    const order: string[] = []
    class HookedModel extends TestModel {
      protected async beforeDelete() { order.push('before') }
      protected async afterDelete() { order.push('after') }
    }
    const db = createMockDb()
    const model = new HookedModel(db, 'test_table', { id: 1 })
    await model.deleteRow()
    expect(order).toEqual(['before', 'after'])
  })
})
```

**Step 2: Implement Model**

Port from `node-db-orm/src/generator/DBAutoGenerator.js` AbstractDbTable class. Key additions:
- `detach()` method: nulls `#db`, sets `#readonly = true`
- Hook methods: empty `protected async` methods that subclasses override
- All write methods call hooks before/after

```typescript
// src/orm/hooks.ts
import { EditResult } from '../core/result/EditResult'

export interface ModelHooks {
  beforeInsert(): Promise<void>
  afterInsert(result: EditResult): Promise<void>
  beforeUpdate(): Promise<void>
  afterUpdate(result: EditResult): Promise<void>
  beforeDelete(): Promise<void>
  afterDelete(result: EditResult): Promise<void>
}
```

**Step 3: Run tests**

Run: `npx vitest run tests/orm/Model.test.ts`
Expected: PASS

---

### Task 12: Generator — codegen engine

**Files:**
- Create: `src/generator/Generator.ts`
- Create: `src/generator/templates/ts.ts`
- Create: `src/generator/templates/js.ts`
- Create: `tests/generator/Generator.test.ts`

**Step 1: Write failing tests**

```typescript
// tests/generator/Generator.test.ts
import { describe, it, expect } from 'vitest'
import { Generator } from '../../src/generator/Generator'
import { Field } from '../../src/orm/Field'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('Generator', () => {
  it('generates BasicXxx.ts file', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orcs-gen-'))
    const modelFile = path.join(tmpDir, 'User.ts')
    fs.writeFileSync(modelFile, '/// AUTO_CODE\nexport class User {}')

    const fields = [
      Field.int('id').primary(),
      Field.string('name').index(),
    ]

    Generator.generate(modelFile, 'User', 'users', fields)

    const basicPath = path.join(tmpDir, 'basic', 'BasicUser.ts')
    expect(fs.existsSync(basicPath)).toBe(true)

    const content = fs.readFileSync(basicPath, 'utf-8')
    expect(content).toContain('class BasicUser')
    expect(content).toContain("tableName = 'users'")
    expect(content).toContain('getId()')
    expect(content).toContain('getName()')
    expect(content).toContain('getById')
    expect(content).toContain('getAllByName')

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('generates .js file for JS source', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orcs-gen-'))
    const modelFile = path.join(tmpDir, 'User.js')
    fs.writeFileSync(modelFile, '/// AUTO_CODE\nclass User {}')

    Generator.generate(modelFile, 'User', 'users', [
      Field.int('id').primary(),
    ])

    const basicPath = path.join(tmpDir, 'basic', 'BasicUser.js')
    expect(fs.existsSync(basicPath)).toBe(true)

    const content = fs.readFileSync(basicPath, 'utf-8')
    expect(content).toContain('class BasicUser')
    expect(content).not.toContain(': number')  // no TS types in JS output

    fs.rmSync(tmpDir, { recursive: true })
  })

  it('define() registers without generating', () => {
    Generator.define('/fake/path/Model.ts', 'Model', 'models', [
      Field.int('id').primary(),
    ])
    const defs = Generator.getDefinitions()
    expect(defs.length).toBeGreaterThan(0)
    expect(defs.find(d => d.name === 'Model')).toBeDefined()

    Generator.clearDefinitions()
  })

  it('generates helpers when configured', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orcs-gen-'))
    const modelFile = path.join(tmpDir, 'Item.ts')
    fs.writeFileSync(modelFile, '/// AUTO_CODE\nexport class Item {}')

    Generator.generate(modelFile, 'Item', 'items', [
      Field.int('id').primary().helpGetCols().helpGetReadOnlyMulti(),
      Field.string('data').helpJson(),
    ])

    const content = fs.readFileSync(path.join(tmpDir, 'basic', 'BasicItem.ts'), 'utf-8')
    expect(content).toContain('getByIdCols')
    expect(content).toContain('getByIdReadOnly')
    expect(content).toContain('getAllByIdReadOnlyMulti')
    expect(content).toContain('getJSONData')

    fs.rmSync(tmpDir, { recursive: true })
  })
})
```

**Step 2: Implement Generator**

Port the code generation logic from `node-db-orm/src/generator/DBAutoGenerator.js` `__cont()` method. Two output templates:
- `templates/ts.ts` — generates TypeScript with interfaces, type annotations
- `templates/js.ts` — generates JavaScript (like current behavior)

Generator detects `.ts` vs `.js` from source file extension and picks template.

**Step 3: Run tests**

Run: `npx vitest run tests/generator/Generator.test.ts`
Expected: PASS

---

### Task 13: Migration system

**Files:**
- Create: `src/migration/Migration.ts`
- Create: `src/migration/Migrator.ts`
- Create: `tests/migration/Migrator.test.ts`

**Step 1: Write Migration base class and Migrator tests**

```typescript
// tests/migration/Migrator.test.ts
import { describe, it, expect, vi } from 'vitest'
import { Migrator } from '../../src/migration/Migrator'
import { Migration } from '../../src/migration/Migration'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('Migrator', () => {
  it('detects pending migrations', async () => {
    // Create temp migration files, mock DB that has no migrations applied
    // Verify pending() returns the list
  })

  it('runs migrations in order', async () => {
    // Mock DB, verify queries executed in file order
  })

  it('records batch in tracking table', async () => {
    // Verify INSERT into orcs_db_migrations with batch number
  })

  it('rollback reverts last batch', async () => {
    // Mock DB with batch 2, verify down() called for batch 2 migrations
  })

  it('creates tracking table if not exists', async () => {
    // Verify CREATE TABLE IF NOT EXISTS on first run
  })
})
```

**Step 2: Implement Migration base class**

```typescript
// src/migration/Migration.ts
import { Connection } from '../core/Connection'

export abstract class Migration {
  abstract up(db: Connection): Promise<void>
  abstract down(db: Connection): Promise<void>
}
```

**Step 3: Implement Migrator**

Key methods:
- `constructor(pool, migrationsDir)`
- `async ensureTable()` — CREATE TABLE IF NOT EXISTS orcs_db_migrations
- `async pending()` — compare files vs applied, return pending list
- `async migrate()` — run all pending in transaction per migration, increment batch
- `async rollback()` — get last batch, run down() for each, remove from tracking table
- `async status()` — return list of all migrations with applied/pending status

**Step 4: Run tests**

Run: `npx vitest run tests/migration/Migrator.test.ts`
Expected: PASS

---

### Task 14: CLI

**Files:**
- Create: `src/cli/index.ts`
- Create: `src/cli/config.ts`

**Step 1: Implement CLI with commander**

```typescript
// src/cli/index.ts
#!/usr/bin/env node
import { Command } from 'commander'
import { loadConfig } from './config'

const program = new Command()

program
  .name('orcs-db')
  .description('orcs-db CLI — generate models and run migrations')
  .version('0.1.0')

program
  .command('generate [file]')
  .description('Generate Basic model classes from field definitions')
  .action(async (file?: string) => {
    // Load all files with Generator.define() calls
    // Or specific file if provided
    // Run generation for each definition
  })

program
  .command('migrate')
  .description('Run pending migrations')
  .action(async () => {
    const config = await loadConfig()
    // Create Pool, create Migrator, run migrate()
  })

program
  .command('migrate:rollback')
  .description('Rollback last migration batch')
  .action(async () => {
    const config = await loadConfig()
    // Create Pool, create Migrator, run rollback()
  })

program
  .command('migrate:status')
  .description('Show migration status')
  .action(async () => {
    const config = await loadConfig()
    // Create Pool, create Migrator, run status(), print table
  })

program
  .command('migrate:create <name>')
  .description('Create a new migration file')
  .action(async (name: string) => {
    // Generate timestamped migration file from template
  })

program.parse()
```

```typescript
// src/cli/config.ts
import * as path from 'path'
import * as fs from 'fs'

export interface OrcDbConfig {
  host: string
  user: string
  password: string
  database: string
  port?: number
  migrationsDir?: string
}

export async function loadConfig(): Promise<OrcDbConfig> {
  const configNames = ['orcs-db.config.ts', 'orcs-db.config.js']
  for (const name of configNames) {
    const configPath = path.resolve(process.cwd(), name)
    if (fs.existsSync(configPath)) {
      const mod = await import(configPath)
      return mod.default ?? mod
    }
  }
  throw new Error('Config file not found: orcs-db.config.ts or orcs-db.config.js')
}
```

**Step 2: Verify build includes CLI**

Run: `npm run build`
Expected: dist/cli/index.js exists with shebang line

---

### Task 15: Final exports and integration verification

**Files:**
- Modify: `src/index.ts`

**Step 1: Add ORM + Generator + Migration exports**

```typescript
// Add to src/index.ts:
export { Model } from './orm/Model'
export { Field, FieldCompiled } from './orm/Field'
export { Generator } from './generator/Generator'
export { Migration } from './migration/Migration'
export { Migrator } from './migration/Migrator'
```

**Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 3: Verify build**

Run: `npm run build`
Expected: Clean build, all .d.ts files generated

**Step 4: Verify types work**

Create a temporary test file and verify IDE autocompletion works for:
- `Pool` constructor config
- `Connection` methods
- `SelectResult<T>` generics
- `Field` builder chain
- `Model` subclass

---

## Task Dependency Order

```
Task 1: Scaffolding (no deps)
  ├── Task 2: Sql (no deps)
  ├── Task 3: Errors (no deps)
  ├── Task 4: EditResult (no deps)
  ├── Task 5: SelectResult (no deps)
  └── Task 6: SqlGenerator (depends: Sql)
       └── Task 7: Connection (depends: SqlGenerator, Sql, results, errors)
            └── Task 8: Pool (depends: Connection)
                 └── Task 9: Core exports + build check
Task 10: Field (no deps on core)
Task 11: Model (depends: Connection, EditResult)
Task 12: Generator (depends: Field, Model)
Task 13: Migration (depends: Connection, Pool)
Task 14: CLI (depends: Generator, Migration)
Task 15: Final exports + integration
```

Tasks 2-5 can run in parallel. Tasks 10-11 can start after Task 7. Tasks 12-13 can run in parallel after Task 11.

# orcs-db — Design Document

## Summary

TypeScript MySQL library combining low-level query builder with ORM code generation. Single npm package `orcs-db`, mysql2 driver only.

Replaces `@destruction-studio/node-common` (db module) and `@destruction-studio/node-db-orm`.

## Decisions

- **Language:** TypeScript
- **Driver:** mysql2 only
- **Package:** single `orcs-db` (no monorepo)
- **Codegen:** dual mode — `Generator.generate()` for JS, `npx orcs-db generate` for TS
- **Error handling:** onError callback optional — present = error swallowed, absent = error thrown

---

## Architecture

```
orcs-db/
├── src/
│   ├── core/
│   │   ├── Pool.ts              # mysql2 pool + execute() + transaction()
│   │   ├── Connection.ts        # query wrapper over mysql2 connection
│   │   ├── SqlGenerator.ts      # SQL string builder
│   │   ├── Sql.ts               # raw SQL marker (escapes auto-quoting)
│   │   ├── result/
│   │   │   ├── SelectResult.ts  # SELECT result wrapper with generics
│   │   │   └── EditResult.ts    # INSERT/UPDATE/DELETE result wrapper
│   │   └── errors/
│   │       ├── DbError.ts
│   │       └── QueryError.ts
│   ├── orm/
│   │   ├── Model.ts             # base class (ex AbstractDbTable)
│   │   ├── Field.ts             # field definition builder
│   │   └── hooks.ts             # hook types
│   ├── generator/
│   │   ├── Generator.ts         # codegen engine
│   │   └── templates/           # JS and TS output templates
│   ├── migration/
│   │   ├── Migrator.ts          # migration runner
│   │   └── templates/           # migration file templates
│   └── cli/
│       └── index.ts             # CLI entry point
├── package.json
├── tsconfig.json
└── orcs-db.config.ts            # example config
```

---

## Core Layer

### Pool

```typescript
const pool = new Pool({
  host: 'localhost',
  user: 'root',
  password: 'secret',
  database: 'mydb',
  connectionLimit: 50,
  port: 3306,
})

// Manual
const db = await pool.getConnection()
try { /* ... */ } finally { db.release() }

// Automatic
await pool.execute(async (db) => { /* ... */ })

// Transaction (auto commit/rollback/release)
await pool.transaction(async (db) => { /* ... */ })

// With error handler
await pool.execute(async (db) => { /* ... */ }, {
  onError: (err) => logger.error(err),
  name: 'operationName',
})

// Stats
pool.stats() // { acquiring, total, free, queued }
```

### Connection

Methods (same API as current DBConnection):
- `select<T>(columns, table, where?, options?)` → `SelectResult<T>`
- `insert(row, table, options?)` → `EditResult`
- `insertMulti(rows, table, options?)` → `EditResult`
- `replace(row, table, options?)` → `EditResult`
- `replaceMulti(rows, table)` → `EditResult`
- `update(columns, table, where, options?)` → `EditResult`
- `deleteFrom(table, where, options?)` → `EditResult`
- `count(table, where?, options?)` → `number`
- `sum(field, table, where?, options?)` → `number`
- `query(sql, bind?)` → raw result
- `sql(raw: string)` → `Sql` instance
- `startTransaction()` / `commit()` / `rollback()`
- `release()` (renamed from `end()`)
- `ping()`

### WHERE syntax (unchanged)

```typescript
{ id: 1 }                          // `id` = '1'
{ field: null }                    // ISNULL(`field`)
{ age: ['>', 18] }                 // `age` > '18'
{ age: ['<', 65] }                 // `age` < '65'
{ age: ['!=', 21] }               // `age` != '21'
{ age: ['>=', 18] }               // `age` >= '18'
{ id: ['IN', [1, 2, 3]] }         // `id` IN('1','2','3')
{ id: ['NOT IN', [1, 2]] }        // `id` NOT IN('1','2')
{ age: ['BETWEEN', 18, 65] }      // `age` BETWEEN '18' AND '65'
{ $key: new Sql('raw expression') } // injected directly
```

### Query options

```typescript
{ limit: 10 }
{ limit: [0, 20] }          // offset, count
{ order: 'id DESC' }
{ group: 'category' }
{ forUpdate: true }
```

### SelectResult<T>

```typescript
result.all()                    // T[]
result.row()                    // T | null
result.field(name)              // value
result.column(name)             // value[]
result.allIndexed(key)          // Record<string, T>
result.columnIndexed(key, col)  // Record<string, value>
result.fields()                 // FieldPacket[]
```

### EditResult

```typescript
result.getInsertId()      // number
result.getAffectedRows()  // number
result.getChangedRows()   // number
```

---

## ORM Layer

### Field definitions

```typescript
Field.int('id').primary().helpGetCols().helpGetReadOnlyMulti()
Field.string('username').index().helpGetCols()
Field.string('email').index()
Field.double('balance')
Field.date('createdAt')
Field.string('profileJson').helpJson()
```

Field types: `int`, `string`, `double`, `date`

Modifiers: `primary()`, `index()`, `helpJson()`, `helpGetCols()`, `helpGetReadOnlyMulti()`

### Generated BasicXxx class

For each model, generates typed interface + class with:
- `UserRow` interface with typed fields
- `BasicUserFields` class with field name getters
- Setters (return `this`, mark touched): `id(value: number)`
- Getters: `getId(): number`
- JSON helpers: `getJSONProfileJson(): object` (lazy parsed, cached)
- Static finders by primary/index: `getById()`, `getAllByEmail()`
- Column-selective: `getByIdCols(db, id, cols?)`
- Read-only: `getByIdReadOnly()`, `getAllByIdReadOnlyMulti()`
- Generic: `getAllByWhere()`, `getFirstByWhere()`
- `static fields()`, `get primaryKeys`, `get row`

### User class (not overwritten)

```typescript
export class User extends BasicUser {
  // custom methods here
}
```

### Model base class

CRUD methods:
- `insert(options?)` → `EditResult`
- `update(options?)` → `EditResult`
- `updateTouched()` → affected rows
- `updateTouchedWhere(where?)` → affected rows
- `updateWhere(where?, options?)` → `EditResult`
- `deleteRow()` → `EditResult`

Touch tracking: setters call `__touch(field)`, `updateTouched()` only updates modified fields.

### Hooks

6 overrideable methods in model class:

```typescript
protected async beforeInsert(): Promise<void>
protected async afterInsert(result: EditResult): Promise<void>
protected async beforeUpdate(): Promise<void>
protected async afterUpdate(result: EditResult): Promise<void>
protected async beforeDelete(): Promise<void>
protected async afterDelete(result: EditResult): Promise<void>
```

Execution: `insert()` calls `beforeInsert()` → `db.insert()` → `afterInsert(result)`.

### Detach

```typescript
user.detach()  // clears db reference, sets readonly
user.getId()       // OK — read works
await user.update() // throws: "Model is detached, cannot perform write operations"
```

Use case: model outlives its connection scope (e.g. returned from pool.execute callback).

---

## Code Generation

### TS projects — CLI

```bash
npx orcs-db generate                   # all models
npx orcs-db generate models/User.ts    # specific model
```

Model file contains `Generator.define(__filename, name, tableName, fields)` which registers (but does not execute) generation. CLI finds definitions and generates `basic/BasicXxx.ts`.

### JS projects — runtime

```javascript
Generator.generate(__filename, 'User', 'users', [...])  // generates on require()
```

Output format matches source file extension: `.ts` → `.ts`, `.js` → `.js`.

### Generated file structure

```
models/
├── User.ts             # define() + custom code
├── basic/
│   └── BasicUser.ts    # auto-generated (overwritten on each generate)
```

---

## Migrations

### File format

```typescript
// migrations/001_create_users.ts
import { Migration } from 'orcs-db'

export default class extends Migration {
  async up(db: Connection): Promise<void> {
    await db.query(`CREATE TABLE users (...)`)
  }
  async down(db: Connection): Promise<void> {
    await db.query('DROP TABLE users')
  }
}
```

### CLI

```bash
npx orcs-db migrate                          # apply pending
npx orcs-db migrate:rollback                 # rollback last batch
npx orcs-db migrate:status                   # show status
npx orcs-db migrate:create add_email_index   # create migration file
```

### Tracking table: `orcs_db_migrations`

| id | name | batch | executed_at |
|----|------|-------|-------------|
| 1 | 001_create_users | 1 | timestamp |

Each `migrate` = new batch. `rollback` reverts last batch. Each migration runs in a transaction.

### Config

```typescript
// orcs-db.config.ts
export default {
  host: 'localhost',
  user: 'root',
  password: 'secret',
  database: 'mydb',
  migrationsDir: './migrations',
}
```

---

## Exports

```typescript
// Main entry
export { Pool } from './core/Pool'
export { Connection } from './core/Connection'
export { Sql } from './core/Sql'
export { SqlGenerator } from './core/SqlGenerator'
export { SelectResult } from './core/result/SelectResult'
export { EditResult } from './core/result/EditResult'
export { DbError } from './core/errors/DbError'
export { QueryError } from './core/errors/QueryError'

export { Model } from './orm/Model'
export { Field } from './orm/Field'
export { Generator } from './generator/Generator'
export { Migration } from './migration/Migrator'
```

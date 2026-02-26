# orcs-db

TypeScript MySQL library with query builder, ORM codegen, and migrations. Built on top of [mysql2](https://github.com/sidorares/node-mysql2).

## Install

```bash
npm install orcs-db
```

## Quick Start

```typescript
import { Pool } from 'orcs-db'

const pool = new Pool({
  host: 'localhost',
  user: 'root',
  password: 'secret',
  database: 'mydb',
})

// Automatic connection management
await pool.execute(async (db) => {
  const result = await db.select('*', 'users', { id: 1 })
  console.log(result.row())
})

// Transactions (auto commit/rollback)
await pool.transaction(async (db) => {
  await db.insert({ name: 'Alice', email: 'alice@example.com' }, 'users')
  await db.update({ balance: 100 }, 'accounts', { userId: 1 })
})

// Error handling with callback
await pool.execute(async (db) => {
  await db.insert({ name: 'Bob' }, 'users')
}, {
  onError: (err) => console.error('Insert failed:', err),
})
```

## Query Builder

### SELECT

```typescript
const result = await db.select('*', 'users', { active: 1 }, { order: 'id DESC', limit: 10 })
result.all()                       // all rows
result.row()                       // first row or null
result.field('name')               // single field value
result.column('name')              // array of values from one column
result.allIndexed('id')            // rows indexed by key
result.columnIndexed('id', 'name') // { id: name } map
```

### INSERT

```typescript
const result = await db.insert({ name: 'Alice', email: 'alice@example.com' }, 'users')
result.getInsertId()
result.getAffectedRows()

// Insert multiple
await db.insertMulti([
  { name: 'Alice', email: 'a@example.com' },
  { name: 'Bob', email: 'b@example.com' },
], 'users')

// Upsert
await db.insert({ id: 1, name: 'Alice' }, 'users', { onDuplicateUpdate: true })
```

### UPDATE / DELETE

```typescript
await db.update({ name: 'Alice Updated' }, 'users', { id: 1 })
await db.deleteFrom('users', { id: 1 })
```

### WHERE Syntax

```typescript
{ id: 1 }                          // `id` = '1'
{ field: null }                     // ISNULL(`field`)
{ age: ['>', 18] }                  // `age` > '18'
{ age: ['>=', 18] }                 // `age` >= '18'
{ age: ['!=', 21] }                 // `age` != '21'
{ id: ['IN', [1, 2, 3]] }          // `id` IN('1','2','3')
{ id: ['NOT IN', [1, 2]] }         // `id` NOT IN('1','2')
{ age: ['BETWEEN', 18, 65] }       // `age` BETWEEN '18' AND '65'
{ $key: new Sql('raw expression') } // raw SQL
```

### Query Options

```typescript
{ limit: 10 }               // LIMIT 10
{ limit: [0, 20] }          // LIMIT 0,20 (offset, count)
{ order: 'id DESC' }        // ORDER BY id DESC
{ group: 'category' }       // GROUP BY `category`
{ forUpdate: true }          // FOR UPDATE
```

### Raw SQL

```typescript
import { Sql } from 'orcs-db'

await db.update({ views: new Sql('`views` + 1') }, 'posts', { id: 1 })
```

## ORM

### Define a Model

```typescript
// models/User.ts
import { Generator, Field } from 'orcs-db'

Generator.define(__filename, 'User', 'users', [
  Field.int('id').primary().helpGetCols().helpGetReadOnlyMulti(),
  Field.string('username').index().helpGetCols(),
  Field.string('email').index(),
  Field.double('balance'),
  Field.date('createdAt'),
  Field.string('profileJson').helpJson(),
])
```

Generate the basic class:

```bash
npx orcs-db generate
```

This creates `models/basic/BasicUser.ts` with typed getters, setters, finders, and helpers. The user class extends it:

```typescript
// models/User.ts (after generation)
import { BasicUser } from './basic/BasicUser'

export class User extends BasicUser {
  // custom methods
}
```

### Using Models

```typescript
await pool.execute(async (db) => {
  // Find by primary key
  const user = await User.getById(db, 1)

  // Update with touch tracking
  user.username('newname')
  await user.updateTouched()  // only updates `username`

  // Create
  const newUser = new User(db)
  newUser.username('alice').email('alice@example.com').balance(100)
  const result = await newUser.insert()

  // Detach for use outside connection scope
  user.detach()
  return user  // safe to use readonly outside pool.execute
})
```

### Hooks

Override in your model class:

```typescript
export class User extends BasicUser {
  async beforeInsert() { /* validation */ }
  async afterInsert(result) { /* audit log */ }
  async beforeUpdate() { /* ... */ }
  async afterUpdate(result) { /* ... */ }
  async beforeDelete() { /* ... */ }
  async afterDelete(result) { /* ... */ }
}
```

## Migrations

### Create a Migration

```bash
npx orcs-db migrate:create create_users
```

```typescript
// migrations/001_create_users.ts
import { Migration, Connection } from 'orcs-db'

export default class extends Migration {
  async up(db: Connection) {
    await db.query(`
      CREATE TABLE users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL
      )
    `)
  }

  async down(db: Connection) {
    await db.query('DROP TABLE users')
  }
}
```

### CLI Commands

```bash
npx orcs-db migrate            # apply pending migrations
npx orcs-db migrate:rollback   # rollback last batch
npx orcs-db migrate:status     # show migration status
```

### Config

Create `orcs-db.config.ts` (or `.js` / `.json`):

```typescript
export default {
  host: 'localhost',
  user: 'root',
  password: 'secret',
  database: 'mydb',
  migrationsDir: './migrations',
}
```

## License

MIT

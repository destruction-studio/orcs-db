import * as fs from 'fs'
import * as path from 'path'
import { Connection } from '../core/Connection'
import { Pool, PoolConfig } from '../core/Pool'
import { Migration } from './Migration'

export interface MigrationStatus {
  name: string
  applied: boolean
  batch: number | null
  executedAt: Date | null
  database: string | null
}

export class Migrator {
  #pool: Pool
  #migrationsDir: string
  #databases: Record<string, PoolConfig>
  #pools: Map<string, Pool> = new Map()
  static readonly TABLE_NAME = 'orcs_db_migrations'

  constructor(pool: Pool, migrationsDir: string, databases?: Record<string, PoolConfig>) {
    this.#pool = pool
    this.#migrationsDir = migrationsDir
    this.#databases = databases ?? {}
  }

  #getPool(name?: string): Pool {
    if (!name) return this.#pool
    const existing = this.#pools.get(name)
    if (existing) return existing
    const config = this.#databases[name]
    if (!config) {
      throw new Error(`Unknown database "${name}" in migration. Add it to databases config.`)
    }
    const pool = new Pool(config)
    this.#pools.set(name, pool)
    return pool
  }

  #loadMigration(file: string): Migration {
    const migrationPath = path.resolve(this.#migrationsDir, file)
    const mod = require(migrationPath)
    const MigrationClass = mod.default ?? mod
    return new MigrationClass()
  }

  async endAll(): Promise<void> {
    const pools = [...this.#pools.values()]
    this.#pools.clear()
    await Promise.all(pools.map(p => p.end()))
  }

  async ensureTable(db: Connection): Promise<void> {
    await db.query(`
      CREATE TABLE IF NOT EXISTS ${Migrator.TABLE_NAME} (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        batch INT NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`database\` VARCHAR(255) NULL
      )
    `)
    await db.query(`
      ALTER TABLE ${Migrator.TABLE_NAME}
      ADD COLUMN IF NOT EXISTS \`database\` VARCHAR(255) NULL
    `)
  }

  async getApplied(db: Connection): Promise<Array<{ name: string; batch: number; database: string | null }>> {
    const result = await db.select(['name', 'batch', 'database'], Migrator.TABLE_NAME, {}, { order: 'id ASC' })
    return result.all() as any
  }

  getAvailable(): string[] {
    if (!fs.existsSync(this.#migrationsDir)) return []
    return fs.readdirSync(this.#migrationsDir)
      .filter(f => f.endsWith('.ts') || f.endsWith('.js'))
      .sort()
  }

  async pending(): Promise<string[]> {
    return await this.#pool.execute(async (db) => {
      await this.ensureTable(db)
      const applied = await this.getApplied(db)
      const appliedNames = new Set(applied.map(a => a.name))
      return this.getAvailable().filter(f => !appliedNames.has(this.migrationName(f)))
    }) as string[]
  }

  async migrate(): Promise<string[]> {
    const pendingFiles = await this.pending()
    if (pendingFiles.length === 0) return []

    // Preflight: load all migrations and validate database names
    const loaded = pendingFiles.map(file => ({
      file,
      migration: this.#loadMigration(file),
    }))

    const invalidDatabases = loaded
      .map(l => l.migration.database())
      .filter((db): db is string => db !== undefined && !(db in this.#databases))

    if (invalidDatabases.length > 0) {
      const unique = [...new Set(invalidDatabases)]
      throw new Error(
        `Unknown database ${unique.map(d => `"${d}"`).join(', ')} in migration. Add to databases config.`
      )
    }

    // Determine next batch number on master
    const batch = await this.#pool.execute(async (db) => {
      await this.ensureTable(db)
      const lastBatch = (await db.select(
        [db.sql('MAX(batch)') as any],
        Migrator.TABLE_NAME
      )).field() ?? 0
      return (lastBatch as number) + 1
    }) as number

    const applied: string[] = []

    for (const { file, migration } of loaded) {
      const dbName = migration.database()

      if (!dbName) {
        // Master DB: up() + tracking in single transaction
        await this.#pool.execute(async (db) => {
          await db.startTransaction()
          try {
            await migration.up(db)
            await db.insert({
              name: this.migrationName(file),
              batch,
              database: null,
            }, Migrator.TABLE_NAME)
            await db.commit()
          } catch (err) {
            await db.rollback()
            throw err
          }
        })
      } else {
        // Secondary DB: separate pools, no cross-DB atomicity
        const targetPool = this.#getPool(dbName)

        await targetPool.execute(async (db) => {
          await migration.up(db)
        })

        await this.#pool.execute(async (db) => {
          await db.insert({
            name: this.migrationName(file),
            batch,
            database: dbName,
          }, Migrator.TABLE_NAME)
        })
      }

      applied.push(file)
    }

    return applied
  }

  async rollback(): Promise<string[]> {
    const rolledBack: string[] = []

    const migrations = await this.#pool.execute(async (db) => {
      await this.ensureTable(db)

      const lastBatch = (await db.select(
        [db.sql('MAX(batch)') as any],
        Migrator.TABLE_NAME
      )).field()
      if (!lastBatch) return []

      const result = await db.select(
        ['name', 'database'],
        Migrator.TABLE_NAME,
        { batch: lastBatch },
        { order: 'id DESC' }
      )
      return result.all() as Array<{ name: string; database: string | null }>
    }) as Array<{ name: string; database: string | null }>

    if (!migrations || migrations.length === 0) return []

    // Preflight: validate all database names before rolling back
    const toRollback = migrations
      .map(row => {
        const file = this.findFile(row.name)
        if (!file) return null
        const migration = this.#loadMigration(file)
        // NULL = pre-upgrade record, always master
        const dbName = row.database ?? undefined
        return { name: row.name, file, migration, dbName }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    const invalidDatabases = toRollback
      .map(r => r.dbName)
      .filter((db): db is string => db !== undefined && !(db in this.#databases))

    if (invalidDatabases.length > 0) {
      const unique = [...new Set(invalidDatabases)]
      throw new Error(
        `Unknown database ${unique.map(d => `"${d}"`).join(', ')} in migration. Add to databases config.`
      )
    }

    for (const { name, migration, dbName } of toRollback) {
      if (!dbName) {
        // Master DB: down() + tracking delete in single transaction
        await this.#pool.execute(async (db) => {
          await db.startTransaction()
          try {
            await migration.down(db)
            await db.deleteFrom(Migrator.TABLE_NAME, { name })
            await db.commit()
          } catch (err) {
            await db.rollback()
            throw err
          }
        })
      } else {
        // Secondary DB: separate pools
        const targetPool = this.#getPool(dbName)

        await targetPool.execute(async (db) => {
          await migration.down(db)
        })

        await this.#pool.execute(async (db) => {
          await db.deleteFrom(Migrator.TABLE_NAME, { name })
        })
      }

      rolledBack.push(name)
    }

    return rolledBack
  }

  async status(): Promise<MigrationStatus[]> {
    return await this.#pool.execute(async (db) => {
      await this.ensureTable(db)
      const applied = await this.getApplied(db)
      const appliedMap = new Map(applied.map(a => [a.name, a]))
      const available = this.getAvailable()

      return available.map(file => {
        const name = this.migrationName(file)
        const record = appliedMap.get(name)

        let database: string | null = null
        if (record) {
          database = record.database ?? null
        } else {
          try {
            const migration = this.#loadMigration(file)
            database = migration.database() ?? null
          } catch {}
        }

        return {
          name,
          applied: !!record,
          batch: record?.batch ?? null,
          executedAt: null,
          database,
        }
      })
    }) as MigrationStatus[]
  }

  migrationName(file: string): string {
    return file.replace(/\.(ts|js)$/, '')
  }

  findFile(name: string): string | null {
    const available = this.getAvailable()
    return available.find(f => this.migrationName(f) === name) ?? null
  }
}

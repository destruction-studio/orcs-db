import * as fs from 'fs'
import * as path from 'path'
import { Connection } from '../core/Connection'
import { Pool } from '../core/Pool'

export interface MigrationStatus {
  name: string
  applied: boolean
  batch: number | null
  executedAt: Date | null
}

export class Migrator {
  #pool: Pool
  #migrationsDir: string
  static readonly TABLE_NAME = 'orcs_db_migrations'

  constructor(pool: Pool, migrationsDir: string) {
    this.#pool = pool
    this.#migrationsDir = migrationsDir
  }

  async ensureTable(db: Connection): Promise<void> {
    await db.query(`
      CREATE TABLE IF NOT EXISTS ${Migrator.TABLE_NAME} (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        batch INT NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
  }

  async getApplied(db: Connection): Promise<Array<{ name: string; batch: number }>> {
    const result = await db.select(['name', 'batch'], Migrator.TABLE_NAME, {}, { order: 'id ASC' })
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

    const applied: string[] = []
    await this.#pool.execute(async (db) => {
      await this.ensureTable(db)

      // Determine next batch number
      const lastBatch = (await db.select(
        [db.sql('MAX(batch)') as any],
        Migrator.TABLE_NAME
      )).field() ?? 0
      const batch = (lastBatch as number) + 1

      for (const file of pendingFiles) {
        const migrationPath = path.resolve(this.#migrationsDir, file)
        const mod = require(migrationPath)
        const MigrationClass = mod.default ?? mod
        const migration = new MigrationClass()

        await db.startTransaction()
        try {
          await migration.up(db)
          await db.insert({
            name: this.migrationName(file),
            batch,
          }, Migrator.TABLE_NAME)
          await db.commit()
          applied.push(file)
        } catch (err) {
          await db.rollback()
          throw err
        }
      }
    })

    return applied
  }

  async rollback(): Promise<string[]> {
    const rolledBack: string[] = []

    await this.#pool.execute(async (db) => {
      await this.ensureTable(db)

      const lastBatch = (await db.select(
        [db.sql('MAX(batch)') as any],
        Migrator.TABLE_NAME
      )).field()
      if (!lastBatch) return

      const result = await db.select(
        ['name'],
        Migrator.TABLE_NAME,
        { batch: lastBatch },
        { order: 'id DESC' }
      )
      const migrations = result.all()

      for (const row of migrations) {
        const name = (row as any).name
        const file = this.findFile(name)
        if (!file) continue

        const migrationPath = path.resolve(this.#migrationsDir, file)
        const mod = require(migrationPath)
        const MigrationClass = mod.default ?? mod
        const migration = new MigrationClass()

        await db.startTransaction()
        try {
          await migration.down(db)
          await db.deleteFrom(Migrator.TABLE_NAME, { name })
          await db.commit()
          rolledBack.push(name)
        } catch (err) {
          await db.rollback()
          throw err
        }
      }
    })

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
        return {
          name,
          applied: !!record,
          batch: record?.batch ?? null,
          executedAt: null,
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

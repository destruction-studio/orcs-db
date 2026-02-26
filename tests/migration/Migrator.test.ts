import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Migrator } from '../../src/migration/Migrator'
import { Migration } from '../../src/migration/Migration'
import { Pool } from '../../src/core/Pool'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('Migration base class', () => {
  it('requires up and down methods', () => {
    // Abstract class is defined and can be extended
    expect(Migration).toBeDefined()

    class TestMigration extends Migration {
      async up() {}
      async down() {}
    }

    const m = new TestMigration()
    expect(m).toBeInstanceOf(Migration)
    expect(typeof m.up).toBe('function')
    expect(typeof m.down).toBe('function')
  })
})

describe('Migrator', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orcs-migrate-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('constructor accepts pool and directory', () => {
    const pool = new Pool({ host: 'localhost', user: 'test', password: '', database: 'test' })
    const migrator = new Migrator(pool, tmpDir)
    expect(migrator).toBeInstanceOf(Migrator)
  })

  it('getAvailable returns sorted migration files', () => {
    fs.writeFileSync(path.join(tmpDir, '002_add_email.ts'), '')
    fs.writeFileSync(path.join(tmpDir, '001_create_users.ts'), '')
    fs.writeFileSync(path.join(tmpDir, '003_add_index.js'), '')
    fs.writeFileSync(path.join(tmpDir, 'readme.md'), '')

    const pool = new Pool({ host: 'localhost', user: 'test', password: '', database: 'test' })
    const migrator = new Migrator(pool, tmpDir)
    const available = migrator.getAvailable()

    expect(available).toEqual([
      '001_create_users.ts',
      '002_add_email.ts',
      '003_add_index.js',
    ])
  })

  it('getAvailable returns empty for non-existent directory', () => {
    const pool = new Pool({ host: 'localhost', user: 'test', password: '', database: 'test' })
    const migrator = new Migrator(pool, '/nonexistent/path')
    expect(migrator.getAvailable()).toEqual([])
  })

  it('migrationName strips extension', () => {
    const pool = new Pool({ host: 'localhost', user: 'test', password: '', database: 'test' })
    const migrator = new Migrator(pool, tmpDir)
    expect(migrator.migrationName('001_create_users.ts')).toBe('001_create_users')
    expect(migrator.migrationName('002_add_email.js')).toBe('002_add_email')
  })

  it('findFile matches name to available file', () => {
    fs.writeFileSync(path.join(tmpDir, '001_create_users.ts'), '')
    fs.writeFileSync(path.join(tmpDir, '002_add_email.ts'), '')

    const pool = new Pool({ host: 'localhost', user: 'test', password: '', database: 'test' })
    const migrator = new Migrator(pool, tmpDir)

    expect(migrator.findFile('001_create_users')).toBe('001_create_users.ts')
    expect(migrator.findFile('nonexistent')).toBeNull()
  })

  it('TABLE_NAME is orcs_db_migrations', () => {
    expect(Migrator.TABLE_NAME).toBe('orcs_db_migrations')
  })
})

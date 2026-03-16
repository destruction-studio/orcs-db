import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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

  it('database() returns undefined by default', () => {
    class TestMigration extends Migration {
      async up() {}
      async down() {}
    }
    const m = new TestMigration()
    expect(m.database()).toBeUndefined()
  })

  it('database() can be overridden', () => {
    class TestMigration extends Migration {
      database() { return 'statQueue' }
      async up() {}
      async down() {}
    }
    const m = new TestMigration()
    expect(m.database()).toBe('statQueue')
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

  it('constructor accepts optional databases config', () => {
    const pool = new Pool({ host: 'localhost', user: 'test', password: '', database: 'test' })
    const databases = {
      statQueue: { host: 'localhost', user: 'test', password: '', database: 'stat_queue' }
    }
    const migrator = new Migrator(pool, tmpDir, databases)
    expect(migrator).toBeInstanceOf(Migrator)
  })

  it('endAll() resolves even with no secondary pools', async () => {
    const pool = new Pool({ host: 'localhost', user: 'test', password: '', database: 'test' })
    const migrator = new Migrator(pool, tmpDir)
    await migrator.endAll()
  })

  it('ensureTable creates table with database column', async () => {
    const pool = new Pool({ host: 'localhost', user: 'test', password: '', database: 'test' })
    const queries: string[] = []
    const mockDb = {
      query: vi.fn((sql: string) => { queries.push(sql) }),
    }

    const migrator = new Migrator(pool, tmpDir)
    await migrator.ensureTable(mockDb as any)

    expect(queries).toHaveLength(2)
    expect(queries[0]).toContain('CREATE TABLE IF NOT EXISTS')
    expect(queries[0]).toContain('database')
    expect(queries[1]).toContain('ADD COLUMN')
    expect(queries[1]).toContain('database')
  })

  it('migrate() throws for unknown database before executing any migration', async () => {
    const migration1 = `
      class M {
        database() { return undefined }
        async up(db) {}
        async down(db) {}
      }
      module.exports = M
    `
    const migration2 = `
      class M {
        database() { return 'unknownDb' }
        async up(db) {}
        async down(db) {}
      }
      module.exports = M
    `
    fs.writeFileSync(path.join(tmpDir, '001_first.js'), migration1)
    fs.writeFileSync(path.join(tmpDir, '002_second.js'), migration2)

    const pool = new Pool({ host: 'localhost', user: 'test', password: '', database: 'test' })

    const mockExecute = vi.fn().mockImplementation(async (cb) => {
      const mockDb = {
        query: vi.fn(),
        select: vi.fn().mockResolvedValue({ all: () => [], field: () => 0 }),
        insert: vi.fn(),
        sql: vi.fn((s: string) => s),
      }
      return cb(mockDb as any)
    })
    ;(pool as any).execute = mockExecute

    const migrator = new Migrator(pool, tmpDir)
    await expect(migrator.migrate()).rejects.toThrow('Unknown database "unknownDb"')
    await migrator.endAll()
  })

  it('rollback() throws for migration with unknown database', async () => {
    const migrationCode = `
      class TestMig {
        database() { return 'unknownDb' }
        async up(db) {}
        async down(db) {}
      }
      module.exports = TestMig
    `
    fs.writeFileSync(path.join(tmpDir, '001_test.js'), migrationCode)

    const pool = new Pool({ host: 'localhost', user: 'test', password: '', database: 'test' })

    const mockExecute = vi.fn().mockImplementationOnce(async (cb) => {
      const mockDb = {
        query: vi.fn(),
        select: vi.fn()
          .mockResolvedValueOnce({ field: () => 1 })
          .mockResolvedValueOnce({ all: () => [{ name: '001_test', database: 'unknownDb' }] }),
        deleteFrom: vi.fn(),
        sql: vi.fn((s: string) => s),
      }
      return cb(mockDb as any)
    })
    ;(pool as any).execute = mockExecute

    const migrator = new Migrator(pool, tmpDir)
    await expect(migrator.rollback()).rejects.toThrow('Unknown database "unknownDb"')
    await migrator.endAll()
  })

  it('status() returns database field for pending migration', async () => {
    const migrationCode = `
      class M {
        database() { return 'statQueue' }
        async up(db) {}
        async down(db) {}
      }
      module.exports = M
    `
    fs.writeFileSync(path.join(tmpDir, '001_test.js'), migrationCode)

    const pool = new Pool({ host: 'localhost', user: 'test', password: '', database: 'test' })

    const mockExecute = vi.fn().mockImplementationOnce(async (cb) => {
      const mockDb = {
        query: vi.fn(),
        select: vi.fn().mockResolvedValue({ all: () => [] }),
      }
      return cb(mockDb as any)
    })
    ;(pool as any).execute = mockExecute

    const migrator = new Migrator(pool, tmpDir, {
      statQueue: { host: 'localhost', user: 'test', password: '', database: 'sq' }
    })
    const statuses = await migrator.status()

    expect(statuses).toHaveLength(1)
    expect(statuses[0].database).toBe('statQueue')
    expect(statuses[0].name).toBe('001_test')
    expect(statuses[0].applied).toBe(false)
    await migrator.endAll()
  })
})

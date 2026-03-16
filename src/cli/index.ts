#!/usr/bin/env node

import { Command } from 'commander'
import * as path from 'path'
import * as fs from 'fs'
import { Generator } from 'orcs-db'
import type { PoolConfig } from 'orcs-db'

const program = new Command()

program
  .name('orcs-db')
  .description('orcs-db CLI — generate models and run migrations')
  .version('0.1.0')

program
  .command('generate [file]')
  .description('Generate Basic model classes from field definitions')
  .action(async (file?: string) => {
    try {
      if (file) {
        const fullPath = path.resolve(file)
        if (!fs.existsSync(fullPath)) {
          console.error(`File not found: ${fullPath}`)
          process.exit(1)
        }
        // Uncomment any previously commented-out define blocks
        Generator.uncommentDefines(fullPath)
        // Load file — user code calls Generator.define() on the same instance
        const ext = path.extname(fullPath)
        if (ext === '.mjs' || (ext === '.js' && isESMProject(fullPath))) {
          await import(fullPath)
        } else {
          require(fullPath)
        }
        const defs = Generator.getDefinitions()
        if (defs.length === 0) {
          console.error('No model definitions found in file. Make sure it calls Generator.define().')
          process.exit(1)
        }
        // generateAll() will also comment out defines after generation
        Generator.generateAll()
        console.log(`Generated ${defs.length} model(s) from ${file}`)
      } else {
        console.log('Scanning for model definitions...')
        const defs = Generator.getDefinitions()
        if (defs.length === 0) {
          console.log('No model definitions registered. Use: orcs-db generate <file>')
          return
        }
        Generator.generateAll()
        console.log(`Generated ${defs.length} model(s)`)
      }
    } catch (err) {
      console.error('Generation failed:', (err as Error).message)
      process.exit(1)
    }
  })

program
  .command('migrate')
  .description('Run pending migrations')
  .action(async () => {
    let pool: any, migrator: any
    try {
      const config = await loadConfig()
      const { Pool, Migrator } = require('orcs-db')

      pool = new Pool(config)
      migrator = new Migrator(pool, config.migrationsDir || './migrations', config.databases)

      const applied = await migrator.migrate()
      if (applied.length === 0) {
        console.log('Nothing to migrate.')
      } else {
        console.log(`Applied ${applied.length} migration(s):`)
        applied.forEach((name: string) => console.log(`  ✓ ${name}`))
      }
    } catch (err) {
      console.error('Migration failed:', (err as Error).message)
      process.exitCode = 1
    } finally {
      if (migrator) await migrator.endAll()
      if (pool) await pool.end()
    }
  })

program
  .command('migrate:rollback')
  .description('Rollback last migration batch')
  .action(async () => {
    let pool: any, migrator: any
    try {
      const config = await loadConfig()
      const { Pool, Migrator } = require('orcs-db')

      pool = new Pool(config)
      migrator = new Migrator(pool, config.migrationsDir || './migrations', config.databases)

      const rolledBack = await migrator.rollback()
      if (rolledBack.length === 0) {
        console.log('Nothing to rollback.')
      } else {
        console.log(`Rolled back ${rolledBack.length} migration(s):`)
        rolledBack.forEach((name: string) => console.log(`  ✗ ${name}`))
      }
    } catch (err) {
      console.error('Rollback failed:', (err as Error).message)
      process.exitCode = 1
    } finally {
      if (migrator) await migrator.endAll()
      if (pool) await pool.end()
    }
  })

program
  .command('migrate:status')
  .description('Show migration status')
  .action(async () => {
    let pool: any, migrator: any
    try {
      const config = await loadConfig()
      const { Pool, Migrator } = require('orcs-db')

      pool = new Pool(config)
      migrator = new Migrator(pool, config.migrationsDir || './migrations', config.databases)

      const statuses = await migrator.status()
      if (statuses.length === 0) {
        console.log('No migrations found.')
      } else {
        console.log('Migration status:')
        statuses.forEach((s: any) => {
          const status = s.applied ? `✓ (batch ${s.batch})` : '✗ pending  '
          const db = s.database ? ` [${s.database}]` : ''
          console.log(`  ${status}${db}  ${s.name}`)
        })
      }
    } catch (err) {
      console.error('Status check failed:', (err as Error).message)
      process.exitCode = 1
    } finally {
      if (migrator) await migrator.endAll()
      if (pool) await pool.end()
    }
  })

program
  .command('migrate:create <name>')
  .description('Create a new migration file')
  .option('-d, --dir <dir>', 'Migrations directory', './migrations')
  .option('--database <name>', 'Target database name (from databases config)')
  .action(async (name: string, opts: any) => {
    try {
      const dir = path.resolve(opts.dir)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
      const fileName = `${timestamp}_${name}.ts`
      const filePath = path.join(dir, fileName)

      if (opts.database && !/^[a-zA-Z0-9_]+$/.test(opts.database)) {
        console.error('Invalid database name. Use only letters, numbers, and underscores.')
        process.exitCode = 1
        return
      }

      const databaseMethod = opts.database
        ? `\n  database() { return '${opts.database}' }\n`
        : ''

      const template = `import { Migration } from 'orcs-db'
import type { Connection } from 'orcs-db'

export default class extends Migration {${databaseMethod}
  async up(db: Connection): Promise<void> {
    // await db.query(\`\`)
  }

  async down(db: Connection): Promise<void> {
    // await db.query(\`\`)
  }
}
`

      fs.writeFileSync(filePath, template)
      console.log(`Created migration: ${fileName}`)
    } catch (err) {
      console.error('Failed to create migration:', (err as Error).message)
      process.exit(1)
    }
  })

interface OrcDbConfig {
  host: string
  user: string
  password: string
  database: string
  port?: number
  migrationsDir?: string
  databases?: Record<string, PoolConfig>
}

function isESMProject(filePath: string): boolean {
  let dir = path.dirname(path.resolve(filePath))
  while (true) {
    const pkgPath = path.join(dir, 'package.json')
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
        return pkg.type === 'module'
      } catch {
        return false
      }
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return false
}

async function loadConfig(): Promise<OrcDbConfig> {
  const configNames = ['orcs-db.config.ts', 'orcs-db.config.js', 'orcs-db.config.json']
  for (const name of configNames) {
    const configPath = path.resolve(process.cwd(), name)
    if (fs.existsSync(configPath)) {
      if (name.endsWith('.json')) {
        return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      }
      const mod = require(configPath)
      return mod.default ?? mod
    }
  }
  throw new Error('Config file not found. Create orcs-db.config.ts, orcs-db.config.js, or orcs-db.config.json')
}

program.parse()

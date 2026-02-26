#!/usr/bin/env node

import { Command } from 'commander'
import * as path from 'path'
import * as fs from 'fs'

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
        // Generate specific file
        const fullPath = path.resolve(file)
        if (!fs.existsSync(fullPath)) {
          console.error(`File not found: ${fullPath}`)
          process.exit(1)
        }
        // Load the file to trigger Generator.define() calls
        require(fullPath)
        const { Generator } = require('../generator/Generator')
        const defs = Generator.getDefinitions()
        if (defs.length === 0) {
          console.error('No model definitions found in file. Make sure it calls Generator.define().')
          process.exit(1)
        }
        Generator.generateAll()
        console.log(`Generated ${defs.length} model(s) from ${file}`)
      } else {
        // Process any already-registered definitions
        console.log('Scanning for model definitions...')
        const { Generator } = require('../generator/Generator')
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
    try {
      const config = await loadConfig()
      const { Pool } = require('../core/Pool')
      const { Migrator } = require('../migration/Migrator')

      const pool = new Pool(config)
      const migrator = new Migrator(pool, config.migrationsDir || './migrations')

      const applied = await migrator.migrate()
      if (applied.length === 0) {
        console.log('Nothing to migrate.')
      } else {
        console.log(`Applied ${applied.length} migration(s):`)
        applied.forEach((name: string) => console.log(`  ✓ ${name}`))
      }
      await pool.end()
    } catch (err) {
      console.error('Migration failed:', (err as Error).message)
      process.exit(1)
    }
  })

program
  .command('migrate:rollback')
  .description('Rollback last migration batch')
  .action(async () => {
    try {
      const config = await loadConfig()
      const { Pool } = require('../core/Pool')
      const { Migrator } = require('../migration/Migrator')

      const pool = new Pool(config)
      const migrator = new Migrator(pool, config.migrationsDir || './migrations')

      const rolledBack = await migrator.rollback()
      if (rolledBack.length === 0) {
        console.log('Nothing to rollback.')
      } else {
        console.log(`Rolled back ${rolledBack.length} migration(s):`)
        rolledBack.forEach((name: string) => console.log(`  ✗ ${name}`))
      }
      await pool.end()
    } catch (err) {
      console.error('Rollback failed:', (err as Error).message)
      process.exit(1)
    }
  })

program
  .command('migrate:status')
  .description('Show migration status')
  .action(async () => {
    try {
      const config = await loadConfig()
      const { Pool } = require('../core/Pool')
      const { Migrator } = require('../migration/Migrator')

      const pool = new Pool(config)
      const migrator = new Migrator(pool, config.migrationsDir || './migrations')

      const statuses = await migrator.status()
      if (statuses.length === 0) {
        console.log('No migrations found.')
      } else {
        console.log('Migration status:')
        statuses.forEach((s: any) => {
          const status = s.applied ? `✓ (batch ${s.batch})` : '✗ pending'
          console.log(`  ${status}  ${s.name}`)
        })
      }
      await pool.end()
    } catch (err) {
      console.error('Status check failed:', (err as Error).message)
      process.exit(1)
    }
  })

program
  .command('migrate:create <name>')
  .description('Create a new migration file')
  .option('-d, --dir <dir>', 'Migrations directory', './migrations')
  .action(async (name: string, opts: any) => {
    try {
      const dir = path.resolve(opts.dir)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      // Timestamp-based prefix: YYYYMMDDHHmmss
      const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
      const fileName = `${timestamp}_${name}.ts`
      const filePath = path.join(dir, fileName)

      const template = `import { Migration } from 'orcs-db'
import type { Connection } from 'orcs-db'

export default class extends Migration {
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

import { Field, FieldCompiled } from '../orm/Field'
import * as fs from 'fs'
import * as path from 'path'

interface Definition {
  file: string
  name: string
  dbName: string
  fields: Field[]
}

function ucfirst(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function mapFieldType(type: string): string {
  return type
}

function generateTS(name: string, dbName: string, compiledFields: FieldCompiled[]): string {
  const basicName = `Basic${name}`
  const fieldsClassName = `${basicName}Fields`
  const rowName = `${name}Row`

  const primaryFields = compiledFields.filter(f => f.isPrimary())
  const indexFields = compiledFields.filter(f => f.isIndex())
  const hasCompositePrimary = primaryFields.length > 1

  const lines: string[] = []

  // Imports
  lines.push(`import { Model } from 'orcs-db'`)
  lines.push(`import type { Connection } from 'orcs-db'`)
  lines.push('')

  // Row interface
  lines.push(`export interface ${rowName} {`)
  for (const f of compiledFields) {
    lines.push(`  ${f.getName()}: ${mapFieldType(f.getType())}`)
  }
  lines.push('}')
  lines.push('')

  // Fields class
  lines.push(`class ${fieldsClassName} {`)
  for (const f of compiledFields) {
    lines.push(`  ${f.getName()} = () => '${f.getName()}' as const`)
  }
  lines.push('}')
  lines.push('')

  // Basic class
  lines.push(`export class ${basicName} extends Model {`)
  lines.push(`  static readonly tableName = '${dbName}'`)
  lines.push('')

  // Constructor
  lines.push(`  constructor(db: Connection | null, data: Partial<${rowName}> = {}, readonly: boolean = false) {`)
  lines.push(`    super(db, '${dbName}', data, readonly)`)
  lines.push('  }')
  lines.push('')

  // Row getter
  lines.push(`  get row(): ${rowName} {`)
  lines.push(`    return { ...this.__data } as ${rowName}`)
  lines.push('  }')
  lines.push('')

  // Per-field: setter and getter
  for (const f of compiledFields) {
    const fieldName = f.getName()
    const fieldType = mapFieldType(f.getType())
    lines.push(`  ${fieldName}(value: ${fieldType}): this { this.__data.${fieldName} = value; this.__touch('${fieldName}'); return this }`)
    lines.push(`  get${ucfirst(fieldName)}(): ${fieldType} { return this.__data.${fieldName} }`)
    lines.push('')
  }

  // Static factories
  for (const f of compiledFields) {
    const fieldName = f.getName()
    const fieldType = mapFieldType(f.getType())
    // Avoid collision with reserved keywords by appending "Field" for certain names
    const staticName = isReservedStaticName(fieldName) ? `${fieldName}Field` : fieldName
    lines.push(`  static ${staticName}(db: Connection, value: ${fieldType}): ${basicName} {`)
    lines.push(`    const r = new this(db, {})`)
    lines.push(`    return r.${fieldName}(value) as ${basicName}`)
    lines.push('  }')
    lines.push('')
  }

  // Primary keys getter
  lines.push(`  get primaryKeys(): string[] { return [${primaryFields.map(f => `'${f.getName()}'`).join(', ')}] }`)
  lines.push('')

  // Finders for primary fields
  for (const f of primaryFields) {
    const fieldName = f.getName()
    const fieldType = mapFieldType(f.getType())
    lines.push(`  static async getBy${ucfirst(fieldName)}(db: Connection, ${fieldName}: ${fieldType}): Promise<${basicName} | null> {`)
    lines.push(`    const row = (await db.select('*', this.tableName, { ${fieldName} })).row()`)
    lines.push(`    if (!row) return null`)
    lines.push(`    return new this(db, row)`)
    lines.push('  }')
    lines.push('')
  }

  // Finders for index fields
  for (const f of indexFields) {
    const fieldName = f.getName()
    const fieldType = mapFieldType(f.getType())
    lines.push(`  static async getBy${ucfirst(fieldName)}(db: Connection, ${fieldName}: ${fieldType}): Promise<${basicName} | null> {`)
    lines.push(`    const row = (await db.select('*', this.tableName, { ${fieldName} })).row()`)
    lines.push(`    if (!row) return null`)
    lines.push(`    return new this(db, row)`)
    lines.push('  }')
    lines.push('')
  }

  // helpGetCols for applicable fields
  for (const f of compiledFields) {
    if (!f.hasHelpGetCols()) continue
    const fieldName = f.getName()
    const fieldType = mapFieldType(f.getType())
    lines.push(`  static async getBy${ucfirst(fieldName)}Cols(db: Connection, ${fieldName}: ${fieldType}, columns: string[] = ['*']): Promise<${rowName} | null> {`)
    lines.push(`    return (await db.select(columns, this.tableName, { ${fieldName} })).row()`)
    lines.push('  }')
    lines.push(`  static async getAllBy${ucfirst(fieldName)}Cols(db: Connection, ${fieldName}: ${fieldType}, columns: string[] = ['*'], options: any = {}): Promise<${rowName}[]> {`)
    lines.push(`    return (await db.select(columns, this.tableName, { ${fieldName} }, options)).all()`)
    lines.push('  }')
    lines.push('')
  }

  // helpGetReadOnlyMulti for applicable fields
  for (const f of compiledFields) {
    if (!f.hasHelpGetReadOnlyMulti()) continue
    const fieldName = f.getName()
    const fieldType = mapFieldType(f.getType())
    lines.push(`  static async getBy${ucfirst(fieldName)}ReadOnly(db: Connection, ${fieldName}: ${fieldType}): Promise<${basicName} | null> {`)
    lines.push(`    const row = (await db.select('*', this.tableName, { ${fieldName} })).row()`)
    lines.push(`    if (!row) return null`)
    lines.push(`    return new this(db, row, true)`)
    lines.push('  }')
    lines.push(`  static async getAllBy${ucfirst(fieldName)}ReadOnlyMulti(db: Connection, ${fieldName}: ${fieldType}, options: any = {}): Promise<${basicName}[]> {`)
    lines.push(`    const rows = (await db.select('*', this.tableName, { ${fieldName} }, options)).all()`)
    lines.push(`    return rows.map((row: any) => new this(db, row, true))`)
    lines.push('  }')
    lines.push('')
  }

  // helpJson for applicable fields
  for (const f of compiledFields) {
    if (!f.hasHelpJson()) continue
    const fieldName = f.getName()
    lines.push(`  #__json_${fieldName}: any = undefined`)
    lines.push(`  getJSON${ucfirst(fieldName)}(): any {`)
    lines.push(`    if (this.#__json_${fieldName} === undefined) {`)
    lines.push(`      const raw = this.__data.${fieldName}`)
    lines.push(`      this.#__json_${fieldName} = typeof raw === 'string' ? JSON.parse(raw) : raw`)
    lines.push('    }')
    lines.push(`    return this.#__json_${fieldName}`)
    lines.push('  }')
    lines.push('')
  }

  // Composite primary key finder
  if (hasCompositePrimary) {
    const params = primaryFields.map(f => `${f.getName()}: ${mapFieldType(f.getType())}`).join(', ')
    const whereObj = primaryFields.map(f => f.getName()).join(', ')
    lines.push(`  static async getByAllPrimary(db: Connection, ${params}): Promise<${basicName} | null> {`)
    lines.push(`    const row = (await db.select('*', this.tableName, { ${whereObj} })).row()`)
    lines.push(`    if (!row) return null`)
    lines.push(`    return new this(db, row)`)
    lines.push('  }')
    lines.push('')
  }

  // Generic queries
  lines.push(`  static async getAllByWhere(db: Connection, where: any, options: any = {}): Promise<${basicName}[]> {`)
  lines.push(`    const rows = (await db.select('*', this.tableName, where, options)).all()`)
  lines.push(`    return rows.map((row: any) => new this(db, row))`)
  lines.push('  }')
  lines.push('')
  lines.push(`  static async getFirstByWhere(db: Connection, where: any, options: any = {}): Promise<${basicName} | null> {`)
  lines.push(`    const row = (await db.select('*', this.tableName, where, { limit: 1, ...options })).row()`)
  lines.push(`    if (!row) return null`)
  lines.push(`    return new this(db, row)`)
  lines.push('  }')
  lines.push('')

  // Static fields
  lines.push(`  static #fields = new ${fieldsClassName}()`)
  lines.push(`  static fields(): ${fieldsClassName} { return this.#fields }`)

  lines.push('}')

  return lines.join('\n') + '\n'
}

function generateJS(name: string, dbName: string, compiledFields: FieldCompiled[]): string {
  const basicName = `Basic${name}`
  const fieldsClassName = `${basicName}Fields`

  const primaryFields = compiledFields.filter(f => f.isPrimary())
  const indexFields = compiledFields.filter(f => f.isIndex())
  const hasCompositePrimary = primaryFields.length > 1

  const lines: string[] = []

  // Imports
  lines.push(`const { Model } = require('orcs-db')`)
  lines.push('')

  // Fields class
  lines.push(`class ${fieldsClassName} {`)
  for (const f of compiledFields) {
    lines.push(`  ${f.getName()} = () => '${f.getName()}'`)
  }
  lines.push('}')
  lines.push('')

  // Basic class
  lines.push(`class ${basicName} extends Model {`)
  lines.push(`  static tableName = '${dbName}'`)
  lines.push('')

  // Constructor
  lines.push(`  constructor(db, data = {}, readonly = false) {`)
  lines.push(`    super(db, '${dbName}', data, readonly)`)
  lines.push('  }')
  lines.push('')

  // Row getter
  lines.push(`  get row() {`)
  lines.push(`    return { ...this.__data }`)
  lines.push('  }')
  lines.push('')

  // Per-field: setter and getter
  for (const f of compiledFields) {
    const fieldName = f.getName()
    lines.push(`  ${fieldName}(value) { this.__data.${fieldName} = value; this.__touch('${fieldName}'); return this }`)
    lines.push(`  get${ucfirst(fieldName)}() { return this.__data.${fieldName} }`)
    lines.push('')
  }

  // Static factories
  for (const f of compiledFields) {
    const fieldName = f.getName()
    const staticName = isReservedStaticName(fieldName) ? `${fieldName}Field` : fieldName
    lines.push(`  static ${staticName}(db, value) {`)
    lines.push(`    const r = new this(db, {})`)
    lines.push(`    return r.${fieldName}(value)`)
    lines.push('  }')
    lines.push('')
  }

  // Primary keys getter
  lines.push(`  get primaryKeys() { return [${primaryFields.map(f => `'${f.getName()}'`).join(', ')}] }`)
  lines.push('')

  // Finders for primary fields
  for (const f of primaryFields) {
    const fieldName = f.getName()
    lines.push(`  static async getBy${ucfirst(fieldName)}(db, ${fieldName}) {`)
    lines.push(`    const row = (await db.select('*', this.tableName, { ${fieldName} })).row()`)
    lines.push(`    if (!row) return null`)
    lines.push(`    return new this(db, row)`)
    lines.push('  }')
    lines.push('')
  }

  // Finders for index fields
  for (const f of indexFields) {
    const fieldName = f.getName()
    lines.push(`  static async getBy${ucfirst(fieldName)}(db, ${fieldName}) {`)
    lines.push(`    const row = (await db.select('*', this.tableName, { ${fieldName} })).row()`)
    lines.push(`    if (!row) return null`)
    lines.push(`    return new this(db, row)`)
    lines.push('  }')
    lines.push('')
  }

  // helpGetCols for applicable fields
  for (const f of compiledFields) {
    if (!f.hasHelpGetCols()) continue
    const fieldName = f.getName()
    lines.push(`  static async getBy${ucfirst(fieldName)}Cols(db, ${fieldName}, columns = ['*']) {`)
    lines.push(`    return (await db.select(columns, this.tableName, { ${fieldName} })).row()`)
    lines.push('  }')
    lines.push(`  static async getAllBy${ucfirst(fieldName)}Cols(db, ${fieldName}, columns = ['*'], options = {}) {`)
    lines.push(`    return (await db.select(columns, this.tableName, { ${fieldName} }, options)).all()`)
    lines.push('  }')
    lines.push('')
  }

  // helpGetReadOnlyMulti for applicable fields
  for (const f of compiledFields) {
    if (!f.hasHelpGetReadOnlyMulti()) continue
    const fieldName = f.getName()
    lines.push(`  static async getBy${ucfirst(fieldName)}ReadOnly(db, ${fieldName}) {`)
    lines.push(`    const row = (await db.select('*', this.tableName, { ${fieldName} })).row()`)
    lines.push(`    if (!row) return null`)
    lines.push(`    return new this(db, row, true)`)
    lines.push('  }')
    lines.push(`  static async getAllBy${ucfirst(fieldName)}ReadOnlyMulti(db, ${fieldName}, options = {}) {`)
    lines.push(`    const rows = (await db.select('*', this.tableName, { ${fieldName} }, options)).all()`)
    lines.push(`    return rows.map((row) => new this(db, row, true))`)
    lines.push('  }')
    lines.push('')
  }

  // helpJson for applicable fields
  for (const f of compiledFields) {
    if (!f.hasHelpJson()) continue
    const fieldName = f.getName()
    lines.push(`  #__json_${fieldName} = undefined`)
    lines.push(`  getJSON${ucfirst(fieldName)}() {`)
    lines.push(`    if (this.#__json_${fieldName} === undefined) {`)
    lines.push(`      const raw = this.__data.${fieldName}`)
    lines.push(`      this.#__json_${fieldName} = typeof raw === 'string' ? JSON.parse(raw) : raw`)
    lines.push('    }')
    lines.push(`    return this.#__json_${fieldName}`)
    lines.push('  }')
    lines.push('')
  }

  // Composite primary key finder
  if (hasCompositePrimary) {
    const params = primaryFields.map(f => f.getName()).join(', ')
    lines.push(`  static async getByAllPrimary(db, ${params}) {`)
    lines.push(`    const row = (await db.select('*', this.tableName, { ${params} })).row()`)
    lines.push(`    if (!row) return null`)
    lines.push(`    return new this(db, row)`)
    lines.push('  }')
    lines.push('')
  }

  // Generic queries
  lines.push(`  static async getAllByWhere(db, where, options = {}) {`)
  lines.push(`    const rows = (await db.select('*', this.tableName, where, options)).all()`)
  lines.push(`    return rows.map((row) => new this(db, row))`)
  lines.push('  }')
  lines.push('')
  lines.push(`  static async getFirstByWhere(db, where, options = {}) {`)
  lines.push(`    const row = (await db.select('*', this.tableName, where, { limit: 1, ...options })).row()`)
  lines.push(`    if (!row) return null`)
  lines.push(`    return new this(db, row)`)
  lines.push('  }')
  lines.push('')

  // Static fields
  lines.push(`  static #fields = new ${fieldsClassName}()`)
  lines.push(`  static fields() { return this.#fields }`)

  lines.push('}')
  lines.push('')
  lines.push(`exports.${basicName} = ${basicName}`)

  return lines.join('\n') + '\n'
}

// Field names that would conflict with built-in static methods
function isReservedStaticName(name: string): boolean {
  const reserved = ['name', 'length', 'caller', 'arguments', 'prototype', 'constructor']
  return reserved.includes(name)
}

export class Generator {
  static #definitions: Definition[] = []

  static generate(file: string, name: string, dbName: string, fields: Field[]): void {
    const compiledFields = fields.map(f => f.compile())
    const ext = path.extname(file)
    const isTS = ext === '.ts'
    const dir = path.dirname(file)
    const basicDir = path.join(dir, 'basic')

    if (!fs.existsSync(basicDir)) {
      fs.mkdirSync(basicDir, { recursive: true })
    }

    const content = isTS
      ? generateTS(name, dbName, compiledFields)
      : generateJS(name, dbName, compiledFields)

    const outFile = path.join(basicDir, `Basic${name}${ext}`)
    fs.writeFileSync(outFile, content, 'utf-8')

    // Check if main class wrapper needs generation
    const sourceContent = fs.readFileSync(file, 'utf-8')
    if (!sourceContent.includes('/// MAIN_CLASS_GENERATED')) {
      const parts = sourceContent.split('/// AUTO_CODE')
      if (parts.length >= 2) {
        const mainContent = isTS
          ? generateMainClassTS(name, dbName)
          : generateMainClassJS(name, dbName)
        const newSource = parts[0] + '/// AUTO_CODE\n/// MAIN_CLASS_GENERATED\n' + mainContent
        fs.writeFileSync(file, newSource, 'utf-8')
      }
    }
  }

  static define(file: string, name: string, dbName: string, fields: Field[]): void {
    Generator.#definitions.push({ file, name, dbName, fields })
  }

  static getDefinitions(): Definition[] {
    return [...Generator.#definitions]
  }

  static clearDefinitions(): void {
    Generator.#definitions = []
  }

  static generateAll(): void {
    for (const def of Generator.#definitions) {
      Generator.generate(def.file, def.name, def.dbName, def.fields)
    }
  }
}

function generateMainClassTS(name: string, _dbName: string): string {
  const basicName = `Basic${name}`
  const lines: string[] = []
  lines.push(`import { ${basicName} } from './basic/${basicName}'`)
  lines.push('')
  lines.push(`export class ${name} extends ${basicName} {`)
  lines.push('}')
  lines.push('')
  return lines.join('\n')
}

function generateMainClassJS(name: string, _dbName: string): string {
  const basicName = `Basic${name}`
  const lines: string[] = []
  lines.push(`const { ${basicName} } = require('./basic/${basicName}')`)
  lines.push('')
  lines.push(`class ${name} extends ${basicName} {`)
  lines.push('}')
  lines.push('')
  lines.push(`exports.${name} = ${name}`)
  lines.push('')
  return lines.join('\n')
}

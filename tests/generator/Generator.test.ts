import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Generator } from '../../src/generator/Generator'
import { Field } from '../../src/orm/Field'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('Generator', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orcs-gen-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    Generator.clearDefinitions()
  })

  describe('generate (TS)', () => {
    it('creates basic/BasicXxx.ts file', () => {
      const modelFile = path.join(tmpDir, 'User.ts')
      fs.writeFileSync(modelFile, '// User model definition')

      Generator.generate(modelFile, 'User', 'users', [
        Field.int('id').primary(),
        Field.string('name').index(),
      ])

      const basicPath = path.join(tmpDir, 'basic', 'BasicUser.ts')
      expect(fs.existsSync(basicPath)).toBe(true)

      const content = fs.readFileSync(basicPath, 'utf-8')
      expect(content).toContain('class BasicUser')
      expect(content).toContain("'users'")
      expect(content).toContain('getId()')
      expect(content).toContain('getName()')
      expect(content).toContain('getById')
      expect(content).toContain('getByName')
      expect(content).toContain('primaryKeys')
      expect(content).toContain('getAllByWhere')
      expect(content).toContain('getFirstByWhere')
    })

    it('generates TS types (interface, type annotations)', () => {
      const modelFile = path.join(tmpDir, 'Item.ts')
      fs.writeFileSync(modelFile, '// Item model definition')

      Generator.generate(modelFile, 'Item', 'items', [
        Field.int('id').primary(),
        Field.string('title'),
        Field.double('price'),
      ])

      const content = fs.readFileSync(path.join(tmpDir, 'basic', 'BasicItem.ts'), 'utf-8')
      expect(content).toContain('interface ItemRow')
      expect(content).toContain('id: number')
      expect(content).toContain('title: string')
      expect(content).toContain('price: number')
    })

    it('generates helpGetCols methods', () => {
      const modelFile = path.join(tmpDir, 'User.ts')
      fs.writeFileSync(modelFile, '// User model definition')

      Generator.generate(modelFile, 'User', 'users', [
        Field.int('id').primary().helpGetCols(),
      ])

      const content = fs.readFileSync(path.join(tmpDir, 'basic', 'BasicUser.ts'), 'utf-8')
      expect(content).toContain('getByIdCols')
      expect(content).toContain('getAllByIdCols')
    })

    it('generates helpGetReadOnlyMulti methods', () => {
      const modelFile = path.join(tmpDir, 'User.ts')
      fs.writeFileSync(modelFile, '// User model definition')

      Generator.generate(modelFile, 'User', 'users', [
        Field.int('id').primary().helpGetReadOnlyMulti(),
      ])

      const content = fs.readFileSync(path.join(tmpDir, 'basic', 'BasicUser.ts'), 'utf-8')
      expect(content).toContain('getByIdReadOnly')
      expect(content).toContain('getAllByIdReadOnlyMulti')
    })

    it('generates helpJson methods', () => {
      const modelFile = path.join(tmpDir, 'Config.ts')
      fs.writeFileSync(modelFile, '// Config model definition')

      Generator.generate(modelFile, 'Config', 'configs', [
        Field.int('id').primary(),
        Field.string('data').helpJson(),
      ])

      const content = fs.readFileSync(path.join(tmpDir, 'basic', 'BasicConfig.ts'), 'utf-8')
      expect(content).toContain('getJSONData')
    })

    it('generates composite primary key support', () => {
      const modelFile = path.join(tmpDir, 'UserRole.ts')
      fs.writeFileSync(modelFile, '// UserRole model definition')

      Generator.generate(modelFile, 'UserRole', 'user_roles', [
        Field.int('userId').primary(),
        Field.int('roleId').primary(),
      ])

      const content = fs.readFileSync(path.join(tmpDir, 'basic', 'BasicUserRole.ts'), 'utf-8')
      expect(content).toContain('getByAllPrimary')
      expect(content).toContain('userId')
      expect(content).toContain('roleId')
    })

    it('generates Fields class', () => {
      const modelFile = path.join(tmpDir, 'User.ts')
      fs.writeFileSync(modelFile, '// User model definition')

      Generator.generate(modelFile, 'User', 'users', [
        Field.int('id').primary(),
        Field.string('name'),
      ])

      const content = fs.readFileSync(path.join(tmpDir, 'basic', 'BasicUser.ts'), 'utf-8')
      expect(content).toContain('BasicUserFields')
      expect(content).toContain("id = () =>")
      expect(content).toContain("name = () =>")
      expect(content).toContain('static fields()')
    })
  })

  describe('generate (JS CJS)', () => {
    it('creates basic/BasicXxx.js file with require/exports', () => {
      const modelFile = path.join(tmpDir, 'User.js')
      fs.writeFileSync(modelFile, 'class User {}')

      Generator.generate(modelFile, 'User', 'users', [
        Field.int('id').primary(),
      ])

      const basicPath = path.join(tmpDir, 'basic', 'BasicUser.js')
      expect(fs.existsSync(basicPath)).toBe(true)

      const content = fs.readFileSync(basicPath, 'utf-8')
      expect(content).toContain('class BasicUser')
      expect(content).not.toContain(': number')
      expect(content).toContain('require(')
      expect(content).toContain('exports.BasicUser')
    })
  })

  describe('generate (JS ESM)', () => {
    it('creates ESM output when package.json has type=module', () => {
      // Create a package.json with type: module in tmpDir
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ type: 'module' }))
      const modelFile = path.join(tmpDir, 'User.js')
      fs.writeFileSync(modelFile, 'class User {}')

      Generator.generate(modelFile, 'User', 'users', [
        Field.int('id').primary(),
      ])

      const basicPath = path.join(tmpDir, 'basic', 'BasicUser.js')
      expect(fs.existsSync(basicPath)).toBe(true)

      const content = fs.readFileSync(basicPath, 'utf-8')
      expect(content).toContain("import { Model } from 'orcs-db'")
      expect(content).toContain('export { BasicUser }')
      expect(content).not.toContain('require(')
      expect(content).not.toContain('exports.')
    })

    it('creates ESM main class when package.json has type=module', () => {
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ type: 'module' }))
      // Definition file that doesn't yet contain the class
      const modelFile = path.join(tmpDir, 'User.js')
      fs.writeFileSync(modelFile, '// Generator.define(...)')

      Generator.generate(modelFile, 'User', 'users', [
        Field.int('id').primary(),
      ])

      const content = fs.readFileSync(modelFile, 'utf-8')
      expect(content).toContain("import { BasicUser } from './basic/BasicUser.js'")
      expect(content).toContain('export class User extends BasicUser')
    })
  })

  describe('main class generation (Bug 2)', () => {
    it('appends main class to definition file if class not present', () => {
      const modelFile = path.join(tmpDir, 'User.ts')
      fs.writeFileSync(modelFile, "import { Generator, Field } from 'orcs-db'\nGenerator.define(__filename, 'User', 'users', [])")

      Generator.generate(modelFile, 'User', 'users', [
        Field.int('id').primary(),
        Field.string('name'),
      ])

      expect(fs.existsSync(path.join(tmpDir, 'basic', 'BasicUser.ts'))).toBe(true)

      const content = fs.readFileSync(modelFile, 'utf-8')
      expect(content).toContain("import { BasicUser } from './basic/BasicUser'")
      expect(content).toContain('export class User extends BasicUser')
      // Define block should be commented out
      expect(content).toContain('/* orcs-db:define')
      expect(content).toContain('orcs-db:define */')
    })

    it('does not modify file if class already exists', () => {
      const modelFile = path.join(tmpDir, 'User.ts')
      const customContent = `import { BasicUser } from './basic/BasicUser'\n\nexport class User extends BasicUser {\n  customMethod() { return 42 }\n}\n`
      fs.writeFileSync(modelFile, customContent)

      Generator.generate(modelFile, 'User', 'users', [
        Field.int('id').primary(),
      ])

      const content = fs.readFileSync(modelFile, 'utf-8')
      expect(content).toBe(customContent)
    })

    it('creates fresh main class file if file does not exist', () => {
      const modelDir = path.join(tmpDir, 'models')
      fs.mkdirSync(modelDir)
      // User.ts does not exist — generate should create it
      const modelFile = path.join(modelDir, 'Def.ts')
      fs.writeFileSync(modelFile, 'Generator.define(...)')

      Generator.generate(modelFile, 'User', 'users', [
        Field.int('id').primary(),
      ])

      const mainPath = path.join(modelDir, 'User.ts')
      expect(fs.existsSync(mainPath)).toBe(true)
      const content = fs.readFileSync(mainPath, 'utf-8')
      expect(content).toContain("import { BasicUser } from './basic/BasicUser'")
      expect(content).toContain('export class User extends BasicUser')
    })

    it('creates CJS main class for JS files', () => {
      const modelFile = path.join(tmpDir, 'User.js')
      fs.writeFileSync(modelFile, '// define call here')

      Generator.generate(modelFile, 'User', 'users', [
        Field.int('id').primary(),
      ])

      const content = fs.readFileSync(modelFile, 'utf-8')
      expect(content).toContain("require('./basic/BasicUser.js')")
      expect(content).toContain('module.exports')
      expect(content).toContain('class User extends BasicUser')
    })
  })

  describe('commentDefines / uncommentDefines (Bug 4)', () => {
    it('comments out Generator.define() block after generate()', () => {
      const modelFile = path.join(tmpDir, 'User.ts')
      const src = [
        "import { Generator, Field } from 'orcs-db'",
        '',
        "Generator.define(__filename, 'User', 'users', [",
        "  Field.int('id').primary(),",
        "  Field.string('name'),",
        '])',
      ].join('\n')
      fs.writeFileSync(modelFile, src)

      Generator.generate(modelFile, 'User', 'users', [
        Field.int('id').primary(),
        Field.string('name'),
      ])

      const content = fs.readFileSync(modelFile, 'utf-8')
      expect(content).toContain('/* orcs-db:define')
      expect(content).toContain('orcs-db:define */')
      // The define call itself should be inside the comment block
      expect(content).toContain("Generator.define(__filename, 'User', 'users', [")
      // Import should NOT be commented out
      expect(content).toMatch(/^import \{ Generator/)
    })

    it('uncommentDefines restores commented blocks', () => {
      const modelFile = path.join(tmpDir, 'User.ts')
      const commented = [
        "import { Generator, Field } from 'orcs-db'",
        '',
        '/* orcs-db:define',
        "Generator.define(__filename, 'User', 'users', [",
        "  Field.int('id').primary(),",
        '])',
        'orcs-db:define */',
      ].join('\n')
      fs.writeFileSync(modelFile, commented)

      const changed = Generator.uncommentDefines(modelFile)
      expect(changed).toBe(true)

      const content = fs.readFileSync(modelFile, 'utf-8')
      expect(content).not.toContain('/* orcs-db:define')
      expect(content).not.toContain('orcs-db:define */')
      expect(content).toContain("Generator.define(__filename, 'User', 'users', [")
    })

    it('uncommentDefines returns false if no markers found', () => {
      const modelFile = path.join(tmpDir, 'User.ts')
      fs.writeFileSync(modelFile, 'no markers here')

      const changed = Generator.uncommentDefines(modelFile)
      expect(changed).toBe(false)
    })

    it('does not double-comment already commented defines', () => {
      const modelFile = path.join(tmpDir, 'User.ts')
      const src = [
        '/* orcs-db:define',
        "Generator.define(__filename, 'User', 'users', [])",
        'orcs-db:define */',
      ].join('\n')
      fs.writeFileSync(modelFile, src)

      Generator.commentDefines(modelFile)

      const content = fs.readFileSync(modelFile, 'utf-8')
      // Should not nest markers
      const markerCount = (content.match(/orcs-db:define/g) || []).length
      expect(markerCount).toBe(2) // one start, one end
    })

    it('round-trip: uncomment → generate → re-commented', () => {
      const modelFile = path.join(tmpDir, 'User.ts')
      // Start with already-commented state (as if previously generated)
      const initial = [
        "import { Generator, Field } from 'orcs-db'",
        '',
        '/* orcs-db:define',
        "Generator.define(__filename, 'User', 'users', [",
        "  Field.int('id').primary(),",
        '])',
        'orcs-db:define */',
        '',
        "import { BasicUser } from './basic/BasicUser'",
        '',
        'export class User extends BasicUser {',
        '}',
        '',
      ].join('\n')
      fs.writeFileSync(modelFile, initial)

      // Step 1: uncomment
      Generator.uncommentDefines(modelFile)
      const afterUncomment = fs.readFileSync(modelFile, 'utf-8')
      expect(afterUncomment).not.toContain('/* orcs-db:define')
      expect(afterUncomment).toContain('Generator.define(')

      // Step 2: generate (would normally require() the file first)
      Generator.generate(modelFile, 'User', 'users', [
        Field.int('id').primary(),
      ])

      // Step 3: verify re-commented
      const afterGenerate = fs.readFileSync(modelFile, 'utf-8')
      expect(afterGenerate).toContain('/* orcs-db:define')
      expect(afterGenerate).toContain('orcs-db:define */')
      // Class should still be there
      expect(afterGenerate).toContain('export class User extends BasicUser')
    })
  })

  describe('define + getDefinitions', () => {
    it('registers definition without generating', () => {
      Generator.define('/fake/User.ts', 'User', 'users', [
        Field.int('id').primary(),
      ])

      const defs = Generator.getDefinitions()
      expect(defs).toHaveLength(1)
      expect(defs[0].name).toBe('User')
      expect(defs[0].file).toBe('/fake/User.ts')
    })

    it('clearDefinitions removes all', () => {
      Generator.define('/fake/A.ts', 'A', 'a', [Field.int('id').primary()])
      Generator.define('/fake/B.ts', 'B', 'b', [Field.int('id').primary()])
      expect(Generator.getDefinitions()).toHaveLength(2)

      Generator.clearDefinitions()
      expect(Generator.getDefinitions()).toHaveLength(0)
    })
  })
})

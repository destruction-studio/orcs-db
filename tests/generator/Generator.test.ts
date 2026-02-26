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
      fs.writeFileSync(modelFile, '/// AUTO_CODE\nexport class User {}')

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
      fs.writeFileSync(modelFile, '/// AUTO_CODE\nexport class Item {}')

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
      fs.writeFileSync(modelFile, '/// AUTO_CODE\nexport class User {}')

      Generator.generate(modelFile, 'User', 'users', [
        Field.int('id').primary().helpGetCols(),
      ])

      const content = fs.readFileSync(path.join(tmpDir, 'basic', 'BasicUser.ts'), 'utf-8')
      expect(content).toContain('getByIdCols')
      expect(content).toContain('getAllByIdCols')
    })

    it('generates helpGetReadOnlyMulti methods', () => {
      const modelFile = path.join(tmpDir, 'User.ts')
      fs.writeFileSync(modelFile, '/// AUTO_CODE\nexport class User {}')

      Generator.generate(modelFile, 'User', 'users', [
        Field.int('id').primary().helpGetReadOnlyMulti(),
      ])

      const content = fs.readFileSync(path.join(tmpDir, 'basic', 'BasicUser.ts'), 'utf-8')
      expect(content).toContain('getByIdReadOnly')
      expect(content).toContain('getAllByIdReadOnlyMulti')
    })

    it('generates helpJson methods', () => {
      const modelFile = path.join(tmpDir, 'Config.ts')
      fs.writeFileSync(modelFile, '/// AUTO_CODE\nexport class Config {}')

      Generator.generate(modelFile, 'Config', 'configs', [
        Field.int('id').primary(),
        Field.string('data').helpJson(),
      ])

      const content = fs.readFileSync(path.join(tmpDir, 'basic', 'BasicConfig.ts'), 'utf-8')
      expect(content).toContain('getJSONData')
    })

    it('generates composite primary key support', () => {
      const modelFile = path.join(tmpDir, 'UserRole.ts')
      fs.writeFileSync(modelFile, '/// AUTO_CODE\nexport class UserRole {}')

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
      fs.writeFileSync(modelFile, '/// AUTO_CODE\nexport class User {}')

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

  describe('generate (JS)', () => {
    it('creates basic/BasicXxx.js file for JS source', () => {
      const modelFile = path.join(tmpDir, 'User.js')
      fs.writeFileSync(modelFile, '/// AUTO_CODE\nclass User {}')

      Generator.generate(modelFile, 'User', 'users', [
        Field.int('id').primary(),
      ])

      const basicPath = path.join(tmpDir, 'basic', 'BasicUser.js')
      expect(fs.existsSync(basicPath)).toBe(true)

      const content = fs.readFileSync(basicPath, 'utf-8')
      expect(content).toContain('class BasicUser')
      expect(content).not.toContain(': number')  // no TS annotations
      expect(content).toContain('require(')
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

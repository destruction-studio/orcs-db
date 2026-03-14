import { describe, it, expect } from 'vitest'
import { SqlGenerator } from '../../src/core/SqlGenerator'
import { Sql } from '../../src/core/Sql'

function createGenerator(): SqlGenerator {
  const gen = new SqlGenerator()
  gen.setQuote((v: any) => `'${v}'`)
  gen.setTableQuote((t: string) => `\`${t}\``)
  return gen
}

describe('SqlGenerator', () => {
  describe('select', () => {
    it('simple select *', () => {
      const gen = createGenerator()
      expect(gen.select('*', 'users')).toContain('SELECT * FROM `users`')
    })

    it('select single column', () => {
      const gen = createGenerator()
      const sql = gen.select('name', 'users')
      expect(sql).toContain('SELECT `name` FROM `users`')
    })

    it('select with array of columns', () => {
      const gen = createGenerator()
      const sql = gen.select(['id', 'name'], 'users')
      expect(sql).toContain('`id`')
      expect(sql).toContain('`name`')
      expect(sql).toContain('FROM `users`')
    })

    it('select with where equality', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', { id: 1 })
      expect(sql).toContain("WHERE `id` = '1'")
    })

    it('select with limit number', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', {}, { limit: 10 })
      expect(sql).toContain('LIMIT 10')
    })

    it('select with order string (raw)', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', {}, { order: 'id DESC' })
      expect(sql).toContain('ORDER BY id DESC')
    })

    it('select with order tuple', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', {}, { order: ['name', 'ASC'] })
      expect(sql).toContain('ORDER BY `name` ASC')
    })

    it('select with order array of tuples', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', {}, { order: [['name', 'ASC'], ['id', 'DESC']] })
      expect(sql).toContain('ORDER BY `name` ASC, `id` DESC')
    })

    it('select with order object', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', {}, { order: { name: 'ASC', id: 'DESC' } })
      expect(sql).toContain('ORDER BY `name` ASC, `id` DESC')
    })

    it('select with order Sql', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', {}, { order: new Sql('FIELD(status, "active", "pending")') })
      expect(sql).toContain('ORDER BY FIELD(status, "active", "pending")')
    })

    it('select with order lowercase direction', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', {}, { order: ['name', 'desc'] })
      expect(sql).toContain('ORDER BY `name` DESC')
    })

    it('order rejects invalid direction', () => {
      const gen = createGenerator()
      expect(() => gen.select('*', 'users', {}, { order: ['name', 'DROP TABLE users' as any] })).toThrow('Invalid ORDER BY direction')
    })

    it('select with group', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', {}, { group: 'status' })
      expect(sql).toContain('GROUP BY `status`')
    })

    it('select with forUpdate', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', {}, { forUpdate: true })
      expect(sql).toContain('FOR UPDATE')
    })

    it('select with Sql in columns (object alias)', () => {
      const gen = createGenerator()
      const sql = gen.select({ count: new Sql('COUNT(*)') }, 'users')
      expect(sql).toContain('COUNT(*) AS `count`')
    })

    it('select with Sql as direct column', () => {
      const gen = createGenerator()
      const sql = gen.select(new Sql('COUNT(*)'), 'users')
      expect(sql).toContain('SELECT COUNT(*) FROM')
    })
  })

  describe('where', () => {
    it('null value → ISNULL', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', { deleted: null })
      expect(sql).toContain('ISNULL(`deleted`)')
    })

    it('comparison operators', () => {
      const gen = createGenerator()
      expect(gen.select('*', 'u', { age: ['>', 18] })).toContain("`age` > '18'")
      expect(gen.select('*', 'u', { age: ['<', 65] })).toContain("`age` < '65'")
      expect(gen.select('*', 'u', { age: ['!=', 21] })).toContain("`age` != '21'")
      expect(gen.select('*', 'u', { age: ['>=', 18] })).toContain("`age` >= '18'")
    })

    it('IN operator', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', { id: ['IN', [1, 2, 3]] })
      expect(sql).toContain("`id` IN('1','2','3')")
    })

    it('NOT IN operator', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', { id: ['NOT IN', [1, 2]] })
      expect(sql).toContain("`id` NOT IN('1','2')")
    })

    it('BETWEEN operator', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', { age: ['BETWEEN', 18, 65] })
      expect(sql).toContain("`age` BETWEEN '18' AND '65'")
    })

    it('raw Sql in where', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', { $custom: new Sql('created_at > NOW()') })
      expect(sql).toContain('created_at > NOW()')
    })

    it('multiple conditions joined with AND', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', { name: 'John', age: ['>', 18] })
      expect(sql).toContain("`name` = 'John'")
      expect(sql).toContain("`age` > '18'")
      expect(sql).toContain(' AND ')
    })

    it('$or with two conditions', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', {
        $or: [
          { status: 'active' },
          { status: 'pending' },
        ],
      })
      expect(sql).toContain("(`status` = 'active' OR `status` = 'pending')")
    })

    it('$or combined with AND conditions', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', {
        role: 'admin',
        $or: [
          { lastCheckedAt: null },
          { lastCheckedAt: ['<', '2024-01-01'] },
        ],
      })
      expect(sql).toContain("`role` = 'admin'")
      expect(sql).toContain(' AND ')
      expect(sql).toContain("(ISNULL(`lastCheckedAt`) OR `lastCheckedAt` < '2024-01-01')")
    })

    it('nested $or', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', {
        $or: [
          { status: 'active' },
          { $or: [{ role: 'admin' }, { role: 'superadmin' }] },
        ],
      })
      expect(sql).toContain("(`status` = 'active' OR (`role` = 'admin' OR `role` = 'superadmin'))")
    })

    it('$or with various operator types', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', {
        $or: [
          { deleted: null },
          { age: ['>', 18] },
          { id: ['IN', [1, 2, 3]] },
          { score: ['BETWEEN', 10, 100] },
        ],
      })
      expect(sql).toContain('ISNULL(`deleted`)')
      expect(sql).toContain("`age` > '18'")
      expect(sql).toContain("`id` IN('1','2','3')")
      expect(sql).toContain("`score` BETWEEN '10' AND '100'")
      expect(sql).toContain(' OR ')
    })

    it('$or with empty array produces no clause', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', { name: 'John', $or: [] })
      expect(sql).toContain("`name` = 'John'")
      expect(sql).not.toContain('OR')
    })

    it('$and with two conditions', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', {
        $and: [
          { age: ['>', 18] },
          { age: ['<', 65] },
        ],
      })
      expect(sql).toContain("(`age` > '18' AND `age` < '65')")
    })

    it('$and combined with top-level AND', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', {
        status: 'active',
        $and: [
          { score: ['>=', 10] },
          { score: ['<=', 100] },
        ],
      })
      expect(sql).toContain("`status` = 'active' AND (`score` >= '10' AND `score` <= '100')")
    })

    it('nested $and', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', {
        $and: [
          { type: 'premium' },
          { $and: [{ age: ['>', 18] }, { age: ['<', 65] }] },
        ],
      })
      expect(sql).toContain("(`type` = 'premium' AND (`age` > '18' AND `age` < '65'))")
    })

    it('$and combined with $or', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', {
        $and: [{ score: ['>=', 10] }, { score: ['<=', 100] }],
        $or: [{ status: 'active' }, { status: 'pending' }],
      })
      expect(sql).toContain("(`score` >= '10' AND `score` <= '100') AND (`status` = 'active' OR `status` = 'pending')")
    })

    it('$and with empty array produces no clause', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', { name: 'John', $and: [] })
      expect(sql).toContain("`name` = 'John'")
      expect(sql).not.toContain('()')
      expect(sql).not.toContain(' AND (')
    })

    it('$and with single element', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', {
        $and: [{ status: 'active' }],
      })
      expect(sql).toContain("(`status` = 'active')")
    })

    it('Sql instance in > operator', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', {
        createdAt: ['>', new Sql('DATE_SUB(NOW(), INTERVAL 30 DAY)')],
      })
      expect(sql).toContain('`createdAt` > DATE_SUB(NOW(), INTERVAL 30 DAY)')
    })

    it('Sql instance in < operator', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', {
        updatedAt: ['<', new Sql('NOW()')],
      })
      expect(sql).toContain('`updatedAt` < NOW()')
    })

    it('Sql instance in != operator', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', {
        status: ['!=', new Sql("'archived'")],
      })
      expect(sql).toContain("`status` != 'archived'")
    })

    it('Sql instance in >= operator', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', {
        score: ['>=', new Sql('AVG(score)')],
      })
      expect(sql).toContain('`score` >= AVG(score)')
    })

    it('Sql instance in <= operator', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', {
        age: ['<=', new Sql('MAX(age)')],
      })
      expect(sql).toContain('`age` <= MAX(age)')
    })

    it('Sql instance in BETWEEN operator', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', {
        createdAt: ['BETWEEN', new Sql('DATE_SUB(NOW(), INTERVAL 7 DAY)'), new Sql('NOW()')],
      })
      expect(sql).toContain('`createdAt` BETWEEN DATE_SUB(NOW(), INTERVAL 7 DAY) AND NOW()')
    })

    it('Sql instance mixed with regular value in BETWEEN', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', {
        createdAt: ['BETWEEN', '2026-01-01', new Sql('NOW()')],
      })
      expect(sql).toContain("`createdAt` BETWEEN '2026-01-01' AND NOW()")
    })

    it('Sql instance in fallback operator (LIKE)', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', {
        name: ['LIKE', new Sql("CONCAT('%', 'test', '%')")],
      })
      expect(sql).toContain("`name` LIKE CONCAT('%', 'test', '%')")
    })

    it('empty where object', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users', {})
      expect(sql).not.toContain('WHERE')
    })

    it('undefined where', () => {
      const gen = createGenerator()
      const sql = gen.select('*', 'users')
      expect(sql).not.toContain('WHERE')
    })
  })

  describe('insert', () => {
    it('basic insert', () => {
      const gen = createGenerator()
      const sql = gen.insert({ name: 'John', email: 'j@t.com' }, 'users')
      expect(sql).toContain('INSERT INTO `users`')
      expect(sql).toContain('`name`, `email`')
      expect(sql).toContain("'John'")
      expect(sql).toContain("'j@t.com'")
    })

    it('insert ignore', () => {
      const gen = createGenerator()
      const sql = gen.insert({ id: 1 }, 'users', { ignore: true })
      expect(sql).toContain('INSERT IGNORE')
    })

    it('on duplicate key update (boolean true)', () => {
      const gen = createGenerator()
      const sql = gen.insert({ id: 1, name: 'John' }, 'users', { onDuplicateUpdate: true })
      expect(sql).toContain('ON DUPLICATE KEY UPDATE')
      expect(sql).toContain('VALUES(`id`)')
      expect(sql).toContain('VALUES(`name`)')
    })

    it('on duplicate key update (custom object)', () => {
      const gen = createGenerator()
      const sql = gen.insert({ id: 1, name: 'John' }, 'users', {
        onDuplicateUpdate: { count: new Sql('count + 1') }
      })
      expect(sql).toContain('ON DUPLICATE KEY UPDATE')
      expect(sql).toContain('count + 1')
    })
  })

  describe('insertMulti', () => {
    it('generates multi-row insert', () => {
      const gen = createGenerator()
      const sql = gen.insertMulti([{ name: 'A' }, { name: 'B' }, { name: 'C' }], 'users')
      expect(sql).toContain('INSERT INTO `users`')
      expect(sql).toContain("'A'")
      expect(sql).toContain("'B'")
      expect(sql).toContain("'C'")
    })
  })

  describe('update', () => {
    it('basic update', () => {
      const gen = createGenerator()
      const sql = gen.update({ name: 'Jane' }, 'users', { id: 1 })
      expect(sql).toContain("UPDATE `users` SET `name` = 'Jane'")
      expect(sql).toContain("WHERE `id` = '1'")
    })

    it('update with Sql value', () => {
      const gen = createGenerator()
      const sql = gen.update({ updated_at: new Sql('NOW()') }, 'users', { id: 1 })
      expect(sql).toContain('NOW()')
    })

    it('update with limit', () => {
      const gen = createGenerator()
      const sql = gen.update({ status: 'inactive' }, 'users', { active: 0 }, { limit: 100 })
      expect(sql).toContain('LIMIT 100')
    })

    it('update with $and and Sql in operator (target query)', () => {
      const gen = createGenerator()
      const dateSub = new Sql("DATE_SUB(NOW(), INTERVAL '30' SECOND)")
      const sql = gen.update(
        { acquired: 0, acquiredAt: null },
        'statQueue',
        {
          acquired: ['>', 0],
          $and: [
            { acquiredAt: ['<', dateSub] },
          ],
        },
      )
      expect(sql).toContain("UPDATE `statQueue` SET")
      expect(sql).toContain("`acquired` = '0'")
      expect(sql).toContain("`acquired` > '0'")
      expect(sql).toContain("(`acquiredAt` < DATE_SUB(NOW(), INTERVAL '30' SECOND))")
    })
  })

  describe('deleteFrom', () => {
    it('basic delete', () => {
      const gen = createGenerator()
      const sql = gen.deleteFrom('users', { id: 1 })
      expect(sql).toContain('DELETE FROM `users`')
      expect(sql).toContain("WHERE `id` = '1'")
    })

    it('delete with limit', () => {
      const gen = createGenerator()
      const sql = gen.deleteFrom('users', { active: 0 }, { limit: 100 })
      expect(sql).toContain('LIMIT 100')
    })

    it('delete with order string', () => {
      const gen = createGenerator()
      const sql = gen.deleteFrom('users', {}, { order: 'id ASC' })
      expect(sql).toContain('ORDER BY id ASC')
    })

    it('delete with order tuple', () => {
      const gen = createGenerator()
      const sql = gen.deleteFrom('users', {}, { order: ['id', 'ASC'] })
      expect(sql).toContain('ORDER BY `id` ASC')
    })
  })

  describe('replace', () => {
    it('basic replace', () => {
      const gen = createGenerator()
      const sql = gen.replace({ id: 1, name: 'John' }, 'users')
      expect(sql).toContain('REPLACE INTO')
      expect(sql).toContain('`users`')
      expect(sql).toContain("'1'")
      expect(sql).toContain("'John'")
    })
  })

  describe('replaceMulti', () => {
    it('multi-row replace', () => {
      const gen = createGenerator()
      const sql = gen.replaceMulti([{ id: 1, name: 'A' }, { id: 2, name: 'B' }], 'users')
      expect(sql).toContain('REPLACE INTO')
      expect(sql).toContain("'A'")
      expect(sql).toContain("'B'")
    })
  })

  describe('quote', () => {
    it('throws if quote not set', () => {
      const gen = new SqlGenerator()
      expect(() => gen.quote('test')).toThrow()
    })
  })
})

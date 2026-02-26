import { describe, it, expect, vi } from 'vitest'
import { Model } from '../../src/orm/Model'
import { Connection } from '../../src/core/Connection'
import { EditResult } from '../../src/core/result/EditResult'

class TestModel extends Model {
  static readonly tableName = 'test_table'
  get primaryKeys(): string[] { return ['id'] }
}

function createMockDb() {
  return {
    insert: vi.fn(async () => new EditResult({ insertId: 1, affectedRows: 1, changedRows: 0 })),
    update: vi.fn(async () => new EditResult({ insertId: 0, affectedRows: 1, changedRows: 1 })),
    deleteFrom: vi.fn(async () => new EditResult({ insertId: 0, affectedRows: 1, changedRows: 0 })),
    select: vi.fn(async () => ({ all: () => [], row: () => null })),
  } as unknown as Connection
}

describe('Model CRUD', () => {
  it('insert calls db.insert with data', async () => {
    const db = createMockDb()
    const model = new TestModel(db, 'test_table', { id: 1, name: 'test' })
    const result = await model.insert()
    expect(db.insert).toHaveBeenCalledWith({ id: 1, name: 'test' }, 'test_table', {})
    expect(result.getInsertId()).toBe(1)
  })

  it('update calls db.update with data minus primary keys', async () => {
    const db = createMockDb()
    const model = new TestModel(db, 'test_table', { id: 1, name: 'test' })
    await model.update()
    expect(db.update).toHaveBeenCalledWith(
      { name: 'test' },
      'test_table',
      { id: 1 },
      {},
    )
  })

  it('updateTouched only updates touched fields', async () => {
    const db = createMockDb()
    const model = new TestModel(db, 'test_table', { id: 1, name: 'old', email: 'a@b.com' })
    model.__data.name = 'new'
    model.__touch('name')
    const affected = await model.updateTouched()
    expect(db.update).toHaveBeenCalledWith(
      { name: 'new' },
      'test_table',
      { id: 1 },
    )
    expect(affected).toBe(1)
  })

  it('updateTouched returns 0 when nothing touched', async () => {
    const db = createMockDb()
    const model = new TestModel(db, 'test_table', { id: 1 })
    const affected = await model.updateTouched()
    expect(affected).toBe(0)
    expect(db.update).not.toHaveBeenCalled()
  })

  it('updateTouchedWhere merges primary keys into where', async () => {
    const db = createMockDb()
    const model = new TestModel(db, 'test_table', { id: 1, name: 'test' })
    model.__data.name = 'new'
    model.__touch('name')
    await model.updateTouchedWhere({ active: 1 })
    expect(db.update).toHaveBeenCalledWith(
      { name: 'new' },
      'test_table',
      { id: 1, active: 1 },
    )
  })

  it('deleteRow calls db.deleteFrom with primary where', async () => {
    const db = createMockDb()
    const model = new TestModel(db, 'test_table', { id: 42 })
    const result = await model.deleteRow()
    expect(db.deleteFrom).toHaveBeenCalledWith('test_table', { id: 42 })
    expect(result.getAffectedRows()).toBe(1)
  })

  it('deleteRow throws if already deleted', async () => {
    const db = createMockDb()
    const model = new TestModel(db, 'test_table', { id: 1 })
    await model.deleteRow()
    await expect(model.deleteRow()).rejects.toThrow('already deleted')
  })
})

describe('Model readonly', () => {
  it('readonly model throws on insert', async () => {
    const db = createMockDb()
    const model = new TestModel(db, 'test_table', { id: 1 }, true)
    await expect(model.insert()).rejects.toThrow('read only')
  })

  it('readonly model throws on update', async () => {
    const db = createMockDb()
    const model = new TestModel(db, 'test_table', { id: 1 }, true)
    await expect(model.update()).rejects.toThrow('read only')
  })

  it('readonly model throws on delete', async () => {
    const db = createMockDb()
    const model = new TestModel(db, 'test_table', { id: 1 }, true)
    await expect(model.deleteRow()).rejects.toThrow('read only')
  })
})

describe('Model detach', () => {
  it('detach allows reading data', () => {
    const db = createMockDb()
    const model = new TestModel(db, 'test_table', { id: 1, name: 'test' })
    model.detach()
    expect(model.__data.name).toBe('test')
    expect(model.__data.id).toBe(1)
  })

  it('detach prevents insert', async () => {
    const db = createMockDb()
    const model = new TestModel(db, 'test_table', { id: 1 })
    model.detach()
    await expect(model.insert()).rejects.toThrow('detached')
  })

  it('detach prevents update', async () => {
    const db = createMockDb()
    const model = new TestModel(db, 'test_table', { id: 1 })
    model.detach()
    await expect(model.update()).rejects.toThrow('detached')
  })

  it('detach prevents deleteRow', async () => {
    const db = createMockDb()
    const model = new TestModel(db, 'test_table', { id: 1 })
    model.detach()
    await expect(model.deleteRow()).rejects.toThrow('detached')
  })
})

describe('Model hooks', () => {
  it('beforeInsert is called before db.insert', async () => {
    const order: string[] = []
    class HookedModel extends TestModel {
      protected async beforeInsert() { order.push('before') }
      protected async afterInsert() { order.push('after') }
    }
    const db = createMockDb();
    (db.insert as any).mockImplementation(async () => {
      order.push('db.insert')
      return new EditResult({ insertId: 1, affectedRows: 1, changedRows: 0 })
    })
    const model = new HookedModel(db, 'test_table', { id: 1 })
    await model.insert()
    expect(order).toEqual(['before', 'db.insert', 'after'])
  })

  it('afterInsert receives EditResult', async () => {
    let received: EditResult | null = null
    class HookedModel extends TestModel {
      protected async afterInsert(result: EditResult) { received = result }
    }
    const db = createMockDb()
    const model = new HookedModel(db, 'test_table', { id: 1 })
    await model.insert()
    expect(received).toBeInstanceOf(EditResult)
  })

  it('beforeUpdate and afterUpdate are called', async () => {
    const order: string[] = []
    class HookedModel extends TestModel {
      protected async beforeUpdate() { order.push('before') }
      protected async afterUpdate() { order.push('after') }
    }
    const db = createMockDb();
    (db.update as any).mockImplementation(async () => {
      order.push('db.update')
      return new EditResult({ insertId: 0, affectedRows: 1, changedRows: 1 })
    })
    const model = new HookedModel(db, 'test_table', { id: 1, name: 'test' })
    await model.update()
    expect(order).toEqual(['before', 'db.update', 'after'])
  })

  it('beforeDelete and afterDelete are called in order', async () => {
    const order: string[] = []
    class HookedModel extends TestModel {
      protected async beforeDelete() { order.push('before') }
      protected async afterDelete() { order.push('after') }
    }
    const db = createMockDb();
    (db.deleteFrom as any).mockImplementation(async () => {
      order.push('db.delete')
      return new EditResult({ insertId: 0, affectedRows: 1, changedRows: 0 })
    })
    const model = new HookedModel(db, 'test_table', { id: 1 })
    await model.deleteRow()
    expect(order).toEqual(['before', 'db.delete', 'after'])
  })

  it('hooks work with updateTouched too', async () => {
    const spy = vi.fn()
    class HookedModel extends TestModel {
      protected async beforeUpdate() { spy('before') }
      protected async afterUpdate() { spy('after') }
    }
    const db = createMockDb()
    const model = new HookedModel(db, 'test_table', { id: 1, name: 'test' })
    model.__touch('name')
    await model.updateTouched()
    expect(spy).toHaveBeenCalledWith('before')
    expect(spy).toHaveBeenCalledWith('after')
  })
})

describe('Model with composite primary keys', () => {
  class CompositeModel extends Model {
    get primaryKeys(): string[] { return ['userId', 'roleId'] }
  }

  it('uses composite where for update', async () => {
    const db = createMockDb()
    const model = new CompositeModel(db, 'user_roles', { userId: 1, roleId: 2, active: true })
    await model.update()
    expect(db.update).toHaveBeenCalledWith(
      { active: true },
      'user_roles',
      { userId: 1, roleId: 2 },
      {},
    )
  })

  it('uses composite where for deleteRow', async () => {
    const db = createMockDb()
    const model = new CompositeModel(db, 'user_roles', { userId: 1, roleId: 2 })
    await model.deleteRow()
    expect(db.deleteFrom).toHaveBeenCalledWith('user_roles', { userId: 1, roleId: 2 })
  })
})

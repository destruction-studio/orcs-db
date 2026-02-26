import { EditResult } from '../core/result/EditResult'

export interface ModelHooks {
  beforeInsert(): Promise<void>
  afterInsert(result: EditResult): Promise<void>
  beforeUpdate(): Promise<void>
  afterUpdate(result: EditResult): Promise<void>
  beforeDelete(): Promise<void>
  afterDelete(result: EditResult): Promise<void>
}

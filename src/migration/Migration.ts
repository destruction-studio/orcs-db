import { Connection } from '../core/Connection'

export abstract class Migration {
  database(): string | undefined { return undefined }
  abstract up(db: Connection): Promise<void>
  abstract down(db: Connection): Promise<void>
}

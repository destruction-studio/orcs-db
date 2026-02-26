import { Connection } from '../core/Connection'

export abstract class Migration {
  abstract up(db: Connection): Promise<void>
  abstract down(db: Connection): Promise<void>
}

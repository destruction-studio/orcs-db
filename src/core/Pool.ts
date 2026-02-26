import mysql from 'mysql2'
import { Connection } from './Connection'

export interface PoolConfig {
  host: string
  user: string
  password: string
  database: string
  connectionLimit?: number
  port?: number
}

export interface ExecuteOptions {
  onError?: (err: Error) => void
  name?: string
}

export class Pool {
  readonly #pool: mysql.Pool

  constructor(config: PoolConfig) {
    this.#pool = mysql.createPool({
      host: config.host,
      user: config.user,
      password: config.password,
      database: config.database,
      connectionLimit: config.connectionLimit ?? 50,
      port: config.port ?? 3306,
      waitForConnections: true,
    })
  }

  async getConnection(): Promise<Connection> {
    return new Promise((resolve, reject) => {
      this.#pool.getConnection((err, conn) => {
        if (err) return reject(err)
        resolve(new Connection(conn))
      })
    })
  }

  async execute<T>(action: (db: Connection) => Promise<T>, options?: ExecuteOptions): Promise<T | undefined> {
    const db = await this.getConnection()
    try {
      const result = await action(db)
      db.release()
      return result
    } catch (err) {
      try { db.release() } catch {}
      if (options?.onError) {
        options.onError(err as Error)
        return undefined
      }
      throw err
    }
  }

  async transaction<T>(action: (db: Connection) => Promise<T>, options?: ExecuteOptions): Promise<T | undefined> {
    const db = await this.getConnection()
    try {
      await db.startTransaction()
      const result = await action(db)
      await db.commit()
      db.release()
      return result
    } catch (err) {
      try { await db.rollback() } catch {}
      try { db.release() } catch {}
      if (options?.onError) {
        options.onError(err as Error)
        return undefined
      }
      throw err
    }
  }

  stats(): { acquiring: number; total: number; free: number; queued: number } {
    const p = this.#pool as any
    return {
      acquiring: (p._acquiringConnections?.length ?? p._allConnections.length - p._freeConnections.length) as number,
      total: p._allConnections.length as number,
      free: p._freeConnections.length as number,
      queued: p._connectionQueue.length as number,
    }
  }

  async end(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.#pool.end((err) => {
        if (err) return reject(err)
        resolve()
      })
    })
  }
}

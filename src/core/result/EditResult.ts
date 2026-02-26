export interface EditResultData {
  insertId: number
  affectedRows: number
  changedRows: number
}

export class EditResult {
  readonly #data: EditResultData

  constructor(data: EditResultData) {
    this.#data = data
  }

  getInsertId(): number {
    return this.#data.insertId
  }

  getAffectedRows(): number {
    return this.#data.affectedRows
  }

  getChangedRows(): number {
    return this.#data.changedRows
  }
}

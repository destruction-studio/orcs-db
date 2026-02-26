export class FieldCompiled {
  readonly #name: string
  readonly #type: string
  readonly #primary: boolean
  readonly #index: boolean
  readonly #helpJson: boolean
  readonly #helpGetCols: boolean
  readonly #helpGetReadOnlyMulti: boolean

  constructor(data: {
    name: string; type: string; primary: boolean; index: boolean;
    helpJson: boolean; helpGetCols: boolean; helpGetReadOnlyMulti: boolean;
  }) {
    this.#name = data.name
    this.#type = data.type
    this.#primary = data.primary
    this.#index = data.index
    this.#helpJson = data.helpJson
    this.#helpGetCols = data.helpGetCols
    this.#helpGetReadOnlyMulti = data.helpGetReadOnlyMulti
  }

  getName(): string { return this.#name }
  getType(): string { return this.#type }
  isPrimary(): boolean { return this.#primary }
  isIndex(): boolean { return this.#index }
  hasHelpJson(): boolean { return this.#helpJson }
  hasHelpGetCols(): boolean { return this.#helpGetCols }
  hasHelpGetReadOnlyMulti(): boolean { return this.#helpGetReadOnlyMulti }
}

export class Field {
  #name: string
  #type: string
  #primary = false
  #index = false
  #helpJson = false
  #helpGetCols = false
  #helpGetReadOnlyMulti = false

  private constructor(name: string, type: string) {
    this.#name = name
    this.#type = type
  }

  static int(name: string): Field { return new Field(name, 'number') }
  static string(name: string): Field { return new Field(name, 'string') }
  static double(name: string): Field { return new Field(name, 'number') }
  static date(name: string): Field { return new Field(name, 'Date') }

  primary(): this { this.#primary = true; return this }
  index(): this { this.#index = true; return this }
  helpJson(): this { this.#helpJson = true; return this }
  helpGetCols(): this { this.#helpGetCols = true; return this }
  helpGetReadOnlyMulti(): this { this.#helpGetReadOnlyMulti = true; return this }

  compile(): FieldCompiled {
    return new FieldCompiled({
      name: this.#name, type: this.#type, primary: this.#primary,
      index: this.#index, helpJson: this.#helpJson,
      helpGetCols: this.#helpGetCols, helpGetReadOnlyMulti: this.#helpGetReadOnlyMulti,
    })
  }
}

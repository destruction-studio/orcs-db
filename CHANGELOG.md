# Changelog

## [0.1.2] - 2026-02-27

### Fixed

- **Generator.define() выполнялся при обычном импорте модели** — после генерации define-блок автоматически оборачивается в `/* orcs-db:define ... */` комментарий, при повторной генерации раскомментируется и обновляется

## [0.1.1] - 2026-02-27

### Fixed

- **CLI generate не видел определения моделей** — CLI бандлил свою копию Generator, теперь использует тот же инстанс из `node_modules/orcs-db`
- **Генератор не создавал главный класс модели** — `generate()` теперь автоматически создаёт файл `User.ts` (extends BasicUser), если он не существует
- **Нет поддержки ESM в генераторе** — автоопределение формата по `package.json` (`type: module`) и расширению файла (`.mjs`/`.cjs`), генерация `import`/`export` для ESM-проектов

## [0.1.0] - 2026-02-27

### Added

- Core: Pool, Connection, SqlGenerator, Sql (raw SQL marker)
- Query builder: SELECT, INSERT, UPDATE, DELETE с поддержкой WHERE-синтаксиса
- Pool wrappers: `pool.execute()`, `pool.transaction()` с опциональным `onError`
- SelectResult с методами: `all()`, `row()`, `field()`, `column()`, `allIndexed()`, `columnIndexed()`
- EditResult: `getInsertId()`, `getAffectedRows()`, `getChangedRows()`
- ORM: Model base class с touch-tracking, CRUD, hooks (before/after insert/update/delete), `detach()`
- Field builder: `Field.int()`, `Field.string()`, `Field.double()`, `Field.date()` с модификаторами
- Code generator: dual mode — JS runtime (`Generator.generate()`) и TS CLI (`npx orcs-db generate`)
- Migration system: up/down, batch tracking, CLI commands (migrate, rollback, status, create)
- Ошибки: DbError, QueryError

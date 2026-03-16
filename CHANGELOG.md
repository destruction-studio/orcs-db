# Changelog

## [0.5.0] - 2026-03-16

### Added

- **Multi-database миграции** — миграции могут целиться в разные базы данных через метод `database()` и конфиг `databases` в `orcs-db.config`. Migrator лениво создаёт пулы для вторичных БД и закрывает через `endAll()`
- **Preflight-валидация в `migrate()`** — все pending миграции загружаются и их `database()` проверяется до выполнения первой. Если имя базы не найдено в конфиге — ошибка до начала работы
- **Колонка `database` в `orcs_db_migrations`** — трекинг-таблица хранит имя целевой БД. `ensureTable()` добавляет колонку через `ALTER TABLE ADD COLUMN IF NOT EXISTS` для совместимости с существующими установками
- **`Migration.database()`** — метод базового класса, возвращает `string | undefined` (по умолчанию `undefined` = master pool)
- **`Migrator.endAll()`** — закрывает все вторичные пулы, не трогает master
- **`--database` опция в `migrate:create`** — генерирует шаблон миграции с методом `database()`
- **Database-метка в `migrate:status`** — вывод показывает `[dbName]` рядом с именем миграции

### Changed

- `MigrationStatus` расширен полем `database: string | null`
- `Migrator` конструктор принимает опциональный `databases?: Record<string, PoolConfig>`
- `rollback()` читает `database` из трекинг-таблицы (fallback на класс для старых записей)
- CLI команды `migrate`, `migrate:rollback`, `migrate:status` используют `try/finally` для гарантированной очистки пулов

## [0.4.0] - 2026-03-14

### Added

- **`$and` в WHERE-условиях** — поддержка AND-группировки через `$and: Where[]` для дублирования полей в условиях. Работает аналогично `$or`, поддерживает вложенность и комбинацию с `$or`
- **`Sql` в операторных значениях WHERE** — операторы `<`, `>`, `!=`, `>=`, `<=`, `BETWEEN` теперь принимают `Sql` инстансы для raw SQL выражений (например `['<', db.func.dateSub(30, 'SECOND')]`)
- **`db.func` namespace** — новый класс `Func` с методами `dateSub()` и `dateAdd()` для генерации `DATE_SUB`/`DATE_ADD` выражений. Доступен через `db.func` на Connection, поддерживает все INTERVAL юниты с рантайм-валидацией

### Changed

- Тип `Where` переключен с `Record<string, WhereValue> &` на явную index signature для корректной работы `$or`/`$and`

### Exported

- `Func`, `IntervalUnit`

## [0.3.0] - 2026-03-09

### Added

- **Structured ORDER BY** — `order` в `QueryOptions` теперь принимает не только raw string, но и типизированные формы: tuple `['field', 'DESC']`, массив tuple `[['a', 'ASC'], ['b', 'DESC']]`, объект `{ a: 'ASC', b: 'DESC' }`, и `Sql` для сложных выражений. Структурированные формы backtick-экранируют имена полей и валидируют направление (только ASC/DESC)

### Exported

- Новые типы `OrderOption`, `OrderDirection`

## [0.2.0] - 2026-03-06

### Added

- **`$or` в WHERE-условиях** — поддержка OR-группировки через `$or: Where[]`. Условия внутри массива объединяются через OR и оборачиваются в скобки. Поддерживает вложенность и все существующие операторы (null, сравнения, IN, BETWEEN, raw Sql)

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

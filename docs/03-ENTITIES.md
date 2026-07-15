# Сущности и поля

## Модель (MVP + задел)

| Сущность | Фаза | Описание |
|----------|------|----------|
| User | MVP | сотрудники (роль, город, телефон, даты, active/fired) |
| Master | MVP | мастер (тип User без кабинета / отдельная сущность) |
| Client | MVP | телефон (уникальный нормализованный), имя, возраст-кат, комм.филиала |
| Order | MVP | заявка |
| OrderPayment | MVP | оплаты / поля сумм |
| OrderDocument | 2 | файлы к заявке |
| Claim | MVP | претензия |
| Partner | MVP | справочник партнёров |
| City / Branch | MVP | город / филиал |
| SalaryCategory | 2 | пороги суммы работы → % ЗП |
| CashTx | 3 | касса |
| AdDailyReport | 3/4 | реклама за день |
| Asset | 5 | имущество |
| ChatThread / Msg | 5 | чат-центр |

## Client

| Поле | Тип | Правило |
|------|-----|---------|
| id | uuid | PK |
| phone_normalized | string | уникальный ключ поиска |
| name | string | отображаемое имя; уник: phone + name |
| age_category_id | fk | возрастные категории |
| branch_comment | text | комментарий филиала |
| city_id | fk | nullable |
| created_at | datetime | |

Уникальность: `normalize(phone)` + отображаемое имя.

## Order (заявка) — поля MVP

| Поле | Тип | Описание |
|------|-----|----------|
| id | string(9) | публичный номер: MMYYWNNNN (см. `06-ID-RULES.md`) |
| client_id | fk | клиент |
| type | enum | `NEW` / `WARRANTY` / `REPEAT` |
| source_kind | enum | `OUR` / `PARTNER` |
| source_our | enum? | `AVITO` / `LEAFLET` (если OUR) |
| partner_id | fk? | если PARTNER |
| created_at | datetime | дата/время формирования |
| scheduled_at | datetime? | дата/время выполнения; null → статус Не оформлена |
| address | string | адрес |
| age_category_id | fk | возрастная категория (копия/ссылка) |
| comment | text | комментарий по заявке |
| master_id | fk? | мастер |
| status | enum | см. `02-STATUSES.md` |
| is_claim | bool | флаг претензии |
| is_warranty | bool | доп. статус гарантии |
| is_repeat | bool | |
| is_profile | bool | профильная / непрофильная |
| type_tech | string | тип техники (текст вручную) |
| branch_comment_snapshot | text? | комм. филиала / карточки клиента |

## OrderPayment

| Поле | Тип | Описание |
|------|-----|----------|
| paid | decimal | оплачено клиентом |
| prepay | decimal | предоплата |
| parts_cost | decimal | стоимость комплектующих |
| parts_yes_no | bool | комплектующие есть/нет |
| work_sum | decimal | считаемое: paid − parts_cost |
| master_percent | decimal | % из категории |
| master_salary | decimal | work_sum × % |
| to_company | decimal | work_sum − master_salary |

Считаемые поля — фаза 2 (автопересчёт); на MVP храним базовые суммы вручную/с пересчётом на бэке.

## Claim (претензия)

| Поле | Тип | Описание |
|------|-----|----------|
| order_id | fk | заявка |
| type | enum | `POLICE` / `MASTER_BROKE` / `PRICE_DISSATISFIED` (+ расширяемо) |
| created_at | datetime | авто |
| closed_at | datetime? | ставит диспетчер |
| refund_sum | decimal | сумма возврата |
| order_sum | decimal | сумма заявки |
| city_id | fk | город |

## Partner / City / SalaryCategory

Справочники; начальные значения — `docs/DATA/`.

## Master

Мастера без личного кабинета web; используются для выбора в заявке.
При «удалении» (увольнении) открытые заявки → `master_id = null`, требуют переназначения.

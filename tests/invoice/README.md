# POS return persistence regression

`pos-returns.integration.cjs` runs the real return service, invoice/credit
repositories, stock changes, payment allocations and royalty ledger against an
existing migrated MySQL dump. It never synchronizes or migrates the schema. Each
case runs inside an outer transaction that is rolled back even on failure;
service transactions use real savepoints. Permission lookup and customer-wide
balance/cache recalculation are stubbed to keep the fixture isolated.

Use an explicitly approved test dump with the invoice-POS migrations applied.
Do not target production. PowerShell, from the API repository:

```powershell
yarn build
$env:NODE_ENV = 'test'
$env:DB_DATABASE = 'smw_sep_23'
$env:SMW_POS_TEST_DATABASE = 'smw_sep_23'
node --test tests/invoice/pos-returns.integration.cjs
```

The four cases cover paid/unpaid partial/full returns. They assert that:

- The retry key survives the credit's final totals save in MySQL.
- Replaying the same request returns the original credit without changing
  quantities, stock, balances, payment allocations or royalty entries.
- A new request can return remaining goods, and earlier requests still resolve
  to their original credits after all goods have been returned.
- All fixture rows roll back.

The normal Vitest return tests run without a database. They complement this
regression but cannot prove TypeORM's later entity saves preserve a raw SQL change.

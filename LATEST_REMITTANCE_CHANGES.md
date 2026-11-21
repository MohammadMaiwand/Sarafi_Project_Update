# Latest Tehran and provincial remittance changes

Implemented in the existing React/Django application on 6 November 2026.

The subsequent [rules 6.4 follow-up](PROVINCIAL_RULES_6_4.md) supersedes the agency-report perspective labels below and adds signed eight-line reports, provincial numbering configuration and contact editing.

## Routes and behavior

- `/tehran-remittances`: distinct depositor cardholder and card number, recipient card retained, `مرجع مصرف` label throughout create/edit/detail/receipt. Card values remain strings, including leading zeros; list and receipt card displays are masked.
- `/incoming`: `حواله تهران کابل`, explicit USD→AFN and Toman→AFN paths, manual rates, editable profit with currency and null/zero distinction, filtered customer AFN and Toman totals. These are two currency views, never one combined monetary total. Missing historical conversion values are marked unknown.
- `/provincial-remittances`: provincial landing page. `/outgoingimage` redirects here. `/provincial-inbound` and `/provincial-outbound` begin with province selection, then actual configured representative accounts, scoped remittances, search, filters, table/card view, pagination, printing and totals. `/outgoing` and `/outgoing/new` retain their existing separate workflow.
- `/provincial-accounts/:accountId`: persistent representative ledger across both directions; selected Solar Hijri month, all-history view, per-currency balances, explicit movements and audited reversal/correction.
- Province catalog: 34 stable `AF-XXX` identifiers, verified against Unicode CLDR territory subdivisions: https://www.unicode.org/cldr/charts/48/supplemental/territory_subdivisions.html . Kunduz can also be searched as قندوز. No example representatives or test financial data were inserted into the live database.

## Financial conventions

- USD 100 × AFN 70/USD = AFN 7,000. Toman 10,000,000 × AFN 0.70/1,000 Toman = AFN 7,000. Only the selected path is applied. Existing rates retain base quantity 1; new Toman quotes default to an explicitly labeled base of 1,000. Existing stored financial amounts are preserved when editing metadata/profit. No rate is supplied automatically.
- Manual profit is an independent amount and currency. Blank is null; entered zero is zero. Rate changes, beneficiary payments and representative settlements do not recalculate it. Existing incoming Toman profit is retained with its known unit. Historical outgoing profit with no established currency keeps its value and an explicitly unknown unit.
- Positive representative balance: `طلبکار` / `نماینده به ما بدهکار است`. Negative: `بدهکار` / `ما به نماینده بدهکار هستیم`. Zero: `تصفیه‌شده`. Provincial inbound establishes a positive representative obligation; outbound establishes a negative one, as stated in their forms. Explicit receivable, office obligation, repayment and advance movement types handle other meanings of money sent/received.
- Opening balance sums confirmed ledger entries before the month; monthly movement uses inclusive start/exclusive next-month start; closing is their signed sum. No copied activity or automatic carry-forward posting is created by a read. Currency balances remain separate. Historical reversals change later calculated balances while retaining the original audit trail.
- Beneficiary payouts and representative settlements use separate ledger buckets and allocations. Partial/full beneficiary status derives from confirmed allocations. A settlement covering multiple remittances is one idempotent document with explicit allocations. Reversal uses the whole original document, including all of its allocations.
- Financial arithmetic uses exact decimal values. Display uses shared grouped numbers with at most two decimals and HALF_UP rounding; small rates use a labeled larger quote unit. Dates and month boundaries use the Afghan Solar Hijri calendar and Asia/Kabul business date rules.

## Persistence and local deployment

- Applied migrations `0019`–`0022`: province relations/catalog, manual profit, incoming rate base/path and conversion-availability flags.
- Backup: `backups/before-workspace-brief-20261106-103329.sqlite3`.
- `MIGRATION_VERIFICATION.json` records unchanged IDs and selected financial values across 12 legacy and ledger tables. The migrations do not recalculate historical transaction amounts or create financial postings.
- Local Django server restarted on port 8000; Vite remains on port 5173. `verify_workspace_live.py` checks authenticated routes through the frontend proxy without creating financial records.

## Verification

- Backend: `manage.py test api --noinput` — 97 tests passed, including 14 latest-remittance cases covering both rates, legacy amounts, card round trips, profit null/zero/editing, filtered customer totals, province/account scoping, beneficiary partial/full/duplicate/invalid payments, separate representative settlements, multiple allocations, complete receipt reversal, all monthly examples, inactive months, New Year, currency isolation, historical correction and read-only refreshes.
- Frontend utilities: `node --test --test-isolation=none src/utils/*.test.mjs` — 31 tests passed.
- Actual React component SSR: `verify-latest-remittances.mjs`, `verify-ledger-render.mjs`, `verify-dashboard-render.mjs` passed. These verify labels, fields, receipts, card strings/masking, quote examples, populated provincial rows, monthly summaries, receiver-bound UUID initialization and independent navigation states.
- `npm --prefix frontend run build` passed. Lint completed with no errors and 10 existing warnings concerning effects and one redundant catch. `makemigrations --check --dry-run` reported no pending changes.
- Live frontend-proxied HTTP checks: 20 authenticated API routes returned 200; anonymous financial access returned 401. Financial documents, postings, audits and numbering sequences were unchanged by report reads. See `LIVE_API_VERIFICATION.json`.
- Interactive browser verification was unavailable because the browser automation runtime failed to start. Component SSR checks do not establish pixel-level visual correctness or replace interactive browser testing.

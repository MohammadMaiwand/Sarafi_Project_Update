# Provincial rules 6.4 — implementation and verification

Implemented in the existing application, 6 November 2026. These rules supersede the older report labels described in `LATEST_REMITTANCE_CHANGES.md`.

## Agency and office perspectives

- `/agency-reports` shows USD, AFN, EUR and TOMAN separately, including currencies with zero activity. Additional currencies appear when actually used.
- Positive signed balance means the agency owes the office: agency **بدهکار** / **نمایندگی بدهکار است**, office **طلبکار** / **صرافی طلبکار است**.
- Negative signed balance means the office owes the agency: agency **طلبکار**, office **بدهکار**. Zero is **تصفیه‌شده** for both.
- Provincial account cards and monthly ledgers show both perspectives explicitly. Existing office-perspective API fields retain their convention, with separate agency-perspective fields, avoiding an ambiguous inversion for existing consumers. Running history labels explicitly identify the office perspective.
- Main navigation and the dashboard now use **گزارش نمایندگی‌ها**. The older provincial-receipt records remain accessible via the report's historical-records link and their original routes.

## Eight-line monthly reconciliation

All eight rows are always displayed, individually, including zero rows:

| Operation | Line |
|---|---|
| Add | دریافتی |
| Add | پول امانت مردم |
| Add | امانت همکاران |
| Subtract | توزیع |
| Subtract | معاش |
| Subtract | مصارف |
| Subtract | قرض بالای مردم |
| Subtract | قرض بالای همکاران |

As explicitly selected by the user, settlements are included inside these eight lines with their actual positive or negative effects. The report displays both the line amount and its signed balance effect, plus expandable dated source references. For example, an allocated inbound agency receipt reduces the receipts line; an outbound agency payment reduces the distribution line's amount. Reversals negate the original line. Remittance obligations and other account entries also retain their actual signed effect and reconcile in the appropriate receipt/distribution line.

Only confirmed representative-account postings are included: agency settlements and operational account movements. Beneficiary payouts, separate fee postings, and counterpart principal/loan postings are excluded from this sum. An allocated receipt spanning several remittances contributes its posting portions once each; these sum to its one receipt total. No duplication of the whole receipt occurs.

Opening is the signed sum before the selected Afghan Solar Hijri month. Movement is the sum of the first three lines minus the last five. Closing is opening plus movement. Reads do not generate carry-forward postings or copy earlier activity. Month boundaries retain the existing Asia/Kabul inclusive-start/exclusive-next-month-start policy.

Acceptance fixture through the normal API:

- Sunbula opening/closing AFN 20,000.
- Mizan additions: 1,000 + 2,000 + 3,000 = 6,000.
- Mizan deductions: 4,000 + 2,000 + 1,000 + 5,000 + 2,000 = 14,000.
- Mizan net movement: −8,000; closing: 12,000.
- Agency: **نمایندگی بدهکار است**. Office: **صرافی طلبکار است**.
- Following inactive months and the next Solar Hijri year open at 12,000 with zero new activity.

Public deposit principal remains in its separate cash/term liability account. New colleague deposit principal is posted to the colleague's `DEPOSIT_PRINCIPAL` bucket, distinct from colleague loans; historical postings are preserved. The report displays deposit liabilities separately and never treats them as profit. Colleague deposits now correctly require a colleague counterpart account.

## Provincial numbering

- An authenticated administrator can configure the start on the provincial landing/list pages via `/api/provincial/numbering/`. Other authenticated users can inspect the next number but cannot change configuration.
- New provincial remittances share the `PVL` series across inbound/outbound, provinces and representatives, scoped by Afghan Solar Hijri year. This keeps the existing yearly sequence model, and leaves all historical references, existing `FIN` sequences, and legacy `PRV` scopes untouched.
- A fresh series configured at 200 issues `PVL-1405-200`, then 201, then 202. Other financial documents do not consume provincial numbers. A reset below an already-issued number cannot reuse it. The displayed next reference is a preview; issuing a number happens only within the confirmed document transaction.
- Database uniqueness, row locking, SQLite write-lock serialization and the existing bounded retry/idempotency mechanism protect concurrent issuance. Repeated identical submissions reuse the same document.

## Settlement and phone workflows

- Inbound action: **دریافت از نمایندگی**. Remaining = original agency obligation minus confirmed receipts allocated to the remittance, including negative reversal allocations.
- Outbound action: **پرداخت به نمایندگی**. Remaining = original agency obligation minus confirmed allocated payments.
- Both show obligation, settled amount and remaining agency balance independently from the beneficiary balance. Profit is untouched by settlement.
- Both directions include **شماره تماس فرستنده** and **شماره تماس گیرنده** in create, contact/identity edit and detail views. Values remain strings with leading zeros.
- Metadata edits use `/api/provincial/remittances/:id/`, update only changed fields, preserve masked-but-unchanged identifiers, record an audit event without copying sensitive values, and cannot modify amounts or postings. Financial correction remains an audited full-document reversal.

## Actual checks

- Django: **104 tests passed**, including seven new compound rules-6.4 tests for all four currency statuses, the eight lines and acceptance example, separate principal, signed settlements and reversals, phone persistence and masking protection, authorization, series scope, concurrent issuance and duplicate submissions.
- Frontend utility tests: **32 passed**.
- Actual React SSR checks passed: `verify-provincial-rules64.mjs`, `verify-latest-remittances.mjs`, `verify-dashboard-render.mjs`, `verify-ledger-render.mjs`. The last also guards against blank financial forms and receiver-sensitive UUID initialization.
- Production build passed. Lint has no errors and the same 10 pre-existing warnings. Model/migration check reports no changes; no new schema migration is required for this follow-up.
- Updated Django server activated locally on port 8000, with frontend proxy on 5173. **21 authenticated live API routes passed**, including provincial numbering; anonymous financial access was rejected. These checks inserted no financial data.
- `RULES64_DATA_VERIFICATION.json` verifies that all original columns and rows across 12 historical/ledger tables still match the preserved SQLite backup. No historical financial reference or amount was rewritten.
- Interactive browser automation remains unavailable. SSR verifies real component output, not mouse interactions or pixel-level rendering. Save/reload, settlement, report and concurrency behavior were exercised through the application API in isolated test databases; live checks were read-only.

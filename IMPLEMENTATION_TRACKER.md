# Amiri Workspace implementation and verification

User brief: attached “Codex implementation brief — Amiri Workspace remittance and currency exchange”.
Clarification: all monetary amounts and rates are entered manually. No “230” rate is inferred or applied. Existing PKR configuration identifies kaldar as Pakistani rupees.

| Requirement | Implementation | Verification / limits |
| --- | --- | --- |
| 1. Afghan dates | Shared `calendar.js`, `AfghanDate.jsx`, backend `calendar_policy.py`; Kabul timezone; dashboard, expenses, mudarabah, custody inputs and periods; existing remittance/debt date helpers retained. Gregorian machine interfaces remain available; UI requests opt in with `calendar=afghan`. | Nowruz, leap Hut, inclusive/exclusive month boundaries tested. Live Aqrab 1405 query verified as 2026-10-23 through 2026-11-22 exclusive. Browser layout could not be inspected because both browser/Windows Node runtimes failed to start. |
| 2. Numbers | `presentation.js` supplies exact decimal HALF_UP presentation, commas, Latin digits, at most two decimals, missing-value marker, negative-zero normalization. Existing format wrappers delegate to it; editable values use `groupExact`. Small-rate quote-unit helper. IDs remain strings; card displays are masked. | Screenshot fixtures and exact editable-rate tests pass. No storage precision reduction. Old arithmetic helpers remain separate from presentation. |
| 3. Shared records/posting | New authenticated financial accounts link existing customers, colleagues and agencies. Confirmed, per-currency postings; idempotency keys; atomic sequence assignment; configurable starting number; explicit reversals; immutable financial documents; legacy numeric corrections/deletions logged without personal payloads. | Duplicate, concurrent, overpayment, reversal and currency-isolation tests. New token authorization required for business APIs; login/health remain public. Financial audit readable by staff. |
| 4. Tehran | Manual source/destination currencies, optional destination, USD stage independent of AFN, fee currency/method, 12-place stored rates, rate/conversion snapshots, sender father, depositor cardholder/card, recipient card, amount words and purpose. Effective-rate labels replace misleading profit labels. | Conversion example, exact rate preservation, USD-only stage, fees and invalid rates tested. No invented cost basis or realized profit; unavailable profit stays unavailable. Manual-rate clarification supersedes automatic rate defaults. |
| 5. Provincial workflows | `/provincial-inbound`, `/provincial-outbound`; agency link; sender/recipient/locality details; separate beneficiary and agency obligations; partial/full receipts; explicit multi-remittance allocations with exact reconciliation. | Independent settlement, over-allocation and multiple-allocation tests. Old remittances can be linked explicitly from `/unpaid-remittances`; accounts/agency relationships are not guessed from matching names. |
| 6. Agency reports | `/agency-reports`: Afghan month, agency, currency, opening, signed movement, closing, category breakdown and separate deposit liabilities. Closing derives from all earlier confirmed postings rather than inserting rollover entries. | 20,000 − 8,000 = 12,000; next month's opening equals prior closing. Report totals cover confirmed ledger postings; unlinked legacy movements are not silently reclassified. |
| 7. Debtors/creditors/colleagues | `/financial-accounts` includes Kabul debtor, Iran debtor, creditor and colleague account types; profile fields; per-currency balances; loans, obligations, collections/payments and cross-currency settlement; monthly activity separately from totals. Existing customer dashboards link related accounts. Old colleague workflow also accepts EUR/PKR/TRY with explicit existing AFN-per-unit convention. | 50,000 − 30,000 + 10,000 = 30,000. Actual payment currency/rate and account equivalent retained. Existing debtor/colleague historical records stay in their original interfaces; they are not automatically merged into a new opening balance. |
| 8. Custody/deposits | `/custody`: cash, unpaid remittance source, pending exchange, contractual deposit; manual terms/identity/acknowledgements; principal postings separate from fee bucket; partial/final releases; source obligation before conversion, destination after explicit commitment. New duplicate HAWALA deposit creation is rejected; use original remittance and linked receipts. | Pending-conversion and partial-release tests; excess release rejected. Existing unlinked legacy custody remains readable. Hardware fingerprint acquisition and electronic stamp/signature verification are not implemented; manual acknowledgement/signature fields and printable signature/stamp areas are available. |
| 9. Verification | Backend regression suite, shared-format/date/calculation tests, concurrent posting test, production build, live authenticated route checks, before/after database fingerprints. | See `MIGRATION_VERIFICATION.json`, `LIVE_API_VERIFICATION.json` and tests. Browser UI verification was unavailable; no claim of visual QA. |

## Routes

- `/tehran-remittances`, `/customer/:id`: existing Tehran flows with expanded manual conversion.
- `/financial-accounts`, `/financial-accounts/:accountId`: shared account profiles, transactions, receipt printing, corrections and monthly CSV.
- `/creditors`, `/custody`: focused account lists.
- `/provincial-inbound`, `/provincial-outbound`: separate provincial workflows.
- `/unpaid-remittances`: confirmed unpaid obligations plus original unlinked remittances, with explicit linking.
- `/identity-review`: mutually exclusive ID/phone omissions with separate AFN and TOMAN totals.
- `/agency-reports`: per-agency, per-currency monthly report.

## Financial and compatibility policy

- Source and destination quotes are currency units per USD. USD/USD is 1. Settlement precision is explicitly three decimals; display precision is two decimals HALF_UP. Rates retain twelve decimals in Tehran and snapshots preserve the supplied quote.
- A blank destination produces no destination obligation. A deducted fee must use the destination currency. Fee postings are separate and never added to principal twice.
- A financial correction reverses the original postings and retains links and operator. Old APIs retain their schemas, plus additive fields, but now require an authenticated token. Obtain it from the existing login endpoint and send `Authorization: Token …`; the web app does this automatically after signing in.
- Existing IDs and amounts were fingerprinted before/after migrations. Historical identity, agency matching, account balances, old rates and ambiguous profit costs are not inferred.
- Legacy accounts are not automatically consolidated with new ledger accounts. The original history remains accessible. Explicit remittance links prevent a second source liability. This is a deliberate data-reconciliation boundary, not a claim that every historical movement appears in the new agency report.
- App tests create only test database postings. Live verification creates no financial records. Temporary access tokens used by live checks are removed if created by the check.

## Operational limits

- The browser/Windows automation runtime was unavailable, so interactive layout, picker focus, print pagination and end-user click paths have not been visually verified.
- Biometric device integrations, cryptographic signatures and automatic bank/agency reconciliation remain outside the implemented manual-entry flows.
- If historical consolidation is required, reconcile original counterpart accounts and currencies explicitly before importing opening balances; never sum differently denominated amounts or migrate by name alone.

## Final checks actually run

- `manage.py test api --noinput`: 81 tests passed, including concurrent idempotent posting and legacy correction audit.
- `node --test --test-isolation=none frontend/src/utils/*.test.mjs`: 22 tests passed.
- `npm --prefix frontend run lint`: no errors; existing effect-style warnings remain, including a similar warning on the new ledger loader.
- `npm --prefix frontend run build`: production bundle succeeded.
- `manage.py makemigrations --check --dry-run`: no pending model changes.
- Live frontend-proxied API: 11 authorized routes returned 200, anonymous financial access returned 401, Aqrab period bounds matched, and no financial records were created.
- Database migrations 0011–0018 were applied with SQLite backups; selected existing financial rows and IDs matched their pre-migration fingerprints.

## Follow-up: missing navigation / empty dashboard

- Every new workflow is now present in the main menu and directly on the dashboard; the desktop menu wraps instead of hiding items in horizontal overflow.
- Added authenticated `/api/session/` validation at startup and session-expiry handling for failed data requests. A stale authorization header is never sent to the login endpoint.
- Dashboard customer, totals and remittance requests fail independently; one failure no longer suppresses successful totals. An unavailable period is shown as missing with an error rather than as zero or another month's figures.
- Added specific session/navigation regressions and `frontend/verify-dashboard-render.mjs`. Actual React output verifies all new links and the four dashboard formatting fixtures. This is server-rendered component verification, not an interactive browser screenshot check.
- Live verification now includes the session endpoint; no financial records are created or altered by these checks.

## Follow-up: financial form crash and automatic calculations

- Fixed unbound `crypto.randomUUID` lazy state initializers in both LedgerForm and Tehran NewTransaction. Regression rendering uses a receiver-sensitive crypto implementation to reproduce the browser's `Illegal invocation` behavior.
- Main navigation uses pathname plus account-kind query to set a single `aria-current` and active style for financial accounts, Kabul debtors or Iran debtors. Type-specific account forms start with the selected type.
- Added exact-decimal automatic USD/gross/net previews, projected per-currency balances, derived agency settlement fields, automatic allocation totals and a full-outstanding allocation action. Results are read-only; the server still calculates authoritative amounts and balances from confirmed postings.
- API balances are serialized as settlement-precision decimal strings, preserving editable/input arithmetic precision at the client boundary.
- Empty accounts/history now have explicit empty states. A route-level error boundary keeps an unexpected future page error from blanking the entire application.
- `frontend/verify-ledger-render.mjs` verifies all four LedgerForm modes, the Tehran form, independent menu states and read-only result fields. Unit tests cover exact conversion, allocation sums and projected balances; API tests verify the server ignores invented client totals.

## Latest Tehran and provincial brief

Completed: depositor card fields/labels, explicit incoming quote paths, filtered customer currency totals, manual profit, provincial landing and shared province/representative accounts, separate beneficiary payments and representative settlements, and calculated monthly per-currency carry-forward with audited historical correction. Full routes, migration compatibility decisions, backup, financial conventions and actual verification results are in [LATEST_REMITTANCE_CHANGES.md](LATEST_REMITTANCE_CHANGES.md).

Final checks: 97 backend tests, 31 frontend utility tests, three actual-component SSR checks, production build, and 20 authenticated live API checks passed. Lint has no errors and 10 existing warnings. Interactive browser verification remains unavailable; SSR is not pixel-level browser testing. Applied migrations 0019–0022 after backup and preservation checks across 12 financial/legacy tables.

## Follow-up: provincial rules 6.4

Completed the four-currency agency-perspective balances with explicit opposite office status, eight-line signed monthly reconciliation (settlements included as selected by the user), separate deposit principal, administrator-configured provincial numbering, independent inbound/outbound agency settlement labels and amounts, and persisted contact editing. Historical references and financial values are preserved. See [PROVINCIAL_RULES_6_4.md](PROVINCIAL_RULES_6_4.md) for the full mapping, series scope and acceptance example.

Actual checks: 104 backend tests, 32 frontend utility tests, four component SSR verifications, production build, no pending schema changes, and 21 authenticated live API routes passed. Original columns and rows in all 12 protected tables remain unchanged. No new migration or live test financial records were needed; interactive browser verification remains unavailable.

import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import assert from 'node:assert/strict'

// Read-only SSR checks; no account, payment, or business record is created.
globalThis.localStorage = { getItem: () => null }
const server = await createServer({ configFile: false, plugins: [react()], server: { middlewareMode: true }, appType: 'custom' })
try {
  const { LanguageContext } = await server.ssrLoadModule('/src/hooks/LanguageContext.js')
  const { FinancePage, TableShell } = await server.ssrLoadModule('/src/components/FinanceUI.jsx')
  const { default: Header } = await server.ssrLoadModule('/src/components/Header.jsx')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const language = { ui: text => text, t: text => text, lang: 'fa', isRTL: true, sectionLabels: {} }
  const render = (child, path = '/') => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(QueryClientProvider, { client }, createElement(LanguageContext.Provider, { value: language }, child))))
  const samples = [
    ['LedgerPage', '/financial-accounts'], ['LedgerPage', '/custody'], ['LedgerPage', '/identity-review'],
    ['LedgerPage', '/agency-reports/representatives'], ['CreditorsPage', '/creditors'],
    ['UnpaidRemittancesPage', '/unpaid-remittances'], ['RemittancePage', '/incoming', { kind: 'incoming' }],
    ['RemittancePage', '/provincial-received', { kind: 'provincial-received' }],
    ['ProvincialWorkspace', '/provincial-inbound'], ['ProvincialWorkspace', '/provincial-outbound'],
    ['OutgoingWorkspace', '/outgoing'], ['ProvincialReceivedPage', '/outgoing/records'],
    ['ColleaguesPage', '/colleagues'], ['DebtorsPage', '/debtors'], ['DepositsPage', '/deposits'],
    ['MudarabahPage', '/mudarabah'], ['ExpensesPage', '/expenses'], ['SystemReportsPage', '/agency-reports'],
    ['TomanProfitPage', '/toman-profit'], ['PersonalizationPage', '/personalization'],
    ['Dashboard', '/tehran-remittances', { tehranOnly: true }], ['NewTransaction', '/transactions/new'],
    ['WorkspaceDashboard', '/']
  ]
  for (const [name, path, props] of samples) {
    const { default: Page } = await server.ssrLoadModule(`/src/pages/${name}.jsx`)
    const html = render(createElement(Page, props), path)
    assert.ok(html.includes('<main'), `${path}: page renders`)
    if (!['WorkspaceDashboard', 'TomanProfitPage'].includes(name)) assert.ok(html.includes('ui-page-heading'), `${path}: shared heading`)
    assert.ok(!html.includes('????'), `${path}: readable labels`)
  }
  for (const mode of ['menubar', 'sidebar']) {
    const html = render(createElement(Header, { ...language, languages: [{ code: 'fa' }], username: 'QA', navigationMode: mode }), '/expenses')
    assert.ok(html.includes('aria-current="page"'))
    assert.ok(html.includes('href="/expenses"'))
    assert.ok(html.includes('ui-nav-group') || mode === 'menubar')
  }
  const row = createElement('tr', null, createElement('td', null, '250,000 AFN'))
  const table = render(createElement(TableShell, { headers: ['Amount'], rows: createElement(Fragment, null, row) }))
  assert.ok(!table.includes('<h3'), 'fragment rows must not display an empty state')
  assert.ok(table.includes('tabindex="0"'))
  assert.ok(table.includes('scope="col"'))
  const loading = render(createElement(TableShell, { headers: ['Amount'], loading: true, rows: [] }))
  assert.ok(loading.includes('role="status"'))
  assert.ok(loading.includes('aria-busy="true"'))
  const title = render(createElement(FinancePage, { title: 'Accounts' }), '/financial-accounts')
  assert.ok(title.includes('data-tone="finance"'))
  assert.ok(title.includes('ui-module-icon'))
  console.log(`PASS: ${samples.length} route renderings, both navigation modes, module icons, keyboard table regions, and loading states.`)
  client.clear()
} finally { await server.close() }

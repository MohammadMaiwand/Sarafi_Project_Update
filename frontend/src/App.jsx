import { lazy, Suspense, useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { remittanceQueryClient } from './remittances/query'
const ColleagueListPage = lazy(() => import('./pages/ColleaguesPage'))
const ColleagueProfileFormPage = lazy(() => import('./pages/ColleaguesPage').then(module => ({ default: module.ColleagueProfileFormPage })))
const ColleagueLedgerPage = lazy(() => import('./pages/ColleaguesPage').then(module => ({ default: module.ColleagueLedgerPage })))
const ColleagueTransactionPage = lazy(() => import('./pages/ColleaguesPage').then(module => ({ default: module.ColleagueTransactionPage })))
const RemittancePage = lazy(() => import('./pages/RemittancePage'))
const ProvincialReceivedPage = lazy(() => import('./pages/ProvincialReceivedPage'))
const OutgoingWorkspace = lazy(() => import('./pages/OutgoingWorkspace'))
const ProvincialDistributionsPage = lazy(() => import('./pages/ProvincialDistributionsPage'))
const ProvincialPersonFormPage = lazy(() => import('./pages/ProvincialDistributionsPage').then(module => ({ default: module.ProvincialPersonFormPage })))
const ProvincialEntriesPage = lazy(() => import('./pages/ProvincialDistributionsPage').then(module => ({ default: module.ProvincialEntriesPage })))
const ProvincialEntryFormPage = lazy(() => import('./pages/ProvincialDistributionsPage').then(module => ({ default: module.ProvincialEntryFormPage })))
const ProvincialCustomersPage = lazy(() => import('./pages/ProvincialCustomersPage').then(module => ({ default: module.ProvincialCustomersPage })))
const ProvincialCustomerHistoryPage = lazy(() => import('./pages/ProvincialCustomersPage').then(module => ({ default: module.ProvincialCustomerHistoryPage })))
const ProvincialCustomerRemainingPage = lazy(() => import('./pages/ProvincialCustomersPage').then(module => ({ default: module.ProvincialCustomerRemainingPage })))
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useLocation } from 'react-router-dom'
import { PageLoading } from './components/FinanceUI'
import PageErrorBoundary from './components/PageErrorBoundary'
import useAuth from './hooks/useAuth'
import useLanguage from './hooks/useLanguage'
import useTheme from './hooks/useTheme'
import Header from './components/Header'
import Login from './components/Login'
import Settings from './components/Settings'
const PersonalizationPage = lazy(() => import('./pages/PersonalizationPage'))
const ProvincialPage = lazy(()=>import('./pages/ProvincialWorkspace'))
const ProvincialLanding = lazy(()=>import('./pages/ProvincialWorkspace'))
const ProvincialAccountPage = lazy(()=>import('./pages/ProvincialWorkspace').then(module=>({default:module.ProvincialAccountWorkspace})))
const LedgerPage = lazy(() => import('./pages/LedgerPage'))
const CreditorsPage = lazy(() => import('./pages/CreditorsPage'))
const SystemReportsPage = lazy(() => import('./pages/SystemReportsPage'))
const UnpaidRemittancesPage = lazy(() => import('./pages/UnpaidRemittancesPage'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const WorkspaceDashboard = lazy(() => import('./pages/WorkspaceDashboard'))
const NewTransaction = lazy(() => import('./pages/NewTransaction'))
const CustomerDetail = lazy(() => import('./pages/CustomerDetail'))
const DebtorsPage = lazy(() => import('./pages/DebtorsPage'))
const MudarabahPage = lazy(() => import('./pages/MudarabahPage'))
const DepositsPage = lazy(() => import('./pages/DepositsPage'))
const ExpensesPage = lazy(() => import('./pages/ExpensesPage'))
const TomanProfitPage = lazy(() => import('./pages/TomanProfitPage'))

function AppContent() {
  const navigate = useNavigate()
  const location=useLocation()
  const language = useLanguage()
  const appearance = useTheme()
  const auth = useAuth()
  const [navigationMode, setNavigationMode] = useState(() => localStorage.getItem('app_navigation_mode') === 'sidebar' ? 'sidebar' : 'menubar')
  const changeNavigationMode = (mode) => {
    localStorage.setItem('app_navigation_mode', mode)
    setNavigationMode(mode)
  }
  const logout = () => { auth.logout(); navigate('/') }

  return <div data-navigation={auth.isAuthenticated ? navigationMode : 'menubar'} className="app-shell min-h-screen bg-gray-50 text-gray-900 antialiased transition-colors dark:bg-gray-950 dark:text-gray-100">
    <Header {...language} {...appearance} navigationMode={navigationMode} onNavigationModeChange={changeNavigationMode} username={auth.username} onSettings={() => navigate('/settings')} onLogout={logout} />
    <div className="app-content">
    {auth.checking ? <PageLoading label={language.t('common.loading')}/> : !auth.isAuthenticated
      ? <Login t={language.t} onLoginSuccess={(username) => { auth.login(username); navigate('/') }} />
      : <PageErrorBoundary key={location.pathname+location.search}><Suspense fallback={<PageLoading label={language.t('common.loading')}/>}><Routes>
        <Route path="/" element={<WorkspaceDashboard />} />
        <Route path="/financial-accounts" element={<LedgerPage/>}/>
        <Route path="/financial-accounts/:accountId" element={<LedgerPage/>}/>
        <Route path="/provincial-remittances" element={<ProvincialLanding/>}/><Route path="/outgoingimage" element={<Navigate to="/provincial-remittances" replace/>}/><Route path="/provincial-accounts/:accountId" element={<ProvincialAccountPage/>}/><Route path="/provincial-inbound" element={<ProvincialPage direction="PROVINCIAL_IN"/>}/><Route path="/provincial-outbound" element={<ProvincialPage direction="PROVINCIAL_OUT"/>}/><Route path="/unpaid-remittances" element={<UnpaidRemittancesPage/>}/><Route path="/identity-review" element={<LedgerPage/>}/><Route path="/creditors" element={<CreditorsPage/>}/><Route path="/creditors/:creditorId" element={<CreditorsPage/>}/>
        <Route path="/custody" element={<LedgerPage/>}/>
        <Route path="/agency-reports" element={<SystemReportsPage/>}/><Route path="/agency-reports/representatives" element={<LedgerPage/>}/>
        <Route path="/tehran-remittances" element={<Dashboard tehranOnly />} />
        <Route path="/toman-profit" element={<TomanProfitPage />} />
        <Route path="/customer/:id" element={<CustomerDetail />} />
        <Route path="/transactions/new" element={<NewTransaction />} />
        <Route path="/debtors" element={<DebtorsPage />} />
        <Route path="/debtors/:debtorId" element={<DebtorsPage />} />
        <Route path="/debtors/new" element={<DebtorsPage />} />
        <Route path="/debtors/:debtorId/edit" element={<DebtorsPage />} />
        <Route path="/colleagues" element={<ColleagueListPage />} />
        <Route path="/colleagues/new" element={<ColleagueProfileFormPage />} />
        <Route path="/colleagues/:colleagueId" element={<ColleagueLedgerPage />} />
        <Route path="/colleagues/:colleagueId/edit" element={<ColleagueProfileFormPage />} />
        <Route path="/colleagues/:colleagueId/transactions" element={<ColleagueLedgerPage historyOnly />} />
        <Route path="/colleagues/:colleagueId/transactions/new" element={<ColleagueTransactionPage mode="create" />} />
        <Route path="/colleagues/:colleagueId/transactions/:txId" element={<ColleagueTransactionPage mode="view" />} />
        <Route path="/colleagues/:colleagueId/transactions/:txId/edit" element={<ColleagueTransactionPage mode="edit" />} />
        <Route path="/mudarabah" element={<MudarabahPage />} />
        <Route path="/deposits" element={<DepositsPage />} />
        <Route path="/deposits/new" element={<DepositsPage newDeposit />} />
        <Route path="/deposits/:depositId" element={<DepositsPage />} />
        <Route path="/incoming" element={<RemittancePage key="incoming" kind="incoming" />} />
        <Route path="/incoming/new" element={<RemittancePage key="incoming/new" kind="incoming" />} />
        <Route path="/incoming/:id" element={<RemittancePage key="incoming/:id" kind="incoming" />} />
        <Route path="/incoming/:id/edit" element={<RemittancePage key="incoming/:id/edit" kind="incoming" />} />
        <Route path="/outgoing" element={<OutgoingWorkspace />} /><Route path="/outgoing/accounts/:accountId" element={<OutgoingWorkspace account />} /><Route path="/outgoing/records" element={<ProvincialReceivedPage />} />
        <Route path="/outgoing/new" element={<ProvincialReceivedPage />} />
        <Route path="/outgoing/:id" element={<ProvincialReceivedPage />} />
        <Route path="/outgoing/:id/edit" element={<ProvincialReceivedPage />} />
        <Route path="/provincial-received" element={<RemittancePage key="provincial-received" kind="provincial-received" />} />
        <Route path="/provincial-received/new" element={<RemittancePage key="provincial-received/new" kind="provincial-received" />} />
        <Route path="/provincial-received/:id" element={<RemittancePage key="provincial-received/:id" kind="provincial-received" />} />
        <Route path="/provincial-received/:id/edit" element={<RemittancePage key="provincial-received/:id/edit" kind="provincial-received" />} />
        <Route path="/provincial-received/customer/:customer" element={<ProvincialCustomerHistoryPage />} />
        <Route path="/provincial-received/customer-by-id/:id" element={<ProvincialCustomerHistoryPage />} />
        <Route path="/provincial-received/distributions" element={<ProvincialDistributionsPage />} />
        <Route path="/provincial-received/distributions/new" element={<ProvincialPersonFormPage />} />
        <Route path="/provincial-received/customers" element={<ProvincialCustomersPage />} />
        <Route path="/provincial-received/customers-summary" element={<ProvincialCustomersPage />} />
        <Route path="/provincial-received/customer/remittance/:id" element={<ProvincialCustomerRemainingPage />} />
        <Route path="/provincial-received/distributions/:personId" element={<ProvincialEntriesPage />} />
        <Route path="/provincial-received/distributions/:personId/edit" element={<ProvincialPersonFormPage />} />
        <Route path="/provincial-received/distributions/:personId/entries" element={<ProvincialEntriesPage />} />
        <Route path="/provincial-received/distributions/:personId/entries/new" element={<ProvincialEntryFormPage />} />
        <Route path="/provincial-received/distributions/:personId/entries/:entryId/edit" element={<ProvincialEntryFormPage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/personalization" element={<PersonalizationPage />} />
        <Route path="/settings" element={<Settings {...language} {...appearance} username={auth.username} switchAccount={auth.switchAccount} onBack={() => navigate('/')} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes></Suspense></PageErrorBoundary>}
    </div>
  </div>
}

export default function App() {
  return <QueryClientProvider client={remittanceQueryClient}><BrowserRouter><AppContent /></BrowserRouter></QueryClientProvider>
}

from django.urls import path
from . import views
from . import finance_views
from . import debtor_views
from . import system_reporting

urlpatterns = [
    path('reports/system/',system_reporting.system_report),
    path('session/',views.session_api),
    path('hello/', views.hello_api, name='hello-api'),
    path('login/', views.login_api, name='login-api'),
    path('users/', views.users_api, name='users-api'),
    path('users/create/', views.create_user_api, name='create-user-api'),
    path('users/change-password/', views.change_password_api, name='change-password-api'),
    path('customers/', views.customers_api, name='customers-api'),
    path('customers/<int:customer_id>/', views.customer_detail_api, name='customer-detail-api'),
    path('customers/<int:customer_id>/transactions/', views.customer_transactions_api, name='customer-transactions-api'),
    path('transactions/', views.transactions_api, name='transactions-api'),
    path('transactions/auto-voucher/', views.auto_voucher_api, name='auto-voucher-api'),
    path('transactions/next-voucher/', views.next_voucher_api, name='next-voucher-api'),
    path('transactions/<int:transaction_id>/', views.transaction_detail_api, name='transaction-detail-api'),
    path('dashboard/stats/', views.dashboard_stats_api, name='dashboard-stats-api'),
    path('expenses/', finance_views.expenses_api, name='expenses-api'),
    path('expenses/next-number/', finance_views.expense_next_number_api, name='expense-next-number-api'),
    path('expenses/<int:expense_id>/', finance_views.expense_detail_api, name='expense-detail-api'),
    path('mudarabah/', finance_views.mudarabah_api, name='mudarabah-api'),
    path('mudarabah/next-number/', finance_views.mudarabah_next_number_api, name='mudarabah-next-number-api'),
    path('mudarabah/<int:contract_id>/', finance_views.mudarabah_detail_api, name='mudarabah-detail-api'),
    path('debtors/', debtor_views.debtors_api, name='debtors-api'),
    path('debtors/next-number/', debtor_views.debtor_next_number_api, name='debtor-next-number-api'),
    path('debtors/<int:debtor_id>/', debtor_views.debtor_detail_api, name='debtor-detail-api'),
    path('debtors/<int:debtor_id>/payments/', debtor_views.debtor_payments_api, name='debtor-payments-api'),
    path('debtors/<int:debtor_id>/payments/<int:payment_id>/', debtor_views.debtor_payment_detail_api, name='debtor-payment-detail-api'),
    path('customer-deposits/', finance_views.deposits_api, name='customer-deposits-api'),
    path('customer-deposits/next-number/', finance_views.deposit_next_number_api, name='deposit-next-number-api'),
    path('customer-deposits/<int:deposit_id>/', finance_views.deposit_detail_api, name='customer-deposit-detail-api'),
    path('customer-deposits/<int:deposit_id>/withdrawals/', finance_views.deposit_withdrawals_api, name='deposit-withdrawals-api'),
    path('customer-deposits/<int:deposit_id>/withdrawals/<int:withdrawal_id>/', finance_views.deposit_withdrawal_detail_api, name='deposit-withdrawal-detail-api'),
    path('finance/summary/', finance_views.finance_summary_api, name='finance-summary-api'),
]
from . import remittance_views
for remittance_kind in remittance_views.KINDS:
    urlpatterns += [
        path(f'{remittance_kind}/', remittance_views.remittances, {'kind': remittance_kind}),
        path(f'{remittance_kind}/next-number/', remittance_views.next_number, {'kind': remittance_kind}),
        path(f'{remittance_kind}/<int:pk>/', remittance_views.remittance_detail, {'kind': remittance_kind}),
    ]
urlpatterns += [path('provincial-distributions/', remittance_views.distributions)]
urlpatterns += [path('outgoing/customer/', remittance_views.outgoing_customer)]
urlpatterns += [
    path('remittances/options/', remittance_views.remittance_options),
    path('provincial-received/customers/', remittance_views.provincial_customers),
    path('provincial-received/customer/<path:name>/', remittance_views.provincial_customer_history),
    path('provincial-received/customer-by-id/<int:source_id>/', remittance_views.provincial_customer_history),
    path('provincial-received/distributions/', remittance_views.provincial_people),
    path('provincial-received/distributions/<int:person_id>/', remittance_views.provincial_person_detail),
    path('provincial-received/distributions/<int:person_id>/entries/', remittance_views.distributions),
    path('provincial-received/distributions/<int:person_id>/entries/<int:entry_id>/', remittance_views.distribution_detail),
    path('provincial-distributions/<int:entry_id>/', remittance_views.distribution_detail),
]

from . import colleague_views
urlpatterns += [
    path('colleagues/', colleague_views.colleagues),
    path('colleagues/next-number/', colleague_views.colleague_next_number),
    path('colleagues/<int:colleague_id>/', colleague_views.colleague_detail),
    path('colleagues/<int:colleague_id>/transactions/', colleague_views.colleague_transactions),
    path('colleagues/<int:colleague_id>/transactions/next-number/', colleague_views.colleague_next_number),
    path('colleagues/<int:colleague_id>/transactions/<int:tx_id>/', colleague_views.colleague_transaction_detail),
]

from . import provincial_customer_views
urlpatterns += [
    path('provincial-received/customer/', provincial_customer_views.rename_customer),
    path('provincial-received-remittances/customer/', provincial_customer_views.rename_customer),
    path('provincial-received/customers-summary/', provincial_customer_views.customers_summary),
    path('provincial-customers/<int:person_id>/remaining/', provincial_customer_views.customer_remaining),
    path('provincial-customers/<int:person_id>/transactions/', provincial_customer_views.customer_remaining_history),
    path('provincial-remaining-transactions/', provincial_customer_views.create_remaining_transaction),
]

from . import ledger_views
from . import creditor_views
from . import provincial_views
from . import toman_profit_views
from . import dashboard_views
urlpatterns += [
 path('creditors/',creditor_views.creditors),
 path('creditors/<int:pk>/',creditor_views.creditor_detail),
 path('creditors/<int:pk>/payments/',creditor_views.creditor_payments),
 path('dashboard/workspace/',dashboard_views.workspace_dashboard),
 path('provinces/',provincial_views.provinces),
 path('toman-profit/',toman_profit_views.toman_profit),
 path('provinces/<str:code>/accounts/',provincial_views.representatives),
 path('outgoing/agencies/',provincial_views.outgoing_agencies),
 path('outgoing/agencies/<int:pk>/',provincial_views.outgoing_agency_detail),
 path('outgoing/agencies/<int:pk>/transactions/',provincial_views.outgoing_agency_transactions),
 path('provincial/accounts/<int:pk>/ledger/',provincial_views.representative_ledger),
 path('provincial/accounts/<int:pk>/remittances-summary/',provincial_views.account_remittances),
 path('provincial/accounts/<int:pk>/customer-payments/',provincial_views.customer_payments),
 path('provincial/accounts/<int:pk>/movements/',provincial_views.movements),
 path('provincial/remittances/',provincial_views.remittances),
 path('provincial/numbering/',provincial_views.numbering),
 path('provincial/remittances/<int:pk>/',provincial_views.remittance_detail),
 path('provincial/remittances/<int:pk>/payments/',provincial_views.payments),
 path('provincial/remittances/<int:pk>/profit/',provincial_views.profit),
 path('ledger/options/',ledger_views.options),
 path('ledger/accounts/',ledger_views.accounts),
 path('ledger/accounts/<int:pk>/',ledger_views.account_detail),
 path('ledger/agencies/',ledger_views.agencies),
 path('ledger/agencies/<int:pk>/monthly/',ledger_views.monthly_report),
 path('ledger/documents/',ledger_views.documents),
 path('ledger/conversion/',ledger_views.preview_conversion),
 path('ledger/missing-identity/',ledger_views.missing_identity),
 path('ledger/legacy-unpaid/',ledger_views.legacy_unpaid),
 path('ledger/audit/',ledger_views.audit_history),
]

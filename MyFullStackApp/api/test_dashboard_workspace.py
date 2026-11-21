"""Workspace dashboard contract: every card reconciles to its source module."""
import uuid
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model

from .calendar_policy import month_bounds
from .ledger_models import Currency, FinancialAccount, FinancialDocument, ReceiptAllocation
from .models import Customer, Expense, MudarabahContract, Transaction
from .testing import AuthenticatedAPITestCase


class WorkspaceDashboardTests(AuthenticatedAPITestCase):
    def setUp(self):
        super().setUp()
        self.operator = get_user_model().objects.get(username='regression-operator')
        self.start, self.before, _ = month_bounds('1405-08')
        self.end = self.before - timedelta(days=1)

    def account(self, kind='AGENCY'):
        return FinancialAccount.objects.create(kind=kind, name=f'Account {uuid.uuid4().hex[:8]}')

    def document(self, category, amount, currency='AFN', date=None, **extra):
        Currency.objects.get_or_create(code=currency, defaults={'name': currency})
        return FinancialDocument.objects.create(
            number=f'DOC-{uuid.uuid4().hex[:16]}',
            request_key=uuid.uuid4().hex,
            payload_hash=uuid.uuid4().hex * 2,
            account=extra.pop('account', None) or self.account(),
            category=category,
            date=date or self.start,
            currency_id=currency,
            amount=Decimal(amount),
            conversion=extra.pop('conversion', {}),
            details=extra.pop('details', {}),
            status=extra.pop('status', 'CONFIRMED'),
            operator=self.operator,
            **extra,
        )

    def expense(self, amount, currency, date=None):
        return Expense.objects.create(
            expense_number=f'EXP-{uuid.uuid4().hex[:12]}',
            category='داشبورد',
            amount=Decimal(amount),
            currency_type=currency,
            date=date or self.start,
        )

    def tehran_receipt(self, amount, currency='AFN'):
        customer = Customer.objects.create(name=f'Receipt customer {uuid.uuid4().hex[:8]}')
        field = {'AFN': 'destination_amount', 'TOMAN': 'toman_amount', 'USD': 'usd_amount'}[currency]
        row = Transaction.objects.create(
            customer=customer,
            voucher_number=f'RCPT-{uuid.uuid4().hex[:12]}',
            date=self.start,
            transaction_kind='RECEIPT',
            source_currency='TOMAN' if currency != 'TOMAN' else 'USD',
            destination_currency=currency,
            toman_amount=Decimal('0'),
        )
        Transaction.objects.filter(pk=row.pk).update(**{field: Decimal(amount)})
        return row

    def test_invalid_month_and_currency_are_rejected(self):
        self.assertEqual(self.client.get('/api/dashboard/workspace/?month=1405-13').status_code, 400)
        self.assertEqual(self.client.get('/api/dashboard/workspace/?month=1405-08&currency=XXX').status_code, 400)

    def test_empty_month_reports_zero_and_pending_modules(self):
        response = self.client.get('/api/dashboard/workspace/?month=1405-08&currency=AFN')
        self.assertEqual(response.status_code, 200, response.data)
        metrics = response.data['metrics']
        self.assertEqual(metrics['provincial_net']['value'], '0.000')
        self.assertEqual(metrics['unpaid_remittances']['value'], 0)
        self.assertEqual(metrics['expenses']['value'], '0.000')
        self.assertEqual(metrics['mudarabah']['value'], 0)
        self.assertEqual(metrics['profit']['state'], 'pending')
        self.assertEqual(metrics['profit']['label'], 'در حال تکمیل')
        self.assertEqual(metrics['capital']['state'], 'planned')
        self.assertEqual(metrics['settings']['value'], 'تنظیمات سیستم')
        self.assertEqual(response.data['charts']['provincial']['total'], '0.000')
        self.assertEqual(response.data['charts']['payments']['total'], 0)
        self.assertIn('AFN', response.data['currencies'])
        self.assertEqual(response.data['period']['to'], str(self.end))

    def test_metrics_and_charts_reconcile_to_source_modules(self):
        # Provincial movement: one outgoing and one incoming confirmed entry.
        self.document('PROVINCIAL_OUT', '500')
        self.document('PROVINCIAL_IN', '200')
        # One open Tehran remittance and one fully settled by a confirmed receipt.
        self.document('TEHRAN_REMITTANCE', '100')
        settled = self.document('TEHRAN_REMITTANCE', '60')
        receipt = self.document('RECEIPT', '60')
        ReceiptAllocation.objects.create(receipt=receipt, remittance=settled, amount=Decimal('60'), purpose='BENEFICIARY')

        self.tehran_receipt('1234')
        self.expense('50', 'AFN')
        self.expense('999', 'TOMAN')
        MudarabahContract.objects.create(
            contract_number=f'MUD-{uuid.uuid4().hex[:12]}',
            investor_name='سرمایه‌گذار',
            agent_name='عامل',
            principal_amount=Decimal('1000'),
            start_date=self.start,
            status='active',
        )

        response = self.client.get('/api/dashboard/workspace/?month=1405-08&currency=AFN')
        self.assertEqual(response.status_code, 200, response.data)
        metrics = response.data['metrics']
        self.assertEqual(metrics['tehran_receipts']['value'], '1234.000')
        self.assertEqual(metrics['tehran_receipts']['route'], '/tehran-remittances')
        self.assertEqual(metrics['tehran_kabul_remaining']['value'], '100.000')
        self.assertEqual(metrics['provincial_net']['value'], '300.000')
        self.assertEqual(metrics['provincial_incoming']['value'], '200.000')
        self.assertEqual(metrics['unpaid_remittances']['value'], 3)
        self.assertEqual(metrics['expenses']['value'], '50.000')
        self.assertEqual(metrics['mudarabah']['value'], 1)

        charts = response.data['charts']
        self.assertEqual(charts['provincial']['outgoing'], '500.000')
        self.assertEqual(charts['provincial']['incoming'], '200.000')
        self.assertEqual(charts['provincial']['total'], '700.000')
        self.assertEqual(charts['provincial']['net'], '300.000')
        self.assertEqual(charts['payments']['total'], 4)
        self.assertEqual(charts['payments']['completed'], 1)
        self.assertEqual(charts['payments']['open'], 3)
        self.assertEqual(
            charts['payments']['completed'] + charts['payments']['open'],
            charts['payments']['total'],
        )

    def test_currency_selection_keeps_amounts_separate(self):
        self.document('PROVINCIAL_OUT', '500', currency='AFN')
        self.document('PROVINCIAL_OUT', '700', currency='TOMAN')
        self.expense('50', 'AFN')
        self.expense('999', 'TOMAN')

        afn = self.client.get('/api/dashboard/workspace/?month=1405-08&currency=AFN').data
        toman = self.client.get('/api/dashboard/workspace/?month=1405-08&currency=TOMAN').data
        self.assertEqual(afn['metrics']['provincial_net']['value'], '500.000')
        self.assertEqual(afn['metrics']['expenses']['value'], '50.000')
        self.assertEqual(toman['metrics']['provincial_net']['value'], '700.000')
        self.assertEqual(toman['metrics']['expenses']['value'], '999.000')

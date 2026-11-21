import uuid
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.utils import timezone
from .models import (Colleague, ColleagueTransaction, CustomerDeposit, DebtorCustomer,
                     DebtPayment, FinancialAccount, FinancialDocument)
from .ledger_service import balance, confirm
from .testing import AuthenticatedAPITestCase

DATE = '2026-11-06'


class CreditorWorkspaceTests(AuthenticatedAPITestCase):
    def setUp(self):
        super().setUp()
        self.operator = get_user_model().objects.get(username='regression-operator')

    def document(self, account, category='OPENING', amount='50000', currency='AFN', **extra):
        return confirm({'request_key': uuid.uuid4().hex, 'account': account.pk, 'category': category,
                        'date': DATE, 'currency': currency, 'amount': amount, **extra}, self.operator)

    def rows(self, source=''):
        data = self.client.get(f'/api/creditors/{"?source=" + source if source else ""}').data
        return {(row['source'], row['ref_id']): row for row in data['results']}, data['summary']

    def test_ledger_creditor_is_aggregated_and_paid_down(self):
        account = FinancialAccount.objects.create(name='Tehran creditor', kind='CREDITOR')
        self.document(account, category='OPENING', amount='50000')
        rows, summary = self.rows()
        self.assertEqual(rows[('LEDGER', account.pk)]['source'], 'LEDGER')
        self.assertEqual(rows[('LEDGER', account.pk)]['payables'][0]['amount'], '50000.000')
        self.assertTrue(any(total['source'] == 'LEDGER' and total['currency'] == 'AFN' for total in summary['totals']))
        paid = self.client.post(f'/api/creditors/{account.pk}/payments/', {'request_key': uuid.uuid4().hex, 'date': DATE, 'currency': 'AFN', 'amount': '20000'}, format='json')
        self.assertEqual(paid.status_code, 201)
        self.assertEqual(balance(account, 'AFN'), Decimal('30000'))
        rows, _ = self.rows()
        self.assertEqual(rows[('LEDGER', account.pk)]['payables'][0]['amount'], '30000.000')

    def test_overpayment_is_rejected(self):
        account = FinancialAccount.objects.create(name='Small creditor', kind='CREDITOR')
        self.document(account, category='OPENING', amount='1000')
        response = self.client.post(f'/api/creditors/{account.pk}/payments/', {'request_key': uuid.uuid4().hex, 'date': DATE, 'currency': 'AFN', 'amount': '1500'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(balance(account, 'AFN'), Decimal('1000'))

    def test_creditor_crud(self):
        created = self.client.post('/api/creditors/', {'name': 'New creditor', 'profile': {'phone': '0700000000'}}, format='json')
        self.assertEqual(created.status_code, 201)
        account = FinancialAccount.objects.get(pk=created.data['id'])
        self.assertEqual(account.kind, 'CREDITOR')
        self.assertEqual(account.profile.get('approval'), 'APPROVED')
        edited = self.client.patch(f'/api/creditors/{account.pk}/', {'profile': {'phone': '0700000001'}}, format='json')
        self.assertEqual(edited.status_code, 200)
        self.assertEqual(edited.data['profile']['phone'], '0700000001')
        removed = self.client.delete(f'/api/creditors/{account.pk}/')
        self.assertEqual(removed.status_code, 200)
        account.refresh_from_db()
        self.assertFalse(account.active)

    def test_colleague_deposit_and_debtor_sources(self):
        colleague = Colleague.objects.create(colleagueNumber='C-1', colleagueName='Colleague one')
        ColleagueTransaction.objects.create(colleague=colleague, transactionNumber='CT-1', transactionType='RECEIVED', transactionDate=DATE, currencyType='AFN', amount='500', usdRate='70', afnAmount='500')
        deposit = CustomerDeposit.objects.create(deposit_number='CD-1', deposit_type='CASH', customer_name='Depositor', currency_type='AFN', amount='900')
        debtor = DebtorCustomer.objects.create(customer_number='D-1', customer_name='Advanced payer', debtor_type='SMALL', original_usd_amount='0')
        DebtPayment.objects.create(debtor=debtor, payment_type='PAYMENT', payment_usd_amount='120', usd_rate='70')
        rows, summary = self.rows()
        self.assertEqual(rows[('COLLEAGUE', colleague.pk)]['source'], 'COLLEAGUE')
        self.assertEqual(rows[('COLLEAGUE', colleague.pk)]['payables'][0]['amount'], '500.000')
        self.assertEqual(rows[('DEPOSIT', deposit.pk)]['source'], 'DEPOSIT')
        self.assertEqual(rows[('DEBTOR', debtor.pk)]['source'], 'DEBTOR')
        self.assertEqual(rows[('DEBTOR', debtor.pk)]['payables'][0]['currency'], 'USD')
        self.assertEqual(rows[('DEBTOR', debtor.pk)]['payables'][0]['amount'], '120.000')
        self.assertEqual({row['source'] for row in self.client.get('/api/creditors/?source=COLLEAGUE').data['results']}, {'COLLEAGUE'})
        self.assertTrue(any(total['source'] == 'DEBTOR' for total in summary['totals']))

    def test_paid_and_settled_accounts_disappear(self):
        account = FinancialAccount.objects.create(name='Settled creditor', kind='CREDITOR')
        self.document(account, category='OPENING', amount='4000')
        paid = self.client.post(f'/api/creditors/{account.pk}/payments/', {'request_key': uuid.uuid4().hex, 'date': DATE, 'currency': 'AFN', 'amount': '4000'}, format='json')
        self.assertEqual(balance(account, 'AFN'), Decimal('0'))
        rows, _ = self.rows()
        self.assertNotIn(('LEDGER', account.pk), rows)
        confirm({'request_key': uuid.uuid4().hex, 'account': account.pk, 'category': 'REVERSAL', 'date': DATE,
                 'currency': 'AFN', 'amount': '4000', 'reversal_of': paid.data['id'], 'details': {'reason': 'Correction'}}, self.operator)
        self.assertEqual(balance(account, 'AFN'), Decimal('4000'))
        rows, _ = self.rows()
        self.assertIn(('LEDGER', account.pk), rows)

    def test_detail_requires_existing_account(self):
        missing = self.client.get('/api/creditors/999999/')
        self.assertEqual(missing.status_code, 404)
        account = FinancialAccount.objects.create(name='Detail creditor', kind='CREDITOR')
        self.document(account, category='OPENING', amount='700')
        detail = self.client.get(f'/api/creditors/{account.pk}/')
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data['source'], 'LEDGER')
        self.assertEqual(detail.data['payables'][0]['amount'], '700.000')
        payments = self.client.get(f'/api/creditors/{account.pk}/payments/')
        self.assertEqual(payments.status_code, 200)
        self.assertEqual(payments.data['results'], [])

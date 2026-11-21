import uuid
from decimal import Decimal
from django.utils import timezone
from .testing import AuthenticatedAPITestCase
from .models import Customer,Transaction,Remittance,Expense,FinancialDocument,FinancialAccount,LedgerPosting,NumberSequence,FinancialAudit,DebtorCustomer,DebtPayment,CustomerDeposit,DepositWithdrawal,Colleague,ColleagueTransaction

class SystemReportingTests(AuthenticatedAPITestCase):
    def report(self,kind='system',**params):
        response=self.client.get('/api/reports/system/',{'type':kind,'dateFrom':'2026-11-01','dateTo':'2026-11-30',**params})
        self.assertEqual(response.status_code,200,response.data)
        return response.data,{section['key']:section for section in response.data['sections']}
    def test_expenses_currency_isolation_deletion_and_exact_totals(self):
        for number,unit,amount,day in [('A','USD','10.125','2026-11-06'),('B','USD','20.225','2026-11-07'),('C','AFN','1000','2026-11-07'),('D','USD','999','2026-12-01')]:
            Expense.objects.create(expense_number=number,date=day,category='Office',amount=amount,currency_type=unit,afn_amount='1')
        Expense.objects.create(expense_number='DELETED',date='2026-11-06',category='Deleted',amount='999',currency_type='USD',deleted_at=timezone.now())
        _,sections=self.report();expense=sections['expenses']
        self.assertEqual(expense['count'],3)
        totals={(row['metric'],row['currency']):Decimal(row['amount']) for row in expense['totals']}
        self.assertEqual(totals['amount','USD'],Decimal('30.350'))
        self.assertEqual(totals['amount','AFN'],Decimal(1000))
    def test_tehran_report_excludes_other_modules_and_keeps_linked_source_once(self):
        customer=Customer.objects.create(name='Tehran customer')
        source=Transaction.objects.create(customer=customer,voucher_number='TH-1',date='2026-11-06',toman_amount='100',source_currency='USD',destination_currency='AFN',destination_rate='70',afghani_rate='70')
        account=FinancialAccount.objects.create(name='Account',kind='HAWALA')
        FinancialDocument.objects.create(number='LINK-1',request_key='link',payload_hash='test',account=account,category='TEHRAN_REMITTANCE',date='2026-11-06',currency_id='AFN',amount='7000',tehran_transaction=source,operator=self.client.handler._force_user)
        Remittance.objects.create(kind='outgoing',hawalaNumber='OUT-1',transactionDate='2026-11-06',sourceAmount=100,afnAmount=7000)
        _,sections=self.report('tehran')
        self.assertEqual(sections['tehran']['count'],1)
        self.assertEqual(sections['ledger_activity']['count'],0)
        self.assertNotIn('expenses',sections)
        self.assertNotIn('outgoing',sections)
    def test_pending_as_of_cutoff_ignores_later_payment_and_future_reversal(self):
        account=self.client.post('/api/provinces/AF-BDS/accounts/',{'name':'Agent'},format='json').data
        response=self.client.post('/api/provincial/remittances/',{'request_key':uuid.uuid4().hex,'account':account['id'],'province':'AF-BDS','category':'PROVINCIAL_OUT','date':'2026-10-01','currency':'AFN','amount':'100','details':{'sender_name':'Sender','recipient_name':'Recipient'}},format='json')
        self.assertEqual(response.status_code,201,response.data);doc=response.data
        payment=self.client.post('/api/ledger/documents/',{'request_key':uuid.uuid4().hex,'account':account['id'],'category':'BENEFICIARY_PAYOUT','date':'2026-12-01','currency':'AFN','amount':'100','allocations':[{'remittance':doc['id'],'amount':'100'}]},format='json')
        self.assertEqual(payment.status_code,201,payment.data)
        _,sections=self.report();self.assertEqual(sections['pending']['rows'][0]['remaining'],'100.000')
        _,later=self.report(dateTo='2026-12-31');self.assertEqual(later['pending']['count'],0)
    def test_debtor_and_deposit_balances_include_prior_activity_only_until_cutoff(self):
        debtor=DebtorCustomer.objects.create(customer_number='D-1',customer_name='Debtor',original_usd_amount=100)
        DebtorCustomer.objects.filter(pk=debtor.pk).update(created_at='2026-09-01T00:00:00Z')
        DebtPayment.objects.create(debtor=debtor,payment_type='PAYMENT',payment_date='2026-10-01',payment_usd_amount=20)
        DebtPayment.objects.create(debtor=debtor,payment_type='PAYMENT',payment_date='2026-12-01',payment_usd_amount=80)
        deposit=CustomerDeposit.objects.create(deposit_number='DEP-1',customer_name='Depositor',received_date='2026-09-01',deposit_type='CASH',currency_type='USD',amount=100,afn_rate=70)
        DepositWithdrawal.objects.create(deposit=deposit,withdrawal_date='2026-10-01',currency_type='USD',amount=30,afn_rate=70)
        _,sections=self.report()
        self.assertEqual(sections['debt_balances']['rows'][0]['receivable'],'80.000')
        self.assertEqual(sections['deposit_balances']['rows'][0]['remaining'],'70.000')
    def test_report_reads_do_not_write_financial_records(self):
        before=(FinancialDocument.objects.count(),LedgerPosting.objects.count(),FinancialAudit.objects.count(),NumberSequence.objects.count())
        report,sections=self.report()
        self.assertTrue({'expenses','colleagues','debt_payments','debt_balances','ledger_balances','deposit_balances','deposit_events','mudarabah','pending','unverified','distributions','toman_settlements'}.issubset(sections))
        self.report('tehran')
        self.assertEqual(before,(FinancialDocument.objects.count(),LedgerPosting.objects.count(),FinancialAudit.objects.count(),NumberSequence.objects.count()))
    def test_invalid_period_and_type_are_rejected(self):
        for params in [{'dateFrom':'2026-12-01','dateTo':'2026-11-01'},{'type':'wrong'},{'month':'1405-13'}]:
            self.assertEqual(self.client.get('/api/reports/system/',params).status_code,400)

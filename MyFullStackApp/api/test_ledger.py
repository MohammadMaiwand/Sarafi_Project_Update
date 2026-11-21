import uuid
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APITestCase
from rest_framework.exceptions import ValidationError
from .models import FinancialAccount, FinancialDocument, LedgerPosting, Agency, Customer, Transaction
from .ledger_service import confirm, balance, outstanding, agency_report
from .conversion import convert
from .calendar_policy import month_bounds
from django.test import TransactionTestCase
from django.db import close_old_connections
from concurrent.futures import ThreadPoolExecutor

class LedgerTests(TestCase):
    def setUp(self):
        self.user=get_user_model().objects.create_user(username='ledger',password='test-password')
        self.account=FinancialAccount.objects.create(name='Existing account',kind='KABUL_DEBTOR')
    def data(self,**values):
        return {'request_key':uuid.uuid4().hex,'account':self.account.pk,'category':'OPENING','date':'2026-11-06','currency':'AFN','amount':'50000',**values}
    def test_manual_conversion_usd_only_fees_and_small_rates(self):
        row=convert('10000000','TOMAN','100000','AFN','70','50','AFN','DEDUCTED')
        self.assertEqual(row['usd'],'100.000');self.assertEqual(row['gross'],'7000.000');self.assertEqual(row['net'],'6950.000')
        self.assertIsNone(convert('10000000','TOMAN','100000')['gross'])
        self.assertEqual(convert('1','USD',None,'AFN','70')['net'],'70.000')
        self.assertEqual(convert('1','TOMAN','.0000001')['usd'],'10000000.000')
        for rate in ('0','-1','NaN','Infinity'):
            with self.assertRaises(ValidationError):convert('1','AFN',rate)
        with self.assertRaises(ValidationError):convert('1','USD',None,'AFN','70','1','TOMAN','DEDUCTED')
    def test_loan_collection_and_currency_isolation(self):
        confirm(self.data(),self.user)
        confirm(self.data(category='COLLECTION',amount='30000'),self.user)
        confirm(self.data(category='LOAN',amount='10000'),self.user)
        confirm(self.data(currency='USD',amount='25'),self.user)
        self.assertEqual(balance(self.account,'AFN'),30000);self.assertEqual(balance(self.account,'USD'),25)
    def test_retry_is_idempotent_and_changed_payload_rejected(self):
        data=self.data();one=confirm(data,self.user);two=confirm(data,self.user)
        self.assertEqual(one.pk,two.pk);self.assertEqual(balance(self.account,'AFN'),50000)
        with self.assertRaises(ValidationError):confirm({**data,'amount':'20'},self.user)
        self.assertEqual(FinancialDocument.objects.count(),1)
    def test_overpayment_rolls_back_and_reversal_retains_audit(self):
        original=confirm(self.data(),self.user)
        with self.assertRaises(ValidationError):confirm(self.data(category='COLLECTION',amount='50001'),self.user)
        self.assertEqual(FinancialDocument.objects.count(),1)
        reversal=confirm(self.data(category='REVERSAL',reversal_of=original.pk,details={'reason':'Correction'}),self.user)
        self.assertEqual(balance(self.account,'AFN'),0);self.assertEqual(reversal.reversal_of,original)
        with self.assertRaises(ValidationError):confirm(self.data(category='REVERSAL',reversal_of=original.pk,details={'reason':'Again'}),self.user)
    def test_partial_beneficiary_and_independent_agency_settlement(self):
        agency=Agency.objects.create(name='Agency')
        remittance=confirm(self.data(category='PROVINCIAL_IN',amount='20000',agency=agency.pk,details={'sender_name':'Sender','recipient_name':'Recipient'}),self.user)
        confirm(self.data(category='BENEFICIARY_PAYOUT',amount='3000',allocations=[{'remittance':remittance.pk,'amount':'3000'}]),self.user)
        self.assertEqual(outstanding(remittance,'BENEFICIARY')[0],17000)
        self.assertEqual(outstanding(remittance,'AGENCY')[0],20000)
        confirm(self.data(category='AGENCY_RECEIPT',agency=agency.pk,amount='8000',allocations=[{'remittance':remittance.pk,'amount':'8000'}]),self.user)
        self.assertEqual(outstanding(remittance,'AGENCY')[0],12000)
        start,end,_=month_bounds('1405-08');report=agency_report(agency,start,end,'AFN')
        self.assertEqual(Decimal(report['closing']),12000)
        next_start,next_end,_=month_bounds('1405-09');later=agency_report(agency,next_start,next_end,'AFN')
        self.assertEqual(later['opening'],report['closing'])
        with self.assertRaises(ValidationError):confirm(self.data(category='BENEFICIARY_PAYOUT',amount='17001',allocations=[{'remittance':remittance.pk,'amount':'17001'}]),self.user)
    def test_explicit_multiple_allocations_and_exact_receipt_reconciliation(self):
        agency=Agency.objects.create(name='Agency')
        docs=[confirm(self.data(category='PROVINCIAL_IN',amount='100',agency=agency.pk,details={'sender_name':'S','recipient_name':'R'}),self.user) for _ in range(2)]
        receipt=confirm(self.data(category='AGENCY_RECEIPT',agency=agency.pk,amount='150',allocations=[{'remittance':docs[0].pk,'amount':'100'},{'remittance':docs[1].pk,'amount':'50'}]),self.user)
        self.assertEqual(receipt.allocations.count(),2)
        self.assertEqual(outstanding(docs[0],'AGENCY')[0],0)
        with self.assertRaises(ValidationError):confirm(self.data(category='AGENCY_RECEIPT',agency=agency.pk,amount='100',allocations=[{'remittance':docs[1].pk,'amount':'50'}]),self.user)
    def test_deposits_and_currency_conversion_commit(self):
        self.account.kind='EXCHANGE';self.account.save()
        confirm(self.data(category='DEPOSIT',currency='TOMAN',amount='10000000'),self.user)
        confirm(self.data(category='CONVERT',currency='TOMAN',amount='10000000',source_rate='100000',destination='USD'),self.user)
        self.assertEqual(balance(self.account,'TOMAN'),0);self.assertEqual(balance(self.account,'USD'),100)
        confirm(self.data(category='RELEASE',currency='USD',amount='40'),self.user)
        self.assertEqual(balance(self.account,'USD'),60)
        self.account.kind='HAWALA';self.account.save()
        with self.assertRaises(ValidationError):confirm(self.data(category='DEPOSIT'),self.user)
    def test_solar_month_new_year_and_leap_hut(self):
        start,end,_=month_bounds('1403-12')
        self.assertEqual(str(start),'2025-02-19');self.assertEqual(str(end),'2025-03-21')
        next_start,_,_=month_bounds('1404-01');self.assertEqual(end,next_start)

class LedgerApiTests(APITestCase):
    def test_automatic_conversion_and_account_balance_are_authoritative(self):
        user=get_user_model().objects.create(username='automatic-ledger-operator')
        self.client.force_authenticate(user)
        account=FinancialAccount.objects.create(name='Automatic account',kind='KABUL_DEBTOR')
        for category,amount in [('OPENING','50000'),('COLLECTION','30000'),('LOAN','10000')]:
            result=self.client.post('/api/ledger/documents/',{'request_key':uuid.uuid4().hex,'account':account.pk,'category':category,'date':'2026-11-06','currency':'AFN','amount':amount},format='json')
            self.assertEqual(result.status_code,201,result.data)
        detail=self.client.get(f'/api/ledger/accounts/{account.pk}/?month=1405-08').data
        self.assertEqual(next(row['amount'] for row in detail['balances'] if row['currency_id']=='AFN'),'30000.000')
        usd=self.client.post('/api/ledger/documents/',{'request_key':uuid.uuid4().hex,'account':account.pk,'category':'LOAN','date':'2026-11-06','currency':'USD','amount':'100'},format='json')
        self.assertEqual(usd.status_code,201,usd.data)
        self.assertEqual(usd.data['conversion']['source_rate'],'1')
        self.assertEqual(usd.data['conversion']['usd'],'100.000')
        converted=self.client.post('/api/ledger/documents/',{'request_key':uuid.uuid4().hex,'account':account.pk,'category':'TEHRAN_REMITTANCE','date':'2026-11-06','currency':'TOMAN','amount':'10000000','source_rate':'100000','destination':'AFN','destination_rate':'70','fee':'50','fee_currency':'AFN','collection':'DEDUCTED','details':{'sender_name':'S','recipient_name':'R'},'net':'999999'},format='json')
        self.assertEqual(converted.status_code,201,converted.data)
        self.assertEqual(converted.data['conversion']['net'],'6950.000')
    def test_session_validation_and_dashboard_do_not_lose_existing_amounts(self):
        self.assertEqual(self.client.get('/api/session/').status_code,401)
        user=get_user_model().objects.create(username='dashboard-session-user')
        self.client.force_authenticate(user)
        self.assertEqual(self.client.get('/api/session/').data['username'],user.username)
        customer=Customer.objects.create(name='Dashboard customer')
        Transaction.objects.create(customer=customer,voucher_number='DASH',date='2026-11-06',toman_amount=Decimal('1000000'),toman_rate=Decimal('225'),afghani_rate=Decimal('64.5'))
        result=self.client.get('/api/dashboard/stats/?calendar=afghan&month=1405-08')
        self.assertEqual(result.status_code,200,result.data)
        self.assertEqual(result.data['total_toman'],Decimal('1000000'))
        self.assertEqual(result.data['total_usd'],Decimal('4444.444'))
        self.assertEqual(result.data['total_afghani'],Decimal('286666.667'))
    def test_legacy_retry_and_audit_preserve_single_financial_record(self):
        user=get_user_model().objects.create_user(username='retry-user',password='password')
        from rest_framework.authtoken.models import Token
        token=Token.objects.create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION='Token '+token.key)
        customer=Customer.objects.create(name='Existing')
        data={'request_key':uuid.uuid4().hex,'customer_id':customer.pk,'voucher_number':'RETRY','date':'2026-11-06','toman_amount':'10000000','toman_rate':'100000','afghani_rate':'70'}
        first=self.client.post('/api/transactions/',data,format='json')
        second=self.client.post('/api/transactions/',data,format='json')
        self.assertEqual(first.status_code,201,first.data);self.assertEqual(second.status_code,201,second.data)
        self.assertEqual(first.data['id'],second.data['id'])
        self.assertEqual(Transaction.objects.count(),1)
        from .models import FinancialAudit
        record=FinancialAudit.objects.get(model='Transaction',object_id=str(first.data['id']),action='CREATE')
        self.assertEqual(record.operator_id,user.pk)
        self.assertNotIn('bank_account',record.after)
        changed=self.client.post('/api/transactions/',{**data,'toman_amount':'1'},format='json')
        self.assertEqual(changed.status_code,400)
    def test_auth_masking_missing_groups_and_manual_option(self):
        self.assertEqual(self.client.get('/api/ledger/accounts/').status_code,401)
        user=get_user_model().objects.create_user(username='operator',password='password')
        self.client.force_authenticate(user)
        account=FinancialAccount.objects.create(name='Customer',kind='KABUL_DEBTOR',profile={'identity_number':'00123456','identity_image':'secret'})
        row=self.client.get('/api/ledger/accounts/').data['results'][0]
        self.assertNotEqual(row['profile']['identity_number'],'00123456');self.assertIs(row['profile']['identity_image'],True)
        options=self.client.get('/api/ledger/options/').data
        self.assertEqual(options['rate_input'],'MANUAL');self.assertEqual(options['kaldar_currency'],'PKR')
        for details in [{'sender_id':'123'},{'sender_phone':'070'},{}]:
            confirm({'request_key':uuid.uuid4().hex,'account':account.pk,'category':'TEHRAN_REMITTANCE','date':'2026-11-06','currency':'AFN','amount':'1','details':{'sender_name':'S','recipient_name':'R',**details}},user)
        groups=self.client.get('/api/ledger/missing-identity/').data
        self.assertEqual([len(groups[key]) for key in ['missing_id_only','missing_phone_only','both_missing']],[1,1,1])
    def test_legacy_tehran_manual_precision_and_destination_optional(self):
        self.client.force_authenticate(get_user_model().objects.create(username='legacy-tester'))
        customer=Customer.objects.create(name='Existing')
        data={'customer_id':customer.pk,'voucher_number':'PRECISION','date':'2026-11-06','toman_amount':'10000000','toman_rate':'100000.123456789','source_currency':'TOMAN','destination_currency':'USD','fee_amount':'1','fee_currency':'USD','fee_collection':'DEDUCTED'}
        result=self.client.post('/api/transactions/',data,format='json')
        self.assertEqual(result.status_code,201,result.data)
        self.assertEqual(result.data['toman_rate'],'100000.123456789000')
        self.assertEqual(result.data['destination_amount'],'99.000')
        result=self.client.patch(f"/api/transactions/{result.data['id']}/",{'destination_currency':''},format='json')
        self.assertEqual(result.status_code,400) # A deducted fee needs a destination.

class ConcurrentLedgerTests(TransactionTestCase):
    def setUp(self):
        from .models import Currency
        from .conversion import CURRENCIES
        for code in CURRENCIES:Currency.objects.get_or_create(code=code,defaults={'name':code})
    def test_concurrent_retries_post_once_and_unique_numbering(self):
        user=get_user_model().objects.create(username='concurrency-operator')
        account=FinancialAccount.objects.create(name='Concurrent',kind='IRAN_DEBTOR')
        key=uuid.uuid4().hex
        def worker(request_key):
            close_old_connections()
            try:
                operator=get_user_model().objects.get(pk=user.pk)
                return confirm({'request_key':request_key,'account':account.pk,'category':'LOAN','date':'2026-11-06','currency':'USD','amount':'10'},operator).pk
            finally: close_old_connections()
        with ThreadPoolExecutor(max_workers=3) as pool:
            ids=list(pool.map(worker,[key,key,key]))
        self.assertEqual(len(set(ids)),1)
        self.assertEqual(balance(account,'USD'),10)
        with ThreadPoolExecutor(max_workers=3) as pool:
            ids=list(pool.map(worker,[uuid.uuid4().hex for _ in range(3)]))
        self.assertEqual(len(set(ids)),3)
        self.assertEqual(balance(account,'USD'),40)

import uuid
from decimal import Decimal
from concurrent.futures import ThreadPoolExecutor
from django.contrib.auth import get_user_model
from django.db import close_old_connections
from django.test import TransactionTestCase
from .testing import AuthenticatedAPITestCase
from .models import Agency, FinancialAccount, FinancialDocument, LedgerPosting, NumberSequence, LedgerSetting, FinancialAudit
from .calendar_policy import month_bounds
from .ledger_service import confirm, balance


class ProvincialRules64Tests(AuthenticatedAPITestCase):
    def setUp(self):
        super().setUp()
        self.agency=Agency.objects.create(name='Actual agency',province_id='AF-BDS')
        self.account=FinancialAccount.objects.create(name='Persistent account',agency=self.agency,kind='AGENCY',province_id='AF-BDS')

    def document(self,category,amount='1000',day=None,currency='AFN',**extra):
        data={'request_key':uuid.uuid4().hex,'account':self.account.pk,'agency':self.agency.pk,'category':category,'amount':amount,'date':str(day or month_bounds('1405-07')[0]),'currency':currency,**extra}
        response=self.client.post('/api/ledger/documents/',data,format='json')
        self.assertEqual(response.status_code,201,response.data)
        return response.data

    def remittance(self,direction='PROVINCIAL_IN',**extra):
        data={'request_key':uuid.uuid4().hex,'account':self.account.pk,'province':'AF-BDS','category':direction,'amount':'25000','date':str(month_bounds('1405-07')[0]),'currency':'AFN','details':{'sender_name':'Sender','recipient_name':'Recipient','sender_phone':'0070123456','recipient_phone':'0093770012345'},**extra}
        response=self.client.post('/api/provincial/remittances/',data,format='json')
        self.assertEqual(response.status_code,201,response.data)
        return response.data

    def report(self,month='1405-07',currency='AFN'):
        response=self.client.get(f'/api/ledger/agencies/{self.agency.pk}/monthly/',{'month':month,'currency':currency})
        self.assertEqual(response.status_code,200,response.data)
        return response.data

    def test_all_four_currencies_show_agency_and_opposite_office_status(self):
        self.document('REPRESENTATIVE_RECEIVABLE','20000')
        self.document('REPRESENTATIVE_OBLIGATION','12',currency='USD')
        self.document('REPRESENTATIVE_RECEIVABLE','1000000',currency='TOMAN')
        result=self.report();units={row['currency']:row for row in result['balances_by_currency']}
        self.assertEqual(list(units),['USD','AFN','EUR','TOMAN'])
        self.assertEqual(units['AFN']['closing_status']['label'],'بدهکار')
        self.assertEqual(units['AFN']['closing_status']['message'],'نمایندگی بدهکار است')
        self.assertEqual(units['AFN']['closing_status']['office']['label'],'طلبکار')
        self.assertEqual(units['USD']['closing_status']['label'],'طلبکار')
        self.assertEqual(units['USD']['closing_status']['office']['label'],'بدهکار')
        self.assertEqual(units['EUR']['closing_status']['label'],'تصفیه‌شده')
        ledger=self.client.get(f'/api/provincial/accounts/{self.account.pk}/ledger/',{'month':'1405-07'}).data
        self.assertEqual(len(ledger['balances_by_currency']),4)
        self.assertEqual(ledger['perspective'],'OFFICE')
        self.assertEqual(ledger['closing_status']['label'],'طلبکار')
        self.assertEqual(ledger['agency_closing_status']['label'],'بدهکار')
        cards=self.client.get('/api/provinces/AF-BDS/accounts/').data['results'][0]['representativeBalances']
        self.assertEqual(len(cards),4);self.assertTrue(all('who_owes_whom' in row['status'] for row in cards))

    def test_eight_lines_acceptance_and_deposit_principal_are_separate(self):
        self.document('OPENING','20000',day=month_bounds('1405-06')[0])
        cash=FinancialAccount.objects.create(name='Public principal',kind='CASH')
        colleague=FinancialAccount.objects.create(name='Colleague',kind='COLLEAGUE')
        borrower=FinancialAccount.objects.create(name='Borrower',kind='KABUL_DEBTOR')
        amounts={'RECEIPT':1000,'PUBLIC_DEPOSIT':2000,'COLLEAGUE_DEPOSIT':3000,'DISTRIBUTION':4000,'SALARY':2000,'EXPENSE':1000,'CUSTOMER_LOAN':5000,'COLLEAGUE_LOAN':2000}
        counterparts={'PUBLIC_DEPOSIT':cash,'COLLEAGUE_DEPOSIT':colleague,'CUSTOMER_LOAN':borrower,'COLLEAGUE_LOAN':colleague}
        for key,value in amounts.items():self.document(key,str(value),details={'counterparty_account':counterparts[key].pk} if key in counterparts else {})
        result=self.report();lines={row['key']:row for row in result['lines']}
        self.assertEqual(len(lines),8)
        for key,value in amounts.items():self.assertEqual(Decimal(lines[key]['amount']),value)
        self.assertEqual(Decimal(result['opening']),20000);self.assertEqual(Decimal(result['movement']),-8000);self.assertEqual(Decimal(result['closing']),12000)
        self.assertEqual(sum(Decimal(row['effect']) for row in result['lines']),-8000)
        self.assertEqual(result['closing_status']['message'],'نمایندگی بدهکار است')
        self.assertEqual(result['closing_status']['office']['message'],'صرافی طلبکار است')
        self.assertEqual(Decimal(result['deposit_liabilities']),5000)
        self.assertEqual(balance(cash,'AFN'),2000)
        self.assertEqual(balance(colleague,'AFN','DEPOSIT_PRINCIPAL'),3000)
        self.assertEqual(balance(colleague,'AFN'),2000)
        for month in ['1405-08','1405-12','1406-01']:
            later=self.report(month)
            self.assertEqual(Decimal(later['opening']),12000);self.assertEqual(Decimal(later['closing']),12000);self.assertEqual(Decimal(later['movement']),0)
            self.assertEqual(sum(len(line['sources']) for line in later['lines']),0)

    def test_allocated_settlements_have_signed_effect_and_exclude_beneficiaries(self):
        for direction,category,expected,key in [('PROVINCIAL_IN','AGENCY_RECEIPT',15000,'RECEIPT'),('PROVINCIAL_OUT','AGENCY_PAYMENT',-15000,'DISTRIBUTION')]:
            with self.subTest(direction=direction):
                doc=self.remittance(direction)
                self.document('BENEFICIARY_PAYOUT','5000',allocations=[{'remittance':doc['id'],'amount':'5000'}])
                receipt=self.document(category,'10000',allocations=[{'remittance':doc['id'],'amount':'10000'}])
                self.document('REVERSAL','10000',reversal_of=receipt['id'],details={'reason':'Correction'})
                self.document(category,'10000',allocations=[{'remittance':doc['id'],'amount':'10000'}])
                doc=self.client.get(f"/api/provincial/remittances/{doc['id']}/").data
                self.assertEqual(Decimal(doc['agency']['outstanding']),15000)
                self.assertEqual(Decimal(doc['beneficiary']['outstanding']),20000)
                report=self.report()
                # Inbound +15,000 and outbound -15,000 cancel in the second loop.
                self.assertEqual(Decimal(report['closing']),expected if direction=='PROVINCIAL_IN' else 0)
                line=next(row for row in report['lines'] if row['key']==key)
                self.assertEqual(Decimal(line['amount']),15000)
                self.assertFalse(any(source['category']=='BENEFICIARY_PAYOUT' for line in report['lines'] for source in line['sources']))

    def test_phone_create_edit_reload_never_changes_financial_postings(self):
        for direction in ['PROVINCIAL_IN','PROVINCIAL_OUT']:
            row=self.remittance(direction,manual_profit='0',profit_currency='USD',details={'sender_name':'Sender','recipient_name':'Recipient','sender_phone':'0070123456','recipient_phone':'0093770012345','sender_id':'0000123456','recipient_id':'0000654321'})
            self.assertEqual(row['details']['sender_phone'],'0070123456')
            count=LedgerPosting.objects.count()
            result=self.client.patch(f"/api/provincial/remittances/{row['id']}/",{'details':{'sender_phone':'0001234','recipient_phone':'00930009999'}},format='json')
            self.assertEqual(result.status_code,200,result.data)
            reloaded=self.client.get(f"/api/provincial/remittances/{row['id']}/").data
            self.assertEqual(reloaded['details']['sender_phone'],'0001234')
            self.assertEqual(reloaded['details']['recipient_phone'],'00930009999')
            self.assertEqual(reloaded['manual_profit'],'0.000');self.assertEqual(reloaded['number'],row['number'])
            saved=FinancialDocument.objects.get(pk=row['id'])
            self.assertEqual(saved.details['sender_id'],'0000123456');self.assertEqual(saved.details['recipient_id'],'0000654321')
            self.assertEqual(LedgerPosting.objects.count(),count)
            self.assertEqual(self.client.patch(f"/api/provincial/remittances/{row['id']}/",{'details':{'agency_settlement':'1'}},format='json').status_code,400)
            self.assertEqual(self.client.patch(f"/api/provincial/remittances/{row['id']}/",{'details':{'sender_phone':123}},format='json').status_code,400)
            self.assertEqual(self.client.patch(f"/api/provincial/remittances/{row['id']}/",{'details':{'sender_id':reloaded['details']['sender_id']}},format='json').status_code,400)
        self.assertEqual(FinancialAudit.objects.filter(action='DETAIL_EDIT').count(),2)

    def test_number_configuration_first_200_then_201_202_and_preserved_scopes(self):
        before=self.document('RECEIPT')['number']
        setting=self.client.post('/api/provincial/numbering/',{'starting_number':200},format='json')
        self.assertEqual(setting.status_code,200,setting.data)
        numbers=[self.remittance(direction)['number'] for direction in ['PROVINCIAL_IN','PROVINCIAL_OUT','PROVINCIAL_IN']]
        self.assertEqual(numbers,['PVL-1405-200','PVL-1405-201','PVL-1405-202'])
        self.assertEqual(before,'FIN-1405-200')
        self.assertEqual(self.document('RECEIPT')['number'],'FIN-1405-201')
        self.assertEqual(FinancialDocument.objects.get(number=before).number,before)
        self.client.post('/api/provincial/numbering/',{'starting_number':100},format='json')
        self.assertEqual(self.remittance()['number'],'PVL-1405-203')
        self.client.post('/api/provincial/numbering/',{'starting_number':500},format='json')
        self.assertEqual(self.remittance()['number'],'PVL-1405-500')
        self.assertEqual(self.remittance(date=str(month_bounds('1406-01')[0]))['number'],'PVL-1406-500')

    def test_number_configuration_authorization_validation_and_read_only_reports(self):
        for value in [0,-1,1.5,True,'200',None,1000000000]:self.assertEqual(self.client.post('/api/provincial/numbering/',{'starting_number':value},format='json').status_code,400)
        ordinary=get_user_model().objects.create(username='ordinary')
        self.client.force_authenticate(ordinary)
        self.assertEqual(self.client.get('/api/provincial/numbering/').data['can_configure'],False)
        self.assertEqual(self.client.post('/api/provincial/numbering/',{'starting_number':300},format='json').status_code,403)
        self.document('OPENING','20000',day=month_bounds('1405-06')[0])
        self.document('DISTRIBUTION','8000')
        counts=lambda:(FinancialDocument.objects.count(),LedgerPosting.objects.count(),FinancialAudit.objects.count(),list(NumberSequence.objects.values_list('prefix','year','last_value')),LedgerSetting.objects.count())
        before=counts()
        for _ in range(3):self.report();self.client.get('/api/provincial/numbering/')
        self.assertEqual(counts(),before)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get('/api/provincial/numbering/').status_code,401)


class ProvincialNumberConcurrencyTests(TransactionTestCase):
    def setUp(self):
        from .models import Currency, Province
        from .conversion import CURRENCIES
        for code in CURRENCIES:Currency.objects.get_or_create(code=code,defaults={'name':code})
        Province.objects.get_or_create(code='AF-BDS',defaults={'name':'بدخشان','english_name':'Badakhshan'})
    def test_concurrent_series_and_duplicate_submissions_issue_once(self):
        user=get_user_model().objects.create(username='number-operator',is_staff=True)
        agency=Agency.objects.create(name='Concurrent',province_id='AF-BDS')
        accounts=[FinancialAccount.objects.create(name=f'Account {i}',kind='AGENCY',agency=agency,province_id='AF-BDS') for i in range(2)]
        LedgerSetting.objects.create(key='provincial_starting_number',value=200)
        def worker(item):
            index,key=item;close_old_connections()
            try:
                doc=confirm({'request_key':key,'account':accounts[index%2].pk,'agency':agency.pk,'province':'AF-BDS','category':'PROVINCIAL_IN' if index%2==0 else 'PROVINCIAL_OUT','date':'2026-11-06','currency':'AFN','amount':'1','details':{'sender_name':'S','recipient_name':'R'}},get_user_model().objects.get(pk=user.pk))
                return doc.number
            finally:close_old_connections()
        with ThreadPoolExecutor(max_workers=4) as pool:numbers=list(pool.map(worker,[(i,uuid.uuid4().hex) for i in range(4)]))
        self.assertEqual(sorted(numbers),[f'PVL-1405-{i}' for i in range(200,204)])
        key=uuid.uuid4().hex
        with ThreadPoolExecutor(max_workers=3) as pool:duplicates=list(pool.map(worker,[(0,key)]*3))
        self.assertEqual(len(set(duplicates)),1);self.assertEqual(duplicates[0],'PVL-1405-204')
        self.assertEqual(FinancialDocument.objects.count(),5)

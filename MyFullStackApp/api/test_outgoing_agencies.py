import uuid
from decimal import Decimal
from .testing import AuthenticatedAPITestCase
from .models import Agency, FinancialAccount, FinancialDocument, LedgerPosting


class OutgoingAgencyWorkspaceTests(AuthenticatedAPITestCase):
    def create_agency(self,name='Manager One',phone='0700000000'):
        response=self.client.post('/api/outgoing/agencies/',{'name':name,'phone':phone},format='json')
        self.assertEqual(response.status_code,201,response.data)
        return response.data

    def transaction(self,account,category,amount,currency='AFN',**extra):
        return self.client.post(f"/api/outgoing/agencies/{account['id']}/transactions/",{
            'request_key':uuid.uuid4().hex,'category':category,'date':'2026-11-06',
            'currency':currency,'amount':str(amount),**extra,
        },format='json')

    def test_agencies_are_separate_from_provincial_and_received_workspaces(self):
        provincial=self.client.post('/api/provinces/AF-BDS/accounts/',{'name':'Provincial','phone':'0700000001','workspace':'provincial'},format='json')
        received=self.client.post('/api/provinces/AF-BDS/accounts/',{'name':'Received','phone':'0700000002','workspace':'received'},format='json')
        self.assertEqual(provincial.status_code,201);self.assertEqual(received.status_code,201)
        created=self.create_agency()
        rows=self.client.get('/api/outgoing/agencies/').data['results']
        self.assertEqual([row['id'] for row in rows],[created['id']])
        self.assertEqual(self.client.get('/api/provinces/AF-BDS/accounts/').data['results'][0]['name'],'Provincial')
        self.assertEqual(self.client.get('/api/provinces/AF-BDS/accounts/?workspace=received').data['results'][0]['name'],'Received')
        self.assertEqual(FinancialAccount.objects.get(pk=created['id']).profile['outgoing_workspace'],True)

    def test_manager_contact_and_transaction_types_update_independently(self):
        account=self.create_agency()
        edited=self.client.patch(f"/api/outgoing/agencies/{account['id']}/",{'name':'Manager Updated','phone':'0700000009'},format='json')
        self.assertEqual(edited.status_code,200,edited.data)
        self.assertEqual((edited.data['name'],edited.data['phone']),('Manager Updated','0700000009'))
        receipt=self.transaction(account,'RECEIPT','1000')
        self.assertEqual(receipt.status_code,201,receipt.data)
        self.assertEqual(receipt.data['account'],account['id'])
        self.assertEqual(FinancialDocument.objects.get(pk=receipt.data['id']).category,'RECEIPT')
        self.assertEqual(LedgerPosting.objects.get(document_id=receipt.data['id']).amount,Decimal('1000'))

    def test_form_batch_saves_populated_fields_atomically(self):
        account=self.create_agency()
        response=self.client.post(f"/api/outgoing/agencies/{account['id']}/transactions/",{
            'date':'2026-11-06',
            'transactions':[
                {'request_key':uuid.uuid4().hex,'category':'RECEIPT','currency':'AFN','amount':'1000'},
                {'request_key':uuid.uuid4().hex,'category':'DISTRIBUTION','currency':'AFN','amount':'250'},
                {'request_key':uuid.uuid4().hex,'category':'CUSTOMER_LOAN','currency':'AFN','amount':'120','details':{'counterparty_name':'Batch Borrower'}},
            ],
        },format='json')
        self.assertEqual(response.status_code,201,response.data)
        self.assertEqual(response.data['count'],3)
        self.assertEqual(len(response.data['results']),3)
        summary=self.client.get(f"/api/outgoing/agencies/{account['id']}/transactions/").data['summary']
        self.assertEqual(Decimal(summary['received_afn']),Decimal('1000'))
        self.assertEqual(Decimal(summary['distributed_afn']),Decimal('250'))
        self.assertEqual(Decimal(summary['central_office_balance_afn']),Decimal('750'))
        self.assertEqual(Decimal(summary['people_debt']),Decimal('120'))

        failed=self.client.post(f"/api/outgoing/agencies/{account['id']}/transactions/",{
            'date':'2026-11-06',
            'transactions':[
                {'request_key':uuid.uuid4().hex,'category':'CUSTOMER_LOAN','currency':'AFN','amount':'50','details':{'counterparty_name':'Rollback Borrower'}},
                {'request_key':uuid.uuid4().hex,'category':'EXPENSE','currency':'TOMAN','amount':'25'},
            ],
        },format='json')
        self.assertEqual(failed.status_code,400,failed.data)
        self.assertEqual(FinancialDocument.objects.filter(account_id=account['id'],status='CONFIRMED').count(),3)
        self.assertFalse(FinancialAccount.objects.filter(agency_id=account['agency'],name='Rollback Borrower').exists())

    def test_central_report_sums_the_requested_afn_categories(self):
        account=self.create_agency()
        for category,amount,details in [
            ('RECEIPT','1000',{}),('PUBLIC_DEPOSIT','120',{'counterparty_name':'Depositor'}),
            ('COLLEAGUE_DEPOSIT','80',{'counterparty_name':'Creditor Colleague'}),
            ('DISTRIBUTION','300',{}),('EXPENSE','40',{}),
            ('CUSTOMER_LOAN','50',{'counterparty_name':'Debtor'}),
            ('CUSTOMER_CREDIT','30',{'counterparty_name':'People Creditor'}),
        ]:
            response=self.transaction(account,category,amount,details=details)
            self.assertEqual(response.status_code,201,response.data)
        summary=self.client.get(f"/api/outgoing/agencies/{account['id']}/transactions/").data['summary']
        self.assertEqual(Decimal(summary['central_report_additions_afn']),Decimal('1200'))
        self.assertEqual(Decimal(summary['central_report_deductions_afn']),Decimal('420'))
        self.assertEqual(Decimal(summary['central_report_balance_afn']),Decimal('780'))
        self.assertEqual(summary['central_report_status'],'نمایندگی بدهکار دفتر مرکزی است')

    def test_outgoing_agencies_can_be_grouped_and_moved_by_province(self):
        unassigned=self.create_agency(name='Legacy Manager')
        created=self.client.post('/api/outgoing/agencies/',{
            'name':'Badakhshan Manager','phone':'0700000011','province':'AF-BDS',
        },format='json')
        self.assertEqual(created.status_code,201,created.data)
        self.assertEqual(created.data['province'],'AF-BDS')
        self.assertEqual(created.data['province_name'],'بدخشان')
        self.assertEqual([row['id'] for row in self.client.get('/api/outgoing/agencies/?province=AF-BDS').data['results']],[created.data['id']])
        self.assertEqual([row['id'] for row in self.client.get('/api/outgoing/agencies/?province=unassigned').data['results']],[unassigned['id']])

        moved=self.client.patch(f"/api/outgoing/agencies/{created.data['id']}/",{'province':'AF-KAB'},format='json')
        self.assertEqual(moved.status_code,200,moved.data)
        self.assertEqual(moved.data['province'],'AF-KAB')
        self.assertEqual(FinancialAccount.objects.get(pk=created.data['id']).province_id,'AF-KAB')
        self.assertEqual(Agency.objects.get(pk=created.data['agency']).province_id,'AF-KAB')
        self.assertEqual(self.client.get('/api/outgoing/agencies/?province=AF-BDS').data['results'],[])
        self.assertEqual(self.client.get('/api/outgoing/agencies/?province=AF-KAB').data['results'][0]['id'],created.data['id'])
        self.assertEqual(self.client.post('/api/outgoing/agencies/',{
            'name':'Invalid Province','phone':'0700000012','province':'AF-XXX',
        },format='json').status_code,404)

    def test_agency_list_shows_named_toman_debtor_or_creditor_balance(self):
        owes_central=self.create_agency(name='Agency Owes Central')
        central_owes=self.create_agency(name='Central Owes Agency')
        settled=self.create_agency(name='Settled Agency')
        self.assertEqual(self.transaction(owes_central,'RECEIPT','5000','TOMAN').status_code,201)
        receipt_to_reverse=self.transaction(owes_central,'RECEIPT','1000','TOMAN')
        self.assertEqual(receipt_to_reverse.status_code,201,receipt_to_reverse.data)
        self.assertEqual(self.transaction(owes_central,'DISTRIBUTION','1000','TOMAN').status_code,201)
        self.assertEqual(self.transaction(central_owes,'RECEIPT','1000','TOMAN').status_code,201)
        self.assertEqual(self.transaction(central_owes,'DISTRIBUTION','2500','TOMAN').status_code,201)
        reversal=self.client.post('/api/ledger/documents/',{
            'request_key':uuid.uuid4().hex,'account':owes_central['id'],'agency':owes_central['agency'],
            'category':'REVERSAL','date':'2026-11-06','currency':'TOMAN','amount':'1000',
            'reversal_of':receipt_to_reverse.data['id'],'details':{'reason':'Test list balance reversal'},
        },format='json')
        self.assertEqual(reversal.status_code,201,reversal.data)

        rows={row['id']:row for row in self.client.get('/api/outgoing/agencies/').data['results']}
        self.assertEqual(rows[owes_central['id']]['name'],'Agency Owes Central')
        self.assertEqual(Decimal(rows[owes_central['id']]['toman_balance']),Decimal('4000'))
        self.assertEqual(rows[owes_central['id']]['toman_balance_status'],'نمایندگی بدهکار دفتر مرکزی است')
        self.assertEqual(Decimal(rows[central_owes['id']]['toman_balance']),Decimal('-1500'))
        self.assertEqual(rows[central_owes['id']]['toman_balance_status'],'نمایندگی طلبکار دفتر مرکزی است')
        self.assertEqual(Decimal(rows[settled['id']]['toman_balance']),0)
        self.assertEqual(rows[settled['id']]['toman_balance_status'],'حساب تومان تصفیه است')

    def test_dashboard_totals_keep_currencies_separate_and_reverse_with_their_source(self):
        account=self.create_agency()
        for category,amount,currency in [
            ('RECEIPT','1000','AFN'),('DISTRIBUTION','300','AFN'),
            ('RECEIPT','5000','TOMAN'),('DISTRIBUTION','1000','TOMAN'),
            ('EXPENSE','100','AFN'),('SHOP_RENT','40','AFN'),('SALARY','200','AFN'),
            ('OPENING','900','AFN'),
        ]:
            result=self.transaction(account,category,amount,currency)
            self.assertEqual(result.status_code,201,result.data)
        url=f"/api/outgoing/agencies/{account['id']}/transactions/?month=1405-08"
        response=self.client.get(url)
        self.assertEqual(response.status_code,200,response.data)
        summary=response.data['summary']
        self.assertEqual(Decimal(summary['received_afn']),Decimal('1000'))
        self.assertEqual(Decimal(summary['received_toman']),Decimal('5000'))
        self.assertEqual(Decimal(summary['distributed_afn']),Decimal('300'))
        self.assertEqual(Decimal(summary['distributed_toman']),Decimal('1000'))
        self.assertEqual(Decimal(summary['toman_balance']),Decimal('4000'))
        self.assertEqual(summary['toman_balance_status'],'نمایندگی بدهکار دفتر مرکزی است')
        self.assertEqual(Decimal(summary['toman_profit']),Decimal('3.333333333'))
        self.assertEqual(Decimal(summary['central_office_balance_afn']),Decimal('700'))
        self.assertEqual(Decimal(summary['expenses']),Decimal('100'))
        self.assertEqual(Decimal(summary['shop_rent']),Decimal('40'))
        self.assertEqual(Decimal(summary['salary']),Decimal('200'))
        self.assertEqual(Decimal(summary['capital']),Decimal('900'))
        receipt=FinancialDocument.objects.get(account_id=account['id'],category='RECEIPT',currency_id='AFN')
        reversal=self.client.post('/api/ledger/documents/',{
            'request_key':uuid.uuid4().hex,'account':account['id'],'agency':account['agency'],
            'category':'REVERSAL','date':'2026-11-06','currency':'AFN','amount':'1000',
            'reversal_of':receipt.pk,'details':{'reason':'Test reversal'},
        },format='json')
        self.assertEqual(reversal.status_code,201,reversal.data)
        summary=self.client.get(url).data['summary']
        self.assertEqual(Decimal(summary['received_afn']),0)
        self.assertEqual(Decimal(summary['central_office_balance_afn']),Decimal('-300'))
        self.assertEqual(summary['central_office_status'],'دفتر مرکزی بدهکار نمایندگی است')
        self.assertEqual(Decimal(summary['toman_profit']),Decimal('3.333333333'))
        toman_distribution=FinancialDocument.objects.get(account_id=account['id'],category='DISTRIBUTION',currency_id='TOMAN')
        reversed_toman=self.client.post('/api/ledger/documents/',{
            'request_key':uuid.uuid4().hex,'account':account['id'],'agency':account['agency'],
            'category':'REVERSAL','date':'2026-11-06','currency':'TOMAN','amount':'1000',
            'reversal_of':toman_distribution.pk,'details':{'reason':'Test toman distribution reversal'},
        },format='json')
        self.assertEqual(reversed_toman.status_code,201,reversed_toman.data)
        summary=self.client.get(url).data['summary']
        self.assertEqual(Decimal(summary['distributed_toman']),0)
        self.assertEqual(Decimal(summary['toman_balance']),Decimal('5000'))
        self.assertEqual(summary['toman_balance_status'],'نمایندگی بدهکار دفتر مرکزی است')
        self.assertEqual(Decimal(summary['toman_profit']),0)
        distribution=FinancialDocument.objects.get(account_id=account['id'],category='DISTRIBUTION',currency_id='AFN')
        reversed_distribution=self.client.post('/api/ledger/documents/',{
            'request_key':uuid.uuid4().hex,'account':account['id'],'agency':account['agency'],
            'category':'REVERSAL','date':'2026-11-06','currency':'AFN','amount':'300',
            'reversal_of':distribution.pk,'details':{'reason':'Test zero denominator'},
        },format='json')
        self.assertEqual(reversed_distribution.status_code,201,reversed_distribution.data)
        summary=self.client.get(url).data['summary']
        self.assertEqual(Decimal(summary['distributed_afn']),0)
        self.assertEqual(Decimal(summary['toman_profit']),0)
        extra_distribution=self.transaction(account,'DISTRIBUTION','6000','TOMAN')
        self.assertEqual(extra_distribution.status_code,201,extra_distribution.data)
        summary=self.client.get(url).data['summary']
        self.assertEqual(Decimal(summary['toman_balance']),Decimal('-1000'))
        self.assertEqual(summary['toman_balance_status'],'نمایندگی طلبکار دفتر مرکزی است')

    def test_counterparties_are_linked_and_currency_or_category_errors_are_rejected(self):
        account=self.create_agency()
        loan=self.transaction(account,'CUSTOMER_LOAN','250','AFN',details={'counterparty_name':'Borrower'})
        self.assertEqual(loan.status_code,201,loan.data)
        borrower=FinancialAccount.objects.get(agency_id=account['agency'],kind='KABUL_DEBTOR',name='Borrower')
        self.assertEqual(borrower.postings.get(document_id=loan.data['id']).amount,Decimal('250'))
        credit=self.transaction(account,'CUSTOMER_CREDIT','120','AFN',details={'counterparty_name':'Creditor'})
        self.assertEqual(credit.status_code,201,credit.data)
        self.assertTrue(FinancialAccount.objects.filter(agency_id=account['agency'],kind='CREDITOR',name='Creditor').exists())
        self.assertEqual(self.transaction(account,'SHOP_RENT','10','TOMAN').status_code,400)
        self.assertEqual(self.transaction(account,'CUSTOMER_LOAN','10','TOMAN',details={'counterparty_name':'Wrong currency'}).status_code,400)
        before=FinancialAccount.objects.filter(agency_id=account['agency'],kind='KABUL_DEBTOR').count()
        self.assertEqual(self.transaction(account,'CUSTOMER_LOAN','-1','AFN',details={'counterparty_name':'Rolled back'}).status_code,400)
        self.assertEqual(FinancialAccount.objects.filter(agency_id=account['agency'],kind='KABUL_DEBTOR').count(),before)
        self.assertEqual(self.transaction(account,'PROVINCIAL_IN','10').status_code,400)

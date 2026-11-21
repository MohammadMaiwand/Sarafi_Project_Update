import uuid
from decimal import Decimal
from .testing import AuthenticatedAPITestCase
from .models import Remittance,FinancialDocument,LedgerPosting

class UnpaidWorkspaceTests(AuthenticatedAPITestCase):
    def setUp(self):
        super().setUp()
        self.account=self.client.post('/api/provinces/AF-BDS/accounts/',{'name':'Representative'},format='json').data
    def document(self):
        response=self.client.post('/api/provincial/remittances/',{'request_key':uuid.uuid4().hex,'account':self.account['id'],'province':'AF-BDS','category':'PROVINCIAL_OUT','date':'2026-11-06','currency':'USD','amount':'100','destination':'AFN','destination_rate':'70','details':{'sender_name':'Sender','recipient_name':'Recipient','recipient_phone':'0700000000'}},format='json')
        self.assertEqual(response.status_code,201,response.data)
        return response.data
    def pay(self,doc,amount):
        response=self.client.post('/api/ledger/documents/',{'request_key':uuid.uuid4().hex,'account':self.account['id'],'category':'BENEFICIARY_PAYOUT','date':'2026-11-06','currency':'AFN','amount':amount,'allocations':[{'remittance':doc['id'],'amount':amount}]},format='json')
        self.assertEqual(response.status_code,201,response.data)
    def test_partial_remaining_is_in_destination_currency_and_full_payment_excluded(self):
        doc=self.document();self.pay(doc,'2000')
        response=self.client.get('/api/ledger/documents/?unexecuted=true')
        row=response.data['results'][0]
        self.assertEqual(row['date'],'2026-11-06')
        self.assertEqual(row['details']['recipient_phone'],'0700000000')
        self.assertEqual(row['conversion']['destination'],'AFN')
        self.assertEqual(Decimal(row['beneficiary']['outstanding']),Decimal(5000))
        self.assertEqual(row['beneficiary']['status'],'PARTIAL')
        self.pay(doc,'5000')
        self.assertEqual(self.client.get('/api/ledger/documents/?unexecuted=true').data['results'],[])
    def test_legacy_details_are_unverified_and_reads_do_not_create_documents(self):
        old=Remittance.objects.create(kind='outgoing',hawalaNumber='OLD-1',transactionDate='2026-11-06',receiverName='Old recipient',receiverFatherName='Father',currencyType='USD',sourceAmount=100,afnAmount=7000,phoneNumber='0700000000',nationalIdNumber='00123456',description='Historical note')
        before=(FinancialDocument.objects.count(),LedgerPosting.objects.count())
        row=self.client.get('/api/ledger/legacy-unpaid/').data['results'][0]
        self.assertEqual(row['legacy_remittance'],old.pk)
        self.assertEqual(row['payment_status'],'UNVERIFIED')
        self.assertEqual(row['details']['recipient_father'],'Father')
        self.assertNotEqual(row['details']['recipient_id'],'00123456')
        self.assertEqual(row['source_currency'],'USD')
        self.assertEqual(before,(FinancialDocument.objects.count(),LedgerPosting.objects.count()))

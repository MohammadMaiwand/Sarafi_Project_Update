import uuid
from decimal import Decimal
from .testing import AuthenticatedAPITestCase
from .models import FinancialAccount,Remittance

class ReceivedWorkspaceTests(AuthenticatedAPITestCase):
    def account(self,workspace):
        response=self.client.post('/api/provinces/AF-BDS/accounts/',{'name':'Same customer','phone':'0700000000','workspace':workspace},format='json')
        self.assertEqual(response.status_code,201,response.data)
        return response.data
    def remittance(self,account,workspace,amount='100',direction='PROVINCIAL_OUT'):
        return self.client.post('/api/provincial/remittances/',{'request_key':uuid.uuid4().hex,'workspace':workspace,'account':account['id'],'province':'AF-BDS','category':direction,'date':'2026-11-06','currency':'AFN','amount':amount,'afn_rate':'1','manual_profit':'0','profit_currency':'AFN','details':{'sender_name':'Sender','recipient_name':'Recipient'}},format='json')
    def test_same_province_accounts_are_separate_and_untagged_accounts_stay_visible(self):
        provincial=self.account('provincial');received=self.account('received')
        old=FinancialAccount.objects.create(name='Historical account',kind='AGENCY',province_id='AF-BDS',profile={'phone':'0700000000'})
        normal=self.client.get('/api/provinces/AF-BDS/accounts/').data['results']
        self.assertEqual({row['id'] for row in normal},{provincial['id'],old.pk})
        other=self.client.get('/api/provinces/AF-BDS/accounts/?workspace=received').data['results']
        self.assertEqual([row['id'] for row in other],[received['id']])
    def test_received_transactions_and_summary_do_not_mix_with_provincial(self):
        provincial=self.account('provincial');received=self.account('received')
        self.assertEqual(self.remittance(provincial,'provincial','900').status_code,201)
        self.assertEqual(self.remittance(received,'received','100').status_code,201)
        self.assertEqual(self.remittance(received,'received','40','PROVINCIAL_IN').status_code,201)
        rows=self.client.get('/api/provincial/remittances/?workspace=received').data
        self.assertEqual(rows['count'],2)
        self.assertEqual(self.client.get('/api/provincial/remittances/').data['count'],1)
        summary=self.client.get(f"/api/provincial/accounts/{received['id']}/remittances-summary/?workspace=received&history=all")
        self.assertEqual(summary.status_code,200,summary.data)
        self.assertEqual(Decimal(summary.data['totals'][0]['customerDebt']),Decimal(60))
        self.assertEqual(self.client.get(f"/api/provincial/accounts/{received['id']}/remittances-summary/").status_code,404)
    def test_wrong_workspace_cannot_create_transaction_on_other_account(self):
        received=self.account('received')
        self.assertEqual(self.remittance(received,'provincial').status_code,404)
        self.assertEqual(self.client.post('/api/provinces/AF-BDS/accounts/',{'name':'Invalid','workspace':'wrong'},format='json').status_code,400)
    def test_previous_outgoing_records_are_unchanged(self):
        row=Remittance.objects.create(kind='outgoing',hawalaNumber='OLD-OUT',transactionDate='2026-11-06',receiverName='Existing customer',currencyType='USD',sourceAmount=100,afnAmount=7000)
        self.account('received')
        self.client.get('/api/provinces/AF-BDS/accounts/?workspace=received')
        self.client.get('/api/provincial/remittances/?workspace=received')
        row.refresh_from_db()
        self.assertEqual(row.hawalaNumber,'OLD-OUT')
        self.assertEqual(row.afnAmount,Decimal(7000))
        self.assertEqual(self.client.get('/api/outgoing/').data['count'],1)

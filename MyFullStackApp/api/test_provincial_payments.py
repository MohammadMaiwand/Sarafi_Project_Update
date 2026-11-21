import uuid
from decimal import Decimal
from datetime import timedelta
from .test_provincial_workspace import ProvincialWorkspaceTests

class ProvincialPaymentBalanceTests(ProvincialWorkspaceTests):
    def payout(self, row, amount, day=None, account=None):
        return self.client.post('/api/ledger/documents/', {'request_key':uuid.uuid4().hex,'account':account or self.account['id'],'agency':row.get('agency_id'),'category':'BENEFICIARY_PAYOUT','date':str(day or self.start),'currency':'AFN','amount':amount,'allocations':[{'remittance':row['id'],'amount':amount}]},format='json')

    def test_partial_payments_are_deducted_once_and_separate(self):
        row=self.create('PROVINCIAL_IN','1000')
        self.create('PROVINCIAL_OUT','200')
        for amount in ['100','150']:
            result=self.payout(row,amount)
            self.assertEqual(result.status_code,201,result.data)
        total=self.report()['AFN']
        self.assertEqual(Decimal(total['payments']),Decimal(250))
        self.assertEqual(Decimal(total['net']),Decimal(-550))
        response=self.client.get(f"/api/provincial/accounts/{self.account['id']}/remittances-summary/",{'history':'all'})
        self.assertEqual(len(response.data['payments']),2)
        self.assertEqual(self.payout(row,'751').status_code,400)

    def test_payment_month_and_account_isolation(self):
        row=self.create('PROVINCIAL_IN','1000',day=self.start-timedelta(days=1))
        self.assertEqual(self.payout(row,'250',day=self.start-timedelta(days=1)).status_code,201)
        self.assertEqual(self.payout(row,'100').status_code,201)
        total=self.report()['AFN']
        self.assertEqual(Decimal(total['opening']),Decimal(-750))
        self.assertEqual(Decimal(total['payments']),Decimal(100))
        self.assertEqual(Decimal(total['closing']),Decimal(-650))
        other=self.client.post('/api/provinces/AF-BDS/accounts/',{'name':'Other'},format='json').data
        self.assertEqual(self.payout(row,'10',account=other['id']).status_code,400)

import uuid
from datetime import timedelta
from decimal import Decimal
from .testing import AuthenticatedAPITestCase
from .calendar_policy import month_bounds
from .models import FinancialDocument, LedgerPosting


class ProvincialWorkspaceTests(AuthenticatedAPITestCase):
    def setUp(self):
        super().setUp()
        response=self.client.post('/api/provinces/AF-BDS/accounts/',{'name':'Monthly customer','phone':'0700000000'},format='json')
        self.assertEqual(response.status_code,201,response.data)
        self.account=response.data
        self.start,self.end,_=month_bounds('1405-08')

    def create(self,direction,amount,currency='AFN',day=None,**extra):
        response=self.client.post('/api/provincial/remittances/',{'request_key':uuid.uuid4().hex,'account':self.account['id'],'province':'AF-BDS','category':direction,'date':str(day or self.start),'amount':amount,'currency':currency,'details':{'sender_name':'Sender','recipient_name':'Recipient'},**extra},format='json')
        self.assertEqual(response.status_code,201,response.data)
        return response.data

    def report(self,**params):
        response=self.client.get(f"/api/provincial/accounts/{self.account['id']}/remittances-summary/",{'month':'1405-08',**params})
        self.assertEqual(response.status_code,200,response.data)
        return {row['currency']:row for row in response.data['totals']}

    def test_outgoing_minus_incoming_and_currency_isolation(self):
        self.create('PROVINCIAL_OUT','1000.125')
        self.create('PROVINCIAL_IN','400.025')
        self.create('PROVINCIAL_IN','30','USD')
        result=self.report()
        self.assertEqual(Decimal(result['AFN']['net']),Decimal('600.100'))
        self.assertEqual(result['AFN']['status'],'بدهکار')
        self.assertEqual(Decimal(result['AFN']['customerDebt']),Decimal('600.100'))
        self.assertEqual(result['USD']['status'],'طلبکار')
        self.assertEqual(Decimal(result['USD']['customerCredit']),Decimal(30))

    def test_month_boundaries_opening_and_all_history(self):
        self.create('PROVINCIAL_OUT','100',day=self.start-timedelta(days=1))
        self.create('PROVINCIAL_IN','40',day=self.start)
        self.create('PROVINCIAL_OUT','900',day=self.end)
        row=self.report()['AFN']
        self.assertEqual(Decimal(row['opening']),Decimal(100))
        self.assertEqual(Decimal(row['net']),Decimal(-40))
        self.assertEqual(Decimal(row['closing']),Decimal(60))
        self.assertEqual(Decimal(self.report(history='all')['AFN']['net']),Decimal(960))

    def test_account_scope_and_read_does_not_create_postings(self):
        self.create('PROVINCIAL_OUT','100')
        other=self.client.post('/api/provinces/AF-BDS/accounts/',{'name':'Other'},format='json').data
        self.client.post('/api/provincial/remittances/',{'request_key':uuid.uuid4().hex,'account':other['id'],'province':'AF-BDS','category':'PROVINCIAL_OUT','date':str(self.start),'currency':'AFN','amount':'999','details':{'sender_name':'S','recipient_name':'R'}},format='json')
        before=(FinancialDocument.objects.count(),LedgerPosting.objects.count())
        self.assertEqual(Decimal(self.report()['AFN']['outgoing']),Decimal(100))
        self.report()
        self.assertEqual(before,(FinancialDocument.objects.count(),LedgerPosting.objects.count()))

    def test_converted_amount_and_reversal(self):
        row=self.create('PROVINCIAL_OUT','100','USD',destination='AFN',source_rate='1',destination_rate='70')
        self.assertEqual(Decimal(self.report()['AFN']['outgoing']),Decimal(7000))
        response=self.client.post(f"/api/provincial/accounts/{self.account['id']}/movements/",{'request_key':uuid.uuid4().hex,'category':'REVERSAL','currency':'USD','amount':'100','reversal_of':row['id'],'date':str(self.start),'details':{'reason':'Test correction'}},format='json')
        self.assertEqual(response.status_code,201,response.data)
        self.assertEqual(self.report(),{})

    def test_simple_form_direct_toman_rate_and_profit(self):
        row=self.create('PROVINCIAL_OUT','10000000','TOMAN',afn_rate='.0007',manual_profit='25',profit_currency='AFN')
        self.assertEqual(Decimal(row['conversion']['net']),Decimal('7000'))
        self.assertEqual(row['conversion']['quote_direction'],'AFN_PER_SOURCE')
        self.assertEqual(Decimal(row['manual_profit']),Decimal(25))
        self.assertEqual(Decimal(self.report()['AFN']['net']),Decimal(7000))

    def test_simple_manual_number_collision_and_automatic_skip(self):
        row=self.create('PROVINCIAL_OUT','100','TOMAN',afn_rate='.5',manual_number=200)
        self.assertTrue(row['number'].endswith('-200'))
        automatic=self.create('PROVINCIAL_IN','100','TOMAN',afn_rate='.5')
        self.assertTrue(automatic['number'].endswith('-201'))
        response=self.client.post('/api/provincial/remittances/',{'request_key':uuid.uuid4().hex,'account':self.account['id'],'province':'AF-BDS','category':'PROVINCIAL_OUT','date':str(self.start),'currency':'TOMAN','amount':'100','afn_rate':'.5','manual_number':200,'details':{'sender_name':'S','recipient_name':'R'}},format='json')
        self.assertEqual(response.status_code,400)
        self.assertIn('manual_number',response.data)

    def test_simple_image_stored_but_omitted_from_response(self):
        image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nmS8AAAAASUVORK5CYII='
        row=self.create('PROVINCIAL_IN','100','TOMAN',afn_rate='.5',details={'sender_name':'Sender','recipient_name':'Recipient','sender_father':'Father','recipient_id':'0012345','recipient_phone':'0700000000','identity_image':image})
        self.assertIs(row['details']['identity_image'],True)
        self.assertEqual(FinancialDocument.objects.get(pk=row['id']).details['identity_image'],image)

import uuid
from decimal import Decimal
from datetime import timedelta
from .test_provincial_workspace import ProvincialWorkspaceTests
from .models import FinancialDocument, ReceiptAllocation

class ProvincialAdvanceTests(ProvincialWorkspaceTests):
    def payment(self, amount, name='Sender', phone='', **extra):
        details={'sender_name':name,'sender_phone':phone,'recipient_name':'Recipient'}
        data={'workspace':'provincial','request_key':uuid.uuid4().hex,'date':str(self.start),'amount':amount,'currency':'AFN','afn_rate':'1','details':details,**extra}
        response=self.client.post(f"/api/provincial/accounts/{self.account['id']}/customer-payments/",data,format='json')
        self.assertEqual(response.status_code,201,response.data)
        return response.data,data

    def customer_rows(self):
        response=self.client.get(f"/api/provincial/accounts/{self.account['id']}/customer-payments/")
        self.assertEqual(response.status_code,200,response.data)
        return response.data['results']

    def test_repeated_advance_without_incoming_and_future_remittance(self):
        self.payment('120')
        self.payment('80')
        customer=self.customer_rows()[0]
        self.assertEqual(Decimal(customer['debt']),Decimal(200))
        self.assertEqual(Decimal(self.report()['AFN']['payments']),Decimal(200))
        incoming=self.create('PROVINCIAL_IN','150')
        self.assertEqual(Decimal(incoming['beneficiary']['outstanding']),Decimal(0))
        self.assertEqual(Decimal(incoming['beneficiary']['paid']),Decimal(150))
        self.assertEqual(Decimal(self.customer_rows()[0]['debt']),Decimal(50))
        self.assertEqual(Decimal(self.report()['AFN']['payments']),Decimal(200))
        second=self.create('PROVINCIAL_IN','100')
        self.assertEqual(Decimal(second['beneficiary']['paid']),Decimal(50))
        self.assertEqual(Decimal(second['beneficiary']['outstanding']),Decimal(50))
        self.assertEqual(Decimal(self.customer_rows()[0]['credit']),Decimal(50))

    def test_existing_incoming_overpayment_and_idempotency(self):
        incoming=self.create('PROVINCIAL_IN','100')
        response,data=self.payment('150')
        replay=self.client.post(f"/api/provincial/accounts/{self.account['id']}/customer-payments/",data,format='json')
        self.assertEqual(replay.status_code,201,replay.data)
        self.assertEqual(replay.data['id'],response['id'])
        self.assertEqual(ReceiptAllocation.objects.filter(receipt_id=response['id']).count(),1)
        self.assertEqual(Decimal(self.report()['AFN']['payments']),Decimal(150))
        self.assertEqual(Decimal(self.customer_rows()[0]['debt']),Decimal(50))

    def test_currency_account_and_person_isolation(self):
        self.payment('100',phone='0001')
        row=self.create('PROVINCIAL_IN','200',details={'sender_name':'Sender','sender_phone':'0002','recipient_name':'Recipient'})
        self.assertEqual(Decimal(row['beneficiary']['paid']),Decimal(0))
        usd=self.create('PROVINCIAL_IN','10','USD')
        self.assertEqual(Decimal(usd['beneficiary']['paid']),Decimal(0))
        other=self.client.post('/api/provinces/AF-BDS/accounts/',{'name':'Other'},format='json').data
        response=self.client.get(f"/api/provincial/accounts/{other['id']}/customer-payments/")
        self.assertEqual(response.data['results'],[])
        response=self.client.get(f"/api/provincial/accounts/{other['id']}/customer-payments/",{'workspace':'received'})
        self.assertEqual(response.status_code,404)

    def test_converted_payment_and_reversal_restores_remaining(self):
        row=self.create('PROVINCIAL_IN','100')
        payment,_=self.payment('1000',currency='TOMAN',afn_rate='.05')
        self.assertEqual(Decimal(self.report()['AFN']['payments']),Decimal(50))
        response=self.client.post(f"/api/provincial/accounts/{self.account['id']}/movements/",{'request_key':uuid.uuid4().hex,'category':'REVERSAL','currency':'TOMAN','amount':'1000','reversal_of':payment['id'],'date':str(self.start),'details':{'reason':'Test'}},format='json')
        self.assertEqual(response.status_code,201,response.data)
        self.assertEqual(Decimal(self.report()['AFN']['payments']),Decimal(0))
        detail=self.client.get(f"/api/provincial/remittances/{row['id']}/payments/")
        self.assertEqual(Decimal(detail.data['remittance']['beneficiary']['outstanding']),Decimal(100))

    def test_month_opening_advance_and_later_incoming(self):
        self.payment('100',date=str(self.start-timedelta(days=1)))
        self.create('PROVINCIAL_IN','150')
        total=self.report()['AFN']
        self.assertEqual(Decimal(total['opening']),Decimal(100))
        self.assertEqual(Decimal(total['payments']),Decimal(0))
        self.assertEqual(Decimal(total['closing']),Decimal(-50))

    def test_invalid_amount_and_missing_customer(self):
        for amount,details in [('0',{'sender_name':'X','recipient_name':'Y'}),('-1',{'sender_name':'X','recipient_name':'Y'}),('10',{'sender_name':'','recipient_name':'Y'})]:
            response=self.client.post(f"/api/provincial/accounts/{self.account['id']}/customer-payments/",{'request_key':uuid.uuid4().hex,'date':str(self.start),'currency':'AFN','amount':amount,'details':details},format='json')
            self.assertEqual(response.status_code,400,response.data)
        self.assertEqual(FinancialDocument.objects.filter(category='PROVINCIAL_PAYMENT').count(),0)

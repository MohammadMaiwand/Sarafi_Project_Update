from decimal import Decimal
from .testing import AuthenticatedAPITestCase as APITestCase
from .models import Remittance, ProvincialPerson


class ProvincialCustomerTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.person = ProvincialPerson.objects.create(recipientName='Customer')
        self.rows = [Remittance.objects.create(kind='provincial-received', hawalaNumber=f'QA-{i}', transactionDate='2025-03-20', recipientName='Customer', tomanAmount=amount, usdAmount=10, usdRate=70, afnAmount=700) for i, amount in enumerate([1000, 2000])]

    def test_deduction_is_once_exact_and_currency_separate(self):
        url = '/api/provincial-remaining-transactions/'
        payload = {'customerId': self.person.pk, 'referenceId': self.rows[0].pk, 'amount': '999'}
        self.assertEqual(self.client.post(url, payload).status_code, 400)
        payload['amount'] = '1000'
        result = self.client.post(url, payload)
        self.assertEqual(result.status_code, 201, result.data)
        self.assertEqual(result.data['balanceAfter'], '2000.000')
        self.assertEqual(self.client.post(url, payload).status_code, 400)
        state = self.client.get(f'/api/provincial-customers/{self.person.pk}/remaining/').data
        self.assertEqual(len(state['items']), 1)
        self.assertEqual(Decimal(state['afnBalance']['remaining']), Decimal(1400))
        self.assertEqual(self.client.delete(f'/api/provincial-received/{self.rows[0].pk}/').status_code, 400)
        self.assertEqual(self.client.patch(f'/api/provincial-received/{self.rows[0].pk}/', {'tomanAmount':'10'}).status_code, 400)

    def test_customer_isolation_and_rename_preserves_settlements(self):
        other = ProvincialPerson.objects.create(recipientName='Other')
        payload = {'customerId':other.pk, 'referenceId':self.rows[0].pk, 'amount':'1000'}
        self.assertEqual(self.client.post('/api/provincial-remaining-transactions/',payload).status_code,404)
        payload['customerId']=self.person.pk
        self.client.post('/api/provincial-remaining-transactions/',payload)
        renamed=self.client.put('/api/provincial-received/customer/',{'currentRecipientName':'Customer','recipientName':'Renamed','recipientFatherName':'Father'})
        self.assertEqual(renamed.status_code,200,renamed.data)
        self.assertEqual(renamed.data['updatedRemittances'],2)
        self.assertEqual(renamed.data['tomanBalance']['remainingToman'],'2000.000')
        collision=self.client.put('/api/provincial-received/customer/',{'currentRecipientName':'Renamed','recipientName':'Other'})
        self.assertEqual(collision.status_code,400)

    def test_report_shamsi_leap_boundary(self):
        report=self.client.get('/api/provincial-received/customers-summary/?year=1403&month=12').data
        self.assertEqual(report['period']['toDate'],'2025-03-20')
        self.assertEqual(report['grandTotal']['transactionCount'],2)
        self.assertEqual(report['grandTotal']['totalReceived'],'1400.000')
        self.assertEqual(self.client.get('/api/provincial-received/customers-summary/?year=1404').data['grandTotal']['transactionCount'],0)
        self.assertEqual(self.client.get('/api/provincial-received/customers-summary/?month=13').status_code,400)

    def test_history_pagination_and_single_record_mode(self):
        Remittance.objects.bulk_create([Remittance(kind='provincial-received',hawalaNumber=f'PAGE-{i}',transactionDate='2025-03-20',recipientName='Customer',tomanAmount=1,afnAmount=1) for i in range(101)])
        result=self.client.get('/api/provincial-received/customer/Customer/?pageSize=100').data
        self.assertEqual(result['count'],103)
        self.assertEqual(len(result['results']),100)
        self.assertEqual(result['totals']['transactionCount'],103)
        self.assertEqual(result['totals']['totalToman'],'3101.000')
        single=self.client.get(f'/api/provincial-received/customer-by-id/{self.rows[0].pk}/').data
        self.assertEqual(single['count'],1)

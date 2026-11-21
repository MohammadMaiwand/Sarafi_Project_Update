from decimal import Decimal
from .testing import AuthenticatedAPITestCase
from .models import Remittance


class OutgoingReceivedTests(AuthenticatedAPITestCase):
    def create(self,**changes):
        response=self.client.post('/api/outgoing/',{'receiverName':'Customer','receiverFatherName':'Father','transactionDate':'2026-11-06','currencyType':'USD','sourceAmount':'500','usdRate':'44','operationType':'USD_FORMULA','profitAmount':'0','moneyTransaction':'نقدی',**changes},format='json')
        self.assertEqual(response.status_code,201,response.data)
        return response.data

    def test_formula_edit_and_metadata_preserve_exact_amount(self):
        row=self.create()
        self.assertEqual(Decimal(row['afnAmount']),Decimal(22000))
        self.assertEqual(Decimal(row['usdAmount']),Decimal(500))
        changed=self.client.patch(f"/api/outgoing/{row['id']}/",{'usdRate':'45.125'},format='json')
        self.assertEqual(changed.status_code,200,changed.data)
        self.assertEqual(Decimal(changed.data['afnAmount']),Decimal('22562.5'))
        edited=self.client.patch(f"/api/outgoing/{row['id']}/",{'description':'Corrected note'},format='json')
        self.assertEqual(edited.data['afnAmount'],changed.data['afnAmount'])

    def test_customer_scope_exact_name_father_and_all_page_totals(self):
        self.create()
        self.create(sourceAmount='100')
        self.create(receiverFatherName='Other',sourceAmount='900')
        self.create(receiverName='Other customer',sourceAmount='900')
        result=self.client.get('/api/outgoing/',{'receiverName':'Customer','receiverFatherName':'Father','pageSize':1}).data
        self.assertEqual(result['count'],2)
        self.assertEqual(len(result['results']),1)
        self.assertEqual(Decimal(result['totalUsd']),Decimal(600))
        self.assertEqual(Decimal(result['totalAfn']),Decimal(26400))

    def test_rename_scopes_and_prevents_implicit_merge(self):
        first=self.create()
        other=self.create(receiverFatherName='Other')
        response=self.client.patch('/api/outgoing/customer/',{'currentName':'Customer','currentFather':'Father','name':'Renamed','father':'New father'},format='json')
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(Remittance.objects.get(pk=first['id']).receiverName,'Renamed')
        self.assertEqual(Remittance.objects.get(pk=other['id']).receiverName,'Customer')
        collision=self.client.patch('/api/outgoing/customer/',{'currentName':'Renamed','currentFather':'New father','name':'Customer','father':'Other'},format='json')
        self.assertEqual(collision.status_code,400)

    def test_old_direct_usd_values_keep_their_existing_formula(self):
        response=self.client.post('/api/outgoing/',{'senderName':'Sender','receiverName':'Receiver','transactionDate':'2026-11-06','currencyType':'USD','sourceAmount':'100','afnAmount':'7654','profitAmount':'0'},format='json')
        self.assertEqual(response.status_code,201,response.data)
        self.assertEqual(Decimal(response.data['afnAmount']),Decimal(7654))
        self.assertEqual(response.data['operationType'],'AFN_DIRECT')

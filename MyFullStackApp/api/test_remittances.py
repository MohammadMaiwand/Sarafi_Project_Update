import base64
from decimal import Decimal
from .testing import AuthenticatedAPITestCase as APITestCase
from .models import ProvincialPerson, Remittance
from .remittance_domain import amount_words


class RemittanceModuleTests(APITestCase):
    def incoming(self, **changes):
        return self.client.post('/api/incoming/', {'transactionDate':'2026-11-05','senderName':'Sender','receiverName':'Receiver','tomanAmount':'1000','afnUsdRate':'.0025',**changes},format='json')

    def receipt(self, **changes):
        response = self.client.post('/api/provincial-received/', {'transactionDate':'2026-11-05','recipientName':'Customer','recipientFatherName':'Father','usdAmount':'100','usdRate':'70','moneyTransaction':'نقدی',**changes},format='json')
        self.assertEqual(response.status_code,201,response.data)
        return response.data

    def distribution(self, amount='2000', **changes):
        return self.client.post('/api/provincial-distributions/', {'transactionDate':'2026-11-05','recipientName':'Customer','afnAmount':amount,**changes},format='json')

    def test_calculation_numbering_edit_delete(self):
        response=self.incoming(manualNumber=42,afnAmount='999')
        self.assertEqual(response.status_code,201,response.data)
        self.assertTrue(response.data['hawalaNumber'].endswith('000042'))
        self.assertEqual(Decimal(response.data['afnAmount']),Decimal('2.500'))
        self.assertEqual(self.incoming(manualNumber=42).status_code,400)
        path=f"/api/incoming/{response.data['id']}/"
        edited=self.client.patch(path,{'tomanAmount':'2000'},format='json')
        self.assertEqual(Decimal(edited.data['afnAmount']),Decimal('5'))
        self.assertEqual(self.client.get('/api/incoming/?search=Sender').data['count'],1)
        self.assertEqual(self.client.get('/api/outgoing/').data['count'],0)
        self.assertEqual(self.client.delete(path).status_code,204)
        self.assertEqual(self.client.get('/api/incoming/').data['count'],0)
        self.assertEqual(self.client.get(path).status_code,404)

    def test_invalid_values(self):
        for changes in [{'tomanAmount':'-1'},{'afnUsdRate':'0'},{'senderName':''},{'fingerprintEnabled':True},{'idCardImageRef':'invalid'},{'afnUsdRate':'NaN'},{'transactionDate':'bad'},{'manualNumber':0}]:
            with self.subTest(changes=changes):
                self.assertEqual(self.incoming(**changes).status_code,400)

    def test_invalid_filters(self):
        for query in ['dateFrom=bad','dateFrom=2026-11-06&dateTo=2026-11-01','page=abc','page=0','pageSize=1000','sortBy=deleted_at','sourceRemittance=abc']:
            with self.subTest(query=query):
                self.assertEqual(self.client.get('/api/incoming/?'+query).status_code,400)

    def test_pagination_order_search_and_date_filter(self):
        for day in ['01','02','03']:
            self.incoming(transactionDate=f'2026-11-{day}',senderFatherName='Search Father')
        result=self.client.get('/api/incoming/?pageSize=1&page=2&sortDir=asc').data
        self.assertEqual(result['count'],3)
        self.assertEqual(result['totalPages'],3)
        self.assertEqual(result['results'][0]['transactionDate'],'2026-11-02')
        self.assertEqual(self.client.get('/api/incoming/?search=Search%20Father&dateFrom=2026-11-02&dateTo=2026-11-03').data['count'],2)
        self.assertEqual(Decimal(result['totalAfn']),Decimal('7.500'))

    def test_sequence_preview_manual_and_deleted_numbers(self):
        response=self.incoming(manualNumber=100)
        self.assertTrue(self.client.get('/api/incoming/next-number/?date=2026-11-05').data['number'].endswith('000101'))
        self.client.delete(f"/api/incoming/{response.data['id']}/")
        self.assertEqual(self.incoming(manualNumber=100).status_code,400)
        self.assertTrue(self.incoming().data['hawalaNumber'].endswith('000101'))

    def test_number_cannot_be_changed_in_edit(self):
        row=self.incoming().data
        response=self.client.patch(f"/api/incoming/{row['id']}/",{'hawalaNumber':'OTHER'},format='json')
        self.assertEqual(response.status_code,400)

    def test_direct_non_toman_uses_entered_afn(self):
        for currency in ['AFN','USD','PKR','EUR']:
            payload={'transactionDate':'2026-11-05','senderName':'A','receiverName':'B','sourceAmount':'10','currencyType':currency,'profitAmount':'0','afnAmount':'456.789','afnUsdRate':'99','tomanInWords':'Discard this'}
            response=self.client.post('/api/outgoing/',payload,format='json')
            self.assertEqual(response.status_code,201,response.data)
            self.assertEqual(Decimal(response.data['afnAmount']),Decimal('456.789'))
            self.assertEqual(response.data['operationType'],'AFN_DIRECT')
            self.assertEqual(response.data['tomanInWords'],'')
            payload.pop('afnAmount')
            self.assertEqual(self.client.post('/api/outgoing/',payload,format='json').status_code,400)

    def test_outgoing_toman_and_currency_rate_alias(self):
        response=self.client.post('/api/outgoing/',{'transactionDate':'2026-11-05','senderName':'A','receiverName':'B','sourceAmount':'123.456','currencyType':'TOMAN','profitAmount':'0','currencyRate':'.12345678','afnAmount':'999'},format='json')
        self.assertEqual(response.status_code,201,response.data)
        self.assertEqual(Decimal(response.data['afnAmount']),Decimal('15.241'))
        self.assertEqual(response.data['operationType'],'TOMAN_FORMULA')
        self.assertTrue(response.data['tomanInWords'])

    def test_outgoing_requires_profit_and_currency(self):
        payload={'transactionDate':'2026-11-05','senderName':'A','receiverName':'B','sourceAmount':'10','currencyType':'TOMAN','profitAmount':'0','afnUsdRate':'1'}
        for key in ['currencyType','profitAmount']:
            changed={k:v for k,v in payload.items() if k!=key}
            self.assertEqual(self.client.post('/api/outgoing/',changed,format='json').status_code,400)

    def test_provincial_creates_person_and_authoritative_words(self):
        row=self.receipt(afnAmount='99',afnAmountInWords='Wrong words')
        self.assertEqual(Decimal(row['afnAmount']),Decimal('7000'))
        self.assertEqual(row['afnAmountInWords'],'هفت هزار')
        self.assertEqual(ProvincialPerson.objects.get(recipientName='Customer').recipientFatherName,'Father')

    def test_provincial_explicit_number_and_auto_sequence(self):
        self.receipt(hawalaNumber='PRV-2026-000020')
        self.assertTrue(self.receipt()['hawalaNumber'].endswith('000021'))
        payload={'transactionDate':'2026-11-05','recipientName':'C','usdAmount':'1','usdRate':'1','moneyTransaction':'نقدی','hawalaNumber':'PRV-2026-000020'}
        self.assertEqual(self.client.post('/api/provincial-received/',payload,format='json').status_code,400)

    def test_provincial_balance_and_overpayment(self):
        self.receipt()
        self.assertEqual(self.distribution().status_code,201)
        self.assertEqual(Decimal(self.client.get('/api/provincial-distributions/?customer=Customer').data['remaining']),Decimal('5000'))
        self.assertEqual(self.distribution('6000').status_code,400)
        self.assertEqual(self.distribution('-1').status_code,400)
        self.assertEqual(self.distribution('0').status_code,400)

    def test_receipt_edit_delete_and_customer_move_protected(self):
        receipt=self.receipt()
        self.distribution('6000')
        path=f"/api/provincial-received/{receipt['id']}/"
        self.assertEqual(self.client.delete(path).status_code,400)
        self.assertEqual(self.client.patch(path,{'usdAmount':'50'},format='json').status_code,400)
        self.assertEqual(self.client.patch(path,{'recipientName':'Someone else'},format='json').status_code,400)
        self.assertEqual(self.client.patch(path,{'description':'Allowed edit'},format='json').status_code,200)
        self.assertEqual(self.client.patch(path,{'usdAmount':'200'},format='json').status_code,200)

    def test_distribution_edit_delete_recomputes_balance(self):
        self.receipt()
        entry=self.distribution().data
        person=ProvincialPerson.objects.get(recipientName='Customer')
        path=f"/api/provincial-received/distributions/{person.pk}/entries/{entry['id']}/"
        self.assertEqual(self.client.patch(path,{'afnAmount':'8000'},format='json').status_code,400)
        self.assertEqual(self.client.patch(path,{'afnAmount':'3000'},format='json').status_code,200)
        self.assertEqual(Decimal(self.client.get(f'/api/provincial-received/distributions/{person.pk}/').data['remaining']),Decimal('4000'))
        self.assertEqual(self.client.delete(path).status_code,204)
        self.assertEqual(Decimal(self.client.get(f'/api/provincial-received/distributions/{person.pk}/').data['remaining']),Decimal('7000'))

    def test_person_entries_route_and_foreign_account_isolation(self):
        self.receipt()
        person=ProvincialPerson.objects.get(recipientName='Customer')
        response=self.client.post(f'/api/provincial-received/distributions/{person.pk}/entries/',{'transactionDate':'2026-11-05','afnAmount':'100','recipientName':'Injected name'},format='json')
        self.assertEqual(response.status_code,201,response.data)
        self.assertEqual(response.data['recipientName'],'Customer')
        other=ProvincialPerson.objects.create(recipientName='Other')
        self.assertEqual(self.client.get(f"/api/provincial-received/distributions/{other.pk}/entries/{response.data['id']}/").status_code,404)

    def test_history_summary_and_source_fallback(self):
        row=self.receipt()
        self.receipt(usdAmount='50')
        self.receipt(recipientName='Other')
        self.distribution()
        history=self.client.get('/api/provincial-received/customer/Customer/').data
        self.assertEqual(history['count'],2)
        self.assertEqual(Decimal(history['balance']['remaining']),Decimal('8500'))
        self.assertEqual(len(history['distributions']),1)
        self.assertEqual(self.client.get(f"/api/provincial-received/customer-by-id/{row['id']}/").data['count'],1)
        summary=self.client.get('/api/provincial-received/customers/?search=Customer').data
        self.assertEqual(summary['count'],1)
        self.assertEqual(summary['results'][0]['remittanceCount'],2)
        Remittance.objects.filter(pk=row['id']).update(recipientName='')
        fallback=self.client.get(f"/api/provincial-received/customer-by-id/{row['id']}/")
        self.assertEqual(fallback.status_code,200,fallback.data)
        self.assertEqual(fallback.data['count'],1)

    def test_media_validation_and_list_omits_large_fields(self):
        png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nmS8AAAAASUVORK5CYII='
        template='data:application/octet-stream;base64,'+base64.b64encode(b'device-template').decode()
        response=self.incoming(idCardImageRef=png,fingerprintEnabled=True,fingerprintTemplateRef=template)
        self.assertEqual(response.status_code,201,response.data)
        listing=self.client.get('/api/incoming/').data['results'][0]
        self.assertTrue(listing['hasIdCardImage'])
        self.assertTrue(listing['hasFingerprint'])
        self.assertNotIn('idCardImageRef',listing)
        self.assertNotIn('fingerprintTemplateRef',listing)
        fake='data:image/png;base64,'+base64.b64encode(b'not an image').decode()
        self.assertEqual(self.incoming(idCardImageRef=fake).status_code,400)
        self.assertEqual(self.incoming(fingerprintTemplateRef='data:application/octet-stream;base64,INVALID').status_code,400)

    def test_large_computed_amount_returns_validation_error(self):
        response=self.incoming(tomanAmount='999999999999999999999',afnUsdRate='999999999999')
        self.assertEqual(response.status_code,400)

    def test_person_metadata_update_preserves_identity(self):
        self.receipt()
        person=ProvincialPerson.objects.get(recipientName='Customer')
        path=f'/api/provincial-received/distributions/{person.pk}/'
        self.assertEqual(self.client.patch(path,{'phoneNumber':'0700000000'},format='json').status_code,200)
        self.assertEqual(self.client.patch(path,{'recipientName':'Renamed'},format='json').status_code,400)

    def test_decimal_words(self):
        self.assertEqual(amount_words(Decimal('123.456')),'صد و بیست و سه و چهارصد و پنجاه و شش هزارم')

    def test_shared_options_and_deferred_fingerprint_marker(self):
        result=self.client.get('/api/remittances/options/').data
        self.assertIn('TOMAN',result['currencies'])
        self.assertEqual(result['fingerprint']['marker'],'FINGERPRINT_DEVICE_INTEGRATION')

    def test_zero_ids_and_invalid_explicit_sequences_are_rejected(self):
        self.assertEqual(self.client.get('/api/provincial-received/customer-by-id/0/').status_code,404)
        self.assertEqual(self.client.get('/api/provincial-received/distributions/0/entries/').status_code,404)
        payload={'transactionDate':'2026-11-05','recipientName':'C','usdAmount':'1','usdRate':'1','moneyTransaction':'نقدی'}
        for number in ['PRV-2026-000000','PRV-2026-1000000000']:
            self.assertEqual(self.client.post('/api/provincial-received/',{**payload,'hawalaNumber':number},format='json').status_code,400)

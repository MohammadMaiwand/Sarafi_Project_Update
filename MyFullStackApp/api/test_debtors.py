from decimal import Decimal
from .testing import AuthenticatedAPITestCase as APITestCase
from .models import DebtorCustomer, DebtPayment

class DebtorLedgerTests(APITestCase):
    def create_debtor(self, **changes):
        response=self.client.post('/api/debtors/',{'customer_name':'Customer','father_name':'Father','location':'Kabul','usd_rate':'64','original_usd_amount':'5000',**changes},format='json')
        self.assertEqual(response.status_code,201,response.data)
        return response.data
    def entry(self, debtor, kind, amount, **changes):
        return self.client.post(f"/api/debtors/{debtor['id']}/payments/",{'payment_type':kind,'payment_usd_amount':amount,**changes},format='json')
    def test_original_amount_is_computed_and_totals_start_correctly(self):
        row=self.create_debtor(original_afn_amount='1')
        self.assertEqual(row['original_afn_amount'],'320000.00')
        self.assertEqual(row['remaining_usd'],'5000.00')
        self.assertEqual(row['total_paid_usd'],'0.00')
        self.assertFalse(row['is_fully_paid'])
    def test_loan_payment_edit_delete_all_recalculate(self):
        row=self.create_debtor()
        loan=self.entry(row,'LOAN','1000')
        self.assertEqual(loan.status_code,201,loan.data)
        self.assertEqual(loan.data['remaining_usd'],'6000.00')
        paid=self.entry(row,'PAYMENT','2500')
        self.assertEqual(paid.data['remaining_usd'],'3500.00')
        path=f"/api/debtors/{row['id']}/payments/{paid.data['id']}/"
        edit=self.client.patch(path,{'payment_usd_amount':'2000'},format='json')
        self.assertEqual(edit.data['remaining_usd'],'4000.00')
        self.assertEqual(edit.data['payment_afn_amount'],'128000.00')
        deleted=self.client.delete(path)
        self.assertEqual(deleted.data['remaining_usd'],'6000.00')
    def test_cannot_overpay_or_make_negative_by_deleting_or_reducing_loan(self):
        row=self.create_debtor(original_usd_amount='100')
        self.assertEqual(self.entry(row,'PAYMENT','100.01').status_code,400)
        loan=self.entry(row,'LOAN','100').data
        self.entry(row,'PAYMENT','180')
        path=f"/api/debtors/{row['id']}/payments/{loan['id']}/"
        self.assertEqual(self.client.delete(path).status_code,400)
        self.assertEqual(self.client.patch(path,{'payment_usd_amount':'50'},format='json').status_code,400)
        self.assertEqual(self.client.patch(path,{'payment_type':'PAYMENT'},format='json').status_code,400)
        self.assertEqual(self.client.patch(path,{'payment_usd_amount':'80'},format='json').data['remaining_usd'],'0.00')
    def test_date_rate_and_afn_are_authoritative_historical_values(self):
        row=self.create_debtor()
        payment=self.entry(row,'PAYMENT','10',usd_rate='999',payment_afn_amount='1',payment_date='2000-01-01')
        self.assertEqual(payment.data['usd_rate'],'64.000000')
        self.assertEqual(payment.data['payment_afn_amount'],'640.00')
        self.assertNotEqual(payment.data['payment_date'],'2000-01-01')
        path=f"/api/debtors/{row['id']}/payments/{payment.data['id']}/"
        edit=self.client.patch(path,{'payment_usd_amount':'20','usd_rate':'100','payment_date':'2000-01-01'},format='json')
        self.assertEqual(edit.data['usd_rate'],'64.000000')
        self.assertEqual(edit.data['payment_afn_amount'],'1280.00')
        self.assertEqual(edit.data['payment_date'],payment.data['payment_date'])
    def test_identity_edit_and_historical_money_locks(self):
        row=self.create_debtor()
        path=f"/api/debtors/{row['id']}/"
        for changes in [{'usd_rate':'65'},{'original_usd_amount':'1'},{'debtor_type':'LARGE','national_id':'N'}]:
            self.assertEqual(self.client.patch(path,changes,format='json').status_code,400)
        edit=self.client.patch(path,{'customer_name':'Edited','location':'Herat'},format='json')
        self.assertEqual(edit.status_code,200)
        self.assertEqual(edit.data['customer_name'],'Edited')
        self.assertEqual(edit.data['original_afn_amount'],'320000.00')
    def test_zero_balance_badge_filters_types_and_search(self):
        paid=self.create_debtor(customer_name='Settled')
        self.entry(paid,'PAYMENT','5000')
        self.create_debtor(customer_name='Open customer')
        self.create_debtor(debtor_type='LARGE',customer_name='Large customer',national_id='N-100')
        result=self.client.get('/api/debtors/?type=SMALL&debtStatus=PAID').data
        self.assertEqual(result['count'],1)
        self.assertTrue(result['results'][0]['is_fully_paid'])
        self.assertEqual(self.client.get('/api/debtors/?type=SMALL&debtStatus=OPEN').data['count'],1)
        self.assertEqual(self.client.get('/api/debtors/?type=LARGE&search=N-100').data['count'],1)
        self.assertEqual(self.client.get('/api/debtors/?search=Kabul').data['count'],2)
    def test_required_large_id_and_valid_positive_rate(self):
        base={'customer_name':'Test','original_usd_amount':'10','usd_rate':'64'}
        for change in [{'debtor_type':'LARGE'},{'usd_rate':'0'},{'usd_rate':'-1'},{'original_usd_amount':'-1'}]:
            response=self.client.post('/api/debtors/',{**base,**change},format='json')
            self.assertEqual(response.status_code,400,response.data)
    def test_nonpositive_payment_and_invalid_filters_are_rejected(self):
        row=self.create_debtor()
        for value in ['0','-1','NaN']:
            self.assertEqual(self.entry(row,'PAYMENT',value).status_code,400)
        for query in ['page=0','pageSize=1000','dateFrom=BAD','debtStatus=BAD','type=BAD','sortBy=deleted_at']:
            self.assertEqual(self.client.get('/api/debtors/?'+query).status_code,400)
    def test_pagination_summary_and_soft_delete(self):
        row=self.create_debtor()
        self.create_debtor()
        result=self.client.get('/api/debtors/?pageSize=1&page=2').data
        self.assertEqual(result['count'],2)
        self.assertEqual(result['totalPages'],2)
        self.assertEqual(result['summary']['remaining_usd'],'10000.00')
        self.assertEqual(self.client.delete(f"/api/debtors/{row['id']}/").status_code,204)
        self.assertEqual(self.client.get(f"/api/debtors/{row['id']}/payments/").status_code,404)
        self.assertEqual(self.client.get('/api/debtors/').data['count'],1)
    def test_manual_number_collision_and_payment_account_isolation(self):
        first=self.create_debtor(manual_sequence=42)
        self.assertTrue(first['customer_number'].endswith('000042'))
        self.assertEqual(self.client.post('/api/debtors/',{'customer_name':'X','original_usd_amount':'1','usd_rate':'64','manual_sequence':42},format='json').status_code,400)
        second=self.create_debtor()
        payment=self.entry(first,'PAYMENT','10').data
        self.assertEqual(self.client.patch(f"/api/debtors/{second['id']}/payments/{payment['id']}/",{'payment_usd_amount':'20'},format='json').status_code,404)
    def test_id_image_flags_and_large_payloads_omitted_from_list(self):
        png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nmS8AAAAASUVORK5CYII='
        row=self.create_debtor(id_card_image_ref=png)
        self.assertTrue(row['has_id_card_image'])
        listing=self.client.get('/api/debtors/').data['results'][0]
        self.assertTrue(listing['has_id_card_image'])
        self.assertNotIn('id_card_image_ref',listing)
        self.assertNotIn('fingerprint_template_ref',listing)

    def test_date_filters_follow_kabul_calendar_day(self):
        row=self.create_debtor()
        DebtorCustomer.objects.filter(pk=row['id']).update(created_at='2026-11-04T20:00:00Z')
        self.assertEqual(self.client.get('/api/debtors/?dateFrom=2026-11-05&dateTo=2026-11-05').data['count'],1)
        self.assertEqual(self.client.get('/api/debtors/?dateFrom=2026-11-04&dateTo=2026-11-04').data['count'],0)

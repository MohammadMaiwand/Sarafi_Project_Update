from decimal import Decimal
from .testing import AuthenticatedAPITestCase as APITestCase
from .models import Colleague, ColleagueTransaction

class ColleagueLedgerTests(APITestCase):
    def colleague(self, **changes):
        response=self.client.post('/api/colleagues/',{'colleagueName':'Amin','fatherName':'Saber','phoneNumber':'0700000000','location':'Kabul',**changes},format='json')
        self.assertEqual(response.status_code,201,response.data)
        return response.data
    def tx(self, person, **changes):
        return self.client.post(f"/api/colleagues/{person['id']}/transactions/",{'transactionType':'RECEIVED','transactionDate':'2026-11-05','currencyType':'USD','amount':'100','usdRate':'70',**changes},format='json')
    def get_person(self, person):
        return self.client.get(f"/api/colleagues/{person['id']}/").data
    def tx_path(self, person, tx): return f"/api/colleagues/{person['id']}/transactions/{tx['id']}/"

    def test_person_creation_starts_empty_and_requires_name(self):
        person=self.colleague()
        self.assertEqual(person['remainingAfn'],'0.000')
        self.assertEqual(ColleagueTransaction.objects.count(),0)
        self.assertEqual(self.client.post('/api/colleagues/',{'colleagueName':' '},format='json').status_code,400)
    def test_received_paid_and_authoritative_usd_calculation(self):
        person=self.colleague()
        received=self.tx(person,usdAmount='1',afnAmount='1')
        self.assertEqual(received.status_code,201,received.data)
        self.assertEqual(received.data['afnAmount'],'7000.000')
        self.assertEqual(received.data['usdAmount'],'100.000')
        paid=self.tx(person,transactionType='PAID',currencyType='AFN',amount='500',usdRate='50')
        self.assertEqual(paid.data['afnAmount'],'500.000')
        self.assertEqual(paid.data['usdAmount'],'10.000')
        self.assertEqual(self.get_person(person)['remainingAfn'],'6500.000')
    def test_toman_uses_afn_per_toman_rate(self):
        person=self.colleague()
        response=self.tx(person,currencyType='TOMAN',amount='1000000',usdRate='.0025')
        self.assertEqual(response.status_code,201,response.data)
        self.assertEqual(response.data['afnAmount'],'2500.000')
        self.assertEqual(response.data['usdAmount'],'0.000')
    def test_overpayment_and_negative_amounts_rejected(self):
        person=self.colleague()
        self.assertEqual(self.tx(person,transactionType='PAID').status_code,400)
        self.tx(person)
        self.assertEqual(self.tx(person,transactionType='PAID',amount='100.001').status_code,400)
        for changes in [{'amount':'0'},{'amount':'-1'},{'usdRate':'0'},{'usdRate':'NaN'},{'currencyType':'INVALID'},{'transactionType':'INVALID'},{'transactionDate':'1405/08/14'}]:
            with self.subTest(changes=changes):self.assertEqual(self.tx(person,**changes).status_code,400)
    def test_edit_delete_spent_received_preserves_balance(self):
        person=self.colleague()
        received=self.tx(person).data
        paid=self.tx(person,transactionType='PAID',currencyType='AFN',amount='6500',usdRate='70').data
        path=self.tx_path(person,received)
        self.assertEqual(self.client.delete(path).status_code,400)
        self.assertEqual(self.client.patch(path,{'amount':'90'},format='json').status_code,400)
        self.assertEqual(self.client.patch(path,{'amount':'110'},format='json').status_code,200)
        self.assertEqual(self.get_person(person)['remainingAfn'],'1200.000')
        path=self.tx_path(person,paid)
        self.assertEqual(self.client.patch(path,{'amount':'6000'},format='json').status_code,200)
        self.assertEqual(self.get_person(person)['remainingAfn'],'1700.000')
        self.assertEqual(self.client.delete(path).status_code,204)
        self.assertEqual(self.get_person(person)['remainingAfn'],'7700.000')
    def test_edit_type_is_locked_and_parent_account_cannot_be_injected(self):
        one,two=self.colleague(),self.colleague(colleagueName='Other')
        row=self.tx(one,colleagueId=two['id'],colleagueName='Spoofed').data
        self.assertEqual(row['colleagueId'],one['id'])
        self.assertEqual(row['colleagueName'],'Amin')
        self.assertEqual(self.client.patch(self.tx_path(one,row),{'transactionType':'PAID'},format='json').status_code,400)
        self.assertEqual(self.client.get(self.tx_path(two,row)).status_code,404)
    def test_currency_change_recalculates_authoritatively(self):
        person=self.colleague()
        tx=self.tx(person).data
        response=self.client.patch(self.tx_path(person,tx),{'currencyType':'AFN','amount':'700','usdRate':'70','afnAmount':'999'},format='json')
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(response.data['afnAmount'],'700.000')
        self.assertEqual(response.data['usdAmount'],'10.000')
        self.assertEqual(self.get_person(person)['remainingAfn'],'700.000')
    def test_profile_edits_propagate_to_history_and_manual_number_can_stay(self):
        person=self.colleague(manualNumber=42)
        tx=self.tx(person).data
        response=self.client.patch(f"/api/colleagues/{person['id']}/",{'colleagueName':'Updated','fatherName':'New father','manualNumber':42},format='json')
        self.assertEqual(response.status_code,200,response.data)
        self.assertTrue(response.data['colleagueNumber'].endswith('000042'))
        detail=self.client.get(self.tx_path(person,tx)).data
        self.assertEqual(detail['colleagueName'],'Updated')
        self.assertEqual(detail['fatherName'],'New father')
        self.assertEqual(self.client.post('/api/colleagues/',{'colleagueName':'Duplicate','manualNumber':42},format='json').status_code,400)
    def test_person_and_transaction_number_sequences_are_separate(self):
        person=self.colleague(manualNumber=40)
        tx=self.tx(person,manualNumber=8).data
        self.assertTrue(person['colleagueNumber'].startswith('CL-'))
        self.assertTrue(tx['transactionNumber'].startswith('CTX-'))
        self.assertTrue(tx['transactionNumber'].endswith('000008'))
        self.assertTrue(self.tx(person).data['transactionNumber'].endswith('000009'))
        self.assertEqual(self.tx(person,manualNumber=8).status_code,400)
    def test_history_pagination_search_and_period_balance(self):
        person=self.colleague()
        self.tx(person,transactionDate='2026-10-01')
        self.tx(person,transactionDate='2026-11-05',currencyType='AFN',amount='200',description='Find this')
        self.tx(person,transactionType='PAID',transactionDate='2026-11-06',currencyType='AFN',amount='100')
        result=self.client.get(f"/api/colleagues/{person['id']}/transactions/?dateFrom=2026-11-01&dateTo=2026-11-30&pageSize=1").data
        self.assertEqual(result['count'],2)
        self.assertEqual(result['transactions'],result['results'])
        self.assertEqual(result['balance']['remainingAfn'],'100.000')
        self.assertEqual(result['accountBalance']['remainingAfn'],'7100.000')
        found=self.client.get(f"/api/colleagues/{person['id']}/transactions/?search=Find").data
        self.assertEqual(found['count'],1)
        listing=self.client.get('/api/colleagues/?dateFrom=2026-11-01&dateTo=2026-11-30').data
        self.assertEqual(listing['results'][0]['remainingAfn'],'100.000')
    def test_filters_do_not_allow_payment_above_real_account_balance(self):
        person=self.colleague()
        self.tx(person)
        self.assertEqual(self.tx(person,transactionType='PAID',amount='101',transactionDate='2026-01-01').status_code,400)
    def test_legacy_negative_balance_can_only_improve(self):
        person=self.colleague()
        old=ColleagueTransaction.objects.create(colleague_id=person['id'],transactionNumber='LEGACY',transactionType='PAID',transactionDate='2026-01-01',currencyType='AFN',amount=1000,usdRate=70,afnAmount=1000)
        self.assertEqual(self.get_person(person)['remainingAfn'],'-1000.000')
        self.assertEqual(self.tx(person,transactionType='PAID',currencyType='AFN',amount='1').status_code,400)
        received=self.tx(person,currencyType='AFN',amount='100')
        self.assertEqual(received.status_code,201,received.data)
        self.assertEqual(self.get_person(person)['remainingAfn'],'-900.000')
        self.assertEqual(self.client.delete(self.tx_path(person,received.data)).status_code,400)
        self.assertEqual(self.client.delete(f"/api/colleagues/{person['id']}/transactions/{old.pk}/").status_code,204)
        self.assertEqual(self.get_person(person)['remainingAfn'],'100.000')
    def test_soft_delete_and_person_search_pagination(self):
        one=self.colleague()
        self.colleague(colleagueName='Second')
        self.tx(one)
        response=self.client.get('/api/colleagues/?pageSize=1&page=2')
        self.assertEqual(response.data['count'],2)
        self.assertEqual(response.data['totalPages'],2)
        self.assertEqual(response.data['balance']['remainingAfn'],'7000.000')
        self.assertEqual(self.client.get('/api/colleagues/?search=Saber').data['count'],2)
        self.assertEqual(self.client.delete(f"/api/colleagues/{one['id']}/").status_code,204)
        self.assertEqual(self.client.get(f"/api/colleagues/{one['id']}/transactions/").status_code,404)
        self.assertEqual(self.client.get('/api/colleagues/').data['count'],1)
        self.assertEqual(ColleagueTransaction.objects.count(),1)
    def test_invalid_pagination_dates_and_oversized_calculation(self):
        person=self.colleague()
        for query in ['page=0','pageSize=1000','dateFrom=BAD','dateFrom=2026-11-05&dateTo=2026-11-01','sortBy=deletedAt']:
            self.assertEqual(self.client.get('/api/colleagues/?'+query).status_code,400)
        self.assertEqual(self.tx(person,amount='999999999999',usdRate='999999999').status_code,400)
        self.assertEqual(self.client.get('/api/colleagues/next-number/?date=BAD').status_code,400)

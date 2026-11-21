import uuid
from decimal import Decimal

from .models import Customer, Transaction
from .testing import AuthenticatedAPITestCase


class TomanProfitReportTests(AuthenticatedAPITestCase):
    def create_tehran_transaction(self, date, toman, afn, destination='AFN'):
        customer = Customer.objects.create(name=f'Profit customer {uuid.uuid4().hex[:8]}')
        row = Transaction.objects.create(
            customer=customer,
            voucher_number=f'PROFIT-{uuid.uuid4().hex[:12]}',
            date=date,
            toman_amount=toman,
            toman_rate=Decimal(1),
            afghani_rate=Decimal(1),
            source_currency='TOMAN',
            destination_currency=destination,
        )
        Transaction.objects.filter(pk=row.pk).update(afghani_amount=Decimal(afn))
        return row

    def create_agency(self, name, province):
        response = self.client.post('/api/outgoing/agencies/', {
            'name': name,
            'phone': '0700000000',
            'province': province,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return response.data

    def post_document(self, agency, category, amount, currency='TOMAN', date='2026-11-06'):
        return self.client.post(f"/api/outgoing/agencies/{agency['id']}/transactions/", {
            'request_key': uuid.uuid4().hex,
            'category': category,
            'date': date,
            'currency': currency,
            'amount': str(amount),
        }, format='json')

    def test_monthly_profit_uses_tehran_buy_rate_and_lists_province_and_agency_totals(self):
        self.create_tehran_transaction('2026-11-06', '100000', '30000')
        self.create_tehran_transaction('2026-12-01', '900000', '270000')
        self.create_tehran_transaction('2026-11-06', '500000', '400000', destination='USD')
        kabul = self.create_agency('Kabul Representative', 'AF-KAB')
        kapisa = self.create_agency('Kapisa Representative', 'AF-KAP')

        for agency, receipt, distributed, afn in (
            (kabul, '210000', '200000', '58000'),
            (kapisa, '160000', '150000', '43500'),
        ):
            self.assertEqual(self.post_document(agency, 'RECEIPT', receipt).status_code, 201)
            self.assertEqual(self.post_document(agency, 'DISTRIBUTION', distributed).status_code, 201)
            self.assertEqual(self.post_document(agency, 'DISTRIBUTION', afn, 'AFN').status_code, 201)

        receipt_to_reverse = self.post_document(kabul, 'RECEIPT', '1000')
        self.assertEqual(receipt_to_reverse.status_code, 201, receipt_to_reverse.data)
        reversal = self.client.post('/api/ledger/documents/', {
            'request_key': uuid.uuid4().hex,
            'account': kabul['id'],
            'agency': kabul['agency'],
            'category': 'REVERSAL',
            'date': '2026-11-06',
            'currency': 'TOMAN',
            'amount': '1000',
            'reversal_of': receipt_to_reverse.data['id'],
            'details': {'reason': 'Toman profit report test'},
        }, format='json')
        self.assertEqual(reversal.status_code, 201, reversal.data)

        response = self.client.get('/api/toman-profit/?month=1405-08')
        self.assertEqual(response.status_code, 200, response.data)
        report = response.data
        self.assertEqual(report['tehran_purchase']['toman'], '100000.000')
        self.assertEqual(report['tehran_purchase']['afn'], '30000.000')
        self.assertEqual(report['tehran_purchase']['rate_per_1000'], '300.000000000')
        self.assertEqual(report['totals']['received_toman'], '370000.000')
        self.assertEqual(report['totals']['distributed_toman'], '350000.000')
        self.assertEqual(report['totals']['distributed_afn'], '101500.000')
        self.assertEqual(report['totals']['profit_afn'], '3500.000')

        provinces = {row['code']: row for row in report['provinces']}
        self.assertEqual(provinces['AF-KAB']['profit_afn'], '2000.000')
        self.assertEqual(provinces['AF-KAP']['profit_afn'], '1500.000')
        kabul_agency = provinces['AF-KAB']['agencies'][0]
        self.assertEqual(kabul_agency['name'], 'Kabul Representative')
        self.assertEqual(kabul_agency['sale_rate_per_1000'], '290.000000000')
        self.assertEqual(kabul_agency['profit_afn'], '2000.000')

    def test_empty_month_has_no_invented_rate_or_profit_and_invalid_month_is_rejected(self):
        response = self.client.get('/api/toman-profit/?month=1405-10')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIsNone(response.data['tehran_purchase']['rate_per_1000'])
        self.assertIsNone(response.data['totals']['profit_afn'])
        self.assertEqual(self.client.get('/api/toman-profit/?month=1405-13').status_code, 400)

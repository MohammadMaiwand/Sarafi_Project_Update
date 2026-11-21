from decimal import Decimal

from .testing import AuthenticatedAPITestCase as APITestCase

from .models import Customer, Transaction


class RemittanceTests(APITestCase):
    def test_spreadsheet_example_and_additional_fields(self):
        row = self.create_transaction(toman_amount='1000000', toman_rate='225.000', afghani_rate='64.5', toman_in_words='One million', expense='120', bank_account='001234567890')
        self.assertEqual(row['usd_amount'], '4444.444')
        self.assertEqual(row['afghani_amount'], '286666.667')
        self.assertEqual(row['toman_profit'], '0.286666667')
        self.assertEqual(row['toman_in_words'], 'One million')
        self.assertEqual(row['expense'], '120')
        self.assertEqual(row['bank_account'], '001234567890')

    def test_expense_accepts_description_and_defaults_to_blank(self):
        row = self.create_transaction(expense='Transport and bank fees')
        self.assertEqual(row['expense'], 'Transport and bank fees')
        response = self.client.patch(f"/api/transactions/{row['id']}/", {'expense': ''}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['expense'], '')
        omitted = self.create_transaction(voucher_number='202')
        self.assertEqual(omitted['expense'], '')

    def setUp(self):
        super().setUp()
        self.customer = Customer.objects.create(name='Test customer', phone='0790000000')
        self.payload = {
            'customer_id': self.customer.id, 'voucher_number': '200',
            'date': '2026-11-05', 'toman_amount': '1000.000',
            'toman_rate': '3.000', 'afghani_rate': '70.000',
        }

    def create_transaction(self, **changes):
        response = self.client.post('/api/transactions/', {**self.payload, **changes}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return response.data

    def test_calculations_and_read_only_results(self):
        row = self.create_transaction(usd_amount='999', toman_profit='999')
        self.assertEqual(row['usd_amount'], '333.333')
        self.assertEqual(row['afghani_amount'], '23333.333')
        self.assertEqual(row['toman_profit'], '23.333333333')

    def test_customer_list_and_isolated_history(self):
        self.create_transaction()
        other = Customer.objects.create(name='Other')
        self.create_transaction(customer_id=other.id, voucher_number='201')
        history = self.client.get(f'/api/customers/{self.customer.id}/transactions/')
        self.assertEqual(len(history.data['transactions']), 1)
        listing = self.client.get('/api/customers/')
        self.assertEqual(listing.status_code, 200)
        row = next(item for item in listing.data['customers'] if item['id'] == self.customer.id)
        self.assertEqual(Decimal(row['total_toman']), Decimal('1000'))

    def test_monthly_totals_and_empty_month(self):
        self.create_transaction()
        self.create_transaction(voucher_number='201', date='2026-10-01')
        result = self.client.get('/api/dashboard/stats/?month=2026-11')
        self.assertEqual(Decimal(result.data['total_toman']), Decimal('1000'))
        self.assertEqual(Decimal(result.data['toman_purchase_profit']), Decimal('23.333333000'))
        empty = self.client.get('/api/dashboard/stats/?month=2025-01')
        self.assertEqual(Decimal(empty.data['toman_purchase_profit']), 0)
        for month in ('bad', '2026-13', '10000-01'):
            self.assertEqual(self.client.get('/api/dashboard/stats/', {'month': month}).status_code, 400)

    def test_edit_recalculates_and_clears_zero_rates(self):
        row = self.create_transaction()
        result = self.client.patch(f"/api/transactions/{row['id']}/", {'toman_rate': '0', 'afghani_rate': '0'}, format='json')
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data['usd_amount'], '0.000')
        self.assertEqual(result.data['afghani_amount'], '0.000')

    def test_manual_voucher_duplicate_and_next_available(self):
        self.create_transaction(voucher_number='201')
        self.create_transaction(voucher_number='200')
        result = self.client.post('/api/transactions/auto-voucher/', {}, format='json')
        self.assertEqual(result.data['voucher_number'], '202')
        duplicate = self.client.post('/api/transactions/', self.payload, format='json')
        self.assertEqual(duplicate.status_code, 400)

    def test_next_voucher_get_uses_maximum_not_latest_record(self):
        self.assertEqual(self.client.get('/api/transactions/next-voucher/').data, {'next_voucher': '200'})
        self.create_transaction(voucher_number='900')
        self.create_transaction(voucher_number='201')
        self.create_transaction(voucher_number='CUSTOM-RECEIPT')
        self.assertEqual(self.client.get('/api/transactions/next-voucher/').data, {'next_voucher': '901'})
        self.assertEqual(self.client.post('/api/transactions/auto-voucher/', {}, format='json').data['voucher_number'], '901')

    def test_put_updates_names_voucher_and_recalculates(self):
        row = self.create_transaction()
        response = self.client.put(f"/api/transactions/{row['id']}/", {
            **self.payload, 'voucher_number': 'MANUAL-500', 'sender_name': 'Sender', 'receiver_name': 'Receiver',
            'toman_amount': '2000', 'toman_rate': '4', 'afghani_rate': '70',
            'usd_amount': '999', 'afghani_amount': '999', 'toman_profit': '999',
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['sender_name'], 'Sender')
        self.assertEqual(response.data['receiver_name'], 'Receiver')
        self.assertEqual(response.data['voucher_number'], 'MANUAL-500')
        self.assertEqual(response.data['usd_amount'], '500.000')
        self.assertEqual(response.data['afghani_amount'], '35000.000')
        self.assertEqual(response.data['toman_profit'], '17.500000000')

    def test_calculated_overflow_is_rejected_before_saving(self):
        response = self.client.post('/api/transactions/', {
            **self.payload, 'toman_amount': '999999999999.999', 'toman_rate': '0.001',
        }, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(Transaction.objects.count(), 0)

    def test_missing_rates_default_to_zero_and_results_round_half_up(self):
        self.create_transaction(toman_amount='1', toman_rate='2000', afghani_rate='1')
        row = Transaction.objects.get()
        self.assertEqual(row.usd_amount, Decimal('0.001'))
        self.assertEqual(row.afghani_amount, Decimal('0.001'))
        self.assertEqual(row.toman_profit, Decimal('0.000500000'))
        response = self.client.post('/api/transactions/', {
            'customer_id': self.customer.pk, 'voucher_number': '201', 'date': '2026-11-05', 'toman_amount': '1000',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['usd_amount'], '0.000')
        self.assertEqual(response.data['afghani_amount'], '0.000')
        self.assertEqual(response.data['toman_profit'], '0.000000000')

    def test_customer_and_transaction_can_be_created_in_one_request(self):
        payload = {key: value for key, value in self.payload.items() if key != 'customer_id'}
        response = self.client.post('/api/transactions/', {
            **payload, 'customer_name': 'Inline customer', 'customer_phone': '0701234567',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        customer = Customer.objects.get(name='Inline customer')
        self.assertEqual(customer.phone, '0701234567')
        self.assertEqual(response.data['customer']['id'], customer.id)
        self.assertEqual(Transaction.objects.get().customer_id, customer.id)
        duplicate = self.client.post('/api/transactions/', {
            **payload, 'customer_name': 'Must not be created',
        }, format='json')
        self.assertEqual(duplicate.status_code, 400)
        self.assertFalse(Customer.objects.filter(name='Must not be created').exists())

    def test_inline_form_requires_existing_customer_or_new_customer_name(self):
        payload = {key: value for key, value in self.payload.items() if key != 'customer_id'}
        self.assertEqual(self.client.post('/api/transactions/', payload, format='json').status_code, 400)
        self.assertEqual(self.client.post('/api/transactions/', {**payload, 'customer_name': '   '}, format='json').status_code, 400)
        before = Customer.objects.count()
        self.create_transaction()
        self.assertEqual(Customer.objects.count(), before)

    def test_zero_amount_and_negative_values(self):
        row = self.create_transaction(toman_amount='0')
        self.assertEqual(row['toman_profit'], '0.000000000')
        for field in ('toman_amount', 'toman_rate', 'afghani_rate'):
            result = self.client.patch(f"/api/transactions/{row['id']}/", {field: '-1'}, format='json')
            self.assertEqual(result.status_code, 400)

    def test_delete_transaction_and_customer_crud(self):
        row = self.create_transaction()
        self.assertEqual(self.client.get(f"/api/transactions/{row['id']}/").status_code, 200)
        self.assertEqual(self.client.delete(f"/api/transactions/{row['id']}/").status_code, 204)
        self.assertFalse(Transaction.objects.exists())
        created = self.client.post('/api/customers/', {'name': 'New'}, format='json')
        self.assertEqual(created.status_code, 201)
        url = f"/api/customers/{created.data['id']}/"
        self.assertEqual(self.client.patch(url, {'name': 'Changed'}, format='json').status_code, 200)
        self.assertEqual(self.client.delete(url).status_code, 204)


class FinanceRegressionTests(APITestCase):
    def test_debtor_list_with_payment_history(self):
        debtor = self.client.post('/api/debtors/', {'customer_name': 'Test', 'original_usd_amount': '100', 'usd_rate':'70'}, format='json')
        self.assertEqual(debtor.status_code, 201)
        paid = self.client.post(f"/api/debtors/{debtor.data['id']}/payments/", {'payment_type': 'PAYMENT', 'payment_usd_amount': '20'}, format='json')
        self.assertEqual(paid.status_code, 201)
        rows = self.client.get('/api/debtors/')
        self.assertEqual(rows.status_code, 200)
        self.assertEqual(Decimal(rows.data['debtors'][0]['remaining_usd']), Decimal('80'))

    def test_duplicate_manual_number_is_validation_error(self):
        data = {'category': 'Office', 'amount': '100', 'manual_sequence': 5}
        self.assertEqual(self.client.post('/api/expenses/', data, format='json').status_code, 201)
        self.assertEqual(self.client.post('/api/expenses/', data, format='json').status_code, 400)

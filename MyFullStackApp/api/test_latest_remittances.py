import uuid
from decimal import Decimal
from .testing import AuthenticatedAPITestCase
from .models import Customer, Remittance, FinancialAccount, FinancialDocument, LedgerPosting, FinancialAudit, Province, NumberSequence
from .calendar_policy import month_bounds

class LatestRemittanceTests(AuthenticatedAPITestCase):
    def setUp(self):
        super().setUp()
        self.customer=Customer.objects.create(name='Existing sender',phone='0700000000')
    def incoming(self,**changes):
        data={'senderName':'Sender','receiverName':'Receiver','transactionDate':'2026-11-06','tomanAmount':'10000000','afnUsdRate':'.70','rateBaseAmount':1000,'conversionPath':'TOMAN_TO_AFN','customer':self.customer.pk,**changes}
        response=self.client.post('/api/incoming/',data,format='json')
        self.assertEqual(response.status_code,201,response.data)
        return response.data
    def representative(self,name='Configured representative',province='AF-BDS'):
        response=self.client.post(f'/api/provinces/{province}/accounts/',{'name':name,'phone':'00123456789'},format='json')
        self.assertEqual(response.status_code,201,response.data)
        return response.data
    def remittance(self,account,direction='PROVINCIAL_IN',**changes):
        data={'request_key':uuid.uuid4().hex,'account':account['id'],'province':account['province'],'category':direction,'date':'2026-11-06','currency':'AFN','amount':'25000','details':{'sender_name':'Sender','recipient_name':'Recipient'},**changes}
        response=self.client.post('/api/provincial/remittances/',data,format='json')
        self.assertEqual(response.status_code,201,response.data)
        return response.data
    def movement(self,account,category,amount,date,currency='AFN',**changes):
        response=self.client.post(f"/api/provincial/accounts/{account['id']}/movements/",{'request_key':uuid.uuid4().hex,'category':category,'amount':amount,'date':str(date),'currency':currency,**changes},format='json')
        self.assertEqual(response.status_code,201,response.data)
        return response.data
    def report(self,account,month,currency='AFN',**params):
        response=self.client.get(f"/api/provincial/accounts/{account['id']}/ledger/",{'month':month,'currency':currency,**params})
        self.assertEqual(response.status_code,200,response.data)
        return response.data

    def test_tehran_depositor_fields_and_recipient_card_round_trip(self):
        response=self.client.post('/api/transactions/',{'customer_id':self.customer.pk,'voucher_number':'CARD-001','date':'2026-11-06','toman_amount':'1000000','toman_rate':'225','afghani_rate':'64.5','bank_account':'0202413316','depositor_cardholder':'Actual cardholder','depositor_card':'001234567890','expense':'Purpose reference'},format='json')
        self.assertEqual(response.status_code,201,response.data)
        row=response.data
        changed=self.client.patch(f"/api/transactions/{row['id']}/",{'depositor_cardholder':'Corrected owner'},format='json')
        self.assertEqual(changed.status_code,200,changed.data)
        reloaded=self.client.get(f"/api/transactions/{row['id']}/").data
        self.assertEqual(reloaded['bank_account'],'0202413316')
        self.assertEqual(reloaded['depositor_card'],'001234567890')
        self.assertEqual(reloaded['depositor_cardholder'],'Corrected owner')
        self.assertEqual(reloaded['expense'],'Purpose reference')

    def test_incoming_explicit_quote_units_use_one_path(self):
        toman=self.incoming(usdRate='70',usdAmount='100')
        self.assertEqual(toman['afnAmount'],'7000.000')
        usd=self.incoming(conversionPath='USD_TO_AFN',usdAmount='100',usdRate='70',tomanAmount='0')
        self.assertEqual(usd['afnAmount'],'7000.000')
        self.assertFalse(usd['tomanAmountKnown'])
        self.assertEqual(usd['currencyType'],'USD')
        legacy=self.incoming(rateBaseAmount=1,afnUsdRate='.0007')
        self.assertEqual(legacy['afnAmount'],'7000.000')

    def test_incoming_manual_profit_blank_zero_edit_and_rate_changes(self):
        row=self.incoming(manualProfit=None)
        self.assertIsNone(row['manualProfit'])
        path=f"/api/incoming/{row['id']}/"
        zero=self.client.patch(path,{'manualProfit':'0','manualProfitCurrency':'AFN'},format='json')
        self.assertEqual(zero.status_code,200,zero.data);self.assertEqual(zero.data['manualProfit'],'0.000')
        edited=self.client.patch(path,{'manualProfit':'20.5','manualProfitCurrency':'USD'},format='json')
        self.assertEqual(edited.status_code,200,edited.data)
        rate=self.client.patch(path,{'afnUsdRate':'.80'},format='json')
        self.assertEqual(rate.data['afnAmount'],'8000.000');self.assertEqual(rate.data['manualProfit'],'20.500');self.assertEqual(rate.data['manualProfitCurrency'],'USD')
        cleared=self.client.patch(path,{'manualProfit':None},format='json')
        self.assertIsNone(cleared.data['manualProfit']);self.assertEqual(cleared.data['manualProfitCurrency'],'')

    def test_historical_amount_not_recalculated_when_profit_changes(self):
        row=Remittance.objects.create(kind='incoming',hawalaNumber='HISTORICAL',transactionDate='2026-11-06',senderName='S',receiverName='R',tomanAmount=1000,afnUsdRate='.2',afnAmount='123.456',rateBaseAmount=1,tomanProfit='5')
        response=self.client.patch(f'/api/incoming/{row.pk}/',{'manualProfit':'7','manualProfitCurrency':'TOMAN'},format='json')
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(response.data['afnAmount'],'123.456')
        self.assertEqual(response.data['afnUsdRate'],'0.20000000')

    def test_missing_historical_conversion_is_not_a_zero_balance(self):
        row=Remittance.objects.create(kind='incoming',hawalaNumber='MISSING-CONVERSION',transactionDate='2026-11-06',senderName='S',receiverName='R',tomanAmount=1000,afnAmount=0,afnAmountKnown=False)
        result=self.client.get('/api/incoming/',{'search':'MISSING-CONVERSION'}).data
        self.assertEqual(result['count'],1)
        self.assertIsNone(result['totalAfn'])
        self.assertEqual(result['missingAfnCount'],1)
        updated=self.client.patch(f'/api/incoming/{row.pk}/',{'manualProfit':'0','manualProfitCurrency':'AFN'},format='json')
        self.assertEqual(updated.status_code,200,updated.data)
        self.assertFalse(updated.data['afnAmountKnown'])
        self.assertEqual(updated.data['afnAmount'],'0.000')

    def test_same_currency_fees_do_not_require_an_invented_exchange_rate(self):
        account=self.representative()
        for changes,usd in [({},None),({'source_rate':'50'},'500.000'),({'currency':'USD','fee_currency':'USD'},'25000.000')]:
            row=self.remittance(account,fee='50',fee_currency='AFN',collection='DEDUCTED',**changes) if 'fee_currency' not in changes else self.remittance(account,fee='50',collection='DEDUCTED',**changes)
            self.assertEqual(Decimal(row['conversion']['net']),Decimal('24950'))
            self.assertEqual(row['conversion']['usd'],usd)

    def test_incoming_customer_currency_views_respect_filters_and_missing_values(self):
        self.incoming(tomanAmount='1000',manualProfit='1',manualProfitCurrency='USD')
        self.incoming(tomanAmount='2000')
        self.incoming(conversionPath='USD_TO_AFN',usdAmount='100',usdRate='70',tomanAmount='0')
        self.incoming(tomanAmount='999',transactionDate='2026-09-01')
        result=self.client.get('/api/incoming/',{'month':'1405-08','currencyType':'TOMAN'}).data
        self.assertEqual(result['count'],2)
        self.assertEqual(result['totalToman'],'3000')
        self.assertEqual(Decimal(result['totalAfn']),Decimal('2.1'))
        self.assertEqual(len(result['customerTotals']),1)
        self.assertEqual(result['customerTotals'][0]['count'],2)
        self.assertEqual(Decimal(result['customerTotals'][0]['toman']),3000)
        all_currencies=self.client.get('/api/incoming/',{'month':'1405-08'}).data
        self.assertEqual(all_currencies['count'],3);self.assertEqual(all_currencies['missingTomanCount'],1)
        self.assertEqual(Decimal(all_currencies['totalAfn']),Decimal('7002.1'))
        self.assertEqual(self.client.get('/api/incoming/',{'month':'1405-08','customerKey':result['customerTotals'][0]['key']}).data['count'],3)

    def test_province_catalog_persistent_accounts_and_shared_directions(self):
        catalog=self.client.get('/api/provinces/').data['results']
        self.assertEqual(len(catalog),34);self.assertEqual(len({row['code'] for row in catalog}),34)
        self.assertEqual(self.client.get('/api/provinces/AF-BDS/accounts/').data['results'],[])
        account=self.representative()
        for direction in ['PROVINCIAL_IN','PROVINCIAL_OUT']:self.remittance(account,direction)
        self.assertEqual(len(self.client.get('/api/provinces/AF-BDS/accounts/').data['results']),1)
        for month in ['1405-09','1405-12','1406-01']:
            self.assertEqual(self.report(account,month)['account'],account['id'])
        mismatch=self.client.post('/api/provincial/remittances/',{'request_key':uuid.uuid4().hex,'account':account['id'],'province':'AF-KDZ','category':'PROVINCIAL_IN'},format='json')
        self.assertEqual(mismatch.status_code,400)

    def test_partial_and_full_beneficiary_payments_leave_representative_and_profit(self):
        for direction in ['PROVINCIAL_IN','PROVINCIAL_OUT']:
            with self.subTest(direction=direction):
                account=self.representative(direction)
                row=self.remittance(account,direction,manual_profit='50',profit_currency='USD')
                def payment(amount,key=None,currency='AFN'):
                    return self.client.post('/api/ledger/documents/',{'request_key':key or uuid.uuid4().hex,'account':account['id'],'agency':row['agency_id'],'category':'BENEFICIARY_PAYOUT','date':'2026-11-06','currency':currency,'amount':amount,'allocations':[{'remittance':row['id'],'amount':amount}]},format='json')
                key=uuid.uuid4().hex;first=payment('10000',key)
                self.assertEqual(first.status_code,201,first.data)
                self.assertEqual(payment('10000',key).data['id'],first.data['id'])
                current=self.client.get(f"/api/provincial/remittances/{row['id']}/payments/").data['remittance']
                self.assertEqual(current['beneficiary']['status'],'PARTIAL');self.assertEqual(Decimal(current['beneficiary']['outstanding']),15000)
                self.assertEqual(Decimal(current['agency']['outstanding']),25000);self.assertEqual(current['manual_profit'],'50.000')
                self.assertEqual(payment('15001').status_code,400);self.assertEqual(payment('1',currency='USD').status_code,400)
                self.assertEqual(payment('15000').status_code,201)
                current=self.client.get(f"/api/provincial/remittances/{row['id']}/payments/").data['remittance']
                self.assertEqual(current['beneficiary']['status'],'PAID');self.assertEqual(Decimal(current['agency']['outstanding']),25000)
                self.assertEqual(current['manual_profit'],'50.000')
                profit=self.client.patch(f"/api/provincial/remittances/{row['id']}/profit/",{'manual_profit':'0','profit_currency':'AFN'},format='json')
                self.assertEqual(profit.data['manual_profit'],'0.000')
                cleared=self.client.patch(f"/api/provincial/remittances/{row['id']}/profit/",{'manual_profit':None},format='json')
                self.assertIsNone(cleared.data['manual_profit'])

    def test_one_representative_receipt_allocated_explicitly_once(self):
        account=self.representative();docs=[self.remittance(account) for _ in range(2)]
        data={'request_key':uuid.uuid4().hex,'account':account['id'],'agency':docs[0]['agency_id'],'category':'AGENCY_RECEIPT','date':'2026-11-06','currency':'AFN','amount':'25000','allocations':[{'remittance':docs[0]['id'],'amount':'10000'},{'remittance':docs[1]['id'],'amount':'15000'}]}
        response=self.client.post('/api/ledger/documents/',data,format='json');self.assertEqual(response.status_code,201,response.data)
        self.assertEqual(self.client.post('/api/ledger/documents/',data,format='json').data['id'],response.data['id'])
        report=self.report(account,'1405-08')
        self.assertEqual(Decimal(report['closing']),25000);self.assertEqual(Decimal(report['money_received']),25000)
        for doc in docs:self.assertEqual(Decimal(self.client.get(f"/api/provincial/remittances/{doc['id']}/payments/").data['remittance']['beneficiary']['paid']),0)

    def test_all_required_monthly_balance_examples(self):
        sunbula=month_bounds('1405-06')[0];mizan=month_bounds('1405-07')[0]
        cases=[('REPRESENTATIVE_RECEIVABLE',None,None,5000,'CREDITOR'),('REPRESENTATIVE_RECEIVABLE','REPRESENTATIVE_RECEIVABLE','2000',7000,'CREDITOR'),('REPRESENTATIVE_RECEIVABLE','REPRESENTATIVE_REPAYMENT','2000',3000,'CREDITOR'),('REPRESENTATIVE_RECEIVABLE','REPRESENTATIVE_REPAYMENT','5000',0,'SETTLED'),('REPRESENTATIVE_OBLIGATION','REPRESENTATIVE_OBLIGATION','2000',-7000,'DEBTOR'),('REPRESENTATIVE_RECEIVABLE','REPRESENTATIVE_REPAYMENT','7000',-2000,'DEBTOR')]
        for index,(opening,category,amount,closing,status) in enumerate(cases):
            with self.subTest(index=index):
                account=self.representative(str(index));self.movement(account,opening,'5000',sunbula)
                if category:self.movement(account,category,amount,mizan)
                result=self.report(account,'1405-07')
                self.assertEqual(Decimal(result['closing']),closing);self.assertEqual(result['closing_status']['code'],status)
                self.assertEqual(result['movement_count'],1 if category else 0)
                self.assertEqual(Decimal(result['money_received']),Decimal(amount) if category=='REPRESENTATIVE_REPAYMENT' else 0)
                for inactive in ['1405-09','1405-12','1406-01']:
                    later=self.report(account,inactive);self.assertEqual(Decimal(later['opening']),closing);self.assertEqual(Decimal(later['movement']),0);self.assertEqual(later['history'],[])
                self.movement(account,'REPRESENTATIVE_RECEIVABLE','100',mizan,'USD')
                self.assertEqual(Decimal(self.report(account,'1405-07')['closing']),closing)
                self.assertEqual(Decimal(self.report(account,'1405-07','USD')['closing']),100)

    def test_multi_remittance_receipt_reversal_uses_whole_original_document(self):
        account=self.representative();docs=[self.remittance(account) for _ in range(2)]
        data={'request_key':uuid.uuid4().hex,'account':account['id'],'agency':docs[0]['agency_id'],'category':'AGENCY_RECEIPT','date':'2026-11-06','currency':'AFN','amount':'25000','allocations':[{'remittance':docs[0]['id'],'amount':'10000'},{'remittance':docs[1]['id'],'amount':'15000'}]}
        receipt=self.client.post('/api/ledger/documents/',data,format='json')
        self.assertEqual(receipt.status_code,201,receipt.data)
        portions=[row for row in self.report(account,'1405-08')['history'] if row['document']==receipt.data['id']]
        self.assertTrue(portions)
        self.assertTrue(all(row['document_amount']=='25000.000' for row in portions))
        bad={'request_key':uuid.uuid4().hex,'category':'REVERSAL','date':'2026-11-06','amount':'10000','currency':'AFN','reversal_of':receipt.data['id'],'details':{'reason':'Correction'}}
        self.assertEqual(self.client.post(f"/api/provincial/accounts/{account['id']}/movements/",bad,format='json').status_code,400)
        self.movement(account,'REVERSAL','25000','2026-11-06',reversal_of=receipt.data['id'],details={'reason':'Correction'})
        self.assertEqual(Decimal(self.report(account,'1405-08')['closing']),50000)
        self.assertEqual(Decimal(self.report(account,'1405-08')['money_received']),0)
        for doc in docs:
            current=self.client.get(f"/api/provincial/remittances/{doc['id']}/payments/").data['remittance']
            self.assertEqual(Decimal(current['agency']['outstanding']),25000)
            self.assertEqual(Decimal(current['beneficiary']['paid']),0)

    def test_historical_correction_reconciles_future_months_without_view_postings(self):
        account=self.representative();start=month_bounds('1405-06')[0];next_start=month_bounds('1405-07')[0]
        original=self.movement(account,'REPRESENTATIVE_RECEIVABLE','5000',start)
        self.movement(account,'REPRESENTATIVE_RECEIVABLE','2000',next_start)
        self.assertEqual(Decimal(self.report(account,'1405-09')['opening']),7000)
        self.movement(account,'REVERSAL','5000',start,reversal_of=original['id'],details={'reason':'Historical correction'})
        self.movement(account,'REPRESENTATIVE_RECEIVABLE','4000',start)
        counts=(FinancialDocument.objects.count(),LedgerPosting.objects.count(),FinancialAudit.objects.count(),list(NumberSequence.objects.values_list('last_value',flat=True)))
        for _ in range(3):
            result=self.report(account,'1405-09');self.assertEqual(Decimal(result['opening']),6000);self.assertEqual(Decimal(result['movement']),0)
        self.assertEqual(counts,(FinancialDocument.objects.count(),LedgerPosting.objects.count(),FinancialAudit.objects.count(),list(NumberSequence.objects.values_list('last_value',flat=True))))

    def test_scoped_filters_totals_profit_and_pagination(self):
        first=self.representative();other=self.representative('Other','AF-KDZ')
        for index in range(12):self.remittance(first,manual_profit=str(index),profit_currency='USD',details={'sender_name':f'Sender-{index}','recipient_name':'Recipient'})
        self.remittance(first,'PROVINCIAL_OUT');self.remittance(other)
        params={'province':'AF-BDS','direction':'PROVINCIAL_IN','month':'1405-08','pageSize':10,'page':2,'paymentStatus':'UNPAID','currency':'AFN'}
        result=self.client.get('/api/provincial/remittances/',params).data
        self.assertEqual(result['count'],12);self.assertEqual(len(result['results']),2);self.assertEqual(result['totalPages'],2)
        self.assertEqual(Decimal(result['totals'][0]['payable']),300000)
        self.assertEqual(Decimal(result['profitTotals'][0]['amount']),sum(range(12)))
        search=self.client.get('/api/provincial/remittances/',{**params,'page':1,'search':'Sender-11'}).data
        self.assertEqual(search['count'],1);self.assertEqual(Decimal(search['totals'][0]['payable']),25000)
        reset=self.client.get('/api/provincial/remittances/',{'province':'AF-BDS','direction':'PROVINCIAL_IN'}).data
        self.assertEqual(reset['count'],12);self.assertEqual(reset['page'],1)

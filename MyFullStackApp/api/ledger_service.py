"""Append-only, currency-isolated confirmed postings and explicit allocations."""
import hashlib
import json
import time
from datetime import date
from decimal import Decimal, ROUND_HALF_UP, localcontext
from django.db import transaction, OperationalError, IntegrityError
from django.db.models import F, Sum
from rest_framework.exceptions import ValidationError
from .models import FinancialAccount, FinancialDocument, LedgerPosting, ReceiptAllocation, NumberSequence, LedgerSetting, RateQuote
from .conversion import convert, decimal_value, CURRENCIES
from .manual_profit import validate_profit

REPRESENTATIVE_MOVEMENTS={
 "REPRESENTATIVE_RECEIVABLE":1,"REPRESENTATIVE_OBLIGATION":-1,
 "REPRESENTATIVE_REPAYMENT":-1,"OFFICE_REPAYMENT":1,
 "ADVANCE_SENT":1,"ADVANCE_RECEIVED":-1,
}

POSITIVE={'OPENING','LOAN','OBLIGATION','DEPOSIT','RECEIPT','PUBLIC_DEPOSIT','COLLEAGUE_DEPOSIT','CUSTOMER_CREDIT','TEHRAN_RECEIPT'}
NEGATIVE={'COLLECTION','PAYMENT','RELEASE','DISTRIBUTION','SALARY','EXPENSE','SHOP_RENT','CUSTOMER_LOAN','COLLEAGUE_LOAN'}
REMITTANCES={'PROVINCIAL_IN','PROVINCIAL_OUT','TEHRAN_REMITTANCE'}
PROFILE_FIELDS={
 'customer_id':'شناسه مشتری','full_name':'نام کامل','father_name':'نام پدر','identity_number':'نمبر تذکره','identity_image':'تصویر تذکره','phone':'شماره تماس','address':'آدرس','due_date':'سررسید','loan_type':'نوع قرض','lender':'قرض‌دهنده','guarantor_name':'نام ضامن','guarantor_phone':'تماس ضامن','guarantee':'مقدار یا نوع ضمانت','contract_number':'نمبر قرارداد یا رسید','approval':'حالت تأیید','classification':'شخصی یا تجارتی','country':'کشور','city':'شهر','company':'شرکت یا دکان','referrer':'معرف','referrer_phone':'تماس معرف','notes':'یادداشت'}

def balance(account, currency, bucket='ACCOUNT', before=None):
    rows=LedgerPosting.objects.filter(account=account,currency_id=currency,bucket=bucket,document__status='CONFIRMED')
    if before: rows=rows.filter(document__date__lt=before)
    return rows.aggregate(value=Sum('amount'))['value'] or Decimal(0)

def outstanding(document, purpose):
    base=Decimal(document.details.get('agency_settlement',document.conversion.get('net') or str(document.amount))) if purpose=='AGENCY' else Decimal(document.conversion.get('net') or str(document.amount))
    paid=document.settlements.filter(purpose=purpose,receipt__status='CONFIRMED').aggregate(value=Sum('amount'))['value'] or Decimal(0)
    # Reversals carry negative allocations, so cancellation restores the obligation.
    return base-paid, base

def number_for(day,category=None):
    from jdatetime import date as solar_date
    year=solar_date.fromgregorian(date=day).year
    provincial=category in {'PROVINCIAL_IN','PROVINCIAL_OUT'}
    prefix='PVL' if provincial else 'FIN'
    setting,_=LedgerSetting.objects.get_or_create(key='provincial_starting_number' if provincial else 'starting_number',defaults={'value':200})
    sequence,_=NumberSequence.objects.select_for_update().get_or_create(prefix=prefix,year=year,defaults={'last_value':int(setting.value)-1})
    sequence.last_value=max(sequence.last_value,int(setting.value)-1)+1
    while FinancialDocument.objects.filter(number=f'{prefix}-{year}-{sequence.last_value}').exists():
        sequence.last_value+=1
    sequence.save(update_fields=['last_value'])
    return f'{prefix}-{year}-{sequence.last_value}'

def post(account, document, currency, amount, bucket='ACCOUNT'):
    if amount: LedgerPosting.objects.create(account=account,document=document,currency_id=currency,amount=amount,bucket=bucket)

@transaction.atomic
def _confirm(data, operator):
    key=str(data.get('request_key',''))
    if not key or len(key)>100: raise ValidationError({'request_key':'کلید یکتای درخواست الزامی است.'})
    digest=hashlib.sha256(json.dumps(data,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
    # First SQL write obtains SQLite's reserved lock; other databases lock account rows.
    FinancialAccount.objects.filter(pk=data.get('account')).update(revision=F('revision')+1)
    previous=FinancialDocument.objects.filter(request_key=key).first()
    if previous:
        if previous.payload_hash!=digest: raise ValidationError({'request_key':'این کلید برای درخواست دیگری استفاده شده است.'})
        return previous
    try: account=FinancialAccount.objects.select_for_update().get(pk=data.get('account'),active=True)
    except (FinancialAccount.DoesNotExist,ValueError,TypeError): raise ValidationError({'account':'حساب معتبر انتخاب کنید.'})
    category=data.get('category')
    if account.kind=='HAWALA' and category in {'OPENING','DEPOSIT','LOAN','OBLIGATION'}:
        raise ValidationError({'category':'حواله پرداخت‌نشده باید از حواله اصلی و پرداخت‌های همان حواله خوانده شود؛ ایجاد تعهد تکراری مجاز نیست.'})
    if category not in POSITIVE|NEGATIVE|REMITTANCES|set(REPRESENTATIVE_MOVEMENTS)|{'CONVERT','REVERSAL','PROVINCIAL_PAYMENT','BENEFICIARY_PAYOUT','AGENCY_RECEIPT','AGENCY_PAYMENT'}:
        raise ValidationError({'category':'نوع معامله معتبر نیست.'})
    try: day=date.fromisoformat(data.get('date',''))
    except (ValueError,TypeError): raise ValidationError({'date':'تاریخ معتبر الزامی است.'})
    currency=data.get('currency')
    if currency not in CURRENCIES: raise ValidationError({'currency':'واحد پول معتبر نیست.'})
    amount=decimal_value(data.get('amount'),'amount',True)
    if amount.as_tuple().exponent < -3: raise ValidationError({'amount':'حداکثر سه رقم اعشار برای ثبت مبلغ مجاز است.'})
    details=data.get('details') or {}
    if not isinstance(details,dict): raise ValidationError({'details':'معلومات معامله معتبر نیست.'})
    if category=='PROVINCIAL_PAYMENT':
        if account.kind!='AGENCY' or not account.agency_id or not account.province_id:
            raise ValidationError({'account':'حساب نمایندگی ولایتی معتبر انتخاب کنید.'})
        from .provincial_views import validate_party_fields, PARTY_FIELDS
        validate_party_fields({key:value for key,value in details.items() if key in PARTY_FIELDS})
        if not str(details.get('sender_name','')).strip() or not str(details.get('recipient_name','')).strip():
            raise ValidationError({'details':'نام مشتری و گیرنده الزامی است.'})
    conversion={}
    if category in {'PROVINCIAL_IN','PROVINCIAL_OUT','PROVINCIAL_PAYMENT'} and 'afn_rate' in data:
        rate=decimal_value(data['afn_rate'],'afn_rate',True)
        if currency=='AFN' and rate!=1:raise ValidationError({'afn_rate':'نرخ افغانی باید یک باشد.'})
        if data.get('fee') not in (None,'','0',0):raise ValidationError({'fee':'فرم ساده حواله فیس جداگانه ندارد.'})
        with localcontext() as context:
            context.prec=60
            net=(amount*rate).quantize(Decimal('.001'),rounding=ROUND_HALF_UP)
        decimal_value(net,'amount',True)
        conversion={'source':currency,'destination':'AFN','amount':str(amount),'gross':str(net),'net':str(net),'afn_rate':str(rate),'quote_direction':'AFN_PER_SOURCE','quote_unit':f'1 {currency}','source_rate':None,'destination_rate':None,'usd':None,'fee':'0','fee_currency':'AFN','collection':'SEPARATE','settlement_precision':3}
    elif currency=='USD' or data.get('source_rate') or data.get('destination') or category=='CONVERT':
        source_rate=data.get('source_rate');dest_rate=data.get('destination_rate')
        if data.get('use_default_rate'):
            raise ValidationError({'source_rate':'نرخ‌ها باید به‌صورت دستی وارد شوند.'})
        destination=data.get('destination')
        if not destination and data.get('collection')=='DEDUCTED':
            destination=currency;dest_rate=source_rate
        conversion=convert(amount,currency,source_rate,destination,dest_rate,data.get('fee','0'),data.get('fee_currency'),data.get('collection','SEPARATE'))
    elif data.get('fee') not in (None,'','0',0):
        fee=decimal_value(data.get('fee'),'fee')
        fee_currency=data.get('fee_currency') or currency
        collection=data.get('collection','SEPARATE')
        if fee_currency not in CURRENCIES or collection not in ['SEPARATE','DEDUCTED']:raise ValidationError({'fee':'واحد و روش دریافت فیس معتبر نیست.'})
        if collection=='DEDUCTED' and (fee_currency!=currency or fee>amount):raise ValidationError({'fee':'فیس کسرشده باید در واحد مبلغ و کمتر از آن باشد.'})
        if fee.as_tuple().exponent < -3:raise ValidationError({'fee':'حداکثر سه رقم اعشار مجاز است.'})
        conversion={'source':currency,'destination':currency,'amount':str(amount),'usd':None,'gross':str(amount),'net':str(amount-fee if collection=='DEDUCTED' else amount),'source_rate':None,'destination_rate':None,'fee':str(fee),'fee_currency':fee_currency,'collection':collection,'settlement_precision':3,'quote_direction':None}
    if category in REMITTANCES and (not details.get('sender_name') or not details.get('recipient_name')):
        raise ValidationError({'details':'نام فرستنده و گیرنده الزامی است.'})
    agency_id=data.get('agency') or account.agency_id
    province_id=data.get('province') or account.province_id or (account.agency.province_id if account.agency_id else None)
    if province_id:
        from .models import Province, Agency
        if not Province.objects.filter(pk=province_id).exists():raise ValidationError({'province':'ولایت معتبر انتخاب کنید.'})
        if account.province_id and province_id!=account.province_id:raise ValidationError({'province':'حساب مربوط به ولایت دیگری است.'})
        if agency_id:
            agency=Agency.objects.filter(pk=agency_id).first()
            if not agency or agency.province_id and agency.province_id!=province_id:raise ValidationError({'agency':'نمایندگی مربوط به ولایت انتخاب‌شده نیست.'})
    manual_profit,profit_currency=validate_profit(data.get('manual_profit'),data.get('profit_currency',''))
    if category in REPRESENTATIVE_MOVEMENTS and account.kind!='AGENCY':raise ValidationError({'account':'این گردش برای حساب نماینده است.'})
    if category in {'PROVINCIAL_IN','PROVINCIAL_OUT'} and not agency_id:
        raise ValidationError({'agency':'نمایندگی الزامی است.'})
    if category in {'LOAN','OBLIGATION','COLLECTION','PAYMENT'} and account.kind in {'KABUL_DEBTOR','IRAN_DEBTOR','CREDITOR'} and account.profile.get('approval','APPROVED')!='APPROVED':
        raise ValidationError({'account':'حساب هنوز تأیید نشده است.'})
    if data.get('legacy_remittance') or data.get('tehran_transaction'):
        from .models import Remittance, Transaction
        if category not in REMITTANCES: raise ValidationError({'category':'اتصال سند قبلی فقط برای حواله مجاز است.'})
        if data.get('legacy_remittance'):
            old=Remittance.objects.select_for_update().filter(pk=data['legacy_remittance'],deleted_at__isnull=True).first()
            if not old: raise ValidationError({'legacy_remittance':'حواله قبلی موجود نیست.'})
            if FinancialDocument.objects.filter(legacy_remittance=old).exists(): raise ValidationError({'legacy_remittance':'این حواله قبلاً متصل شده است.'})
            if currency!='AFN' or amount!=old.afnAmount or conversion: raise ValidationError({'amount':'مبلغ و واحد باید با تعهد افغانی حواله اصلی یکسان باشد.'})
        else:
            old=Transaction.objects.select_for_update().filter(pk=data['tehran_transaction']).first()
            if not old: raise ValidationError({'tehran_transaction':'حواله تهران موجود نیست.'})
            if FinancialDocument.objects.filter(tehran_transaction=old).exists(): raise ValidationError({'tehran_transaction':'این حواله قبلاً متصل شده است.'})
            if currency!=(old.destination_currency or old.source_currency) or amount!=(old.destination_amount if old.destination_amount is not None else old.afghani_amount if old.destination_currency else old.toman_amount) or conversion:
                raise ValidationError({'amount':'مبلغ باید با خالص حواله اصلی برابر باشد.'})
    manual_number=data.get('manual_number')
    if manual_number is not None:
        if category not in {'PROVINCIAL_IN','PROVINCIAL_OUT'} or isinstance(manual_number,bool) or not isinstance(manual_number,int) or not 1<=manual_number<=999999999:raise ValidationError({'manual_number':'نمبر دستی باید عدد صحیح مثبت باشد.'})
        from jdatetime import date as solar_date
        reference=f'PVL-{solar_date.fromgregorian(date=day).year}-{manual_number}'
        if FinancialDocument.objects.filter(number=reference).exists():raise ValidationError({'manual_number':'این نمبر حواله قبلاً ثبت شده است.'})
    else:reference=number_for(day,category)
    doc=FinancialDocument.objects.create(province_id=province_id,manual_profit=manual_profit,profit_currency=profit_currency,number=reference,request_key=key,payload_hash=digest,account=account,category=category,date=day,currency_id=currency,amount=amount,conversion=conversion,details=details,agency_id=agency_id,operator=operator,legacy_remittance_id=data.get('legacy_remittance'),tehran_transaction_id=data.get('tehran_transaction'))
    if category=='REVERSAL':
        try: original=FinancialDocument.objects.select_for_update().get(pk=data.get('reversal_of'),account=account,status='CONFIRMED')
        except FinancialDocument.DoesNotExist: raise ValidationError({'reversal_of':'سند اصلی معتبر نیست.'})
        if original.category=='REVERSAL' or hasattr(original,'reversal'): raise ValidationError({'reversal_of':'سند قبلاً برگشت شده است.'})
        if amount!=original.amount or currency!=original.currency_id:raise ValidationError({'reversal_of':'مبلغ و واحد برگشت باید با کل سند اصلی یکسان باشد.'})
        if not details.get('reason'): raise ValidationError({'details':'دلیل اصلاح یا برگشت الزامی است.'})
        if any(row['total'] for row in original.settlements.values('purpose').annotate(total=Sum('amount'))): raise ValidationError({'reversal_of':'ابتدا رسیدهای تخصیص‌شده را برگشت دهید.'})
        doc.reversal_of=original;doc.agency_id=original.agency_id;doc.province_id=original.province_id;doc.manual_profit=-original.manual_profit if original.manual_profit is not None else None;doc.profit_currency=original.profit_currency;doc.save(update_fields=['reversal_of','agency','province','manual_profit','profit_currency'])
        for posting in original.postings.all():
            # Do not allow release of the deposit/loan base while funds are still out.
            if posting.amount>0 and posting.bucket!='AGENCY' and posting.account.kind!='AGENCY' and balance(posting.account,posting.currency_id,posting.bucket)<posting.amount:
                raise ValidationError({'reversal_of':'برگشت، مانده حساب را منفی می‌سازد.'})
            post(posting.account,doc,posting.currency_id,-posting.amount,posting.bucket)
        for allocation in original.allocations.all(): ReceiptAllocation.objects.create(receipt=doc,remittance=allocation.remittance,amount=-allocation.amount,purpose=allocation.purpose)
        return doc
    if category in REPRESENTATIVE_MOVEMENTS:
        post(account,doc,currency,amount*REPRESENTATIVE_MOVEMENTS[category],'AGENCY')
    elif category=='CONVERT':
        if account.kind!='EXCHANGE' or not conversion.get('destination'): raise ValidationError({'destination':'حساب انتظار تبدیل و واحد مقصد الزامی است.'})
        if balance(account,currency)<amount: raise ValidationError({'amount':'مبلغ از تعهد در واحد مبدأ بیشتر است.'})
        post(account,doc,currency,-amount)
        post(account,doc,conversion['destination'],Decimal(conversion['net']))
    elif category=='PROVINCIAL_PAYMENT':
        pay_currency=conversion.get('destination') or currency
        post(account,doc,pay_currency,-Decimal(conversion.get('net') or str(amount)),'BENEFICIARY')
        from .provincial_customer_payments import reconcile_customer
        reconcile_customer(account,details,pay_currency)
    elif category in REMITTANCES:
        payable=Decimal(conversion.get('net') or str(amount));pay_currency=conversion.get('destination') or currency
        post(account,doc,pay_currency,payable,'BENEFICIARY')
        if agency_id:
            agency_amount=decimal_value(details.get('agency_settlement',payable),'agency_settlement',True)
            agency_currency=details.get('agency_currency') or pay_currency
            if agency_currency not in CURRENCIES: raise ValidationError({'agency_currency':'واحد حساب نمایندگی معتبر نیست.'})
            details.update(agency_settlement=str(agency_amount),agency_currency=agency_currency,representative_sign=1 if category=='PROVINCIAL_IN' else -1);doc.details=details;doc.save(update_fields=['details'])
            post(account,doc,agency_currency,agency_amount if category=='PROVINCIAL_IN' else -agency_amount,'AGENCY')
        if category=='PROVINCIAL_IN':
            from .provincial_customer_payments import reconcile_customer
            reconcile_customer(account,details,pay_currency)
    elif category in {'BENEFICIARY_PAYOUT','AGENCY_RECEIPT','AGENCY_PAYMENT'}:
        allocations=data.get('allocations') or []
        if not allocations: raise ValidationError({'allocations':'تخصیص رسید به حواله الزامی است.'})
        total=Decimal(0);purpose='BENEFICIARY' if category=='BENEFICIARY_PAYOUT' else 'AGENCY'
        for item in allocations:
            target=FinancialDocument.objects.select_for_update().filter(pk=item.get('remittance'),status='CONFIRMED',category__in=REMITTANCES).first()
            if not target: raise ValidationError({'allocations':'حواله معتبر نیست.'})
            if hasattr(target,'reversal'): raise ValidationError({'allocations':'حواله برگشت‌شده قابل تسویه نیست.'})
            if target.account_id!=account.pk and purpose=='BENEFICIARY': raise ValidationError({'account':'حساب گیرنده یکسان نیست.'})
            if purpose=='AGENCY' and (not agency_id or target.agency_id!=agency_id): raise ValidationError({'agency':'نمایندگی رسید با حواله یکسان نیست.'})
            if purpose=='AGENCY' and ((target.category=='PROVINCIAL_IN') != (category=='AGENCY_RECEIPT')): raise ValidationError({'category':'جهت تسویه نمایندگی اشتباه است.'})
            expected_currency=(target.details.get('agency_currency') if purpose=='AGENCY' else target.conversion.get('destination')) or target.currency_id
            if currency!=expected_currency: raise ValidationError({'currency':'واحد رسید و حواله یکسان نیست.'})
            allocation=decimal_value(item.get('amount'),'allocations',True)
            if allocation.as_tuple().exponent < -3: raise ValidationError({'allocations':'حداکثر سه رقم اعشار مجاز است.'})
            if ReceiptAllocation.objects.filter(receipt=doc,remittance=target,purpose=purpose).exists(): raise ValidationError({'allocations':'هر حواله را در رسید فقط یک بار انتخاب کنید.'})
            remaining,_=outstanding(target,purpose)
            if allocation>remaining: raise ValidationError({'allocations':'تخصیص از مانده حواله بیشتر است.'})
            ReceiptAllocation.objects.create(receipt=doc,remittance=target,amount=allocation,purpose=purpose)
            post(target.account,doc,currency,-allocation if category!='AGENCY_PAYMENT' else allocation,'BENEFICIARY' if purpose=='BENEFICIARY' else 'AGENCY')
            total+=allocation
        if total!=amount: raise ValidationError({'allocations':'مجموع تخصیص‌ها باید با مبلغ رسید برابر باشد.'})
    else:
        sign=1 if category in POSITIVE else -1
        posting_currency=currency;posting_amount=amount
        if category in {'COLLECTION','PAYMENT'} and conversion.get('destination'):
            posting_currency=conversion['destination'];posting_amount=Decimal(conversion['net'])
        if sign<0 and account.kind!='AGENCY' and balance(account,posting_currency)<posting_amount:
            raise ValidationError({'amount':'مبلغ از مانده حساب بیشتر است.'})
        post(account,doc,posting_currency,sign*posting_amount)
        if category in {'CUSTOMER_LOAN','CUSTOMER_CREDIT','COLLEAGUE_LOAN','PUBLIC_DEPOSIT','COLLEAGUE_DEPOSIT'}:
            if account.kind!='AGENCY': raise ValidationError({'account':'این ثبت عملیاتی باید از حساب نمایندگی انجام شود.'})
            counterpart=FinancialAccount.objects.select_for_update().filter(pk=details.get('counterparty_account'),active=True).first()
            valid_kinds={'KABUL_DEBTOR','IRAN_DEBTOR'} if category=='CUSTOMER_LOAN' else {'CREDITOR'} if category=='CUSTOMER_CREDIT' else {'COLLEAGUE'} if category in {'COLLEAGUE_LOAN','COLLEAGUE_DEPOSIT'} else {'CASH','TERM'}
            if not counterpart or counterpart.kind not in valid_kinds: raise ValidationError({'counterparty_account':'حساب مرتبط مشتری، همکار یا امانت را انتخاب کنید.'})
            post(counterpart,doc,posting_currency,posting_amount,'DEPOSIT_PRINCIPAL' if category=='COLLEAGUE_DEPOSIT' else 'ACCOUNT')
    if conversion.get('fee') and Decimal(conversion['fee']):
        post(account,doc,conversion['fee_currency'],Decimal(conversion['fee']),'FEE')
    return doc

def confirm(data, operator):
    for attempt in range(8):
        try:
            return _confirm(data,operator)
        except OperationalError as error:
            if attempt==7 or not any(term in str(error).lower() for term in ('locked','deadlock','serialization')): raise
            time.sleep(.01 * 2**attempt)
        except IntegrityError:
            # A simultaneous retry on another account can race the unique key.
            key=str(data.get('request_key',''))
            previous=FinancialDocument.objects.filter(request_key=key).first()
            digest=hashlib.sha256(json.dumps(data,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
            if previous and previous.payload_hash==digest: return previous
            if previous: raise ValidationError({'request_key':'این کلید قبلاً برای درخواست دیگری استفاده شده است.'})
            raise

def agency_report(agency, start, end, currency):
    from .agency_reporting import report
    return report(agency,start,end,currency)

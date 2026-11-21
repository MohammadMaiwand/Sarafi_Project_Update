"""Read-only, currency-separated activity and closing-balance reports."""
from datetime import date,datetime,time,timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo
from django.db import transaction
from django.db.models import Q,Sum
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from . import models as m
from .calendar_policy import month_bounds
from .ledger_service import REMITTANCES

KABUL=ZoneInfo('Asia/Kabul')
ZERO=Decimal(0)
def money(value):return format(Decimal(value or 0),'.3f')
def period(params):
    today=timezone.now().astimezone(KABUL).date()
    try:
        if params.get('all')=='true':start=None;end=today
        elif params.get('dateFrom') or params.get('dateTo'):
            start=date.fromisoformat(params['dateFrom']) if params.get('dateFrom') else None
            end=date.fromisoformat(params['dateTo']) if params.get('dateTo') else today
        else:start,before,_=month_bounds(params.get('month'));end=before-timedelta(days=1)
        if start and start>end:raise ValueError
        cutoff=datetime.combine(end+timedelta(days=1),time.min,KABUL)
    except (ValueError,TypeError,OverflowError):raise ValidationError({'date':'بازه تاریخ معتبر نیست.'})
    return start,end,cutoff

def report_section(key,title,rows,note='',balance=False):
    totals={}
    for row in rows:
        for metric in ['amount','converted','usdEquivalent','paid','remaining','receivable','payable','profit']:
            if row.get(metric) is not None:
                unit='USD' if metric=='usdEquivalent' else row.get('convertedCurrency') if metric=='converted' else row.get('profitCurrency') if metric=='profit' else row.get('currency')
                unit=unit or 'UNKNOWN'
                totals[(metric,unit)]=totals.get((metric,unit),ZERO)+Decimal(row[metric])
    return {'key':key,'title':title,'rows':rows,'count':len(rows),'note':note,'balance':balance,'totals':[] if key=='ledger_balances' else [{'metric':metric,'currency':unit,'amount':money(value)} for (metric,unit),value in sorted(totals.items())]}

@api_view(['GET'])
@transaction.atomic
def system_report(request):
    kind=request.query_params.get('type','system')
    if kind not in ['system','tehran']:raise ValidationError({'type':'نوع گزارش معتبر نیست.'})
    start,end,cutoff=period(request.query_params)
    def scope(rows,field):
        rows=rows.filter(**{field+'__lte':end})
        return rows.filter(**{field+'__gte':start}) if start else rows
    sections=[]
    rows=[]
    for row in scope(m.Transaction.objects.select_related('customer'),'date').order_by('date','id'):
        unit=row.destination_currency or row.source_currency
        converted=row.destination_amount if row.destination_amount is not None else row.afghani_amount if row.destination_currency else row.toman_amount
        rows.append({'date':str(row.date),'number':row.voucher_number,'name':row.customer.name,'description':row.description,'direction':'دریافتی تهران' if row.transaction_kind=='RECEIPT' else 'حواله به تهران','sender':row.sender_name,'recipient':row.receiver_name,'amount':money(row.toman_amount),'currency':row.source_currency,'converted':money(converted),'convertedCurrency':unit,'usdEquivalent':money(row.usd_amount),'rate':str(row.destination_rate or row.afghani_rate),'sourceRate':str(row.toman_rate),'reference':row.expense})
    sections.append(report_section('tehran','دریافتی و حواله به تهران',rows,'مبلغ اصلی و مبلغ مقصد دو نمایش همان معامله‌اند؛ نسبت نرخ، سود پولی نیست.'))
    remittances=m.Remittance.objects.filter(deleted_at__isnull=True)
    for source,label in [('incoming','حواله تهران کابل'),('outgoing','حواله دریافتی ولایتی'),('provincial-received','سوابق حواله ولایتی')]:
        if kind=='tehran' and source!='incoming':continue
        rows=[]
        for row in scope(remittances.filter(kind=source),'transactionDate').order_by('transactionDate','id'):
            original=row.sourceAmount if source=='outgoing' else row.usdAmount if source=='provincial-received' or row.conversionPath=='USD_TO_AFN' else row.tomanAmount
            unit=row.currencyType if source!='provincial-received' else 'USD'
            rows.append({'date':str(row.transactionDate),'number':row.hawalaNumber,'name':row.receiverName or row.recipientName,'sender':row.senderName,'direction':label,'description':row.description,'amount':None if source=='incoming' and unit=='TOMAN' and not row.tomanAmountKnown else money(original),'currency':unit,'converted':money(row.afnAmount) if row.afnAmountKnown else None,'convertedCurrency':'AFN','profit':money(row.manualProfit) if row.manualProfit is not None else None,'profitCurrency':row.manualProfitCurrency,'rate':str(row.usdRate if row.operationType=='USD_FORMULA' else row.afnUsdRate)})
        sections.append(report_section(source,label,rows,'مفاد فقط در صورت ثبت مقدار و واحد نمایش داده می‌شود؛ مبلغ نامشخص صفر فرض نمی‌شود.'))
    documents=m.FinancialDocument.objects.filter(status='CONFIRMED').select_related('account','province')
    # Reversed documents remain visible with their reversal; no netting across sources.
    flow=scope(documents.filter(legacy_remittance=None,tehran_transaction=None),'date')
    if kind=='tehran':flow=flow.filter(Q(category='TEHRAN_REMITTANCE')|Q(reversal_of__category='TEHRAN_REMITTANCE'))
    rows=[]
    for doc in flow.order_by('date','id'):
        rows.append({'date':str(doc.date),'number':doc.number,'name':doc.account.name,'direction':doc.category,'sender':doc.details.get('sender_name',''),'recipient':doc.details.get('recipient_name',''),'description':doc.details.get('notes') or doc.details.get('reason',''),'amount':money(doc.amount),'currency':doc.currency_id,'converted':doc.conversion.get('net'),'convertedCurrency':doc.conversion.get('destination'),'profit':str(doc.manual_profit) if doc.manual_profit is not None else None,'profitCurrency':doc.profit_currency,'state':'برگشت / اصلاح' if doc.reversal_of_id else 'ثبت تأییدشده'})
    sections.append(report_section('ledger_activity','گردش اسناد مالی مستقل' if kind=='system' else 'حواله‌های تهران در دفتر مالی',rows,'سندهای متصل به حواله اصلی دوباره در این جدول شمرده نمی‌شوند. اسناد برگشت با مرجع جدا نمایش داده می‌شوند؛ مبالغ این جدول گردش ناخالص است.'))
    if kind=='system':
        rows=[{'date':str(row.date),'number':row.expense_number,'name':row.paid_by,'direction':row.category,'description':row.description,'amount':money(row.amount),'currency':row.currency_type,'converted':money(row.afn_amount),'convertedCurrency':'AFN'} for row in scope(m.Expense.objects.filter(deleted_at=None),'date').order_by('date','id')]
        sections.append(report_section('expenses','مصارف ثبت‌شده',rows,'مصارف دفتر مالی در جدول اسناد مستقل قابل مشاهده است؛ بدون ارتباط ثبت‌شده با مصارف این جدول ادغام نمی‌شود.'))
        rows=[{'date':str(row.transactionDate),'number':row.transactionNumber,'name':row.colleague.colleagueName,'direction':'دریافت از همکار' if row.transactionType=='RECEIVED' else 'پرداخت به همکار','description':row.description,'amount':money(row.amount),'currency':row.currencyType,'converted':money(row.afnAmount),'convertedCurrency':'AFN'} for row in scope(m.ColleagueTransaction.objects.filter(deletedAt=None,colleague__deletedAt=None).select_related('colleague'),'transactionDate').order_by('transactionDate','id')]
        sections.append(report_section('colleagues','گرفت و پرداخت همکاران',rows))
        rows=[{'date':str(row.transactionDate),'number':str(row.pk),'name':row.recipientName,'description':row.description,'amount':money(row.afnAmount),'currency':'AFN','direction':'توزیع افغانی'} for row in scope(m.ProvincialDistribution.objects.filter(deleted_at=None),'transactionDate').order_by('transactionDate','id')]
        sections.append(report_section('distributions','توزیعات ولایتی',rows))
        provincial_balances={}
        for old in remittances.filter(kind='provincial-received',transactionDate__lte=end):
            values=provincial_balances.setdefault(old.recipientName,{'AFN':ZERO,'TOMAN':ZERO})
            values['AFN']+=old.afnAmount;values['TOMAN']+=old.tomanAmount
        for entry in m.ProvincialDistribution.objects.filter(deleted_at=None,transactionDate__lte=end):
            provincial_balances.setdefault(entry.recipientName,{'AFN':ZERO,'TOMAN':ZERO})['AFN']-=entry.afnAmount
        for entry in m.ProvincialRemainingTransaction.objects.filter(createdAt__lt=cutoff).select_related('person'):
            provincial_balances.setdefault(entry.person.recipientName,{'AFN':ZERO,'TOMAN':ZERO})['TOMAN']-=entry.amount
        rows=[{'name':name or 'نام ثبت نشده','currency':unit,'remaining':money(value),'direction':'حساب توزیع افغانی' if unit=='AFN' else 'تومان قابل کسر'} for name,values in provincial_balances.items() for unit,value in values.items() if value]
        sections.append(report_section('provincial_customer_balances','مانده مشتریان در سوابق ولایتی',rows,'افغانی: دریافتی منهای توزیعات. تومان: مقدار ثبت‌شده منهای کسرهای تأییدشده؛ این دو واحد و مانده دفتر مالی با هم جمع نمی‌شوند.',True))
        rows=[{'date':str(row.createdAt.astimezone(KABUL).date()),'number':str(row.pk),'name':row.person.recipientName,'direction':'کسر تومان','amount':money(row.amount),'currency':'TOMAN'} for row in m.ProvincialRemainingTransaction.objects.select_related('person').filter(createdAt__lt=cutoff).order_by('createdAt','id') if not start or row.createdAt.astimezone(KABUL).date()>=start]
        sections.append(report_section('toman_settlements','تسویه‌های تومان مشتریان ولایتی',rows))
        rows=[{'date':str(row.payment_date),'number':str(row.pk),'name':row.debtor.customer_name,'direction':'قرض جدید' if row.payment_type=='LOAN' else 'وصول قرض','description':row.note or row.payment_description,'amount':money(row.payment_usd_amount),'currency':'USD','converted':money(row.payment_afn_amount),'convertedCurrency':'AFN'} for row in scope(m.DebtPayment.objects.filter(deleted_at=None,debtor__deleted_at=None).select_related('debtor'),'payment_date').order_by('payment_date','id')]
        sections.append(report_section('debt_payments','رویدادهای قرض و وصول بدهکاران',rows))
        rows=[]
        for row in m.DebtorCustomer.objects.filter(deleted_at=None,created_at__lt=cutoff).prefetch_related('payments').order_by('customer_name'):
            remaining=row.original_usd_amount+sum((event.payment_usd_amount*(1 if event.payment_type=='LOAN' else -1) for event in row.payments.all() if event.deleted_at is None and event.payment_date<=end),ZERO)
            if remaining:rows.append({'number':row.customer_number,'name':row.customer_name,'direction':'بدهکار به دفتر' if remaining>0 else 'طلبکار از دفتر','currency':'USD','receivable':money(max(remaining,ZERO)),'payable':money(max(-remaining,ZERO)),'remaining':money(remaining)})
        sections.append(report_section('debt_balances','مانده مشتریان بدهکار تا پایان بازه',rows,'مانده شامل اصل قرض و تمام رویدادها تا پایان بازه است، حتی قبل از شروع بازه.',True))
        rows=[]
        for value in m.LedgerPosting.objects.filter(document__status='CONFIRMED',document__date__lte=end).values('account_id','account__name','account__kind','currency_id','bucket').annotate(total=Sum('amount')).order_by('account_id','currency_id','bucket'):
            if not value['total']:continue
            amount=value['total'];account_kind=value['account__kind'];bucket=value['bucket']
            payable_kind=account_kind in ['CREDITOR','CASH','TERM','COLLEAGUE'] or bucket in ['BENEFICIARY','DEPOSIT_PRINCIPAL']
            signed=-amount if payable_kind else amount
            classified=bucket=='ACCOUNT' and account_kind in ['KABUL_DEBTOR','IRAN_DEBTOR','CREDITOR','CASH','TERM','COLLEAGUE'] or bucket in ['AGENCY','BENEFICIARY','DEPOSIT_PRINCIPAL']
            rows.append({'number':str(value['account_id']),'name':value['account__name'],'direction':account_kind,'bucket':bucket,'currency':value['currency_id'],'remaining':money(amount),'receivable':money(max(signed,ZERO)) if classified else None,'payable':money(max(-signed,ZERO)) if classified else None})
        sections.append(report_section('ledger_balances','مانده بدهکاران، طلبکاران و حساب‌های دفتر مالی',rows,'مانده هر حساب و سبد جدا است. تعهد گیرنده، نمایندگی، اصل امانت و فیس با یکدیگر جمع نمی‌شوند. مانده‌های فاقد طبقه‌بندی به‌عنوان طلب یا بدهی فرض نمی‌شوند.',True))
        rows=[]
        for person in m.Colleague.objects.filter(deletedAt=None,createdAt__lt=cutoff).prefetch_related('transactions').order_by('colleagueName'):
            remaining=sum((event.afnAmount*(1 if event.transactionType=='RECEIVED' else -1) for event in person.transactions.all() if event.deletedAt is None and event.transactionDate<=end),ZERO)
            if remaining:rows.append({'number':person.colleagueNumber,'name':person.colleagueName,'currency':'AFN','remaining':money(remaining),'payable':money(max(remaining,ZERO)),'receivable':money(max(-remaining,ZERO))})
        sections.append(report_section('colleague_balances','مانده حساب همکاران تا پایان بازه',rows,'دریافت منهای پرداخت، به معادل افغانی ثبت‌شده در هر معامله؛ مانده مثبت، تعهد دفتر به همکار است.',True))
        rows=[];events=[]
        for row in m.CustomerDeposit.objects.filter(deleted_at=None,received_date__lte=end).prefetch_related('withdrawals').order_by('received_date','id'):
            if row.deposit_type=='HAWALA':base=row.total_afn-row.hawala_fee;unit='AFN'
            elif row.deposit_type=='EXCHANGE':base=row.final_amount;unit=row.currency_to
            else:base=row.amount;unit=row.currency_type
            changes=[event for event in row.withdrawals.all() if event.deleted_at is None and event.withdrawal_date<=end]
            remaining=base+sum((event.amount*(1 if event.withdrawal_type=='ADDITION' else -1) for event in changes if event.currency_type==unit),ZERO)
            rows.append({'date':str(row.received_date),'number':row.deposit_number,'name':row.customer_name,'direction':row.deposit_type,'amount':money(base),'currency':unit,'remaining':money(remaining),'payable':money(max(remaining,ZERO)),'state':row.hawala_status if row.deposit_type=='HAWALA' else row.conversion_status if row.deposit_type=='EXCHANGE' else 'امانت','description':row.notes})
            for event in changes:
                if not start or event.withdrawal_date>=start:events.append({'date':str(event.withdrawal_date),'number':str(event.pk),'name':row.customer_name,'direction':event.withdrawal_type,'amount':money(event.amount),'currency':event.currency_type,'description':event.note or event.description})
        sections.append(report_section('deposit_balances','مانده امانت‌ها و تعهدات تبدیل ارز',rows,'موجودی تا پایان بازه؛ شامل امانت‌ها، حواله‌های امانی و تبدیل‌های در انتظار است.',True))
        sections.append(report_section('deposit_events','افزودن و برداشت امانت‌ها در بازه',events))
        rows=[{'date':str(row.start_date),'number':row.contract_number,'name':row.investor_name,'recipient':row.agent_name,'amount':money(row.principal_amount),'currency':row.currency_type,'profit':money(row.profit_amount),'profitCurrency':row.currency_type,'state':row.status,'description':row.notes,'investorShare':money(row.investor_share_amount),'agentShare':money(row.agent_share_amount)} for row in scope(m.MudarabahContract.objects.filter(deleted_at=None),'start_date').order_by('start_date','id')]
        sections.append(report_section('mudarabah','قراردادهای مضاربه',rows,'سود قراردادی است و به معنی دریافت نقدی سود نیست.'))
    # Outstanding balances at cutoff, including receipts from before the selected period.
    pending=[]
    eligible=documents.filter(category__in=REMITTANCES,date__lte=end).filter(Q(reversal__isnull=True)|Q(reversal__date__gt=end))
    if kind=='tehran':eligible=eligible.filter(Q(category='TEHRAN_REMITTANCE')|Q(legacy_remittance__kind='incoming')|Q(tehran_transaction__isnull=False))
    for doc in eligible:
        paid=doc.settlements.filter(purpose='BENEFICIARY',receipt__status='CONFIRMED',receipt__date__lte=end).aggregate(v=Sum('amount'))['v'] or ZERO
        payable=Decimal(doc.conversion.get('net') or doc.amount);remaining=payable-paid
        if remaining>0:pending.append({'date':str(doc.date),'number':doc.number,'name':doc.details.get('recipient_name') or doc.account.name,'direction':doc.category,'currency':doc.conversion.get('destination') or doc.currency_id,'amount':money(payable),'paid':money(paid),'remaining':money(remaining),'state':'قسمی پرداخت‌شده' if paid else 'پرداخت‌نشده'})
    sections.append(report_section('pending','حواله‌های دارای مانده گیرنده تا پایان بازه',pending,'حواله‌های کامل پرداخت‌شده و برگشت‌شده حذف می‌شوند؛ پرداخت گیرنده از تسویه نمایندگی جدا است.',True))
    unknown=[]
    originals=remittances.filter(transactionDate__lte=end).filter(Q(financialdocument__isnull=True)|Q(financialdocument__date__gt=end))
    if kind=='tehran':originals=originals.filter(kind='incoming')
    for row in originals:unknown.append({'date':str(row.transactionDate),'number':row.hawalaNumber,'name':row.receiverName or row.recipientName,'direction':row.kind,'amount':money(row.afnAmount) if row.afnAmountKnown else None,'currency':'AFN','state':'وضعیت پرداخت تأیید نشده'})
    for row in m.Transaction.objects.filter(transaction_kind='REMITTANCE',date__lte=end).filter(Q(financialdocument__isnull=True)|Q(financialdocument__date__gt=end)):
        unknown.append({'date':str(row.date),'number':row.voucher_number,'name':row.receiver_name,'direction':'حواله تهران','amount':money(row.destination_amount if row.destination_amount is not None else row.afghani_amount if row.destination_currency else row.toman_amount),'currency':row.destination_currency or row.source_currency,'state':'وضعیت پرداخت تأیید نشده'})
    sections.append(report_section('unverified','سوابق نیازمند تأیید وضعیت پرداخت',unknown,'مبلغ این سوابق، مانده پرداخت‌نشده قطعی نیست و با حواله‌های دارای مانده جمع نمی‌شود.',True))
    return Response({'type':kind,'generatedAt':timezone.now().astimezone(KABUL).isoformat(),'operator':request.user.get_username(),'period':{'from':str(start) if start else None,'to':str(end)},'sections':sections,'notes':['هر واحد پول مستقل است؛ مجموع عمومیِ ارزهای مختلف و سود خالص تخمینی محاسبه نمی‌شود.','گردش معاملات مربوط به بازه انتخاب‌شده است؛ مانده‌ها وضعیت تا پایان بازه را نشان می‌دهند.','منابع قدیمی و دفتر مالی جدا نمایش داده می‌شوند؛ فقط ارتباط‌های صریح برای حذف شمارش دوباره استفاده می‌شود.','مبالغ جدول‌های گردش، تبدیل، پرداخت و مانده را با یکدیگر جمع نکنید؛ این‌ها نماهای متفاوت همان جریان مالی هستند.','گزارش بر اساس سوابق فعلی با تاریخ معاملات محاسبه می‌شود و جایگزین نسخه حسابرسی تاریخی نیست.']})

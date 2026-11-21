from decimal import Decimal
from django.db.models import Sum, F, Q
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError, PermissionDenied
from .models import Currency, Agency, FinancialAccount, FinancialDocument, LedgerPosting, RateQuote, LedgerSetting, Customer, Colleague
from .ledger_service import confirm, outstanding, agency_report, PROFILE_FIELDS, REMITTANCES
from .calendar_policy import month_bounds
from .conversion import convert, CURRENCIES

def sanitize(data):
    if not isinstance(data,dict): return data
    result={}
    for key,value in data.items():
        if any(word in key for word in ('image','fingerprint','signature')): result[key]=bool(value)
        elif 'card' in key or key in ('identity_number','sender_id','recipient_id'): result[key]=('••••'+str(value)[-4:]) if value else ''
        else: result[key]=value
    return result

def account_data(account):
    balances=list(account.postings.filter(document__status='CONFIRMED').values('currency_id','bucket').annotate(amount=Sum('amount')))
    balances=[{**row,'amount':str(row['amount'].quantize(Decimal('.001')))} for row in balances]
    return {'id':account.pk,'kind':account.kind,'name':account.name,'customer':account.customer_id,'colleague':account.colleague_id,'agency':account.agency_id,'profile':sanitize(account.profile),'active':account.active,'province':account.province_id or (account.agency.province_id if account.agency_id else None),'balances':balances}

def document_data(doc):
    result={'id':doc.pk,'number':doc.number,'account':doc.account_id,'agency':doc.agency_id,'category':doc.category,'date':str(doc.date),'amount':str(doc.amount),'currency':doc.currency_id,'status':doc.status,'conversion':doc.conversion,'details':sanitize(doc.details),'operator':doc.operator.get_username(),'reversal_of':doc.reversal_of_id}
    result.update(province=doc.province_id,agency_id=doc.agency_id,representative_name=doc.account.name,manual_profit=str(doc.manual_profit) if doc.manual_profit is not None else None,profit_currency=doc.profit_currency or None)
    if hasattr(doc,'reversal'): result['status']='REVERSED'
    if doc.category in REMITTANCES:
        for purpose,key in [('BENEFICIARY','beneficiary'),('AGENCY','agency')]:
            remaining,total=outstanding(doc,purpose)
            result[key]={'outstanding':str(remaining),'paid':str(total-remaining),'status':'PAID' if remaining==0 else 'UNPAID' if remaining==total else 'PARTIAL'}
    return result

@api_view(['GET','POST'])
@permission_classes([IsAuthenticated])
def accounts(request):
    if request.method=='POST':
        data=request.data;kind=data.get('kind')
        if kind not in dict(FinancialAccount._meta.get_field('kind').choices): raise ValidationError({'kind':'نوع حساب معتبر نیست.'})
        customer=get_object_or_404(Customer,pk=data['customer']) if data.get('customer') else None
        colleague=get_object_or_404(Colleague,pk=data['colleague']) if data.get('colleague') else None
        name=(customer.name if customer else colleague.colleagueName if colleague else str(data.get('name','')).strip())
        if not name or len(name)>200: raise ValidationError({'name':'نام معتبر الزامی است.'})
        if customer and FinancialAccount.objects.filter(customer=customer,kind=kind).exists(): raise ValidationError({'customer':'این مشتری قبلاً این حساب را دارد.'})
        profile=data.get('profile') or {}
        if not isinstance(profile,dict) or set(profile)-set(PROFILE_FIELDS): raise ValidationError({'profile':'خانه‌های مشخصات معتبر نیست.'})
        if kind in ('KABUL_DEBTOR','IRAN_DEBTOR','CREDITOR'):
            if profile.get('approval')=='APPROVED' and not request.user.is_staff: raise PermissionDenied('تأیید حساب برای مدیر مجاز است.')
            profile.setdefault('approval','APPROVED' if request.user.is_staff else 'PENDING')
        if profile.get('due_date'):
            from datetime import date
            try: date.fromisoformat(profile['due_date'])
            except (ValueError,TypeError): raise ValidationError({'due_date':'تاریخ معتبر نیست.'})
        if profile.get('identity_image'):
            from .remittance_domain import validate_file_data
            validate_file_data(profile['identity_image'],'identity_image',image=True)
        row=FinancialAccount.objects.create(kind=kind,name=name,customer=customer,colleague=colleague,agency_id=data.get('agency'),profile=profile)
        return Response(account_data(row),status=201)
    rows=FinancialAccount.objects.all().order_by('name','id')
    if request.query_params.get('kind'): rows=rows.filter(kind=request.query_params['kind'])
    return Response({'results':[account_data(row) for row in rows]})

@api_view(['GET','PATCH'])
@permission_classes([IsAuthenticated])
def account_detail(request,pk):
    row=get_object_or_404(FinancialAccount,pk=pk)
    if request.method=='PATCH':
        profile=request.data.get('profile',{})
        if not isinstance(profile,dict) or set(profile)-set(PROFILE_FIELDS): raise ValidationError({'profile':'مشخصات معتبر نیست.'})
        if 'approval' in profile and profile['approval']!=row.profile.get('approval') and not request.user.is_staff: raise PermissionDenied('تغییر تأیید حساب برای مدیر مجاز است.')
        row.profile={**row.profile,**profile};row.active=request.data.get('active',row.active);row.save(update_fields=['profile','active'])
    result=account_data(row)
    result['documents']=[document_data(doc) for doc in FinancialDocument.objects.filter(Q(account=row)|Q(postings__account=row)).distinct().select_related('operator').order_by('-date','-id')]
    start,end,month=month_bounds(request.query_params.get('month'))
    result['month']=month
    result['monthly_totals']=list(row.postings.filter(document__date__gte=start,document__date__lt=end,document__status='CONFIRMED').values('currency_id','document__category','bucket').annotate(amount=Sum('amount')))
    result['monthly_totals']=[{**item,'amount':str(item['amount'].quantize(Decimal('.001')))} for item in result['monthly_totals']]
    return Response(result)

@api_view(['GET','POST'])
@permission_classes([IsAuthenticated])
def agencies(request):
    if request.method=='POST':
        name=str(request.data.get('name','')).strip()
        if not name or len(name)>200: raise ValidationError({'name':'نام نمایندگی الزامی است.'})
        row=Agency.objects.create(name=name,phone=str(request.data.get('phone',''))[:50],location=str(request.data.get('location',''))[:250])
        FinancialAccount.objects.create(kind='AGENCY',agency=row,name=name)
        return Response({'id':row.pk,'name':row.name},status=201)
    return Response({'results':list(Agency.objects.values('id','name','phone','location','active'))})

@api_view(['GET','POST'])
@permission_classes([IsAuthenticated])
def documents(request):
    if request.method=='POST':
        return Response(document_data(confirm(request.data,request.user)),status=201)
    rows=FinancialDocument.objects.select_related('operator').order_by('-date','-id')
    for field in ['account','agency','category']:
        if request.query_params.get(field): rows=rows.filter(**{field:request.query_params[field]})
    if request.query_params.get('unexecuted')=='true':
        rows=rows.filter(category__in=REMITTANCES,status='CONFIRMED')
        values=[document_data(row) for row in rows]
        return Response({'results':[row for row in values if Decimal(row['beneficiary']['outstanding'])>0 and row['status']!='REVERSED']})
    return Response({'results':[document_data(row) for row in rows[:500]]})

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def monthly_report(request,pk):
    agency=get_object_or_404(Agency,pk=pk)
    start,end,month=month_bounds(request.query_params.get('month'))
    currency=request.query_params.get('currency','AFN')
    if currency not in CURRENCIES: raise ValidationError({'currency':'واحد معتبر نیست.'})
    result=agency_report(agency,start,end,currency);result.update(month=month,agency=agency.name)
    from .agency_reporting import agency_postings
    from .provincial_reporting import REPORT_CURRENCIES
    units=list(dict.fromkeys([*REPORT_CURRENCIES,*agency_postings(agency).values_list('currency_id',flat=True).distinct()]))
    result['balances_by_currency']=[agency_report(agency,start,end,unit) for unit in units]
    return Response(result)

@api_view(['GET','POST'])
@permission_classes([IsAuthenticated])
def options(request):
    if request.method=='POST':
        if not request.user.is_staff: raise PermissionDenied('تنظیم شماره فقط برای مدیر مجاز است.')
        value=request.data.get('starting_number')
        if isinstance(value,bool) or not isinstance(value,int) or not 1<=value<=999999999: raise ValidationError({'starting_number':'شماره آغاز معتبر نیست.'})
        LedgerSetting.objects.update_or_create(key='starting_number',defaults={'value':value})
    setting=LedgerSetting.objects.filter(key='starting_number').first()
    return Response({'currencies':list(Currency.objects.values()),'kaldar_currency':'PKR','starting_number':setting.value if setting else 200,'colleagues':list(Colleague.objects.filter(deletedAt__isnull=True).values('id','colleagueName')),'profile_fields':PROFILE_FIELDS,'rate_input':'MANUAL','profit_policy':'Unavailable without cost basis and sale proceeds'})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def preview_conversion(request):
    data=request.data
    return Response(convert(data.get('amount'),data.get('currency'),data.get('source_rate'),data.get('destination'),data.get('destination_rate'),data.get('fee','0'),data.get('fee_currency'),data.get('collection','SEPARATE')))

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def missing_identity(request):
    groups={'missing_id_only':[],'missing_phone_only':[],'both_missing':[]}
    for row in FinancialDocument.objects.filter(category__in=REMITTANCES).select_related('operator'):
        missing_id=not row.details.get('sender_id');missing_phone=not row.details.get('sender_phone')
        key='both_missing' if missing_id and missing_phone else 'missing_id_only' if missing_id else 'missing_phone_only' if missing_phone else None
        if key: groups[key].append(document_data(row))
    from .models import Transaction, Remittance
    for row in Transaction.objects.filter(financialdocument__isnull=True).select_related('customer'):
        profiles=FinancialAccount.objects.filter(customer_id=row.customer_id).values_list('profile',flat=True)
        identity=next((profile.get('identity_number') for profile in profiles if profile.get('identity_number')),None)
        missing_id=not identity;missing_phone=not row.customer.phone
        key='both_missing' if missing_id and missing_phone else 'missing_id_only' if missing_id else 'missing_phone_only' if missing_phone else None
        if key: groups[key].append({'id':f'T-{row.pk}','number':row.voucher_number,'currency':row.source_currency,'amount':str(row.toman_amount),'details':{'sender_name':row.sender_name},'legacy_source':'TEHRAN'})
    for row in Remittance.objects.filter(financialdocument__isnull=True,deleted_at__isnull=True):
        missing_id=not row.nationalIdNumber;missing_phone=not row.phoneNumber
        key='both_missing' if missing_id and missing_phone else 'missing_id_only' if missing_id else 'missing_phone_only' if missing_phone else None
        if key: groups[key].append({'id':f'R-{row.pk}','number':row.hawalaNumber,'currency':row.currencyType,'amount':str(row.sourceAmount or row.tomanAmount or row.afnAmount),'details':{'sender_name':row.senderName},'legacy_source':'REMITTANCE'})
    groups['totals']={key:{currency:str(sum((Decimal(item['amount']) for item in values if item['currency']==currency),Decimal(0))) for currency in ['AFN','TOMAN']} for key,values in list(groups.items())}
    return Response(groups)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def legacy_unpaid(request):
    from .models import Remittance, Transaction
    results=[]
    for row in Remittance.objects.filter(deleted_at__isnull=True,financialdocument__isnull=True):
        results.append({'legacy_remittance':row.pk,'number':row.hawalaNumber,'date':str(row.transactionDate),'currency':'AFN','amount':str(row.afnAmount),'sender_name':row.senderName,'recipient_name':row.receiverName or row.recipientName,'kind':row.kind,'source_amount':str(row.sourceAmount if row.kind=='outgoing' else row.usdAmount if row.kind=='provincial-received' or row.conversionPath=='USD_TO_AFN' else row.tomanAmount),'source_currency':row.currencyType,'details':sanitize({'sender_name':row.senderName,'sender_father':row.senderFatherName,'recipient_name':row.receiverName or row.recipientName,'recipient_father':row.receiverFatherName or row.recipientFatherName,'recipient_phone':row.phoneNumber,'recipient_id':row.nationalIdNumber,'payment_location':row.location,'notes':row.description}),'conversion':{'destination':'AFN','net':str(row.afnAmount),'usd_rate':str(row.usdRate),'afn_rate':str(row.afnUsdRate)},'manual_profit':str(row.manualProfit) if row.manualProfit is not None else None,'profit_currency':row.manualProfitCurrency,'payment_status':'UNVERIFIED'})
    for row in Transaction.objects.filter(transaction_kind='REMITTANCE',financialdocument__isnull=True):
        results.append({'tehran_transaction':row.pk,'customer':row.customer_id,'number':row.voucher_number,'date':str(row.date),'currency':row.destination_currency or row.source_currency,'amount':str(row.destination_amount if row.destination_amount is not None else row.afghani_amount if row.destination_currency else row.toman_amount),'sender_name':row.sender_name,'recipient_name':row.receiver_name,'kind':'TEHRAN','source_amount':str(row.toman_amount),'source_currency':row.source_currency,'details':sanitize({'sender_name':row.sender_name,'sender_father':row.sender_father_name,'recipient_name':row.receiver_name,'notes':row.description,'purpose':row.expense}),'conversion':row.applied_conversion,'payment_status':'UNVERIFIED'})
    return Response({'results':results})

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def audit_history(request):
    from .models import FinancialAudit
    if not request.user.is_staff: raise PermissionDenied('مشاهده سابقه اصلاحات برای مدیر مجاز است.')
    rows=FinancialAudit.objects.order_by('-created_at','-id')
    for key in ['model','object_id']:
        if request.query_params.get(key): rows=rows.filter(**{key:request.query_params[key]})
    return Response({'results':list(rows.values('id','model','object_id','action','before','after','operator_id','created_at')[:500])})

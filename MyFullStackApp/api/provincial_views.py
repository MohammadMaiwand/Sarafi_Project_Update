from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP, localcontext
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view
from rest_framework.exceptions import ValidationError, PermissionDenied
from rest_framework.response import Response
from .models import Province, Agency, FinancialAccount, FinancialDocument, ReceiptAllocation, LedgerSetting, NumberSequence, FinancialAudit
from .ledger_views import account_data, document_data
from .ledger_service import confirm, outstanding, REPRESENTATIVE_MOVEMENTS
from .calendar_policy import month_bounds
from .conversion import CURRENCIES
from .manual_profit import validate_profit
from .provincial_customer_payments import customer_balances, net_amount, unit as payment_unit
from .provincial_reporting import representative_report, account_rows, money, REPORT_CURRENCIES, agency_status

def workspace_value(params):
    value=params.get('workspace','provincial')
    if value not in ['provincial','received']:raise ValidationError({'workspace':'بخش حواله معتبر نیست.'})
    return value

def workspace_accounts(rows,value,prefix=''):
    key=prefix+'profile__remittance_workspace'
    return rows.filter(**{key:'received'}) if value=='received' else rows.filter(Q(**{key:'provincial'})|Q(**{key+'__isnull':True}))

def province_account(pk,workspace=None):
    rows=FinancialAccount.objects.select_related('agency','province')
    if workspace is not None:rows=workspace_accounts(rows,workspace)
    account=get_object_or_404(rows,pk=pk,kind='AGENCY')
    if not account.province_id and not (account.agency_id and account.agency.province_id):raise ValidationError({'account':'ابتدا ولایت این حساب را مشخص کنید.'})
    return account

@api_view(['GET'])
def provinces(request):
    rows=Province.objects.all()
    if request.query_params.get('search'):rows=rows.filter(Q(name__icontains=request.query_params['search'])|Q(english_name__icontains=request.query_params['search'])|Q(code__icontains=request.query_params['search']))
    return Response({'results':list(rows.values('code','name','english_name'))})

@api_view(['GET','POST'])
def representatives(request,code):
    province=get_object_or_404(Province,pk=code)
    workspace=workspace_value(request.data if request.method=='POST' else request.query_params)
    if request.method=='POST':
        name=str(request.data.get('name','')).strip()
        if not name or len(name)>200:raise ValidationError({'name':'نام حساب نماینده الزامی است.'})
        with transaction.atomic():
            if request.data.get('agency'):
                agency=get_object_or_404(Agency.objects.select_for_update(),pk=request.data['agency'],active=True)
                if agency.province_id and agency.province_id!=code:raise ValidationError({'agency':'نمایندگی به ولایت دیگری مربوط است.'})
                if not agency.province_id:agency.province=province;agency.save(update_fields=['province'])
            else:agency=Agency.objects.create(province=province,name=name,phone=str(request.data.get('phone',''))[:50])
            account=FinancialAccount.objects.create(kind='AGENCY',name=name,province=province,agency=agency,profile={'phone':str(request.data.get('phone',''))[:50],'remittance_workspace':workspace})
        return Response(account_data(account),status=201)
    rows=FinancialAccount.objects.filter(kind='AGENCY').filter(Q(province=province)|Q(agency__province=province)).distinct().order_by('name','id')
    rows=workspace_accounts(rows,workspace)
    values=[]
    for row in rows:
        item=account_data(row);balances={}
        for entry in account_rows(row):balances[entry.currency_id]=balances.get(entry.currency_id,Decimal(0))+entry.amount
        item['representativeBalances']=[{'currency':unit,'amount':money(balances.get(unit,0)),'status':agency_status(balances.get(unit,0))} for unit in dict.fromkeys([*REPORT_CURRENCIES,*balances])];values.append(item)
    return Response({'province':{'code':code,'name':province.name},'results':values,'agencies':list(Agency.objects.filter(Q(province=province)|Q(province=None),active=True).values('id','name'))})

@api_view(['GET'])
def representative_ledger(request,pk):
    account=province_account(pk)
    start,end,month=month_bounds(request.query_params.get('month'))
    currency=request.query_params.get('currency','AFN')
    if currency not in CURRENCIES:raise ValidationError({'currency':'واحد پول معتبر نیست.'})
    result=representative_report(account,start,end,currency,request.query_params.get('history')=='all')
    result['month']=month
    available=list(account_rows(account).values_list('currency_id',flat=True).distinct())
    result['available_currencies']=list(dict.fromkeys([*REPORT_CURRENCIES,currency,*available]))
    result['balances_by_currency']=[{key:value for key,value in representative_report(account,start,end,unit).items() if key in ['currency','opening','movement','closing','closing_status','opening_status','agency_opening_status','agency_closing_status','perspective','money_sent','money_received','movement_count']} for unit in result['available_currencies']]
    return Response(result)

@api_view(['GET'])
def account_remittances(request,pk):
    """Remittances and actual customer payments, including advances."""
    account=province_account(pk,workspace_value(request.query_params))
    start,end,month=month_bounds(request.query_params.get('month'))
    all_history=request.query_params.get('history')=='all'
    rows=FinancialDocument.objects.filter(account=account,category__in=['PROVINCIAL_IN','PROVINCIAL_OUT'],status='CONFIRMED',reversal__isnull=True).order_by('date','id')
    totals={}
    for doc in rows:
        if not all_history and doc.date>=end:continue
        data=document_data(doc)
        unit=data['conversion'].get('destination') or data['currency']
        amount=Decimal(str(data['conversion'].get('net') if data['conversion'].get('net') is not None else data['amount']))
        total=totals.setdefault(unit,{'currency':unit,'opening':Decimal(0),'outgoing':Decimal(0),'incoming':Decimal(0),'payments':Decimal(0),'count':0})
        if not all_history and doc.date<start:
            total['opening']+=amount if doc.category=='PROVINCIAL_OUT' else -amount
        else:
            total['outgoing' if doc.category=='PROVINCIAL_OUT' else 'incoming']+=amount
            total['count']+=1
    payment_rows=[]
    allocations=ReceiptAllocation.objects.filter(remittance__account=account,remittance__category='PROVINCIAL_IN',purpose='BENEFICIARY',receipt__status='CONFIRMED').select_related('receipt','receipt__reversal_of','remittance').order_by('receipt__date','receipt_id','id')
    for allocation in allocations:
        receipt=allocation.receipt
        if receipt.category=='PROVINCIAL_PAYMENT' or receipt.reversal_of_id and receipt.reversal_of.category=='PROVINCIAL_PAYMENT':continue
        if not all_history and receipt.date>=end:continue
        unit=receipt.currency_id
        total=totals.setdefault(unit,{'currency':unit,'opening':Decimal(0),'outgoing':Decimal(0),'incoming':Decimal(0),'payments':Decimal(0),'count':0})
        if not all_history and receipt.date<start:
            total['opening']+=allocation.amount
        else:
            total['payments']+=allocation.amount
            payment_rows.append({'id':allocation.pk,'reference':receipt.number,'date':str(receipt.date),'amount':money(allocation.amount),'currency':unit,'remittance':allocation.remittance.number,'details':{key:allocation.remittance.details.get(key,'') for key in ['sender_name','recipient_name']},'reversal':bool(receipt.reversal_of_id)})
    for doc in FinancialDocument.objects.filter(account=account,category='PROVINCIAL_PAYMENT',status='CONFIRMED',reversal__isnull=True).order_by('date','id'):
        if not all_history and doc.date>=end:continue
        currency=payment_unit(doc);amount=net_amount(doc)
        total=totals.setdefault(currency,{'currency':currency,'opening':Decimal(0),'outgoing':Decimal(0),'incoming':Decimal(0),'payments':Decimal(0),'count':0})
        if not all_history and doc.date<start:total['opening']+=amount
        else:
            total['payments']+=amount
            payment_rows.append({'id':f'payment-{doc.pk}','reference':doc.number,'date':str(doc.date),'amount':money(amount),'currency':currency,'remittance':'پرداخت مشتری / پیش‌پرداخت','details':{key:doc.details.get(key,'') for key in ['sender_name','recipient_name']},'reversal':False})
    payment_rows.sort(key=lambda row:(row['date'],row['reference']))
    result=[]
    for total in totals.values():
        net=total['outgoing']+total['payments']-total['incoming']
        closing=total['opening']+net
        result.append({**{key:money(value) if isinstance(value,Decimal) else value for key,value in total.items()},'net':money(net),'closing':money(closing),'customerDebt':money(max(closing,Decimal(0))),'customerCredit':money(max(-closing,Decimal(0))),'status':'بدهکار' if closing>0 else 'طلبکار' if closing<0 else 'تصفیه‌شده'})
    return Response({'account':account_data(account),'month':month,'allHistory':all_history,'totals':result,'payments':payment_rows,'customers':customer_balances(account,None if all_history else end)})

def scoped_documents(request):
    params=request.query_params
    rows=FinancialDocument.objects.filter(category__in=['PROVINCIAL_IN','PROVINCIAL_OUT'],status='CONFIRMED').select_related('account','operator','province')
    # Account-specific legacy callers keep working; explicitly scoped lists stay isolated.
    if params.get('workspace') or not params.get('account'):
        rows=workspace_accounts(rows,workspace_value(params),'account__')
    if params.get('direction'):
        if params['direction'] not in ['PROVINCIAL_IN','PROVINCIAL_OUT']:raise ValidationError({'direction':'جهت حواله معتبر نیست.'})
        rows=rows.filter(category=params['direction'])
    for key in ['province','account']:
        if params.get(key):rows=rows.filter(**{f'{key}_id':params[key]})
    if params.get('currency'):
        if params['currency'] not in CURRENCIES:raise ValidationError({'currency':'واحد پول معتبر نیست.'})
        rows=rows.filter(Q(currency_id=params['currency'])|Q(conversion__destination=params['currency']))
    if params.get('month'):
        start,end,_=month_bounds(params['month']);rows=rows.filter(date__gte=start,date__lt=end)
    try:
        if params.get('dateFrom'):rows=rows.filter(date__gte=date.fromisoformat(params['dateFrom']))
        if params.get('dateTo'):rows=rows.filter(date__lt=date.fromisoformat(params['dateTo'])+timedelta(days=1))
        if params.get('dateFrom') and params.get('dateTo') and params['dateFrom']>params['dateTo']:raise ValueError
    except (ValueError,TypeError):raise ValidationError({'date':'بازه تاریخ معتبر نیست.'})
    if params.get('search'):
        search=params['search'];rows=rows.filter(Q(number__icontains=search)|Q(details__sender_name__icontains=search)|Q(details__recipient_name__icontains=search)|Q(account__name__icontains=search))
    return rows.order_by('date','id') if params.get('sortDir')=='asc' else rows.order_by('-date','-id')

@api_view(['GET','POST'])
def remittances(request):
    if request.method=='POST':
        data=dict(request.data)
        account=province_account(data.get('account'),workspace_value(data))
        province=account.province_id or account.agency.province_id
        if data.get('province')!=province:raise ValidationError({'province':'ولایت حساب و حواله باید یکسان باشد.'})
        if data.get('category') not in ['PROVINCIAL_IN','PROVINCIAL_OUT']:raise ValidationError({'category':'جهت حواله معتبر نیست.'})
        details=data.get('details') or {}
        if not isinstance(details,dict):raise ValidationError({'details':'مشخصات معتبر وارد کنید.'})
        validate_party_fields({key:value for key,value in details.items() if key in PARTY_FIELDS})
        data['agency']=account.agency_id
        return Response(document_data(confirm(data,request.user)),status=201)
    values=[document_data(row) for row in scoped_documents(request)]
    values=[row for row in values if row['status']!='REVERSED']
    status=request.query_params.get('paymentStatus','')
    if status and status not in ['UNPAID','PARTIAL','PAID']:raise ValidationError({'paymentStatus':'حالت پرداخت معتبر نیست.'})
    if status:values=[row for row in values if row['beneficiary']['status']==status]
    try:
        page=int(request.query_params.get('page',1));size=int(request.query_params.get('pageSize',20))
        if page<1 or size not in [10,20,50,100]:raise ValueError
    except (TypeError,ValueError):raise ValidationError({'page':'صفحه‌بندی معتبر نیست.'})
    totals={};profits={}
    for row in values:
        unit=row['conversion'].get('destination') or row['currency']
        total=totals.setdefault(unit,{'currency':unit,'payable':Decimal(0),'paid':Decimal(0),'remaining':Decimal(0)})
        total['payable']+=Decimal(row['beneficiary']['paid'])+Decimal(row['beneficiary']['outstanding'])
        total['paid']+=Decimal(row['beneficiary']['paid']);total['remaining']+=Decimal(row['beneficiary']['outstanding'])
        if row['manual_profit'] is not None:profits[row['profit_currency']]=profits.get(row['profit_currency'],Decimal(0))+Decimal(row['manual_profit'])
    return Response({'results':values[(page-1)*size:page*size],'count':len(values),'page':page,'pageSize':size,'totalPages':max(1,(len(values)+size-1)//size),'totals':[{key:money(value) if key!='currency' else value for key,value in total.items()} for total in totals.values()],'profitTotals':[{'currency':unit,'amount':money(value)} for unit,value in profits.items()]})

@api_view(['GET'])
def payments(request,pk):
    doc=get_object_or_404(FinancialDocument,pk=pk,category__in=['PROVINCIAL_IN','PROVINCIAL_OUT'])
    return Response({'remittance':document_data(doc),'results':[{'reference':allocation.receipt.number,'document':allocation.receipt_id,'date':str(allocation.receipt.date),'amount':money(allocation.amount),'currency':allocation.receipt.currency_id,'purpose':allocation.purpose,'reversal_of':allocation.receipt.reversal_of_id} for allocation in doc.settlements.select_related('receipt').order_by('receipt__date','id')]})

@api_view(['PATCH'])
def profit(request,pk):
    with transaction.atomic():
        doc=get_object_or_404(FinancialDocument.objects.select_for_update(),pk=pk,category__in=['PROVINCIAL_IN','PROVINCIAL_OUT'])
        if hasattr(doc,'reversal'):raise ValidationError({'manual_profit':'حواله برگشت‌شده قابل ویرایش نیست.'})
        doc.manual_profit,doc.profit_currency=validate_profit(request.data.get('manual_profit',doc.manual_profit),request.data.get('profit_currency',doc.profit_currency))
        doc.save(update_fields=['manual_profit','profit_currency'])
    return Response(document_data(doc))

PARTY_FIELDS={'sender_name','sender_father','sender_phone','sender_id','sender_location','recipient_name','recipient_father','recipient_phone','recipient_id','district','village','payment_location','notes','identity_image'}

def validate_party_fields(details):
    for key,value in details.items():
        if key=='identity_image':
            from .remittance_domain import validate_file_data
            validate_file_data(value,key,image=True)
            continue
        limit=50 if key.endswith('phone') else 2000 if key=='notes' else 250
        if not isinstance(value,str) or len(value)>limit or key in ['sender_name','recipient_name'] and not value.strip():raise ValidationError({key:'مشخصات معتبر وارد کنید.'})
        if key in ['sender_id','recipient_id'] and ('•' in value or '**' in value):raise ValidationError({key:'شماره کامل جدید را وارد کنید؛ مقدار پوشیده‌شده قابل ذخیره نیست.'})

@api_view(['GET','PATCH'])
def remittance_detail(request,pk):
    with transaction.atomic():
        doc=get_object_or_404(FinancialDocument.objects.select_for_update(),pk=pk,category__in=['PROVINCIAL_IN','PROVINCIAL_OUT'])
        if request.method=='PATCH':
            if hasattr(doc,'reversal'):raise ValidationError({'details':'حواله برگشت‌شده قابل ویرایش نیست.'})
            details=request.data.get('details')
            if set(request.data)!={'details'} or not isinstance(details,dict) or set(details)-PARTY_FIELDS:raise ValidationError({'details':'فقط مشخصات فرستنده و گیرنده قابل ویرایش است؛ اصلاح مالی از مسیر برگشت انجام می‌شود.'})
            validate_party_fields(details)
            changed=[key for key,value in details.items() if value!=doc.details.get(key)]
            if changed:
                doc.details={**doc.details,**details};doc.save(update_fields=['details'])
                FinancialAudit.objects.create(model='FinancialDocument',object_id=str(doc.pk),action='DETAIL_EDIT',before={'changed_fields':changed},after={'details_updated':True},operator=request.user)
    return Response(document_data(doc))

@api_view(['GET','POST'])
def numbering(request):
    from django.utils import timezone
    from jdatetime import date as solar_date
    if request.method=='POST':
        if not request.user.is_staff:raise PermissionDenied('تنظیم شماره آغاز فقط برای مدیر مجاز است.')
        value=request.data.get('starting_number')
        if isinstance(value,bool) or not isinstance(value,int) or not 1<=value<=999999999:raise ValidationError({'starting_number':'شماره آغاز باید عدد صحیح مثبت باشد.'})
        with transaction.atomic():
            setting,_=LedgerSetting.objects.select_for_update().get_or_create(key='provincial_starting_number',defaults={'value':200})
            before=setting.value;setting.value=value;setting.save(update_fields=['value'])
            if before!=value:FinancialAudit.objects.create(model='LedgerSetting',object_id=setting.key,action='CORRECTION',before={'starting_number':before},after={'starting_number':value},operator=request.user)
    setting=LedgerSetting.objects.filter(key='provincial_starting_number').first()
    start=int(setting.value) if setting else 200
    year=solar_date.fromgregorian(date=timezone.localdate()).year
    sequence=NumberSequence.objects.filter(prefix='PVL',year=year).first()
    next_value=max(start,sequence.last_value+1 if sequence else start)
    return Response({'starting_number':start,'next_number':next_value,'next_reference':f'PVL-{year}-{next_value}','year':year,'prefix':'PVL','scope':'Both provincial directions, all provinces; Afghan Solar Hijri year','can_configure':request.user.is_staff})

@api_view(['POST'])
def movements(request,pk):
    account=province_account(pk)
    data=dict(request.data);data['account']=account.pk;data['agency']=account.agency_id;data['province']=account.province_id or account.agency.province_id
    if data.get('category') not in set(REPRESENTATIVE_MOVEMENTS)|{'REVERSAL'}:raise ValidationError({'category':'نوع گردش نماینده معتبر نیست.'})
    return Response(document_data(confirm(data,request.user)),status=201)

OUTGOING_CATEGORIES={'RECEIPT','DISTRIBUTION','SALARY','EXPENSE','SHOP_RENT','COLLEAGUE_LOAN','COLLEAGUE_DEPOSIT','CUSTOMER_LOAN','CUSTOMER_CREDIT','PUBLIC_DEPOSIT','OPENING'}
OUTGOING_COUNTERPARTS={'COLLEAGUE_LOAN':('COLLEAGUE','بدهکار همکار'),'COLLEAGUE_DEPOSIT':('COLLEAGUE','طلبکار همکار'),'CUSTOMER_LOAN':('KABUL_DEBTOR','بدهکار'),'CUSTOMER_CREDIT':('CREDITOR','طلبکار مردم'),'PUBLIC_DEPOSIT':('CASH','سپرده‌گذار')}

def outgoing_account(pk):
    return get_object_or_404(
        FinancialAccount.objects.select_related('agency','agency__province','province'),
        pk=pk,kind='AGENCY',profile__outgoing_workspace=True,
    )

def outgoing_agency_data(account):
    province=account.province or (account.agency.province if account.agency_id else None)
    return {
        'id':account.pk,
        'agency':account.agency_id,
        'name':account.name,
        'phone':account.agency.phone if account.agency_id else account.profile.get('phone',''),
        'province':province.code if province else None,
        'province_name':province.name if province else None,
        'active':account.active,
    }

def outgoing_toman_balance_status(balance):
    if balance>0:return 'نمایندگی بدهکار دفتر مرکزی است'
    if balance<0:return 'نمایندگی طلبکار دفتر مرکزی است'
    return 'حساب تومان تصفیه است'

def outgoing_toman_balances(accounts):
    account_ids=[account.pk for account in accounts]
    balances={account_id:{'received':Decimal(0),'distributed':Decimal(0)} for account_id in account_ids}
    documents=FinancialDocument.objects.filter(
        account_id__in=account_ids,
        status='CONFIRMED',
        currency_id='TOMAN',
    ).filter(
        Q(category__in=['RECEIPT','DISTRIBUTION'])|
        Q(reversal_of__category__in=['RECEIPT','DISTRIBUTION'])
    ).select_related('reversal_of').only(
        'account_id','category','amount','reversal_of_id','reversal_of__category',
    )
    for doc in documents:
        category=doc.reversal_of.category if doc.reversal_of_id else doc.category
        key='received' if category=='RECEIPT' else 'distributed'
        sign=Decimal(-1) if doc.reversal_of_id else Decimal(1)
        balances[doc.account_id][key]+=doc.amount*sign
    results={}
    for account_id,values in balances.items():
        balance=values['received']-values['distributed']
        results[account_id]={
            'toman_balance':money(balance),
            'toman_balance_status':outgoing_toman_balance_status(balance),
        }
    return results

@api_view(['GET','POST'])
def outgoing_agencies(request):
    if request.method=='POST':
        name=str(request.data.get('name','')).strip()
        phone=str(request.data.get('phone','')).strip()
        province_code=str(request.data.get('province','')).strip()
        if not name or len(name)>200:raise ValidationError({'name':'نام مدیر نمایندگی الزامی است.'})
        if not phone or len(phone)>50:raise ValidationError({'phone':'شماره تماس مدیر نمایندگی الزامی است.'})
        province=get_object_or_404(Province,pk=province_code) if province_code else None
        with transaction.atomic():
            agency=Agency.objects.create(province=province,name=name,phone=phone)
            account=FinancialAccount.objects.create(kind='AGENCY',name=name,agency=agency,province=province,profile={'phone':phone,'outgoing_workspace':True})
        return Response(outgoing_agency_data(account),status=201)
    accounts=FinancialAccount.objects.filter(
        kind='AGENCY',profile__outgoing_workspace=True,active=True,
    ).select_related('agency','agency__province','province')
    province_code=request.query_params.get('province')
    if province_code=='unassigned':
        accounts=accounts.filter(province__isnull=True,agency__province__isnull=True)
    elif province_code:
        province=get_object_or_404(Province,pk=province_code)
        accounts=accounts.filter(Q(province=province)|Q(agency__province=province))
    accounts=list(accounts.order_by('name','id'))
    toman_balances=outgoing_toman_balances(accounts)
    return Response({'results':[
        {**outgoing_agency_data(row),**toman_balances[row.pk]}
        for row in accounts
    ]})

@api_view(['GET','PATCH'])
def outgoing_agency_detail(request,pk):
    account=outgoing_account(pk)
    if request.method=='PATCH':
        name=str(request.data.get('name',account.name)).strip()
        phone=str(request.data.get('phone',account.agency.phone if account.agency_id else account.profile.get('phone',''))).strip()
        province=account.province or (account.agency.province if account.agency_id else None)
        if 'province' in request.data:
            province_code=str(request.data.get('province','')).strip()
            province=get_object_or_404(Province,pk=province_code) if province_code else None
        if not name or len(name)>200:raise ValidationError({'name':'نام مدیر نمایندگی الزامی است.'})
        if not phone or len(phone)>50:raise ValidationError({'phone':'شماره تماس مدیر نمایندگی الزامی است.'})
        with transaction.atomic():
            account.name=name
            account.province=province
            account.profile={**account.profile,'phone':phone}
            account.save(update_fields=['name','profile','province'])
            if account.agency_id:
                account.agency.name=name
                account.agency.phone=phone
                account.agency.province=province
                account.agency.save(update_fields=['name','phone','province'])
    return Response(outgoing_agency_data(account))

def outgoing_period_rows(account,params):
    rows=FinancialDocument.objects.filter(account=account,status='CONFIRMED').select_related('operator','reversal_of').order_by('-date','-id')
    month=params.get('month')
    if month:
        start,end,_=month_bounds(month)
        rows=rows.filter(date__gte=start,date__lt=end)
    return rows

def outgoing_summary(rows,central_rows=None):
    totals={'received_afn':Decimal(0),'received_toman':Decimal(0),'distributed_afn':Decimal(0),'distributed_toman':Decimal(0),'expenses':Decimal(0),'toman_profit':Decimal(0),'salary':Decimal(0),'shop_rent':Decimal(0),'colleague_debt':Decimal(0),'colleague_credit':Decimal(0),'people_debt':Decimal(0),'people_credit':Decimal(0),'people_deposit':Decimal(0),'capital':Decimal(0)}
    for doc in rows:
        category=doc.reversal_of.category if doc.reversal_of_id else doc.category
        sign=Decimal(-1) if doc.reversal_of_id else Decimal(1)
        amount=doc.amount*sign
        if category=='RECEIPT':
            if doc.currency_id=='AFN':totals['received_afn']+=amount
            elif doc.currency_id=='TOMAN':totals['received_toman']+=amount
        elif category=='DISTRIBUTION':
            if doc.currency_id=='AFN':totals['distributed_afn']+=amount
            elif doc.currency_id=='TOMAN':totals['distributed_toman']+=amount
        elif category=='EXPENSE' and doc.currency_id=='AFN':totals['expenses']+=amount
        elif category=='SALARY' and doc.currency_id=='AFN':totals['salary']+=amount
        elif category=='SHOP_RENT' and doc.currency_id=='AFN':totals['shop_rent']+=amount
        elif category=='COLLEAGUE_LOAN':totals['colleague_debt']+=amount
        elif category=='COLLEAGUE_DEPOSIT':totals['colleague_credit']+=amount
        elif category=='CUSTOMER_LOAN':totals['people_debt']+=amount
        elif category=='CUSTOMER_CREDIT':totals['people_credit']+=amount
        elif category=='PUBLIC_DEPOSIT':totals['people_deposit']+=amount
        elif category=='OPENING':totals['capital']+=amount
    if totals['distributed_afn']:
        with localcontext() as context:
            context.prec=50
            totals['toman_profit']=(totals['distributed_toman']/totals['distributed_afn']).quantize(Decimal('.000000001'),rounding=ROUND_HALF_UP)
    central_received=totals['received_afn']
    central_distributed=totals['distributed_afn']
    if central_rows is not None:
        central_received=central_distributed=Decimal(0)
        for doc in central_rows:
            category=doc.reversal_of.category if doc.reversal_of_id else doc.category
            amount=doc.amount*(Decimal(-1) if doc.reversal_of_id else Decimal(1))
            if doc.currency_id=='AFN' and category=='RECEIPT':central_received+=amount
            elif doc.currency_id=='AFN' and category=='DISTRIBUTION':central_distributed+=amount
    balance=central_received-central_distributed
    report_additions=totals['received_afn']+totals['people_deposit']+totals['colleague_credit']
    report_deductions=totals['distributed_afn']+totals['expenses']+totals['people_debt']+totals['people_credit']
    report_balance=report_additions-report_deductions
    toman_balance=totals['received_toman']-totals['distributed_toman']
    totals.update(
        central_office_balance_afn=balance,
        central_office_status='نمایندگی بدهکار دفتر مرکزی است' if balance>0 else 'دفتر مرکزی بدهکار نمایندگی است' if balance<0 else 'حساب دفتر مرکزی تصفیه است',
        central_report_additions_afn=report_additions,
        central_report_deductions_afn=report_deductions,
        central_report_balance_afn=report_balance,
        central_report_status='نمایندگی بدهکار دفتر مرکزی است' if report_balance>0 else 'دفتر مرکزی بدهکار نمایندگی است' if report_balance<0 else 'حساب دفتر مرکزی تصفیه است',
        toman_balance=toman_balance,
        toman_balance_status=outgoing_toman_balance_status(toman_balance),
    )
    return {key:(format(value,'.9f') if key=='toman_profit' else money(value)) if isinstance(value,Decimal) else value for key,value in totals.items()}

def create_outgoing_agency_transaction(account,data,operator):
    category=data.get('category')
    if category not in OUTGOING_CATEGORIES:raise ValidationError({'category':'نوع معامله نمایندگی معتبر نیست.'})
    if data.get('currency') not in {'AFN','TOMAN'}:raise ValidationError({'currency':'در این بخش فقط افغانی یا تومان ثبت می‌شود.'})
    if category in {'SALARY','EXPENSE','SHOP_RENT'} and data.get('currency')!='AFN':raise ValidationError({'currency':'معاش، مصارف و کرایه دکان باید به افغانی ثبت شوند.'})
    if category in set(OUTGOING_COUNTERPARTS)|{'OPENING'} and data.get('currency')!='AFN':raise ValidationError({'currency':'این حساب نمایندگی باید به افغانی ثبت شود.'})
    details=data.get('details') or {}
    if not isinstance(details,dict):raise ValidationError({'details':'جزئیات معامله معتبر نیست.'})
    details={key:value for key,value in details.items() if key in {'notes','purpose','counterparty_name'}}
    if 'notes' in details and (not isinstance(details['notes'],str) or len(details['notes'])>2000):raise ValidationError({'notes':'یادداشت معامله نباید بیشتر از ۲۰۰۰ حرف باشد.'})
    if 'purpose' in details and (not isinstance(details['purpose'],str) or len(details['purpose'])>250):raise ValidationError({'purpose':'شرح معامله معتبر نیست.'})
    if category=='OPENING':
        details['purpose']='AGENCY_CAPITAL'
    with transaction.atomic():
        if category in OUTGOING_COUNTERPARTS:
            name=str(details.get('counterparty_name','')).strip()
            if not name or len(name)>200:raise ValidationError({'counterparty_name':'نام همکار، قرض‌دار یا امانت‌گذار الزامی است.'})
            kind,_=OUTGOING_COUNTERPARTS[category]
            counterpart=FinancialAccount.objects.filter(kind=kind,agency=account.agency,name=name,active=True).first()
            if not counterpart:
                counterpart=FinancialAccount.objects.create(kind=kind,name=name,agency=account.agency)
            details['counterparty_account']=counterpart.pk
        data.update(
            account=account.pk,
            agency=account.agency_id,
            province=account.province_id or (account.agency.province_id if account.agency_id else None),
            details=details,
        )
        return confirm(data,operator)

@api_view(['GET','POST'])
def outgoing_agency_transactions(request,pk):
    account=outgoing_account(pk)
    if request.method=='POST':
        data=dict(request.data)
        if 'transactions' in data:
            batch=data.get('transactions')
            if not isinstance(batch,list) or not batch or len(batch)>20:raise ValidationError({'transactions':'حداقل یک و حداکثر ۲۰ ثبت لازم است.'})
            with transaction.atomic():
                docs=[]
                for item in batch:
                    if not isinstance(item,dict):raise ValidationError({'transactions':'ساختار ثبت‌ها معتبر نیست.'})
                    transaction_data=dict(item)
                    transaction_data.setdefault('date',data.get('date'))
                    docs.append(create_outgoing_agency_transaction(account,transaction_data,request.user))
            return Response({'results':[document_data(doc) for doc in docs],'count':len(docs)},status=201)
        doc=create_outgoing_agency_transaction(account,data,request.user)
        return Response(document_data(doc),status=201)
    rows=outgoing_period_rows(account,request.query_params)
    all_rows=list(rows)
    central_rows=None
    if request.query_params.get('month'):
        _,period_end,_=month_bounds(request.query_params['month'])
        central_rows=list(FinancialDocument.objects.filter(account=account,status='CONFIRMED',date__lt=period_end).select_related('reversal_of'))
    try:
        page=int(request.query_params.get('page',1));size=int(request.query_params.get('pageSize',20))
        if page<1 or size not in {10,20,50,100}:raise ValueError
    except (TypeError,ValueError):raise ValidationError({'page':'صفحه‌بندی معتبر نیست.'})
    count=len(all_rows)
    return Response({'account':account.pk,'month':request.query_params.get('month') or None,'summary':outgoing_summary(all_rows,central_rows),'results':[document_data(doc) for doc in all_rows[(page-1)*size:page*size]],'count':count,'page':page,'pageSize':size,'totalPages':max(1,(count+size-1)//size)})


@api_view(['GET','POST'])
def customer_payments(request,pk):
    account=province_account(pk,workspace_value(request.data if request.method=='POST' else request.query_params))
    if request.method=='GET':
        return Response({'account':account_data(account),'results':customer_balances(account)})
    data=dict(request.data)
    data.update(account=account.pk,agency=account.agency_id,province=account.province_id or account.agency.province_id,category='PROVINCIAL_PAYMENT')
    return Response(document_data(confirm(data,request.user)),status=201)


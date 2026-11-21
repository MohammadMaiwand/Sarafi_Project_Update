"""Provincial customer history, identity rename, Shamsi reports and Toman settlements."""
from datetime import timedelta
from decimal import Decimal
import jdatetime
from django.db import transaction
from django.db.models import Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.decorators import api_view
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from .models import Remittance, ProvincialPerson, ProvincialDistribution, ProvincialRemainingTransaction
from .remittance_views import pagination, filtered_rows, balance, present_balance, lock_person
from .remittance_serializers import RemittanceListSerializer, ProvincialPersonSerializer, DistributionSerializer
from .debtor_views import KABUL


def text_money(value):
    return str(Decimal(value).quantize(Decimal('.001')))


def toman_balance(person):
    received = Remittance.objects.filter(kind='provincial-received',recipientName=person.recipientName,deleted_at__isnull=True).aggregate(v=Sum('tomanAmount'))['v'] or Decimal(0)
    deducted = person.remaining_transactions.aggregate(v=Sum('amount'))['v'] or Decimal(0)
    return {'receivedToman':text_money(received),'deductedToman':text_money(deducted),'remainingToman':text_money(received-deducted)}


def customer_history(request, name=None, source_id=None):
    source=None
    rows=Remittance.objects.filter(kind='provincial-received',deleted_at__isnull=True)
    if source_id is not None:
        source=get_object_or_404(rows,pk=source_id)
        name=source.recipientName
        rows=rows.filter(pk=source.pk)  # ID mode is always exactly one historical row.
    else:
        rows=rows.filter(recipientName=name)
    totals=rows.aggregate(totalToman=Sum('tomanAmount'),totalUsd=Sum('usdAmount'),totalAfn=Sum('afnAmount'))
    first=rows.order_by('-transactionDate','-id').first()
    father=rows.exclude(recipientFatherName='').order_by('-transactionDate','-id').values_list('recipientFatherName',flat=True).first() or ''
    person=ProvincialPerson.objects.filter(recipientName=name).first() if name else None
    customer=ProvincialPersonSerializer(person).data if person else {'recipientName':name or '', 'recipientFatherName':father}
    if not customer.get('recipientFatherName'):customer['recipientFatherName']=father
    count=rows.count()
    entries=ProvincialDistribution.objects.filter(recipientName=name,deleted_at__isnull=True).order_by('-transactionDate','-id') if name else ProvincialDistribution.objects.none()
    visible=filtered_rows(request,rows)
    search=request.query_params.get('search','').strip()
    if search:visible=visible.filter(Q(hawalaNumber__icontains=search)|Q(description__icontains=search)|Q(moneyTransaction__icontains=search))
    direction=request.query_params.get('sortDir','desc')
    if direction not in ['asc','desc']:raise ValidationError({'message':'ترتیب نمایش معتبر نیست.'})
    visible=visible.order_by(('-' if direction=='desc' else '')+'transactionDate','-id')
    return Response({**pagination(request,visible,RemittanceListSerializer),'customer':customer,
        'totals':{**{key:text_money(value or 0) for key,value in totals.items()},'transactionCount':count},
        'sourceRemittanceId':first.pk if first else None,'singleRecordMode':source_id is not None,
        'missingRecipientName':bool(source and not name),
        'balance':present_balance(name) if name else {'received':text_money(source.afnAmount),'paid':'0.000','remaining':text_money(source.afnAmount)},
        'tomanBalance':toman_balance(person) if person else {'receivedToman':text_money(totals['totalToman'] or 0),'deductedToman':'0.000','remainingToman':text_money(totals['totalToman'] or 0)},
        'distributions':DistributionSerializer(entries,many=True).data})


class CustomerRenameSerializer(serializers.Serializer):
    currentRecipientName=serializers.CharField(max_length=200)
    recipientName=serializers.CharField(max_length=200)
    recipientFatherName=serializers.CharField(max_length=200,allow_blank=True,required=False,default='')


@api_view(['PUT'])
def rename_customer(request):
    serializer=CustomerRenameSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data=serializer.validated_data
    old,new,father=data['currentRecipientName'],data['recipientName'],data['recipientFatherName']
    with transaction.atomic():
        if not ProvincialPerson.objects.filter(recipientName=old).exists() and not Remittance.objects.filter(kind='provincial-received',recipientName=old).exists():
            return Response({'message':'مشتری یافت نشد.'},status=404)
        person=lock_person(old)
        if old!=new and (ProvincialPerson.objects.exclude(pk=person.pk).filter(recipientName=new).exists() or Remittance.objects.filter(kind='provincial-received',recipientName=new).exists() or ProvincialDistribution.objects.filter(recipientName=new).exists()):
            raise ValidationError({'recipientName':'این نام به حساب مشتری دیگری تعلق دارد؛ ادغام خودکار انجام نمی‌شود.'})
        person.recipientName=new;person.recipientFatherName=father
        person.save(update_fields=['recipientName','recipientFatherName'])
        updated=Remittance.objects.filter(kind='provincial-received',recipientName=old).update(recipientName=new,recipientFatherName=father,updated_at=timezone.now())
        ProvincialDistribution.objects.filter(Q(person=person)|Q(recipientName=old)).update(person=person,recipientName=new,recipientFatherName=father,updated_at=timezone.now())
    return Response({'customer':ProvincialPersonSerializer(person).data,'updatedRemittances':updated,'balance':present_balance(new),'tomanBalance':toman_balance(person)})


def shamsi_period(request):
    now=jdatetime.date.fromgregorian(date=timezone.now().astimezone(KABUL).date())
    try:
        year=int(request.query_params.get('year') or now.year)
        raw=request.query_params.get('month')
        month=None if raw in (None,'','all') else int(raw)
        if not 1200<=year<=1600 or month is not None and not 1<=month<=12:raise ValueError
        start=jdatetime.date(year,month or 1,1).togregorian()
        if month is None or month==12:next_day=jdatetime.date(year+1,1,1).togregorian()
        else:next_day=jdatetime.date(year,month+1,1).togregorian()
    except (ValueError,TypeError,OverflowError):
        raise ValidationError({'message':'سال یا ماه شمسی معتبر نیست.'})
    return {'year':year,'month':month,'fromDate':start.isoformat(),'toDate':(next_day-timedelta(days=1)).isoformat()}


@api_view(['GET'])
def customers_summary(request):
    period=shamsi_period(request)
    receipts=Remittance.objects.filter(kind='provincial-received',deleted_at__isnull=True,transactionDate__range=(period['fromDate'],period['toDate'])).order_by('id')
    distributions=ProvincialDistribution.objects.filter(deleted_at__isnull=True,transactionDate__range=(period['fromDate'],period['toDate']))
    people={p.recipientName:p for p in ProvincialPerson.objects.all()}
    grouped={}
    for row in receipts:
        item=grouped.setdefault(row.recipientName,{'recipientName':row.recipientName,'recipientFatherName':row.recipientFatherName,'transactionCount':0,'totalReceived':Decimal(0),'totalDistributed':Decimal(0),'sourceRemittanceId':row.pk})
        if not item['recipientFatherName']:item['recipientFatherName']=row.recipientFatherName
        item['transactionCount']+=1;item['totalReceived']+=row.afnAmount
    for row in distributions:
        item=grouped.setdefault(row.recipientName,{'recipientName':row.recipientName,'recipientFatherName':row.recipientFatherName,'transactionCount':0,'totalReceived':Decimal(0),'totalDistributed':Decimal(0),'sourceRemittanceId':None})
        item['totalDistributed']+=row.afnAmount
    rows=[];grand={'transactionCount':0,'totalReceived':Decimal(0),'totalDistributed':Decimal(0),'remaining':Decimal(0)}
    search=request.query_params.get('search','').strip().casefold()
    for name,item in sorted(grouped.items()):
        person=people.get(name)
        if person:
            item.update(personId=person.pk,recipientFatherName=person.recipientFatherName or item['recipientFatherName'])
        if search and search not in f"{name} {item['recipientFatherName']}".casefold():continue
        item['remaining']=item['totalReceived']-item['totalDistributed']
        for key in grand:grand[key]+=item[key]
        rows.append({key:text_money(value) if isinstance(value,Decimal) else value for key,value in item.items()})
    return Response({'period':period,'currency':'AFN','customers':rows,'grandTotal':{key:text_money(value) if isinstance(value,Decimal) else value for key,value in grand.items()}})


class DeductionSerializer(serializers.Serializer):
    customerId=serializers.IntegerField(min_value=1)
    referenceId=serializers.IntegerField(min_value=1)
    amount=serializers.DecimalField(max_digits=24,decimal_places=3,min_value=Decimal('.001'))


def present_settlement(row):
    return {'id':row.pk,'type':'remaining','currency':'TOMAN','referenceId':row.source_id,'amount':text_money(row.amount),'balanceAfter':text_money(row.balanceAfter),'createdAt':row.createdAt.isoformat()}


@api_view(['GET'])
def customer_remaining(request, person_id):
    person=get_object_or_404(ProvincialPerson,pk=person_id)
    rows=Remittance.objects.filter(kind='provincial-received',recipientName=person.recipientName,deleted_at__isnull=True,tomanAmount__gt=0,toman_settlement__isnull=True)
    items=[{'id':row.pk,'referenceId':row.pk,'title':row.hawalaNumber,'transactionDate':row.transactionDate.isoformat(),'amount':text_money(row.tomanAmount),'currency':'TOMAN'} for row in rows]
    values=toman_balance(person)
    return Response({'customer':ProvincialPersonSerializer(person).data,'balance':values['remainingToman'],'currency':'TOMAN','items':items,'tomanBalance':values,'afnBalance':present_balance(person.recipientName)})


@api_view(['GET'])
def customer_remaining_history(request, person_id):
    person=get_object_or_404(ProvincialPerson,pk=person_id)
    return Response({'transactions':[present_settlement(row) for row in person.remaining_transactions.all()],'balance':toman_balance(person)['remainingToman'],'currency':'TOMAN'})


@api_view(['POST'])
def create_remaining_transaction(request):
    serializer=DeductionSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    values=serializer.validated_data
    with transaction.atomic():
        person=get_object_or_404(ProvincialPerson.objects.select_for_update(),pk=values['customerId'])
        source=get_object_or_404(Remittance.objects.select_for_update(),pk=values['referenceId'],kind='provincial-received',recipientName=person.recipientName,deleted_at__isnull=True)
        if ProvincialRemainingTransaction.objects.filter(source=source).exists():
            raise ValidationError({'message':'تومان این حواله قبلاً کسر شده است.'})
        if values['amount']!=source.tomanAmount or source.tomanAmount<=0:
            raise ValidationError({'amount':'مبلغ انتخاب‌شده با مبلغ فعلی حواله مطابقت ندارد؛ صفحه را تازه کنید.'})
        current=Decimal(toman_balance(person)['remainingToman'])
        if values['amount']>current:
            raise ValidationError({'amount':'مبلغ از مانده تومان بیشتر است.'})
        row=ProvincialRemainingTransaction.objects.create(person=person,source=source,amount=values['amount'],balanceAfter=current-values['amount'])
    return Response(present_settlement(row),status=201)

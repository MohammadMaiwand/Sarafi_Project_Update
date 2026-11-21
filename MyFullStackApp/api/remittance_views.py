"""Remittance CRUD, customer ledger and provincial distribution workflows."""
import re
from datetime import date
from decimal import Decimal
from django.db import IntegrityError, transaction
from django.db.models import Q, Sum, Count
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from .models import Remittance, ProvincialDistribution, ProvincialPerson, ProvincialRemainingTransaction
from .finance_views import _allocate_number, _next_number
from .remittance_domain import CURRENCIES, MONEY_TRANSACTIONS
from .remittance_serializers import (
    RemittanceSerializer, RemittanceListSerializer, DistributionSerializer, ProvincialPersonSerializer,
)

KINDS = {'incoming': 'INC', 'outgoing': 'OUT', 'provincial-received': 'PRV'}


def pagination(request, rows, serializer):
    try:
        page = int(request.query_params.get('page', 1))
        size = int(request.query_params.get('pageSize', 20))
        if page < 1 or not 1 <= size <= 100:
            raise ValueError
    except (ValueError, TypeError):
        raise ValidationError({'message': 'شماره صفحه و تعداد رکورد معتبر نیست.'})
    count = rows.count() if hasattr(rows, 'query') else len(rows)
    return {'results': serializer(rows[(page-1)*size:page*size], many=True).data,
            'count': count, 'page': page, 'pageSize': size, 'totalPages': max(1, (count+size-1)//size)}


def filtered_rows(request, rows):
    params = request.query_params
    if params.get('month'):
        from .calendar_policy import month_bounds
        start,end,_=month_bounds(params['month'])
        rows=rows.filter(transactionDate__gte=start,transactionDate__lt=end)
    try:
        dates = {key: date.fromisoformat(params[key]) for key in ['dateFrom', 'dateTo'] if params.get(key)}
        if dates.get('dateFrom') and dates.get('dateTo') and dates['dateFrom'] > dates['dateTo']:
            raise ValueError
        for key, lookup in [('dateFrom', 'transactionDate__gte'), ('dateTo', 'transactionDate__lte')]:
            if key in dates:
                rows = rows.filter(**{lookup: dates[key]})
    except (ValueError, TypeError):
        raise ValidationError({'message': 'بازه تاریخ معتبر نیست.'})
    return rows


def lock_person(name, father=''):
    person, _ = ProvincialPerson.objects.get_or_create(recipientName=name, defaults={'recipientFatherName': father})
    return ProvincialPerson.objects.select_for_update().get(pk=person.pk)


def balance(name, exclude_remittance=None, exclude_entry=None):
    receipts = Remittance.objects.filter(kind='provincial-received', recipientName=name, deleted_at__isnull=True)
    entries = ProvincialDistribution.objects.filter(recipientName=name, deleted_at__isnull=True)
    if exclude_remittance:
        receipts = receipts.exclude(pk=exclude_remittance)
    if exclude_entry:
        entries = entries.exclude(pk=exclude_entry)
    received = receipts.aggregate(v=Sum('afnAmount'))['v'] or Decimal(0)
    paid = entries.aggregate(v=Sum('afnAmount'))['v'] or Decimal(0)
    return {'received': received, 'paid': paid, 'remaining': received-paid}


def present_balance(name):
    # JSON floats lose precision for large money amounts; API money stays decimal text.
    return {key: str(value) for key, value in balance(name).items()}


def protect_receipt_balance(row, values=None):
    if row.kind != 'provincial-received':
        return
    if ProvincialRemainingTransaction.objects.filter(source=row).exists():
        if values is None:
            raise ValidationError({'message': 'تومان این حواله تسویه شده است؛ حذف حواله مجاز نیست.'})
        if values.get('tomanAmount', row.tomanAmount) != row.tomanAmount or values.get('recipientName', row.recipientName) != row.recipientName:
            raise ValidationError({'message': 'تومان این حواله تسویه شده است؛ مبلغ تومان یا مشتری را تغییر ندهید. برای تغییر نام از ویرایش مشتری استفاده کنید.'})
    new_name = values.get('recipientName', row.recipientName) if values is not None else None
    new_amount = values.get('afnAmount', row.afnAmount) if values is not None else Decimal(0)
    if row.recipientName:
        lock_person(row.recipientName, row.recipientFatherName)
    account = balance(row.recipientName, exclude_remittance=row.pk)
    if new_name == row.recipientName:
        account['remaining'] += new_amount
    if account['remaining'] < 0:
        raise ValidationError({'message': 'این تغییر حساب مشتری را منفی می‌کند؛ ابتدا توزیعات مرتبط را اصلاح کنید.'})
    if new_name and new_name != row.recipientName:
        lock_person(new_name, values.get('recipientFatherName', ''))


@api_view(['GET'])
def remittance_options(request):
    from .models import Customer
    return Response({'currencies': CURRENCIES, 'moneyTransactions': MONEY_TRANSACTIONS,
                     'customers':list(Customer.objects.values('id','name','phone')),
                     'fingerprint': {'status': 'deferred', 'marker': 'FINGERPRINT_DEVICE_INTEGRATION'}})


@api_view(['GET', 'POST'])
def remittances(request, kind):
    if kind not in KINDS:
        return Response(status=404)
    if request.method == 'POST':
        serializer = RemittanceSerializer(data=request.data, context={'kind': kind})
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                values = serializer.validated_data
                manual = values.pop('manualNumber', None)
                explicit_number = values.pop('hawalaNumber', '')
                if kind == 'provincial-received':
                    lock_person(values['recipientName'], values.get('recipientFatherName', ''))
                if explicit_number:
                    expected = re.fullmatch(rf"{KINDS[kind]}-{values['transactionDate'].year}-(\d+)", explicit_number)
                    if expected:
                        sequence = int(expected.group(1))
                        if not 1 <= sequence <= 999999999:
                            raise ValidationError({'hawalaNumber': 'شماره دستی باید عدد صحیح مثبت باشد.'})
                        number, _ = _allocate_number(KINDS[kind], values['transactionDate'], Remittance, 'hawalaNumber', sequence)
                    else:
                        number = explicit_number
                else:
                    number, _ = _allocate_number(KINDS[kind], values['transactionDate'], Remittance, 'hawalaNumber', manual)
                serializer.save(kind=kind, hawalaNumber=number)
        except IntegrityError:
            raise ValidationError({'hawalaNumber': 'این شماره قبلاً ثبت شده است؛ شماره را تازه‌سازی کنید.'})
        except ValidationError as error:
            if isinstance(error.detail, dict) and 'manual_sequence' in error.detail:
                raise ValidationError({'manualNumber': 'این شماره قبلاً ثبت شده است.'})
            raise
        return Response(serializer.data, status=201)
    rows = Remittance.objects.filter(kind=kind, deleted_at__isnull=True)
    params = request.query_params
    search = params.get('search', '').strip()
    if search:
        condition = Q()
        for field in ['hawalaNumber', 'senderName', 'senderFatherName', 'receiverName', 'receiverFatherName', 'recipientName', 'recipientFatherName', 'nationalIdNumber', 'phoneNumber', 'location', 'description']:
            condition |= Q(**{f'{field}__icontains': search})
        rows = rows.filter(condition)
    rows = filtered_rows(request, rows)
    if kind=='outgoing' and 'receiverName' in params:
        rows=rows.filter(receiverName=params['receiverName'],receiverFatherName=params.get('receiverFatherName',''))
    for field in ['currencyType', 'moneyTransaction', 'recipientName']:
        if params.get(field):
            rows = rows.filter(**{field: params[field]})
    if params.get('sourceRemittance'):
        try:
            source_id = int(params['sourceRemittance'])
        except (ValueError, TypeError):
            raise ValidationError({'sourceRemittance': 'شناسه حواله معتبر نیست.'})
        source = get_object_or_404(Remittance, pk=source_id, kind=kind, deleted_at__isnull=True)
        rows = rows.filter(recipientName=source.recipientName) if source.recipientName else rows.filter(pk=source.pk)
    sort = {'transaction_date': 'transactionDate', 'transactionDate': 'transactionDate', 'hawalaNumber': 'hawalaNumber', 'afnAmount': 'afnAmount'}.get(params.get('sortBy', 'transaction_date'))
    if not sort or params.get('sortDir', 'desc') not in ['asc', 'desc']:
        raise ValidationError({'message': 'ترتیب نمایش معتبر نیست.'})
    rows = rows.order_by(('-' if params.get('sortDir', 'desc') == 'desc' else '') + sort, '-id')
    if kind=='incoming' and params.get('customerKey'):
        from .remittance_groups import customer_key
        rows=rows.filter(pk__in=[row.pk for row in rows if customer_key(row)==params['customerKey']])
    totals = rows.aggregate(totalAfn=Sum('afnAmount'), totalProfit=Sum('profitAmount'), totalTomanProfit=Sum('tomanProfit'))
    extra={}
    if kind=='outgoing':
        extra['currencyTotals']=[{'currency':item['currencyType'],'amount':str(item['total'])} for item in rows.values('currencyType').annotate(total=Sum('sourceAmount'))]
        extra['totalUsd']=str(rows.filter(currencyType='USD').aggregate(total=Sum('sourceAmount'))['total'] or 0)
        extra['totalToman']=str(rows.filter(currencyType='TOMAN').aggregate(total=Sum('sourceAmount'))['total'] or 0)
    if kind=='incoming':
        from .remittance_groups import customer_totals
        extra['customerTotals']=customer_totals(rows)
        known=rows.filter(tomanAmountKnown=True)
        extra['totalToman']=str(known.aggregate(total=Sum('tomanAmount'))['total']) if known.exists() else None
        extra['missingTomanCount']=rows.filter(tomanAmountKnown=False).count()
        known_afn=rows.filter(afnAmountKnown=True)
        extra['knownTotalAfn']=str(known_afn.aggregate(total=Sum('afnAmount'))['total']) if known_afn.exists() else None
        extra['totalAfn']=extra['knownTotalAfn'] if rows.exists() else '0'
        extra['missingAfnCount']=rows.filter(afnAmountKnown=False).count()
    extra['manualProfitTotals']=[{'currency':item['manualProfitCurrency'] or None,'amount':str(item['total'])} for item in rows.exclude(manualProfit=None).values('manualProfitCurrency').annotate(total=Sum('manualProfit'))]
    return Response({**pagination(request, rows, RemittanceListSerializer), **{key: str(value or 0) for key, value in totals.items()},**extra})

@api_view(['PATCH'])
def outgoing_customer(request):
    old=request.data.get('currentName');father=request.data.get('currentFather','')
    name=str(request.data.get('name','')).strip();new_father=str(request.data.get('father','')).strip()
    if not isinstance(old,str) or not name or len(name)>200 or len(new_father)>200:raise ValidationError({'name':'نام و ولد معتبر وارد کنید.'})
    with transaction.atomic():
        rows=Remittance.objects.select_for_update().filter(kind='outgoing',deleted_at__isnull=True,receiverName=old,receiverFatherName=father)
        if not rows.exists():return Response({'message':'مشتری یافت نشد.'},status=404)
        if (old,father)!=(name,new_father) and Remittance.objects.filter(kind='outgoing',deleted_at__isnull=True,receiverName=name,receiverFatherName=new_father).exists():raise ValidationError({'name':'این نام و ولد مربوط به مشتری دیگری است.'})
        count=rows.update(receiverName=name,receiverFatherName=new_father,updated_at=timezone.now())
    return Response({'name':name,'father':new_father,'updated':count})


@api_view(['GET'])
def next_number(request, kind):
    if kind not in KINDS:
        return Response(status=404)
    try:
        year = date.fromisoformat(request.query_params.get('date') or timezone.localdate().isoformat()).year
    except ValueError:
        raise ValidationError({'message': 'تاریخ معتبر نیست.'})
    return Response({'number': _next_number(KINDS[kind], year)})


@api_view(['GET', 'PUT', 'PATCH', 'DELETE'])
def remittance_detail(request, kind, pk):
    if request.method == 'GET':
        row = get_object_or_404(Remittance, pk=pk, kind=kind, deleted_at__isnull=True)
        return Response(RemittanceSerializer(row).data)
    with transaction.atomic():
        row = get_object_or_404(Remittance.objects.select_for_update(), pk=pk, kind=kind, deleted_at__isnull=True)
        if request.method == 'DELETE':
            protect_receipt_balance(row)
            row.deleted_at = timezone.now()
            row.save(update_fields=['deleted_at', 'updated_at'])
            return Response(status=204)
        serializer = RemittanceSerializer(row, data=request.data, partial=request.method == 'PATCH', context={'kind': kind})
        serializer.is_valid(raise_exception=True)
        serializer.validated_data.pop('manualNumber', None)
        protect_receipt_balance(row, serializer.validated_data)
        serializer.save()
    return Response(serializer.data)


@api_view(['GET'])
def provincial_customers(request):
    receipts = Remittance.objects.filter(kind='provincial-received', deleted_at__isnull=True)
    paid = {r['recipientName']: r['total'] for r in ProvincialDistribution.objects.filter(deleted_at__isnull=True).values('recipientName').annotate(total=Sum('afnAmount'))}
    people = {p.recipientName: p for p in ProvincialPerson.objects.all()}
    rows = []
    for item in receipts.values('recipientName').annotate(received=Sum('afnAmount'), remittanceCount=Count('id')):
        person = people.get(item['recipientName'])
        item.update(personId=person.pk if person else None, recipientFatherName=person.recipientFatherName if person else '', paid=paid.get(item['recipientName'], Decimal(0)))
        item['remaining'] = item['received']-item['paid']
        rows.append(item)
    search = request.query_params.get('search', '').strip().casefold()
    if search:
        rows = [r for r in rows if search in f"{r['recipientName']} {r['recipientFatherName']}".casefold()]
    rows.sort(key=lambda r: r['recipientName'])
    class RowSerializer:
        def __init__(self, rows, many=False): self.data = rows
    totals = {key: str(sum((row[key] for row in rows), Decimal(0))) for key in ['received', 'paid', 'remaining']}
    for row in rows:
        for key in ['received', 'paid', 'remaining']:
            row[key] = str(row[key])
    return Response({**pagination(request, rows, RowSerializer), **totals})


@api_view(['GET'])
def provincial_customer_history(request, name=None, source_id=None):
    from .provincial_customer_views import customer_history
    return customer_history(request, name=name, source_id=source_id)


@api_view(['GET', 'POST'])
def provincial_people(request):
    if request.method == 'POST':
        serializer = ProvincialPersonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        person = serializer.save()
        return Response({**serializer.data, **present_balance(person.recipientName)}, status=201)
    rows = ProvincialPerson.objects.all()
    name = request.query_params.get('name', '').strip()
    search = request.query_params.get('search', '').strip()
    if name:
        rows = rows.filter(recipientName=name)
    elif search:
        rows = rows.filter(Q(recipientName__icontains=search) | Q(recipientFatherName__icontains=search))
    result = pagination(request, rows, ProvincialPersonSerializer)
    result['results'] = [{**r, **present_balance(r['recipientName'])} for r in result['results']]
    return Response(result)


@api_view(['GET', 'PATCH'])
def provincial_person_detail(request, person_id):
    person = get_object_or_404(ProvincialPerson, pk=person_id)
    if request.method == 'PATCH':
        if request.data.get('recipientName', person.recipientName).strip() != person.recipientName:
            raise ValidationError({'recipientName': 'برای حفظ ارتباط حساب‌ها، نام مشتری قابل تغییر نیست.'})
        serializer = ProvincialPersonSerializer(person, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
    return Response({**ProvincialPersonSerializer(person).data, **present_balance(person.recipientName)})


@api_view(['GET', 'POST'])
def distributions(request, person_id=None):
    person = get_object_or_404(ProvincialPerson, pk=person_id) if person_id is not None else None
    name = person.recipientName if person else request.query_params.get('customer', '').strip()
    if request.method == 'POST':
        payload = request.data.copy()
        if person:
            payload.update(recipientName=person.recipientName, recipientFatherName=person.recipientFatherName)
        serializer = DistributionSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        with transaction.atomic():
            person = lock_person(values['recipientName'], values.get('recipientFatherName', ''))
            account = balance(person.recipientName)
            if values['afnAmount'] > account['remaining']:
                raise ValidationError({'afnAmount': 'مبلغ توزیع از باقی‌مانده حساب بیشتر است.'})
            serializer.save(person=person)
        return Response(serializer.data, status=201)
    rows = ProvincialDistribution.objects.filter(deleted_at__isnull=True).order_by('-transactionDate', '-id')
    if name:
        rows = rows.filter(recipientName=name)
    search = request.query_params.get('search', '').strip()
    if search:
        rows = rows.filter(Q(recipientName__icontains=search) | Q(description__icontains=search))
    rows = filtered_rows(request, rows)
    result = pagination(request, rows, DistributionSerializer)
    if name:
        result.update(present_balance(name))
    else:
        received = Remittance.objects.filter(kind='provincial-received', deleted_at__isnull=True).aggregate(v=Sum('afnAmount'))['v'] or 0
        paid = ProvincialDistribution.objects.filter(deleted_at__isnull=True).aggregate(v=Sum('afnAmount'))['v'] or 0
        result.update(received=str(received), paid=str(paid), remaining=str(received-paid))
    result['customers'] = list(ProvincialPerson.objects.values_list('recipientName', flat=True))
    return Response(result)


@api_view(['GET', 'PATCH', 'DELETE'])
def distribution_detail(request, entry_id, person_id=None):
    with transaction.atomic():
        entries = ProvincialDistribution.objects.select_for_update().filter(deleted_at__isnull=True)
        if person_id is not None:
            entries = entries.filter(person_id=person_id)
        row = get_object_or_404(entries, pk=entry_id)
        if request.method == 'GET':
            return Response(DistributionSerializer(row).data)
        lock_person(row.recipientName, row.recipientFatherName)
        if request.method == 'DELETE':
            row.deleted_at = timezone.now()
            row.save(update_fields=['deleted_at', 'updated_at'])
            return Response(status=204)
        if request.data.get('recipientName', row.recipientName).strip() != row.recipientName:
            raise ValidationError({'recipientName': 'مشتری توزیع قابل تغییر نیست.'})
        serializer = DistributionSerializer(row, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        amount = serializer.validated_data.get('afnAmount', row.afnAmount)
        if amount > balance(row.recipientName, exclude_entry=row.pk)['remaining']:
            raise ValidationError({'afnAmount': 'مبلغ توزیع از باقی‌مانده حساب بیشتر است.'})
        serializer.save()
        return Response(serializer.data)

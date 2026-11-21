from datetime import date, datetime, time, timedelta
from decimal import Decimal, ROUND_HALF_UP
from zoneinfo import ZoneInfo
from django.db import transaction
from django.db.models import Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from .models import DebtorCustomer, DebtPayment
from .debtor_serializers import DebtorSerializer, DebtorListSerializer, DebtPaymentSerializer, account, money, CENT, MAX_MONEY
from .finance_views import _allocate_number, _next_number
from .remittance_views import pagination

KABUL = ZoneInfo('Asia/Kabul')

def active_debtor(pk, lock=False):
    rows = DebtorCustomer.objects.filter(deleted_at__isnull=True)
    return get_object_or_404(rows.select_for_update() if lock else rows, pk=pk)

def ensure_balance(value):
    if value < 0:
        raise ValidationError({'message': 'این عملیات باقی‌مانده قرض را منفی می‌کند؛ مبلغ یا رویدادهای مرتبط را اصلاح کنید.'})
    if value > MAX_MONEY:
        raise ValidationError({'message': 'باقی‌مانده از حد مجاز بیشتر است.'})

@api_view(['GET', 'POST'])
def debtors_api(request):
    if request.method == 'POST':
        serializer = DebtorSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            number, manual = _allocate_number('DC', timezone.now().astimezone(KABUL).date(), DebtorCustomer, 'customer_number', serializer.validated_data.pop('manual_sequence', None))
            serializer.save(customer_number=number, number_is_manual=manual)
        return Response(serializer.data, status=201)
    query = request.query_params
    kind = query.get('type', 'SMALL')
    if kind not in ['SMALL', 'LARGE']:
        raise ValidationError({'message': 'نوع مشتری معتبر نیست.'})
    rows = DebtorCustomer.objects.filter(deleted_at__isnull=True, debtor_type=kind)
    search = query.get('search', '').strip()
    if search:
        condition = Q()
        for field in ['customer_name', 'customer_number', 'father_name', 'national_id', 'location', 'phone_number']:
            condition |= Q(**{f'{field}__icontains': search})
        rows = rows.filter(condition)
    try:
        dates = {key: date.fromisoformat(query[key]) for key in ['dateFrom', 'dateTo'] if query.get(key)}
        if dates.get('dateFrom') and dates.get('dateTo') and dates['dateFrom'] > dates['dateTo']:
            raise ValueError
        if 'dateFrom' in dates:
            rows = rows.filter(created_at__gte=datetime.combine(dates['dateFrom'], time.min, KABUL))
        if 'dateTo' in dates:
            rows = rows.filter(created_at__lt=datetime.combine(dates['dateTo']+timedelta(days=1), time.min, KABUL))
    except (ValueError, TypeError, OverflowError):
        raise ValidationError({'message': 'بازه تاریخ معتبر نیست.'})
    sort = {'created_at':'created_at', 'customer_name':'customer_name', 'customer_number':'customer_number'}.get(query.get('sortBy', 'created_at'))
    direction = query.get('sortDir', 'desc')
    if not sort or direction not in ['asc', 'desc']:
        raise ValidationError({'message': 'ترتیب نمایش معتبر نیست.'})
    rows = list(rows.order_by(('-' if direction == 'desc' else '')+sort, '-id'))
    totals = {}
    for payment in DebtPayment.objects.filter(deleted_at__isnull=True, debtor_id__in=[row.pk for row in rows]).values('debtor_id','payment_type').annotate(amount=Sum('payment_usd_amount')):
        totals.setdefault(payment['debtor_id'], {})[payment['payment_type']] = payment['amount'] or Decimal(0)
    for row in rows:
        values = totals.get(row.pk, {})
        loan, paid = values.get('LOAN', Decimal(0)), values.get('PAYMENT', Decimal(0))
        row._debtor_balance = {'total_loan_usd':loan, 'total_paid_usd':paid, 'remaining_usd':row.original_usd_amount+loan-paid}
    status = query.get('debtStatus', '')
    if status not in ['', 'OPEN', 'PAID']:
        raise ValidationError({'message': 'وضعیت قرض معتبر نیست.'})
    if status:
        rows = [row for row in rows if (row._debtor_balance['remaining_usd'] == 0) == (status == 'PAID')]
    result = pagination(request, rows, DebtorListSerializer)
    result['debtors'] = result['results']
    result['summary'] = {key: money(sum((getattr(row, key) if key=='original_usd_amount' else row._debtor_balance[key] for row in rows), Decimal(0))) for key in ['original_usd_amount','total_loan_usd','total_paid_usd','remaining_usd']}
    return Response(result)

@api_view(['GET', 'PATCH', 'PUT', 'DELETE'])
def debtor_detail_api(request, debtor_id):
    if request.method == 'GET':
        debtor = active_debtor(debtor_id)
        return Response({**DebtorSerializer(debtor).data, 'payments':DebtPaymentSerializer(debtor.payments.filter(deleted_at__isnull=True), many=True).data})
    with transaction.atomic():
        debtor = active_debtor(debtor_id, lock=True)
        if request.method == 'DELETE':
            debtor.deleted_at = timezone.now()
            debtor.save(update_fields=['deleted_at','updated_at'])
            return Response(status=204)
        serializer = DebtorSerializer(debtor, data=request.data, partial=request.method=='PATCH')
        serializer.is_valid(raise_exception=True)
        serializer.validated_data.pop('manual_sequence', None)
        serializer.save()
    return Response(serializer.data)

@api_view(['GET', 'POST'])
def debtor_payments_api(request, debtor_id):
    if request.method == 'GET':
        debtor = active_debtor(debtor_id)
        return Response({'payments':DebtPaymentSerializer(debtor.payments.filter(deleted_at__isnull=True), many=True).data, **{key:money(value) for key,value in account(debtor).items()}})
    with transaction.atomic():
        debtor = active_debtor(debtor_id, lock=True)
        serializer = DebtPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        change = values['payment_usd_amount'] * (1 if values.get('payment_type','PAYMENT')=='LOAN' else -1)
        ensure_balance(account(debtor)['remaining_usd']+change)
        afn = (values['payment_usd_amount']*debtor.usd_rate).quantize(CENT, rounding=ROUND_HALF_UP)
        if afn > MAX_MONEY:
            raise ValidationError({'payment_usd_amount':'معادل افغانی از حد مجاز بیشتر است.'})
        serializer.save(debtor=debtor, usd_rate=debtor.usd_rate, payment_afn_amount=afn, payment_date=timezone.now().astimezone(KABUL).date())
    return Response({**serializer.data, **{key:money(value) for key,value in account(debtor).items()}}, status=201)

@api_view(['GET', 'PATCH', 'PUT', 'DELETE'])
def debtor_payment_detail_api(request, debtor_id, payment_id):
    with transaction.atomic():
        debtor = active_debtor(debtor_id, lock=request.method!='GET')
        payment = get_object_or_404(DebtPayment, pk=payment_id, debtor=debtor, deleted_at__isnull=True)
        if request.method=='GET':
            return Response(DebtPaymentSerializer(payment).data)
        available = account(debtor, exclude=payment.pk)['remaining_usd']
        if request.method=='DELETE':
            ensure_balance(available)
            payment.deleted_at=timezone.now()
            payment.save(update_fields=['deleted_at','updated_at'])
        else:
            serializer = DebtPaymentSerializer(payment, data=request.data, partial=request.method=='PATCH')
            serializer.is_valid(raise_exception=True)
            amount=serializer.validated_data.get('payment_usd_amount', payment.payment_usd_amount)
            kind=serializer.validated_data.get('payment_type', payment.payment_type)
            ensure_balance(available + amount*(1 if kind=='LOAN' else -1))
            afn=(amount*payment.usd_rate).quantize(CENT, rounding=ROUND_HALF_UP)
            if afn>MAX_MONEY:
                raise ValidationError({'payment_usd_amount':'معادل افغانی از حد مجاز بیشتر است.'})
            serializer.save(payment_afn_amount=afn)
        response={key:money(value) for key,value in account(debtor).items()}
        if request.method!='DELETE': response.update(serializer.data)
    return Response(response)

@api_view(['GET'])
def debtor_next_number_api(request):
    try:
        year=int(request.query_params.get('year') or timezone.now().astimezone(KABUL).year)
        if not 1900<=year<=9999: raise ValueError
    except (ValueError, TypeError):
        raise ValidationError({'message':'سال معتبر نیست.'})
    return Response({'number':_next_number('DC', year)})

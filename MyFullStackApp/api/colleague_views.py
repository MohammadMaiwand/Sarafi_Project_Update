from datetime import date
from django.db import transaction
from django.db.models import Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from .models import Colleague, ColleagueTransaction
from .colleague_serializers import ColleagueSerializer, ColleagueTransactionSerializer, balance, present_balance, MAXIMUM
from .finance_views import _allocate_number, _next_number
from .remittance_views import pagination
from .debtor_views import KABUL


def person(pk, lock=False):
    rows = Colleague.objects.filter(deletedAt__isnull=True)
    return get_object_or_404(rows.select_for_update() if lock else rows, pk=pk)


def dates(request, rows):
    params = request.query_params
    try:
        start = date.fromisoformat(params['dateFrom']) if params.get('dateFrom') else None
        end = date.fromisoformat(params['dateTo']) if params.get('dateTo') else None
        if start and end and start > end: raise ValueError
    except (ValueError, TypeError):
        raise ValidationError({'message': 'بازه تاریخ معتبر نیست.'})
    if start: rows = rows.filter(transactionDate__gte=start)
    if end: rows = rows.filter(transactionDate__lte=end)
    return rows


def protect_balance(before, after):
    # Imported negative balances can be corrected gradually, but never worsened.
    if after < 0 and (before >= 0 or after < before):
        raise ValidationError({'message': 'این عملیات از موجودی همکار بیشتر است یا مانده را منفی می‌کند.'})
    if abs(after) > MAXIMUM:
        raise ValidationError({'message': 'باقی‌مانده از حد مجاز بیشتر است.'})


def allocate(prefix, record_date, model, field, manual=None, exclude=None):
    try:
        return _allocate_number(prefix, record_date, model, field, manual, exclude_id=exclude)[0]
    except ValidationError:
        raise ValidationError({'manualNumber': 'این شماره قبلاً ثبت شده است.'})


@api_view(['GET', 'POST'])
def colleagues(request):
    if request.method == 'POST':
        serializer = ColleagueSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            manual = serializer.validated_data.pop('manualNumber', None)
            number = allocate('CL', timezone.now().astimezone(KABUL).date(), Colleague, 'colleagueNumber', manual)
            serializer.save(colleagueNumber=number)
        return Response(serializer.data, status=201)
    rows = Colleague.objects.filter(deletedAt__isnull=True)
    search = request.query_params.get('search', '').strip()
    if search:
        query = Q()
        for field in ['colleagueNumber', 'colleagueName', 'fatherName', 'phoneNumber', 'location']:
            query |= Q(**{field+'__icontains': search})
        rows = rows.filter(query)
    sort = {'created_at':'createdAt', 'createdAt':'createdAt', 'colleagueName':'colleagueName', 'colleagueNumber':'colleagueNumber'}.get(request.query_params.get('sortBy', 'created_at'))
    direction = request.query_params.get('sortDir', 'desc')
    if not sort or direction not in ['asc', 'desc']:
        raise ValidationError({'message':'ترتیب نمایش معتبر نیست.'})
    rows = list(rows.order_by(('-' if direction=='desc' else '')+sort, '-id'))
    transactions = dates(request, ColleagueTransaction.objects.filter(deletedAt__isnull=True, colleague_id__in=[row.pk for row in rows]))
    totals = {}
    for item in transactions.values('colleague_id', 'transactionType').annotate(total=Sum('afnAmount')):
        totals.setdefault(item['colleague_id'], {})[item['transactionType']] = item['total'] or 0
    for row in rows:
        amounts = totals.get(row.pk, {})
        received, paid = amounts.get('RECEIVED', 0), amounts.get('PAID', 0)
        row._colleague_balance = {'totalReceivedAfn':received, 'totalPaidAfn':paid, 'remainingAfn':received-paid}
    result = pagination(request, rows, ColleagueSerializer)
    result['balance'] = present_balance({key: sum((row._colleague_balance[key] for row in rows), 0) for key in ['totalReceivedAfn','totalPaidAfn','remainingAfn']})
    return Response(result)


@api_view(['GET'])
def colleague_next_number(request, colleague_id=None):
    if colleague_id is not None: person(colleague_id)
    try:
        day = date.fromisoformat(request.query_params.get('date') or timezone.now().astimezone(KABUL).date().isoformat())
    except (ValueError, TypeError):
        raise ValidationError({'message':'تاریخ معتبر نیست.'})
    return Response({'number':_next_number('CTX' if colleague_id is not None else 'CL', day.year)})


@api_view(['GET', 'PATCH', 'PUT', 'DELETE'])
def colleague_detail(request, colleague_id):
    if request.method == 'GET':
        row = person(colleague_id)
        account = balance(row)
        row._colleague_balance = balance(row, dates(request, row.transactions.filter(deletedAt__isnull=True)))
        return Response({**ColleagueSerializer(row).data, 'accountBalance':present_balance(account)})
    with transaction.atomic():
        row = person(colleague_id, lock=True)
        if request.method == 'DELETE':
            row.deletedAt = timezone.now()
            row.save(update_fields=['deletedAt','updatedAt'])
            return Response(status=204)
        serializer = ColleagueSerializer(row, data=request.data, partial=request.method=='PATCH')
        serializer.is_valid(raise_exception=True)
        manual = serializer.validated_data.pop('manualNumber', None)
        if manual is not None:
            number = allocate('CL', row.createdAt.astimezone(KABUL).date(), Colleague, 'colleagueNumber', manual, row.pk)
            serializer.save(colleagueNumber=number)
        else:
            serializer.save()
    return Response(serializer.data)


@api_view(['GET', 'POST'])
def colleague_transactions(request, colleague_id):
    if request.method == 'GET':
        row = person(colleague_id)
        rows = dates(request, row.transactions.filter(deletedAt__isnull=True).select_related('colleague'))
        period = balance(row, rows)
        search = request.query_params.get('search', '').strip()
        if search:
            rows = rows.filter(Q(transactionNumber__icontains=search)|Q(description__icontains=search)|Q(currencyType__icontains=search)|Q(transactionType__icontains=search))
        kind = request.query_params.get('transactionType')
        if kind:
            if kind not in ['RECEIVED','PAID']: raise ValidationError({'message':'نوع معامله معتبر نیست.'})
            rows = rows.filter(transactionType=kind)
        direction = request.query_params.get('sortDir', 'desc')
        if direction not in ['asc','desc']: raise ValidationError({'message':'ترتیب نمایش معتبر نیست.'})
        rows = rows.order_by(('-' if direction=='desc' else '')+'transactionDate', '-id')
        result = pagination(request, rows, ColleagueTransactionSerializer)
        return Response({**result, 'transactions': result['results'], 'colleague':ColleagueSerializer(row).data, 'balance':present_balance(period), 'accountBalance':present_balance(balance(row))})
    with transaction.atomic():
        row = person(colleague_id, lock=True)
        serializer = ColleagueTransactionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        before = balance(row)['remainingAfn']
        after = before + values['afnAmount']*(1 if values['transactionType']=='RECEIVED' else -1)
        protect_balance(before, after)
        number = allocate('CTX', values['transactionDate'], ColleagueTransaction, 'transactionNumber', values.pop('manualNumber', None))
        serializer.save(colleague=row, transactionNumber=number)
    return Response(serializer.data, status=201)


@api_view(['GET', 'PATCH', 'PUT', 'DELETE'])
def colleague_transaction_detail(request, colleague_id, tx_id):
    with transaction.atomic():
        row = person(colleague_id, lock=request.method!='GET')
        tx = get_object_or_404(row.transactions.select_related('colleague'), pk=tx_id, deletedAt__isnull=True)
        if request.method == 'GET':
            return Response(ColleagueTransactionSerializer(tx).data)
        before = balance(row)['remainingAfn']
        available = balance(row, exclude=tx.pk)['remainingAfn']
        if request.method == 'DELETE':
            protect_balance(before, available)
            tx.deletedAt = timezone.now()
            tx.save(update_fields=['deletedAt','updatedAt'])
            return Response(status=204)
        serializer = ColleagueTransactionSerializer(tx, data=request.data, partial=request.method=='PATCH')
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        after = available + values['afnAmount']*(1 if tx.transactionType=='RECEIVED' else -1)
        protect_balance(before, after)
        manual = values.pop('manualNumber', None)
        if manual is not None:
            number = allocate('CTX', values.get('transactionDate', tx.transactionDate), ColleagueTransaction, 'transactionNumber', manual, tx.pk)
            serializer.save(transactionNumber=number)
        else:
            serializer.save()
    return Response(serializer.data)

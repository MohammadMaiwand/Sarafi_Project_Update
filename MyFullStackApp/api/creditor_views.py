"""Aggregated creditor workspace: every party the office owes money to.

Sources stay independent and are never summed together, matching the accounting
rule used by the system report: sub-system balances and the financial ledger are
shown separately and only explicit links avoid double counting.
"""
from decimal import Decimal
from django.db.models import Q, Sum
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import (Colleague, Customer, CustomerDeposit, DebtorCustomer,
                     FinancialAccount, FinancialDocument, LedgerPosting)
from .ledger_service import PROFILE_FIELDS, confirm
from .ledger_views import account_data, document_data

ZERO = Decimal(0)
# A positive balance is a payable (the office owes) for these kinds/buckets.
PAYABLE_KINDS = {'CREDITOR', 'CASH', 'TERM', 'COLLEAGUE'}
PAYABLE_BUCKETS = {'BENEFICIARY', 'DEPOSIT_PRINCIPAL'}
BUCKET_LABELS = {'ACCOUNT': 'حساب', 'BENEFICIARY': 'تعهد گیرنده حواله', 'AGENCY': 'نمایندگی', 'DEPOSIT_PRINCIPAL': 'اصل امانت یا سپرده', 'FEE': 'فیس'}
KIND_LABELS = {'KABUL_DEBTOR': 'بدهکار کابل', 'IRAN_DEBTOR': 'بدهکار ایران', 'CREDITOR': 'طلبکار', 'COLLEAGUE': 'همکار', 'AGENCY': 'نمایندگی', 'CASH': 'امانت نقدی', 'HAWALA': 'حواله پرداخت‌نشده', 'EXCHANGE': 'انتظار تبدیل ارز', 'TERM': 'امانت قراردادی', 'DEPOSIT': 'امانت مشتری', 'SMALL': 'بدهکار عادی', 'LARGE': 'بدهکار معاملات بزرگ'}
SOURCE_LABELS = {'LEDGER': 'دفتر مالی', 'COLLEAGUE': 'همکاران', 'DEPOSIT': 'امانت مشتریان', 'DEBTOR': 'بدهکاران'}


def money(value):
    return format(Decimal(value or 0), '.3f')


def payable_rows(kind, bucket, total):
    """Payable amount of a posting aggregate using the shared payable rule."""
    if not total:
        return ZERO
    if kind in PAYABLE_KINDS or bucket in PAYABLE_BUCKETS:
        return max(total, ZERO)
    return ZERO


def creditor_payables(account):
    rows = []
    for row in account.postings.filter(document__status='CONFIRMED').values('currency_id', 'bucket').annotate(total=Sum('amount')):
        payable = payable_rows(account.kind, row['bucket'], row['total'])
        if payable <= 0:
            continue
        rows.append({'currency': row['currency_id'], 'bucket': row['bucket'], 'label': BUCKET_LABELS.get(row['bucket'], row['bucket']), 'amount': money(payable)})
    return rows


def ledger_creditors():
    accounts = {}
    rows = (LedgerPosting.objects.filter(document__status='CONFIRMED')
            .values('account_id', 'account__name', 'account__kind', 'account__active', 'account__profile', 'currency_id', 'bucket')
            .annotate(total=Sum('amount')))
    for row in rows:
        payable = payable_rows(row['account__kind'], row['bucket'], row['total'])
        if payable <= 0:
            continue
        entry = accounts.setdefault(row['account_id'], {
            'source': 'LEDGER', 'ref_id': row['account_id'], 'name': row['account__name'], 'kind': row['account__kind'],
            'active': row['account__active'], 'phone': (row['account__profile'] or {}).get('phone', ''),
            'detail_url': f'/creditors/{row["account_id"]}', 'manage': True, 'payables': []})
        entry['payables'].append({'currency': row['currency_id'], 'bucket': row['bucket'], 'label': BUCKET_LABELS.get(row['bucket'], row['bucket']), 'amount': money(payable)})
    return list(accounts.values())


def colleague_creditors():
    out = []
    for person in Colleague.objects.filter(deletedAt__isnull=True).prefetch_related('transactions'):
        received = paid = ZERO
        for event in person.transactions.all():
            if event.deletedAt is not None:
                continue
            if event.transactionType == 'RECEIVED':
                received += event.afnAmount
            else:
                paid += event.afnAmount
        remaining = received - paid
        if remaining <= 0:
            continue
        out.append({'source': 'COLLEAGUE', 'ref_id': person.pk, 'name': person.colleagueName, 'kind': 'COLLEAGUE',
                    'active': True, 'phone': person.phoneNumber, 'manage': False,
                    'detail_url': f'/colleagues/{person.pk}',
                    'payables': [{'currency': 'AFN', 'bucket': 'ACCOUNT', 'label': BUCKET_LABELS['ACCOUNT'], 'amount': money(remaining)}]})
    return out


def deposit_creditors():
    out = []
    for row in CustomerDeposit.objects.filter(deleted_at=None).prefetch_related('withdrawals'):
        if row.deposit_type == 'HAWALA':
            base, unit = row.total_afn - row.hawala_fee, 'AFN'
        elif row.deposit_type == 'EXCHANGE':
            base, unit = row.final_amount, row.currency_to
        else:
            base, unit = row.amount, row.currency_type
        changes = [event for event in row.withdrawals.all() if event.deleted_at is None and event.currency_type == unit]
        remaining = base + sum((event.amount * (1 if event.withdrawal_type == 'ADDITION' else -1) for event in changes), ZERO)
        if remaining <= 0:
            continue
        out.append({'source': 'DEPOSIT', 'ref_id': row.pk, 'name': row.customer_name, 'kind': 'DEPOSIT',
                    'active': True, 'phone': row.phone_number, 'manage': False, 'detail_url': f'/deposits/{row.pk}',
                    'payables': [{'currency': unit or 'AFN', 'bucket': 'DEPOSIT_PRINCIPAL', 'label': BUCKET_LABELS['DEPOSIT_PRINCIPAL'], 'amount': money(remaining)}]})
    return out


def debtor_creditors():
    out = []
    for row in DebtorCustomer.objects.filter(deleted_at=None).prefetch_related('payments'):
        remaining = row.original_usd_amount + sum((event.payment_usd_amount * (1 if event.payment_type == 'LOAN' else -1) for event in row.payments.all() if event.deleted_at is None), ZERO)
        if remaining >= 0:
            continue
        out.append({'source': 'DEBTOR', 'ref_id': row.pk, 'name': row.customer_name, 'kind': row.debtor_type,
                    'active': True, 'phone': row.phone_number, 'manage': False, 'detail_url': f'/debtors/{row.pk}',
                    'payables': [{'currency': 'USD', 'bucket': 'ACCOUNT', 'label': BUCKET_LABELS['ACCOUNT'], 'amount': money(-remaining)}]})
    return out


def create_creditor(request):
    data = request.data
    customer = get_object_or_404(Customer, pk=data['customer']) if data.get('customer') else None
    colleague = get_object_or_404(Colleague, pk=data['colleague']) if data.get('colleague') else None
    name = (customer.name if customer else colleague.colleagueName if colleague else str(data.get('name', '')).strip())
    if not name or len(name) > 200:
        raise ValidationError({'name': 'نام معتبر الزامی است.'})
    if customer and FinancialAccount.objects.filter(customer=customer, kind='CREDITOR').exists():
        raise ValidationError({'customer': 'این مشتری قبلاً حساب طلبکار دارد.'})
    profile = data.get('profile') or {}
    if not isinstance(profile, dict) or set(profile) - set(PROFILE_FIELDS):
        raise ValidationError({'profile': 'خانه‌های مشخصات معتبر نیست.'})
    if profile.get('approval') == 'APPROVED' and not request.user.is_staff:
        raise PermissionDenied('تأیید حساب برای مدیر مجاز است.')
    profile.setdefault('approval', 'APPROVED' if request.user.is_staff else 'PENDING')
    row = FinancialAccount.objects.create(kind='CREDITOR', name=name, customer=customer, colleague=colleague, agency_id=data.get('agency'), profile=profile)
    return Response(account_data(row), status=201)


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def creditors(request):
    if request.method == 'POST':
        return create_creditor(request)
    collected = ledger_creditors() + colleague_creditors() + deposit_creditors() + debtor_creditors()
    source = request.query_params.get('source')
    if source:
        collected = [row for row in collected if row['source'] == source]
    collected.sort(key=lambda row: (row['source'], row['name']))
    totals = {}
    for row in collected:
        for item in row['payables']:
            key = (row['source'], item['currency'])
            totals[key] = totals.get(key, ZERO) + Decimal(item['amount'])
    summary = {'count': len(collected), 'ledger_count': sum(1 for row in collected if row['source'] == 'LEDGER'),
               'totals': [{'source': src, 'currency': unit, 'amount': money(value)} for (src, unit), value in sorted(totals.items())],
               'source_labels': SOURCE_LABELS, 'kind_labels': KIND_LABELS}
    return Response({'results': collected, 'summary': summary})


@api_view(['GET', 'PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def creditor_detail(request, pk):
    row = get_object_or_404(FinancialAccount, pk=pk)
    if request.method == 'PATCH':
        profile = request.data.get('profile', {})
        if not isinstance(profile, dict) or set(profile) - set(PROFILE_FIELDS):
            raise ValidationError({'profile': 'مشخصات معتبر نیست.'})
        if 'approval' in profile and profile['approval'] != row.profile.get('approval') and not request.user.is_staff:
            raise PermissionDenied('تغییر تأیید حساب برای مدیر مجاز است.')
        row.profile = {**row.profile, **profile}
        row.active = request.data.get('active', row.active)
        row.save(update_fields=['profile', 'active'])
    elif request.method == 'DELETE':
        row.active = False
        row.save(update_fields=['active'])
    result = account_data(row)
    result['source'] = 'LEDGER'
    result['payables'] = creditor_payables(row)
    result['documents'] = [document_data(doc) for doc in FinancialDocument.objects.filter(Q(account=row) | Q(postings__account=row)).distinct().select_related('operator').order_by('-date', '-id')]
    return Response(result)


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def creditor_payments(request, pk):
    account = get_object_or_404(FinancialAccount, pk=pk)
    if request.method == 'POST':
        payload = dict(request.data)
        payload['account'] = account.pk
        payload['category'] = 'PAYMENT'
        return Response(document_data(confirm(payload, request.user)), status=201)
    rows = (FinancialDocument.objects.filter(Q(account=account) | Q(postings__account=account), category='PAYMENT')
            .distinct().select_related('operator').order_by('-date', '-id'))
    return Response({'results': [document_data(doc) for doc in rows]})

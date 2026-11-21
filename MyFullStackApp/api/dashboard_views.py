"""Workspace dashboard aggregate: every figure comes from its source module's own rules."""
from datetime import timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.db.models import Q, Sum
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from . import models as m
from .calendar_policy import month_bounds
from .conversion import CURRENCIES
from .ledger_service import REMITTANCES

KABUL = ZoneInfo('Asia/Kabul')
ZERO = Decimal(0)
# Accounts with a dedicated dashboard card are not repeated inside the general balance.
EXCLUDED_BALANCE_KINDS = ['AGENCY', 'KABUL_DEBTOR', 'IRAN_DEBTOR', 'CREDITOR']


def money(value):
    return str(Decimal(value or 0).quantize(Decimal('.001')))


def as_decimal(value):
    return Decimal(str(value))


def document_unit(doc):
    return doc.conversion.get('destination') or doc.currency_id


def document_net(doc):
    net = doc.conversion.get('net')
    return as_decimal(net if net is not None else doc.amount)


def remaining_as_of(doc, purpose, end):
    """Same rule as ledger_service.outstanding(), with beneficiary receipts limited to the period."""
    if purpose == 'AGENCY':
        base = as_decimal(doc.details.get('agency_settlement', doc.conversion.get('net') or str(doc.amount)))
    else:
        base = document_net(doc)
    paid = doc.settlements.filter(purpose=purpose, receipt__status='CONFIRMED', receipt__date__lte=end).aggregate(value=Sum('amount'))['value'] or ZERO
    return base - paid


def ledger_total(kind, currency, end):
    total = m.LedgerPosting.objects.filter(bucket='ACCOUNT', currency_id=currency, account__kind=kind, document__status='CONFIRMED', document__date__lte=end).aggregate(value=Sum('amount'))['value'] or ZERO
    return max(total, ZERO)


def identity_exceptions(end):
    """Mirrors ledger_views.missing_identity(); a record missing both fields is counted once."""
    count = 0
    for doc in m.FinancialDocument.objects.filter(category__in=REMITTANCES, date__lte=end):
        if not doc.details.get('sender_id') or not doc.details.get('sender_phone'):
            count += 1
    identities = {}
    for profile, customer_id in m.FinancialAccount.objects.filter(customer__isnull=False).order_by('id').values_list('profile', 'customer_id'):
        if customer_id not in identities:
            identities[customer_id] = profile.get('identity_number')
    for row in m.Transaction.objects.filter(financialdocument__isnull=True, date__lte=end).select_related('customer'):
        if not identities.get(row.customer_id) or not row.customer.phone:
            count += 1
    for row in m.Remittance.objects.filter(financialdocument__isnull=True, deleted_at__isnull=True, transactionDate__lte=end):
        if not row.nationalIdNumber or not row.phoneNumber:
            count += 1
    return count


def remittance_figures(start, before, end, currency):
    """Beneficiary payable balances, the unpaid count and the payment-status chart."""
    docs = m.FinancialDocument.objects.filter(category__in=REMITTANCES, status='CONFIRMED', date__lte=end).filter(Q(reversal__isnull=True) | Q(reversal__date__gt=end)).select_related('account', 'legacy_remittance')
    unpaid = 0
    tehran_kabul = ZERO
    completed = open_count = 0
    for doc in docs:
        if document_unit(doc) != currency:
            continue
        remaining = remaining_as_of(doc, 'BENEFICIARY', end)
        issued = start <= doc.date < before
        if issued:
            if remaining > ZERO:
                open_count += 1
            else:
                completed += 1
        if remaining > ZERO:
            unpaid += 1
            legacy = doc.legacy_remittance
            if doc.tehran_transaction_id or doc.category == 'TEHRAN_REMITTANCE' or (legacy is not None and legacy.kind == 'incoming'):
                tehran_kabul += remaining
    return {'unpaid': unpaid, 'tehranKabul': tehran_kabul, 'completed': completed, 'open': open_count}


def provincial_figures(start, before, currency):
    """Monthly provincial movement per provincial_views.account_remittances()."""
    outgoing = incoming = ZERO
    docs = m.FinancialDocument.objects.filter(category__in=['PROVINCIAL_IN', 'PROVINCIAL_OUT'], status='CONFIRMED', reversal__isnull=True, date__gte=start, date__lt=before)
    for doc in docs:
        if document_unit(doc) != currency:
            continue
        amount = document_net(doc)
        if doc.category == 'PROVINCIAL_OUT':
            outgoing += amount
        else:
            incoming += amount
    return {'outgoing': outgoing, 'incoming': incoming}


def debtor_figures(end):
    count = 0
    remaining_total = ZERO
    for debtor in m.DebtorCustomer.objects.filter(deleted_at__isnull=True).prefetch_related('payments'):
        remaining = debtor.original_usd_amount + sum((event.payment_usd_amount * (1 if event.payment_type == 'LOAN' else -1) for event in debtor.payments.all() if event.deleted_at is None and event.payment_date <= end), ZERO)
        if remaining > ZERO:
            count += 1
            remaining_total += remaining
    return count, remaining_total


def colleague_figures(end):
    payable = ZERO
    for colleague in m.Colleague.objects.filter(deletedAt__isnull=True).prefetch_related('transactions'):
        remaining = sum((event.afnAmount * (1 if event.transactionType == 'RECEIVED' else -1) for event in colleague.transactions.all() if event.deletedAt is None and event.transactionDate <= end), ZERO)
        if remaining > ZERO:
            payable += remaining
    return payable


def deposit_figures(end, currency):
    open_count = 0
    liability = ZERO
    for deposit in m.CustomerDeposit.objects.filter(deleted_at__isnull=True, received_date__lte=end).prefetch_related('withdrawals'):
        if deposit.deposit_type == 'HAWALA':
            base, unit = deposit.total_afn - deposit.hawala_fee, 'AFN'
        elif deposit.deposit_type == 'EXCHANGE':
            base, unit = deposit.final_amount, deposit.currency_to
        else:
            base, unit = deposit.amount, deposit.currency_type
        changes = [event for event in deposit.withdrawals.all() if event.deleted_at is None and event.withdrawal_date <= end]
        remaining = base + sum((event.amount * (1 if event.withdrawal_type == 'ADDITION' else -1) for event in changes if event.currency_type == unit), ZERO)
        if remaining > ZERO:
            open_count += 1
            if unit == currency:
                liability += remaining
    return open_count, liability


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def workspace_dashboard(request):
    start, before, month = month_bounds(request.query_params.get('month'))
    end = before - timedelta(days=1)
    currency = request.query_params.get('currency', 'AFN')
    if currency not in CURRENCIES:
        raise ValidationError({'currency': 'واحد پول معتبر نیست.'})

    receipts = m.Transaction.objects.filter(transaction_kind='RECEIPT', date__gte=start, date__lt=before)
    if currency == 'TOMAN':
        tehran_receipts = receipts.filter(source_currency='TOMAN').aggregate(value=Sum('toman_amount'))['value'] or ZERO
    elif currency == 'USD':
        tehran_receipts = receipts.filter(source_currency='USD').aggregate(value=Sum('usd_amount'))['value'] or ZERO
    else:
        tehran_receipts = receipts.filter(destination_currency=currency).aggregate(value=Sum('destination_amount'))['value'] or ZERO

    remittances = remittance_figures(start, before, end, currency)
    provincial = provincial_figures(start, before, currency)
    debtor_count, debtor_remaining = debtor_figures(end)
    colleague_payable = colleague_figures(end)
    deposit_count, deposit_liability = deposit_figures(end, currency)

    accounts_balance = m.LedgerPosting.objects.filter(bucket='ACCOUNT', currency_id=currency, document__status='CONFIRMED', document__date__lte=end, account__active=True).exclude(account__kind__in=EXCLUDED_BALANCE_KINDS).aggregate(value=Sum('amount'))['value'] or ZERO
    expenses = m.Expense.objects.filter(deleted_at__isnull=True, date__gte=start, date__lt=before, currency_type=currency).aggregate(value=Sum('amount'))['value'] or ZERO
    mudarabah_active = m.MudarabahContract.objects.filter(deleted_at__isnull=True, status='active', start_date__lte=end).count()

    amount = lambda value: {'state': 'ok', 'unit': currency, 'value': money(value)}
    metrics = {
        'tehran_receipts': {**amount(tehran_receipts), 'route': '/tehran-remittances'},
        'tehran_kabul_remaining': {**amount(remittances['tehranKabul']), 'route': '/incoming'},
        'provincial_net': {**amount(provincial['outgoing'] - provincial['incoming']), 'route': '/provincial-remittances'},
        'provincial_incoming': {**amount(provincial['incoming']), 'route': '/provincial-remittances'},
        'unpaid_remittances': {'state': 'ok', 'unit': 'count', 'value': remittances['unpaid'], 'route': '/unpaid-remittances'},
        'identity_exceptions': {'state': 'ok', 'unit': 'count', 'value': identity_exceptions(end), 'route': '/identity-review'},
        'debtors': {'state': 'ok', 'unit': 'count', 'value': debtor_count, 'amount': money(debtor_remaining), 'amount_unit': 'USD', 'route': '/debtors'},
        # Colleague settlement is kept in the AFN equivalent recorded per transaction.
        'colleagues': {'state': 'ok', 'unit': 'AFN', 'value': money(colleague_payable), 'route': '/colleagues'},
        'customer_deposits': {'state': 'ok', 'unit': 'count', 'value': deposit_count, 'route': '/deposits'},
        'financial_accounts': {**amount(accounts_balance), 'route': '/financial-accounts'},
        'kabul_debtors': {**amount(ledger_total('KABUL_DEBTOR', currency, end)), 'route': '/financial-accounts?kind=KABUL_DEBTOR'},
        'iran_debtors': {**amount(ledger_total('IRAN_DEBTOR', currency, end)), 'route': '/financial-accounts?kind=IRAN_DEBTOR'},
        'creditors': {**amount(ledger_total('CREDITOR', currency, end)), 'route': '/creditors'},
        'deposit_liability': {**amount(deposit_liability), 'route': '/custody'},
        'mudarabah': {'state': 'ok', 'unit': 'count', 'value': mudarabah_active, 'route': '/mudarabah'},
        'expenses': {**amount(expenses), 'route': '/expenses'},
        'profit': {'state': 'pending', 'unit': None, 'value': None, 'label': 'در حال تکمیل'},
        'capital': {'state': 'planned', 'unit': None, 'value': None, 'label': 'برنامه‌ریزی‌شده'},
        'settings': {'state': 'text', 'unit': None, 'value': 'تنظیمات سیستم', 'route': '/settings'},
    }
    total_movement = provincial['outgoing'] + provincial['incoming']
    charts = {
        'provincial': {'currency': currency, 'outgoing': money(provincial['outgoing']), 'incoming': money(provincial['incoming']), 'total': money(total_movement), 'net': money(provincial['outgoing'] - provincial['incoming']), 'route': '/provincial-remittances'},
        'payments': {'currency': currency, 'completed': remittances['completed'], 'open': remittances['open'], 'total': remittances['completed'] + remittances['open'], 'route': '/unpaid-remittances'},
    }
    return Response({
        'generatedAt': timezone.now().astimezone(KABUL).isoformat(),
        'month': month,
        'currency': currency,
        'currencies': list(m.Currency.objects.order_by('code').values_list('code', flat=True)),
        'period': {'from': str(start), 'before': str(before), 'to': str(end)},
        'metrics': metrics,
        'charts': charts,
    })

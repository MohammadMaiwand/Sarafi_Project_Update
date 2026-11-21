from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.db.models import Count, Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError

from .finance_serializers import (
    CustomerDepositSerializer, DebtPaymentSerializer, DebtorSerializer,
    DepositWithdrawalSerializer, ExpenseSerializer, MudarabahSerializer,
)
from .models import (
    CustomerDeposit, DebtPayment, DebtorCustomer, DepositWithdrawal,
    Expense, MudarabahContract, NumberSequence,
)


def _next_number(prefix, year):
    row = NumberSequence.objects.filter(prefix=prefix, year=year).first()
    return f'{prefix}-{year}-{(row.last_value if row else 0) + 1:06d}'


def _allocate_number(prefix, record_date, model, field, manual_sequence=None, exclude_id=None):
    year = record_date.year
    value = int(manual_sequence) if manual_sequence not in (None, '') else None
    if value is not None and value < 1:
        raise ValueError('Manual sequence must be a positive integer.')
    sequence, _ = NumberSequence.objects.select_for_update().get_or_create(prefix=prefix, year=year)
    value = value or sequence.last_value + 1
    number = f'{prefix}-{year}-{value:06d}'
    while model.objects.exclude(pk=exclude_id).filter(**{field: number}).exists():
        if manual_sequence not in (None, ''):
            raise ValidationError({'manual_sequence': 'This number is already in use.'})
        value += 1
        number = f'{prefix}-{year}-{value:06d}'
    sequence.last_value = max(sequence.last_value, value)
    sequence.save(update_fields=['last_value'])
    return number, manual_sequence not in (None, '')


def _active_debt_payments(debtor):
    sums = debtor.payments.filter(deleted_at__isnull=True).values('payment_type').annotate(total=Sum('payment_usd_amount'))
    return {row['payment_type']: row['total'] or Decimal('0.00') for row in sums}


def _debt_balance(debtor, exclude_payment_id=None):
    rows = debtor.payments.filter(deleted_at__isnull=True)
    if exclude_payment_id:
        rows = rows.exclude(pk=exclude_payment_id)
    sums = rows.values('payment_type').annotate(total=Sum('payment_usd_amount'))
    totals = {row['payment_type']: row['total'] or Decimal('0.00') for row in sums}
    loan = totals.get('LOAN', Decimal('0.00'))
    paid = totals.get('PAYMENT', Decimal('0.00'))
    return debtor.original_usd_amount + loan - paid, loan, paid


def _deposit_remaining(deposit):
    rows = deposit.withdrawals.filter(deleted_at__isnull=True)
    if deposit.deposit_type == 'HAWALA':
        base, currency = deposit.total_afn - deposit.hawala_fee, 'AFN'
    elif deposit.deposit_type == 'EXCHANGE':
        base, currency = deposit.final_amount, deposit.currency_to
    else:
        base, currency = deposit.amount, deposit.currency_type
    withdrawn = rows.filter(currency_type=currency, withdrawal_type='WITHDRAWAL').aggregate(v=Sum('amount'))['v'] or Decimal('0.000')
    added = rows.filter(currency_type=currency, withdrawal_type='ADDITION').aggregate(v=Sum('amount'))['v'] or Decimal('0.000')
    return base - withdrawn + added, currency


def _sync_hawala_status(deposit):
    if deposit.deposit_type != 'HAWALA':
        return
    rows = deposit.withdrawals.filter(deleted_at__isnull=True, currency_type='AFN')
    paid = rows.filter(withdrawal_type='WITHDRAWAL').aggregate(v=Sum('amount'))['v'] or Decimal('0.000')
    paid -= rows.filter(withdrawal_type='ADDITION').aggregate(v=Sum('amount'))['v'] or Decimal('0.000')
    deposit.paid_amount = max(paid, Decimal('0.000'))
    deposit.hawala_status = 'paid' if _deposit_remaining(deposit)[0] <= 0 else 'pending'
    deposit.save(update_fields=['paid_amount', 'hawala_status', 'updated_at'])


def _month_range(month):
    if not month:
        today = timezone.localdate()
        return today.year, today.month, f'{today.year:04d}-{today.month:02d}'
    try:
        year, number = (int(part) for part in month.split('-', 1))
        if year < 1200 or not 1 <= number <= 12:
            raise ValueError
        return year, number, month
    except (ValueError, AttributeError):
        return None


@api_view(['GET', 'POST'])
def expenses_api(request):
    if request.method == 'POST':
        serializer = ExpenseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        amount = values['amount']
        rate = values.get('afn_rate') or Decimal('1')
        currency = values.get('currency_type', 'AFN')
        if amount <= 0 or rate <= 0:
            return Response({'message': 'Amount and rate must be greater than zero.'}, status=400)
        with transaction.atomic():
            number, manual = _allocate_number('EXP', values.get('date') or timezone.localdate(), Expense, 'expense_number', values.pop('manual_sequence', None))
            serializer.save(expense_number=number, number_is_manual=manual, afn_amount=(amount if currency == 'AFN' else amount * rate).quantize(Decimal('0.001'), rounding=ROUND_HALF_UP))
        return Response(ExpenseSerializer(serializer.instance).data, status=201)
    queryset = Expense.objects.filter(deleted_at__isnull=True)
    month = request.query_params.get('month')
    parsed = _month_range(month)
    if parsed is None:
        return Response({'message': 'Month must use YYYY-MM format.'}, status=400)
    year, month_number, month = parsed
    if request.query_params.get('calendar') == 'afghan':
        from .calendar_policy import month_bounds
        start, end, month = month_bounds(request.query_params.get('month'))
        queryset = queryset.filter(date__gte=start, date__lt=end)
    else:
        queryset = queryset.filter(date__year=year, date__month=month_number)
    category = request.query_params.get('category')
    if category:
        queryset = queryset.filter(category__icontains=category)
    return Response({'expenses': ExpenseSerializer(queryset, many=True).data, 'month': month, 'total_afn': queryset.aggregate(v=Sum('afn_amount'))['v'] or Decimal('0.000'), 'count': queryset.count()})


@api_view(['GET'])
def expense_next_number_api(request):
    try:
        year = int(request.query_params.get('year') or timezone.localdate().year)
        if not 1900 <= year <= 9999:
            raise ValueError
    except ValueError:
        return Response({'message': 'Year is invalid.'}, status=400)
    return Response({'number': _next_number('EXP', year), 'year': year})


@api_view(['GET', 'PATCH', 'PUT', 'DELETE'])
def expense_detail_api(request, expense_id):
    try:
        expense = Expense.objects.get(pk=expense_id, deleted_at__isnull=True)
    except Expense.DoesNotExist:
        return Response({'message': 'Expense not found.'}, status=404)
    if request.method == 'GET':
        return Response(ExpenseSerializer(expense).data)
    if request.method == 'DELETE':
        expense.deleted_at = timezone.now(); expense.save(update_fields=['deleted_at', 'updated_at'])
        return Response(status=204)
    serializer = ExpenseSerializer(expense, data=request.data, partial=request.method == 'PATCH')
    serializer.is_valid(raise_exception=True)
    values = serializer.validated_data
    amount = values.get('amount', expense.amount)
    currency = values.get('currency_type', expense.currency_type)
    rate = values.get('afn_rate', expense.afn_rate)
    if amount <= 0 or rate <= 0:
        return Response({'message': 'Amount and rate must be greater than zero.'}, status=400)
    serializer.save(afn_amount=(amount if currency == 'AFN' else amount * rate).quantize(Decimal('0.001'), rounding=ROUND_HALF_UP))
    return Response(ExpenseSerializer(expense).data)


@api_view(['GET', 'POST'])
def mudarabah_api(request):
    if request.method == 'POST':
        serializer = MudarabahSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        if values['principal_amount'] <= 0:
            return Response({'message': 'Principal amount must be greater than zero.'}, status=400)
        with transaction.atomic():
            number, manual = _allocate_number('MUDA', values.get('start_date') or timezone.localdate(), MudarabahContract, 'contract_number', values.pop('manual_sequence', None))
            serializer.save(contract_number=number, number_is_manual=manual)
        return Response(MudarabahSerializer(serializer.instance).data, status=201)
    queryset = MudarabahContract.objects.filter(deleted_at__isnull=True)
    month = request.query_params.get('month')
    parsed = _month_range(month)
    if month and parsed is None:
        return Response({'message': 'Month must use YYYY-MM format.'}, status=400)
    if parsed:
        if request.query_params.get('calendar') == 'afghan':
            from .calendar_policy import month_bounds
            start, end, _ = month_bounds(month)
            queryset = queryset.filter(start_date__gte=start, start_date__lt=end)
        else:
            queryset = queryset.filter(start_date__year=parsed[0], start_date__month=parsed[1])
    state = request.query_params.get('status')
    if state:
        queryset = queryset.filter(status=state)
    return Response({'contracts': MudarabahSerializer(queryset, many=True).data, 'count': queryset.count(), 'total_profit': queryset.aggregate(v=Sum('profit_amount'))['v'] or Decimal('0.00')})


@api_view(['GET'])
def mudarabah_next_number_api(request):
    try:
        year = int(request.query_params.get('year') or timezone.localdate().year)
        if not 1900 <= year <= 9999:
            raise ValueError
    except ValueError:
        return Response({'message': 'Year is invalid.'}, status=400)
    return Response({'number': _next_number('MUDA', year), 'year': year})


@api_view(['GET', 'PATCH', 'PUT', 'DELETE'])
def mudarabah_detail_api(request, contract_id):
    try:
        contract = MudarabahContract.objects.get(pk=contract_id, deleted_at__isnull=True)
    except MudarabahContract.DoesNotExist:
        return Response({'message': 'Mudarabah contract not found.'}, status=404)
    if request.method == 'GET':
        return Response(MudarabahSerializer(contract).data)
    if request.method == 'DELETE':
        contract.deleted_at = timezone.now(); contract.save(update_fields=['deleted_at', 'updated_at'])
        return Response(status=204)
    serializer = MudarabahSerializer(contract, data=request.data, partial=request.method == 'PATCH')
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(MudarabahSerializer(contract).data)


@api_view(['GET', 'POST'])
def debtors_api(request):
    if request.method == 'POST':
        serializer = DebtorSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        if values.get('debtor_type', 'SMALL') == 'LARGE' and not values.get('national_id', '').strip():
            return Response({'message': 'National ID is required for large transactions.'}, status=400)
        if values.get('original_usd_amount', 0) < 0:
            return Response({'message': 'Original balance cannot be negative.'}, status=400)
        with transaction.atomic():
            number, manual = _allocate_number('DC', timezone.localdate(), DebtorCustomer, 'customer_number', values.pop('manual_sequence', None))
            serializer.save(customer_number=number, number_is_manual=manual)
        return Response(DebtorSerializer(serializer.instance).data, status=201)
    queryset = DebtorCustomer.objects.filter(deleted_at__isnull=True)
    debtor_type = request.query_params.get('type')
    if debtor_type in ('SMALL', 'LARGE'):
        queryset = queryset.filter(debtor_type=debtor_type)
    search = request.query_params.get('search')
    if search:
        from django.db.models import Q
        queryset = queryset.filter(Q(customer_name__icontains=search) | Q(father_name__icontains=search) | Q(phone_number__icontains=search) | Q(customer_number__icontains=search))
    rows = list(queryset)
    for debtor in rows:
        debtor._payment_totals = [{'payment_type': kind, 'total': total} for kind, total in _active_debt_payments(debtor).items()]
    return Response({'debtors': DebtorSerializer(rows, many=True).data, 'count': len(rows)})


@api_view(['GET', 'PATCH', 'PUT', 'DELETE'])
def debtor_detail_api(request, debtor_id):
    try:
        debtor = DebtorCustomer.objects.get(pk=debtor_id, deleted_at__isnull=True)
    except DebtorCustomer.DoesNotExist:
        return Response({'message': 'Debtor not found.'}, status=404)
    if request.method == 'GET':
        return Response({**DebtorSerializer(debtor).data, 'payments': DebtPaymentSerializer(debtor.payments.filter(deleted_at__isnull=True), many=True).data})
    if request.method == 'DELETE':
        debtor.deleted_at = timezone.now(); debtor.save(update_fields=['deleted_at', 'updated_at'])
        return Response(status=204)
    serializer = DebtorSerializer(debtor, data=request.data, partial=request.method == 'PATCH')
    serializer.is_valid(raise_exception=True)
    if serializer.validated_data.get('debtor_type', debtor.debtor_type) != debtor.debtor_type:
        return Response({'message': 'Debtor type cannot be changed after creation.'}, status=400)
    serializer.save()
    return Response(DebtorSerializer(debtor).data)


@api_view(['GET', 'POST'])
def debtor_payments_api(request, debtor_id):
    try:
        debtor = DebtorCustomer.objects.get(pk=debtor_id, deleted_at__isnull=True)
    except DebtorCustomer.DoesNotExist:
        return Response({'message': 'Debtor not found.'}, status=404)
    if request.method == 'GET':
        current, loans, paid = _debt_balance(debtor)
        return Response({'payments': DebtPaymentSerializer(debtor.payments.filter(deleted_at__isnull=True), many=True).data, 'remaining_usd': current, 'total_loan_usd': loans, 'total_paid_usd': paid})
    serializer = DebtPaymentSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    values = serializer.validated_data
    if values['payment_usd_amount'] <= 0:
        return Response({'message': 'Payment amount must be greater than zero.'}, status=400)
    with transaction.atomic():
        remaining, _, _ = _debt_balance(debtor)
        if values['payment_type'] == 'PAYMENT' and values['payment_usd_amount'] > remaining:
            return Response({'code': 'PAYMENT_EXCEEDS_REMAINING', 'message': 'Payment amount exceeds the remaining debt.'}, status=400)
        payment = serializer.save(debtor=debtor)
    return Response({**DebtPaymentSerializer(payment).data, 'remaining_usd': _debt_balance(debtor)[0]}, status=201)


@api_view(['PUT', 'PATCH', 'DELETE'])
def debtor_payment_detail_api(request, debtor_id, payment_id):
    try:
        debtor = DebtorCustomer.objects.get(pk=debtor_id, deleted_at__isnull=True)
        payment = DebtPayment.objects.get(pk=payment_id, debtor=debtor, deleted_at__isnull=True)
    except (DebtorCustomer.DoesNotExist, DebtPayment.DoesNotExist):
        return Response({'message': 'Payment not found.'}, status=404)
    if request.method == 'DELETE':
        payment.deleted_at = timezone.now(); payment.save(update_fields=['deleted_at'])
        return Response({'remaining_usd': _debt_balance(debtor)[0]}, status=200)
    serializer = DebtPaymentSerializer(payment, data=request.data, partial=request.method == 'PATCH')
    serializer.is_valid(raise_exception=True)
    values = serializer.validated_data
    remaining, _, _ = _debt_balance(debtor, exclude_payment_id=payment.id)
    if values.get('payment_type', payment.payment_type) == 'PAYMENT' and values.get('payment_usd_amount', payment.payment_usd_amount) > remaining:
        return Response({'code': 'PAYMENT_EXCEEDS_REMAINING', 'message': 'Payment amount exceeds the remaining debt.'}, status=400)
    serializer.save()
    return Response({**DebtPaymentSerializer(payment).data, 'remaining_usd': _debt_balance(debtor)[0]})


@api_view(['GET'])
def debtor_next_number_api(request):
    try:
        year = int(request.query_params.get('year') or timezone.localdate().year)
        if not 1900 <= year <= 9999:
            raise ValueError
    except ValueError:
        return Response({'message': 'Year is invalid.'}, status=400)
    return Response({'number': _next_number('DC', year), 'year': year})


@api_view(['GET', 'POST'])
def deposits_api(request):
    if request.method == 'POST':
        serializer = CustomerDepositSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        kind = values.get('deposit_type', 'CASH')
        prefix = CustomerDeposit.PREFIXES[kind]
        record_date = values.get('received_date') or timezone.localdate()
        with transaction.atomic():
            number, manual = _allocate_number(prefix, record_date, CustomerDeposit, 'deposit_number', values.pop('manual_sequence', None))
            serializer.save(deposit_number=number, number_is_manual=manual)
        return Response(CustomerDepositSerializer(serializer.instance).data, status=201)
    queryset = CustomerDeposit.objects.filter(deleted_at__isnull=True)
    kind = request.query_params.get('type')
    if kind in dict(CustomerDeposit.TYPES):
        queryset = queryset.filter(deposit_type=kind)
    search = request.query_params.get('search')
    if search:
        queryset = queryset.filter(customer_name__icontains=search)
    return Response({'deposits': CustomerDepositSerializer(queryset, many=True).data, 'count': queryset.count()})


@api_view(['GET'])
def deposit_next_number_api(request):
    kind = request.query_params.get('type', 'CASH')
    if kind not in CustomerDeposit.PREFIXES:
        return Response({'message': 'Invalid deposit type.'}, status=400)
    prefix = CustomerDeposit.PREFIXES[kind]
    try:
        year = int(request.query_params.get('year') or timezone.localdate().year)
        if not 1900 <= year <= 9999:
            raise ValueError
    except ValueError:
        return Response({'message': 'Year is invalid.'}, status=400)
    return Response({'number': _next_number(prefix, year), 'year': year})


@api_view(['GET', 'PUT', 'PATCH', 'DELETE'])
def deposit_detail_api(request, deposit_id):
    try:
        deposit = CustomerDeposit.objects.get(pk=deposit_id, deleted_at__isnull=True)
    except CustomerDeposit.DoesNotExist:
        return Response({'message': 'Deposit not found.'}, status=404)
    if request.method == 'GET':
        return Response(CustomerDepositSerializer(deposit).data)
    if request.method == 'DELETE':
        deposit.deleted_at = timezone.now(); deposit.save(update_fields=['deleted_at', 'updated_at'])
        return Response(status=204)
    serializer = CustomerDepositSerializer(deposit, data=request.data, partial=request.method == 'PATCH')
    serializer.is_valid(raise_exception=True)
    serializer.save(deposit_number=deposit.deposit_number, number_is_manual=deposit.number_is_manual)
    return Response(CustomerDepositSerializer(deposit).data)


@api_view(['GET', 'POST'])
def deposit_withdrawals_api(request, deposit_id):
    try:
        deposit = CustomerDeposit.objects.get(pk=deposit_id, deleted_at__isnull=True)
    except CustomerDeposit.DoesNotExist:
        return Response({'message': 'Deposit not found.'}, status=404)
    if request.method == 'GET':
        return Response({'withdrawals': DepositWithdrawalSerializer(deposit.withdrawals.filter(deleted_at__isnull=True), many=True).data, 'remaining': CustomerDepositSerializer(deposit).data['remaining'], 'currency': deposit.currency_to if deposit.deposit_type == 'EXCHANGE' else ('AFN' if deposit.deposit_type == 'HAWALA' else deposit.currency_type)})
    serializer = DepositWithdrawalSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    values = serializer.validated_data
    if values['amount'] <= 0:
        return Response({'message': 'Amount must be greater than zero.'}, status=400)
    remaining, expected_currency = _deposit_remaining(deposit)
    currency = values.get('currency_type', expected_currency)
    if currency != expected_currency:
        return Response({'message': f'Currency must be {expected_currency}.'}, status=400)
    if values['withdrawal_type'] == 'WITHDRAWAL' and values['amount'] > remaining:
        return Response({'code': 'WITHDRAWAL_EXCEEDS_REMAINING', 'message': 'Withdrawal exceeds remaining deposit balance.'}, status=400)
    withdrawal = serializer.save(deposit=deposit)
    _sync_hawala_status(deposit)
    return Response({**DepositWithdrawalSerializer(withdrawal).data, 'remaining': _deposit_remaining(deposit)[0]}, status=201)


@api_view(['PUT', 'PATCH', 'DELETE'])
def deposit_withdrawal_detail_api(request, deposit_id, withdrawal_id):
    try:
        deposit = CustomerDeposit.objects.get(pk=deposit_id, deleted_at__isnull=True)
        withdrawal = DepositWithdrawal.objects.get(pk=withdrawal_id, deposit=deposit, deleted_at__isnull=True)
    except (CustomerDeposit.DoesNotExist, DepositWithdrawal.DoesNotExist):
        return Response({'message': 'Withdrawal not found.'}, status=404)
    if request.method == 'DELETE':
        withdrawal.deleted_at = timezone.now(); withdrawal.save(update_fields=['deleted_at'])
        _sync_hawala_status(deposit)
        return Response({'remaining': _deposit_remaining(deposit)[0]}, status=200)
    serializer = DepositWithdrawalSerializer(withdrawal, data=request.data, partial=request.method == 'PATCH')
    serializer.is_valid(raise_exception=True)
    values = serializer.validated_data
    remaining_before, expected_currency = _deposit_remaining(deposit)
    if values.get('currency_type', withdrawal.currency_type) != expected_currency:
        return Response({'message': f'Currency must be {expected_currency}.'}, status=400)
    new_type = values.get('withdrawal_type', withdrawal.withdrawal_type)
    new_amount = values.get('amount', withdrawal.amount)
    if new_type == 'WITHDRAWAL' and new_amount > remaining_before + (withdrawal.amount if withdrawal.withdrawal_type == 'WITHDRAWAL' else 0):
        return Response({'code': 'WITHDRAWAL_EXCEEDS_REMAINING', 'message': 'Withdrawal exceeds remaining deposit balance.'}, status=400)
    serializer.save()
    _sync_hawala_status(deposit)
    return Response({**DepositWithdrawalSerializer(withdrawal).data, 'remaining': _deposit_remaining(deposit)[0]})


@api_view(['GET'])
def finance_summary_api(request):
    month = request.query_params.get('month')
    parsed = _month_range(month)
    if parsed is None:
        return Response({'message': 'Month must use YYYY-MM format.'}, status=400)
    year, month_number, month = parsed
    expenses = Expense.objects.filter(deleted_at__isnull=True, date__year=year, date__month=month_number)
    mudarabah = MudarabahContract.objects.filter(deleted_at__isnull=True, start_date__year=year, start_date__month=month_number)
    if request.query_params.get('calendar') == 'afghan':
        from .calendar_policy import month_bounds
        start, end, month = month_bounds(request.query_params.get('month'))
        expenses = Expense.objects.filter(deleted_at__isnull=True, date__gte=start, date__lt=end)
        mudarabah = MudarabahContract.objects.filter(deleted_at__isnull=True, start_date__gte=start, start_date__lt=end)
    debtors = DebtorCustomer.objects.filter(deleted_at__isnull=True)
    deposits = CustomerDeposit.objects.filter(deleted_at__isnull=True)
    remaining_debt = sum((_debt_balance(item)[0] for item in debtors), Decimal('0.00'))
    return Response({
        'month': month,
        'expenses_afn': expenses.aggregate(v=Sum('afn_amount'))['v'] or Decimal('0.000'),
        'expense_count': expenses.count(),
        'mudarabah_count': mudarabah.count(),
        'mudarabah_profit': mudarabah.aggregate(v=Sum('profit_amount'))['v'] or Decimal('0.00'),
        'debtor_count': debtors.count(),
        'remaining_debt_usd': remaining_debt,
        'deposit_count': deposits.count(),
        'deposit_original_afn': deposits.exclude(deposit_type='EXCHANGE').aggregate(v=Sum('total_afn'))['v'] or Decimal('0.000'),
    })

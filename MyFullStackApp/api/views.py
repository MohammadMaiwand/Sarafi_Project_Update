from decimal import Decimal, ROUND_HALF_UP
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db.models import Sum, Q
from django.db.models.deletion import ProtectedError
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response

from .models import Customer, Transaction, three_places
from .serializers import CustomerSerializer, TransactionSerializer


@api_view(['GET'])
@permission_classes([AllowAny])
def hello_api(request):
    return Response({
        'message': 'سلام! این یک پاسخ از بک‌اند جنگو است.',
        'features': {'outgoing_province_filter': 1},
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def login_api(request):
    username = request.data.get('username', '')
    password = request.data.get('password', '')
    user = authenticate(request, username=username, password=password)
    if user is None:
        return Response({'success': False, 'message': 'Invalid username or password'}, status=401)
    from rest_framework.authtoken.models import Token
    token, _ = Token.objects.get_or_create(user=user)
    return Response({'success': True, 'username': user.get_username(), 'token':token.key, 'message': 'Login successful'})


@api_view(['GET'])
def users_api(request):
    User = get_user_model()
    return Response({'users': list(User.objects.order_by('username').values_list('username', flat=True))})


@api_view(['POST'])
@permission_classes([IsAdminUser])
def create_user_api(request):
    username = (request.data.get('username') or '').strip()
    password = request.data.get('password') or ''
    if not username or not password:
        return Response({'success': False, 'message': 'Username and password required'}, status=400)
    User = get_user_model()
    if User.objects.filter(username=username).exists():
        return Response({'success': False, 'message': 'Username already exists'}, status=400)
    user = User.objects.create_user(username=username, password=password, is_staff=False, is_superuser=False)
    return Response({'success': True, 'username': user.get_username()}, status=201)


@api_view(['POST'])
def change_password_api(request):
    username = (request.data.get('username') or '').strip()
    old_password = request.data.get('old_password') or ''
    new_password = request.data.get('new_password') or ''
    User = get_user_model()
    try:
        user = User.objects.get(username=username)
    except User.DoesNotExist:
        return Response({'success': False, 'message': 'User not found'}, status=404)
    if authenticate(request, username=username, password=old_password) is None:
        return Response({'success': False, 'message': 'Invalid old password'}, status=401)
    if not new_password:
        return Response({'success': False, 'message': 'New password required'}, status=400)
    try:
        validate_password(new_password, user)
    except ValidationError as error:
        return Response({'success': False, 'message': ' '.join(error.messages)}, status=400)
    user.set_password(new_password)
    user.save(update_fields=['password'])
    return Response({'success': True, 'message': 'Password changed successfully'})


@api_view(['GET'])
def session_api(request):
    return Response({'username':request.user.get_username()})

def _next_voucher_number():
    from .models import LedgerSetting
    setting=LedgerSetting.objects.filter(key='starting_number').first()
    starting=int(setting.value) if setting else 200
    numeric = [int(value) for value in Transaction.objects.values_list('voucher_number', flat=True) if value.isdecimal()]
    return str(max([starting-1,*numeric]) + 1)


@api_view(['GET', 'POST'])
def customers_api(request):
    if request.method == 'POST':
        serializer = CustomerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    # Per-currency aggregates are attached in one grouped query for the customer list.
    totals = Transaction.objects.values('customer_id').annotate(
        total_toman=Sum('toman_amount',filter=Q(source_currency='TOMAN')), total_usd=Sum('usd_amount'),
        total_afghani=Sum('afghani_amount'), total_profit=Sum('toman_profit'),
    )
    totals_by_customer = {
        row['customer_id']: {
            'toman_amount': row['total_toman'], 'usd_amount': row['total_usd'],
            'afghani_amount': row['total_afghani'], 'toman_profit': row['total_profit'],
        }
        for row in totals
    }
    customers = list(Customer.objects.order_by('name', 'id'))
    for customer in customers:
        customer.transaction_totals = totals_by_customer.get(customer.id, {})
    return Response({'customers': CustomerSerializer(customers, many=True).data})


@api_view(['GET', 'PUT', 'PATCH', 'DELETE'])
def customer_detail_api(request, customer_id):
    try:
        customer = Customer.objects.get(pk=customer_id)
    except Customer.DoesNotExist:
        return Response({'message': 'Customer not found'}, status=status.HTTP_404_NOT_FOUND)
    if request.method == 'GET':
        return Response(CustomerSerializer(customer).data)
    if request.method == 'DELETE':
        try: customer.delete()
        except ProtectedError: return Response({'message':'این مشتری حساب مالی دارد؛ حذف مجاز نیست.'},status=400)
        return Response(status=status.HTTP_204_NO_CONTENT)
    serializer = CustomerSerializer(customer, data=request.data, partial=request.method == 'PATCH')
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


@api_view(['GET'])
def customer_transactions_api(request, customer_id):
    if not Customer.objects.filter(pk=customer_id).exists():
        return Response({'message': 'Customer not found'}, status=status.HTTP_404_NOT_FOUND)
    transactions = Transaction.objects.filter(customer_id=customer_id).select_related('customer')
    return Response({'transactions': TransactionSerializer(transactions, many=True).data})


@api_view(['GET', 'POST'])
def transactions_api(request):
    if request.method == 'POST':
        serializer = TransactionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    transactions = Transaction.objects.select_related('customer')
    customer_id = request.query_params.get('customer')
    if customer_id:
        transactions = transactions.filter(customer_id=customer_id)
    return Response({'transactions': TransactionSerializer(transactions, many=True).data})


@api_view(['GET', 'PUT', 'PATCH', 'DELETE'])
def transaction_detail_api(request, transaction_id):
    try:
        transaction = Transaction.objects.select_related('customer').get(pk=transaction_id)
    except Transaction.DoesNotExist:
        return Response({'message': 'Transaction not found'}, status=status.HTTP_404_NOT_FOUND)
    if request.method == 'GET':
        return Response(TransactionSerializer(transaction).data)
    if request.method == 'DELETE':
        try: transaction.delete()
        except ProtectedError: return Response({'message':'این حواله ثبت مالی مرتبط دارد؛ از برگشت اصلاحی در حساب مشتری استفاده کنید.'},status=400)
        return Response(status=status.HTTP_204_NO_CONTENT)
    serializer = TransactionSerializer(transaction, data=request.data, partial=request.method == 'PATCH')
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


@api_view(['POST'])
def auto_voucher_api(request):
    return Response({'voucher_number': _next_voucher_number()})


@api_view(['GET'])
def next_voucher_api(request):
    return Response({'next_voucher': _next_voucher_number()})


@api_view(['GET'])
def dashboard_stats_api(request):
    if request.query_params.get('calendar') == 'afghan':
        from .calendar_policy import month_bounds
        start, end, month = month_bounds(request.query_params.get('month'))
        totals = Transaction.objects.filter(date__gte=start, date__lt=end).aggregate(total_toman=Sum('toman_amount',filter=Q(source_currency='TOMAN')), total_usd=Sum('usd_amount'), total_afghani=Sum('afghani_amount'))
        toman, afn = totals['total_toman'] or Decimal(0), totals['total_afghani'] or Decimal(0)
        pair=Transaction.objects.filter(date__gte=start,date__lt=end,source_currency='TOMAN',destination_currency='AFN').aggregate(toman=Sum('toman_amount'),afn=Sum('afghani_amount'))
        effective=(pair['afn']/pair['toman']) if pair['toman'] else None
        return Response({'month':month, 'dateFrom':str(start), 'dateBefore':str(end), 'total_toman':toman, 'total_usd':totals['total_usd'] or 0, 'total_afghani':afn, 'toman_purchase_profit':effective})
    month = request.query_params.get('month')
    if month:
        try:
            year, month_number = (int(part) for part in month.split('-', 1))
            if not 1 <= year <= 9999 or not 1 <= month_number <= 12:
                raise ValueError
        except (TypeError, ValueError):
            return Response({'message': 'Month must use YYYY-MM format'}, status=status.HTTP_400_BAD_REQUEST)
    else:
        today = timezone.localdate()
        year, month_number = today.year, today.month
        month = f'{year:04d}-{month_number:02d}'
    totals = Transaction.objects.filter(date__year=year, date__month=month_number).aggregate(
        total_toman=Sum('toman_amount',filter=Q(source_currency='TOMAN')), total_usd=Sum('usd_amount'), total_afghani=Sum('afghani_amount'),
    )
    toman = totals['total_toman'] or 0
    afghani = totals['total_afghani'] or 0
    profit = (afghani / toman).quantize(Decimal('0.000000001'), rounding=ROUND_HALF_UP) if toman else Decimal('0.000000000')
    return Response({
        'month': month,
        'total_toman': three_places(toman),
        'total_usd': three_places(totals['total_usd'] or 0),
        'total_afghani': three_places(afghani),
        'toman_purchase_profit': profit,
    })

from decimal import Decimal, ROUND_HALF_UP, localcontext

from django.db.models import Q, Sum
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .calendar_policy import month_bounds
from .models import FinancialAccount, FinancialDocument, Province, Transaction
from .provincial_reporting import money


ZERO = Decimal(0)
THOUSAND = Decimal(1000)
RATE_PLACES = Decimal('0.000000001')


def rate_per_thousand(afn_amount, toman_amount):
    if not toman_amount:
        return None
    with localcontext() as context:
        context.prec = 48
        return (afn_amount * THOUSAND / toman_amount).quantize(RATE_PLACES, rounding=ROUND_HALF_UP)


def toman_profit_report(month):
    start, end, normalized_month = month_bounds(month)
    purchase = Transaction.objects.filter(
        date__gte=start,
        date__lt=end,
        source_currency='TOMAN',
        destination_currency='AFN',
    ).aggregate(toman=Sum('toman_amount'), afn=Sum('afghani_amount'))
    purchase_toman = purchase['toman'] or ZERO
    purchase_afn = purchase['afn'] or ZERO
    if purchase_toman:
        with localcontext() as context:
            context.prec = 48
            purchase_rate = purchase_afn * THOUSAND / purchase_toman
    else:
        purchase_rate = None

    accounts = list(FinancialAccount.objects.filter(
        kind='AGENCY',
        profile__outgoing_workspace=True,
        active=True,
    ).select_related('province', 'agency__province').order_by('name', 'id'))
    account_totals = {
        account.pk: {'received_toman': ZERO, 'distributed_toman': ZERO, 'distributed_afn': ZERO}
        for account in accounts
    }
    documents = FinancialDocument.objects.filter(
        account_id__in=account_totals,
        status='CONFIRMED',
        date__gte=start,
        date__lt=end,
        currency_id__in=['TOMAN', 'AFN'],
    ).filter(
        Q(category__in=['RECEIPT', 'DISTRIBUTION']) |
        Q(reversal_of__category__in=['RECEIPT', 'DISTRIBUTION'])
    ).select_related('reversal_of').only(
        'account_id', 'category', 'currency_id', 'amount', 'reversal_of_id', 'reversal_of__category',
    )
    for document in documents:
        category = document.reversal_of.category if document.reversal_of_id else document.category
        sign = Decimal(-1) if document.reversal_of_id else Decimal(1)
        totals = account_totals[document.account_id]
        if category == 'RECEIPT' and document.currency_id == 'TOMAN':
            totals['received_toman'] += document.amount * sign
        elif category == 'DISTRIBUTION' and document.currency_id == 'TOMAN':
            totals['distributed_toman'] += document.amount * sign
        elif category == 'DISTRIBUTION' and document.currency_id == 'AFN':
            totals['distributed_afn'] += document.amount * sign

    provinces = {
        province.code: {
            'code': province.code,
            'name': province.name,
            'received_toman': ZERO,
            'distributed_toman': ZERO,
            'distributed_afn': ZERO,
            'profit_afn': ZERO,
            'agencies': [],
        }
        for province in Province.objects.all()
    }
    unassigned = None
    total_received = total_distributed_toman = total_distributed_afn = total_profit = ZERO
    for account in accounts:
        province_code = account.province_id or (account.agency.province_id if account.agency_id else None)
        if province_code in provinces:
            province = provinces[province_code]
        else:
            if unassigned is None:
                unassigned = {
                    'code': None,
                    'name': 'ولایت نامشخص',
                    'received_toman': ZERO,
                    'distributed_toman': ZERO,
                    'distributed_afn': ZERO,
                    'profit_afn': ZERO,
                    'agencies': [],
                }
            province = unassigned

        values = account_totals[account.pk]
        agency_rate = rate_per_thousand(values['distributed_afn'], values['distributed_toman'])
        profit = ZERO
        if purchase_rate is not None:
            with localcontext() as context:
                context.prec = 48
                profit = purchase_rate * values['distributed_toman'] / THOUSAND - values['distributed_afn']
            profit = Decimal(money(profit))
        agency = {
            'id': account.pk,
            'name': account.name,
            'received_toman': money(values['received_toman']),
            'distributed_toman': money(values['distributed_toman']),
            'distributed_afn': money(values['distributed_afn']),
            'sale_rate_per_1000': str(agency_rate) if agency_rate is not None else None,
            'profit_afn': money(profit) if purchase_rate is not None else None,
        }
        province['agencies'].append(agency)
        province['received_toman'] += values['received_toman']
        province['distributed_toman'] += values['distributed_toman']
        province['distributed_afn'] += values['distributed_afn']
        province['profit_afn'] += profit
        total_received += values['received_toman']
        total_distributed_toman += values['distributed_toman']
        total_distributed_afn += values['distributed_afn']
        total_profit += profit

    province_rows = list(provinces.values())
    if unassigned is not None:
        province_rows.append(unassigned)
    for province in province_rows:
        province['received_toman'] = money(province['received_toman'])
        province['distributed_toman'] = money(province['distributed_toman'])
        province['distributed_afn'] = money(province['distributed_afn'])
        province['sale_rate_per_1000'] = (
            str(rate_per_thousand(Decimal(province['distributed_afn']), Decimal(province['distributed_toman'])))
            if Decimal(province['distributed_toman']) else None
        )
        province['profit_afn'] = money(province['profit_afn']) if purchase_rate is not None else None
        province['agencies'].sort(key=lambda row: (row['name'].casefold(), row['id']))

    return {
        'month': normalized_month,
        'dateFrom': str(start),
        'dateBefore': str(end),
        'tehran_purchase': {
            'toman': money(purchase_toman),
            'afn': money(purchase_afn),
            'rate_per_1000': str(rate_per_thousand(purchase_afn, purchase_toman)) if purchase_toman else None,
        },
        'totals': {
            'received_toman': money(total_received),
            'distributed_toman': money(total_distributed_toman),
            'distributed_afn': money(total_distributed_afn),
            'profit_afn': money(total_profit) if purchase_rate is not None else None,
        },
        'provinces': province_rows,
    }


@api_view(['GET'])
def toman_profit(request):
    return Response(toman_profit_report(request.query_params.get('month')))

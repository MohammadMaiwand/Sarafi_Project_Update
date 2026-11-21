from decimal import Decimal, InvalidOperation
from rest_framework.exceptions import ValidationError
from .conversion import CURRENCIES

def validate_profit(value,currency,field='manual_profit',currency_field='profit_currency',allow_unknown=False):
    if value in (None,''):
        return None,''
    try:
        amount=Decimal(str(value))
        if not amount.is_finite() or abs(amount)>Decimal('999999999999999999999.999') or amount.as_tuple().exponent < -3:raise ValueError
    except (InvalidOperation,ValueError,TypeError):raise ValidationError({field:'مفاد معتبر، با حداکثر سه رقم اعشار وارد کنید.'})
    if currency not in CURRENCIES and not (allow_unknown and not currency):raise ValidationError({currency_field:'واحد مفاد را مشخص کنید.'})
    return amount.quantize(Decimal('.001')),currency or ''

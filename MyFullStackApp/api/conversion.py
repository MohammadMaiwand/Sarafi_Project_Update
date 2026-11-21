"""Shared USD-pivot conversion. Quote = currency units per one USD."""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP, localcontext
from rest_framework.exceptions import ValidationError

CURRENCIES = ('AFN','USD','TOMAN','EUR','TRY','PKR')
def decimal_value(value, field, positive=False):
    try:
        result=Decimal(str(value))
        if not result.is_finite() or result<0 or (positive and result==0): raise ValueError
        if result>Decimal('999999999999999999999'): raise ValueError
        return result
    except (InvalidOperation,ValueError,TypeError):
        raise ValidationError({field:'مقدار معتبر وارد کنید؛ نرخ باید بیشتر از صفر باشد.'})

def convert(amount, source, source_rate, destination=None, destination_rate=None, fee='0', fee_currency=None, collection='SEPARATE'):
    if source not in CURRENCIES or (destination and destination not in CURRENCIES):
        raise ValidationError({'currency':'واحد پول معتبر نیست.'})
    amount=decimal_value(amount,'amount',True)
    source_rate=Decimal(1) if source=='USD' else decimal_value(source_rate,'source_rate',True)
    fee=decimal_value(fee,'fee')
    if fee.as_tuple().exponent < -3: raise ValidationError({'fee':'فیس ثبت‌شده حداکثر سه رقم اعشار دارد.'})
    if collection not in ('SEPARATE','DEDUCTED'): raise ValidationError({'collection':'روش دریافت فیس معتبر نیست.'})
    if fee and fee_currency not in CURRENCIES: raise ValidationError({'fee_currency':'واحد فیس الزامی است.'})
    with localcontext() as context:
        context.prec=60
        usd=amount/source_rate
        dest_rate=Decimal(1) if destination=='USD' else decimal_value(destination_rate,'destination_rate',True) if destination else None
        gross=usd*dest_rate if destination else None
        if collection=='DEDUCTED' and (not destination or fee_currency!=destination):
            raise ValidationError({'fee_currency':'فیس کسرشده باید به واحد مقصد باشد.'})
        net=gross-fee if gross is not None and collection=='DEDUCTED' else gross
        if net is not None and net<0: raise ValidationError({'fee':'فیس از مبلغ قابل پرداخت بیشتر است.'})
        settle=lambda value: str(value.quantize(Decimal('.001'),rounding=ROUND_HALF_UP)) if value is not None else None
        return {'source':source,'destination':destination or None,'amount':str(amount),'source_rate':str(source_rate),'destination_rate':str(dest_rate) if dest_rate else None,'quote_direction':'UNITS_PER_USD','quote_unit':'1 USD','usd':settle(usd),'gross':settle(gross),'net':settle(net),'fee':str(fee),'fee_currency':fee_currency or None,'collection':collection,'settlement_precision':3}

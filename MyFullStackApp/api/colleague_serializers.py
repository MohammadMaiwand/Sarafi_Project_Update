from decimal import Decimal, ROUND_HALF_UP
from django.db.models import Sum
from rest_framework import serializers
from .models import Colleague, ColleagueTransaction

UNIT = Decimal('.001')
MAXIMUM = Decimal('999999999999.999')

def money(value):
    return str(Decimal(value).quantize(UNIT, rounding=ROUND_HALF_UP))

def calculate(currency, amount, rate):
    if amount <= 0 or rate <= 0:
        raise serializers.ValidationError({'amount': 'مبلغ و نرخ باید بیشتر از صفر باشند.'})
    if currency == 'AFN':
        afn, usd = amount, amount / rate
    elif currency == 'USD':
        afn, usd = amount * rate, amount
    elif currency in ('TOMAN','EUR','PKR','TRY'):
        # Same direct AFN-per-Toman convention as the incoming remittance module.
        afn, usd = amount * rate, Decimal(0)
    else:
        raise serializers.ValidationError({'currencyType': 'واحد پول نامعتبر است.'})
    if afn > MAXIMUM or usd > MAXIMUM:
        raise serializers.ValidationError({'amount': 'حاصل محاسبه از حد مجاز بزرگ‌تر است.'})
    return afn.quantize(UNIT, rounding=ROUND_HALF_UP), usd.quantize(UNIT, rounding=ROUND_HALF_UP)


def balance(person, rows=None, exclude=None):
    rows = rows if rows is not None else person.transactions.filter(deletedAt__isnull=True)
    if exclude is not None:
        rows = rows.exclude(pk=exclude)
    totals = {item['transactionType']: item['total'] or Decimal(0) for item in rows.values('transactionType').annotate(total=Sum('afnAmount'))}
    received, paid = totals.get('RECEIVED', Decimal(0)), totals.get('PAID', Decimal(0))
    return {'totalReceivedAfn': received, 'totalPaidAfn': paid, 'remainingAfn': received-paid}


def present_balance(values):
    return {key: money(value) for key,value in values.items()}


class ColleagueSerializer(serializers.ModelSerializer):
    manualNumber = serializers.IntegerField(write_only=True, required=False, allow_null=True, min_value=1, max_value=999999999)
    totalReceivedAfn = serializers.SerializerMethodField()
    totalPaidAfn = serializers.SerializerMethodField()
    remainingAfn = serializers.SerializerMethodField()

    class Meta:
        model = Colleague
        exclude = ['deletedAt']
        read_only_fields = ['colleagueNumber', 'createdAt', 'updatedAt']

    def values(self, person):
        if not hasattr(person, '_colleague_balance'):
            person._colleague_balance = balance(person)
        return person._colleague_balance

    def get_totalReceivedAfn(self, person): return money(self.values(person)['totalReceivedAfn'])
    def get_totalPaidAfn(self, person): return money(self.values(person)['totalPaidAfn'])
    def get_remainingAfn(self, person): return money(self.values(person)['remainingAfn'])


class ColleagueTransactionSerializer(serializers.ModelSerializer):
    manualNumber = serializers.IntegerField(write_only=True, required=False, allow_null=True, min_value=1, max_value=999999999)
    colleagueId = serializers.IntegerField(source='colleague_id', read_only=True)
    colleagueName = serializers.CharField(source='colleague.colleagueName', read_only=True)
    fatherName = serializers.CharField(source='colleague.fatherName', read_only=True)

    class Meta:
        model = ColleagueTransaction
        exclude = ['colleague', 'deletedAt']
        read_only_fields = ['transactionNumber', 'afnAmount', 'usdAmount', 'createdAt', 'updatedAt']

    def validate(self, attrs):
        def value(field):
            return attrs.get(field, getattr(self.instance, field, None))
        if self.instance and value('transactionType') != self.instance.transactionType:
            raise serializers.ValidationError({'transactionType': 'نوع معامله پس از ثبت قابل تغییر نیست.'})
        if value('amount') is None or value('usdRate') is None:
            raise serializers.ValidationError({'amount': 'مبلغ و نرخ را وارد کنید.'})
        afn, usd = calculate(value('currencyType'), value('amount'), value('usdRate'))
        attrs.update(afnAmount=afn, usdAmount=usd)
        return attrs

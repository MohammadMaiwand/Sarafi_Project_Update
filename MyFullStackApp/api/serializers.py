from decimal import Decimal
from django.db import transaction as database_transaction
from django.db.models import Sum
from rest_framework import serializers

from .models import Customer, Transaction, three_places


class CustomerSerializer(serializers.ModelSerializer):
    total_toman = serializers.SerializerMethodField()
    total_usd = serializers.SerializerMethodField()
    total_afghani = serializers.SerializerMethodField()
    total_profit = serializers.SerializerMethodField()
    currency_totals = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = ['id', 'name', 'phone', 'created_at', 'total_toman', 'total_usd', 'total_afghani', 'total_profit', 'currency_totals']
        read_only_fields = ['id', 'created_at', 'total_toman', 'total_usd', 'total_afghani', 'total_profit', 'currency_totals']

    def _total(self, obj, field):
        totals = getattr(obj, 'transaction_totals', None)
        if totals is not None:
            return three_places(totals.get(field) or 0)
        value = obj.transactions.aggregate(value=Sum(field))['value'] or 0
        return three_places(value)

    def get_total_toman(self, obj):
        return three_places(obj.transactions.filter(source_currency='TOMAN').aggregate(value=Sum('toman_amount'))['value'] or 0)

    def get_total_usd(self, obj):
        return self._total(obj, 'usd_amount')

    def get_total_afghani(self, obj):
        return self._total(obj, 'afghani_amount')

    def get_currency_totals(self, obj):
        return list(obj.transactions.values('source_currency').annotate(amount=Sum('toman_amount')))

    def get_total_profit(self, obj):
        if obj.transactions.exclude(source_currency='TOMAN',destination_currency='AFN').exists(): return None
        toman = self._total(obj, 'toman_amount')
        afghani = self._total(obj, 'afghani_amount')
        return (afghani / toman).quantize(Decimal('0.000000001')) if toman else Decimal('0.000000000')


class TransactionSerializer(serializers.ModelSerializer):
    voucher_number = serializers.CharField(max_length=40)
    request_key = serializers.CharField(required=False, write_only=True, max_length=100)
    customer = CustomerSerializer(read_only=True)
    customer_id = serializers.PrimaryKeyRelatedField(source='customer', queryset=Customer.objects.all(), write_only=True, required=False)
    customer_name = serializers.CharField(max_length=200, write_only=True, required=False)
    customer_phone = serializers.CharField(max_length=40, write_only=True, required=False, allow_blank=True)

    def validate(self, attrs):
        if self.instance and hasattr(self.instance,'financialdocument'):
            for key in ['toman_amount','toman_rate','afghani_rate','destination_rate','source_currency','destination_currency','fee_amount','fee_currency','fee_collection']:
                if key in attrs and attrs[key]!=getattr(self.instance,key):
                    raise serializers.ValidationError({key:'این حواله به ثبت مالی وصل شده است؛ برای اصلاح مبلغ از برگشت و ثبت اصلاحی در حساب مشتری استفاده کنید.'})
        number=attrs.get('voucher_number',getattr(self.instance,'voucher_number',None))
        existing=Transaction.objects.filter(voucher_number=number).exclude(pk=getattr(self.instance,'pk',None)).first()
        if existing and (not attrs.get('request_key') or existing.request_key!=attrs['request_key']):
            raise serializers.ValidationError({'voucher_number':'این نمبر حواله قبلاً استفاده شده است.'})
        if not self.instance and not attrs.get('customer') and not attrs.get('customer_name'):
            raise serializers.ValidationError({'customer_name': 'نام مشتری را وارد کنید یا مشتری موجود را انتخاب کنید.'})
        for field in ('toman_amount', 'toman_rate', 'afghani_rate'):
            if attrs.get(field, getattr(self.instance, field, 0)) < 0:
                raise serializers.ValidationError({field: 'Amount and rates cannot be negative.'})
        def value(field):
            return attrs.get(field, getattr(self.instance, field, Decimal('0')))
        toman, toman_rate, afghani_rate = (value(field) for field in ('toman_amount', 'toman_rate', 'afghani_rate'))
        maximum = Decimal('999999999999.999')
        usd = three_places(toman / toman_rate) if toman_rate else Decimal('0')
        if usd > maximum:
            raise serializers.ValidationError({'toman_rate': 'مقدار دالر محاسبه‌شده از حد مجاز بیشتر است.'})
        afghani = three_places(toman * afghani_rate / toman_rate) if toman_rate else Decimal(0)
        if afghani > maximum:
            raise serializers.ValidationError({'afghani_rate': 'مقدار افغانی محاسبه‌شده از حد مجاز بیشتر است.'})
        profit = three_places(afghani / toman) if toman else Decimal('0')
        if profit > maximum:
            raise serializers.ValidationError({'toman_amount': 'مفاد تومان محاسبه‌شده از حد مجاز بیشتر است.'})
        if 'source_currency' in attrs or 'destination_currency' in attrs or 'destination_rate' in attrs:
            from .conversion import convert
            get=lambda key,default=None: attrs.get(key,getattr(self.instance,key,default))
            source=get('source_currency','TOMAN'); destination=get('destination_currency','AFN')
            converted=convert(toman,source,toman_rate,destination,get('destination_rate') if get('destination_rate') is not None else afghani_rate,get('fee_amount','0'),get('fee_currency','AFN'),get('fee_collection','SEPARATE'))
            if Decimal(converted['usd'])>maximum or (converted['net'] is not None and Decimal(converted['net'])>maximum):
                raise serializers.ValidationError({'toman_amount':'مبلغ تبدیل‌شده از حد مجاز بیشتر است.'})
        return attrs

    @database_transaction.atomic
    def create(self, validated_data):
        import hashlib, json
        from .models import LedgerSetting
        key=validated_data.get('request_key')
        digest=hashlib.sha256(json.dumps({k:getattr(v,'pk',str(v)) for k,v in validated_data.items() if k!='request_key'},sort_keys=True).encode()).hexdigest()
        # Lock shared setting before checking idempotency; also serializes SQLite writes.
        if key:
            LedgerSetting.objects.get_or_create(key='tehran_posting',defaults={'value':0})
            LedgerSetting.objects.select_for_update().filter(key='tehran_posting').update(value=0)
            previous=Transaction.objects.filter(request_key=key).first()
            if previous:
                if previous.request_hash!=digest: raise serializers.ValidationError({'request_key':'این درخواست قبلاً با معلومات دیگری ثبت شده است.'})
                return previous
            validated_data['request_hash']=digest
        name = validated_data.pop('customer_name', '')
        phone = validated_data.pop('customer_phone', '')
        if 'customer' not in validated_data:
            validated_data['customer'] = Customer.objects.create(name=name, phone=phone)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data.pop('request_key',None)
        validated_data.pop('customer_name', None)
        validated_data.pop('customer_phone', None)
        return super().update(instance, validated_data)

    class Meta:
        model = Transaction
        fields = [
            'id', 'request_key', 'customer', 'customer_id', 'customer_name', 'customer_phone', 'voucher_number', 'date', 'sender_name', 'receiver_name',
            'toman_amount', 'usd_amount', 'afghani_amount', 'toman_rate', 'afghani_rate', 'toman_profit',
            'transaction_kind','source_currency','destination_currency','destination_rate','destination_amount','fee_amount','fee_currency','fee_collection','applied_conversion','sender_father_name','depositor_cardholder','depositor_card','purpose_reference',
            'description', 'bank_account', 'toman_in_words', 'expense', 'created_at', 'updated_at',
        ]
        read_only_fields = ['destination_amount','applied_conversion','id', 'usd_amount', 'afghani_amount', 'toman_profit', 'created_at', 'updated_at']

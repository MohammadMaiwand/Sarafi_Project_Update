from decimal import Decimal, ROUND_HALF_UP
from django.db.models import Sum
from rest_framework import serializers
from .models import DebtorCustomer, DebtPayment
from .remittance_domain import validate_file_data

CENT = Decimal('.01')
MAX_MONEY = Decimal('9999999999999.99')

def money(value):
    return str(Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP))

def account(debtor, exclude=None):
    payments = debtor.payments.filter(deleted_at__isnull=True)
    if exclude is not None:
        payments = payments.exclude(pk=exclude)
    totals = {row['payment_type']: row['amount'] or Decimal(0) for row in payments.values('payment_type').annotate(amount=Sum('payment_usd_amount'))}
    loans, paid = totals.get('LOAN', Decimal(0)), totals.get('PAYMENT', Decimal(0))
    return {'total_loan_usd': loans, 'total_paid_usd': paid, 'remaining_usd': debtor.original_usd_amount + loans - paid}

class DebtorSerializer(serializers.ModelSerializer):
    manual_sequence = serializers.IntegerField(write_only=True, required=False, min_value=1, max_value=999999999)
    total_paid_usd = serializers.SerializerMethodField()
    total_loan_usd = serializers.SerializerMethodField()
    remaining_usd = serializers.SerializerMethodField()
    is_fully_paid = serializers.SerializerMethodField()
    has_id_card_image = serializers.SerializerMethodField()
    has_fingerprint = serializers.SerializerMethodField()

    class Meta:
        model = DebtorCustomer
        exclude = ['deleted_at']
        read_only_fields = ['customer_number', 'number_is_manual', 'original_afn_amount', 'created_at', 'updated_at']

    def balance(self, row):
        if not hasattr(row, '_debtor_balance'):
            row._debtor_balance = account(row)
        return row._debtor_balance

    def get_total_paid_usd(self, row): return money(self.balance(row)['total_paid_usd'])
    def get_total_loan_usd(self, row): return money(self.balance(row)['total_loan_usd'])
    def get_remaining_usd(self, row): return money(self.balance(row)['remaining_usd'])
    def get_is_fully_paid(self, row): return self.balance(row)['remaining_usd'] == 0
    def get_has_id_card_image(self, row): return bool(row.id_card_image_ref)
    def get_has_fingerprint(self, row): return row.fingerprint_enabled and bool(row.fingerprint_template_ref)

    def validate(self, attrs):
        def value(key, default=''):
            return attrs.get(key, getattr(self.instance, key, default))
        if self.instance:
            for field in ['debtor_type', 'usd_rate', 'original_usd_amount']:
                if field in attrs and attrs[field] != getattr(self.instance, field):
                    raise serializers.ValidationError({field: 'این مقدار تاریخی است و پس از ثبت قابل تغییر نیست.'})
        if value('debtor_type', 'SMALL') == 'LARGE' and not value('national_id').strip():
            raise serializers.ValidationError({'national_id': 'شماره تذکره برای معاملات بزرگ الزامی است.'})
        amount = Decimal(value('original_usd_amount', 0))
        rate = Decimal(value('usd_rate', 0))
        if amount < 0:
            raise serializers.ValidationError({'original_usd_amount': 'اصل قرض نمی‌تواند منفی باشد.'})
        if not self.instance and ('original_usd_amount' not in attrs or rate <= 0):
            raise serializers.ValidationError({'usd_rate': 'اصل قرض و نرخ مثبت دالر را وارد کنید.'})
        afn = (amount * rate).quantize(CENT, rounding=ROUND_HALF_UP)
        if afn > MAX_MONEY:
            raise serializers.ValidationError({'usd_rate': 'معادل افغانی از حد مجاز بیشتر است.'})
        if not self.instance:
            attrs['original_afn_amount'] = afn
        validate_file_data(value('id_card_image_ref'), 'id_card_image_ref', image=True)
        validate_file_data(value('fingerprint_template_ref'), 'fingerprint_template_ref')
        if value('fingerprint_enabled', False) and not value('fingerprint_template_ref'):
            raise serializers.ValidationError({'fingerprint_template_ref': 'قالب اثر انگشت ثبت نشده است.'})
        if not value('fingerprint_enabled', False):
            attrs['fingerprint_template_ref'] = ''
        return attrs

class DebtorListSerializer(DebtorSerializer):
    class Meta(DebtorSerializer.Meta):
        exclude = ['deleted_at', 'id_card_image_ref', 'fingerprint_template_ref']

class DebtPaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = DebtPayment
        exclude = ['deleted_at']
        read_only_fields = ['debtor', 'payment_date', 'payment_afn_amount', 'usd_rate', 'created_at', 'updated_at']

    def validate_payment_usd_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError('مبلغ باید بیشتر از صفر باشد.')
        return value

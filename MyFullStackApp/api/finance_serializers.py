from decimal import Decimal

from django.db.models import Sum
from rest_framework import serializers

from .models import CustomerDeposit, DebtPayment, DebtorCustomer, DepositWithdrawal, Expense, MudarabahContract


class ExpenseSerializer(serializers.ModelSerializer):
    manual_sequence = serializers.IntegerField(write_only=True, required=False, min_value=1)
    class Meta:
        model = Expense
        fields = '__all__'
        read_only_fields = ['expense_number', 'number_is_manual', 'afn_amount', 'created_at', 'updated_at', 'deleted_at']

    def validate(self, attrs):
        amount = attrs.get('amount', getattr(self.instance, 'amount', Decimal('0')))
        rate = attrs.get('afn_rate', getattr(self.instance, 'afn_rate', Decimal('1')))
        if amount <= 0 or rate <= 0:
            raise serializers.ValidationError({'amount': 'Amount and exchange rate must be greater than zero.'})
        return attrs


class MudarabahSerializer(serializers.ModelSerializer):
    manual_sequence = serializers.IntegerField(write_only=True, required=False, min_value=1)
    class Meta:
        model = MudarabahContract
        fields = '__all__'
        read_only_fields = ['contract_number', 'number_is_manual', 'profit_amount', 'investor_share_amount', 'agent_share_amount', 'created_at', 'updated_at', 'deleted_at']

    def validate(self, attrs):
        investor = attrs.get('investor_share_percent', getattr(self.instance, 'investor_share_percent', Decimal('50')))
        agent = attrs.get('agent_share_percent', getattr(self.instance, 'agent_share_percent', Decimal('50')))
        if investor + agent != Decimal('100'):
            raise serializers.ValidationError({'agent_share_percent': 'Investor and agent shares must total 100%.'})
        if attrs.get('duration_months', getattr(self.instance, 'duration_months', 1)) < 1:
            raise serializers.ValidationError({'duration_months': 'Duration must be at least one month.'})
        return attrs


class DebtPaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = DebtPayment
        exclude = ['deleted_at']
        read_only_fields = ['debtor', 'created_at', 'updated_at']


class DebtorSerializer(serializers.ModelSerializer):
    manual_sequence = serializers.IntegerField(write_only=True, required=False, min_value=1)
    total_paid_usd = serializers.SerializerMethodField()
    total_loan_usd = serializers.SerializerMethodField()
    remaining_usd = serializers.SerializerMethodField()
    is_fully_paid = serializers.SerializerMethodField()

    class Meta:
        model = DebtorCustomer
        fields = '__all__'
        read_only_fields = ['customer_number', 'number_is_manual', 'created_at', 'updated_at', 'deleted_at']

    def _payment_totals(self, obj):
        return getattr(obj, '_payment_totals', None) or obj.payments.filter(deleted_at__isnull=True).values('payment_type').annotate(total=Sum('payment_usd_amount'))

    def get_total_paid_usd(self, obj):
        return sum((row['total'] or 0 for row in self._payment_totals(obj) if row['payment_type'] == 'PAYMENT'), Decimal('0.00'))

    def get_total_loan_usd(self, obj):
        return sum((row['total'] or 0 for row in self._payment_totals(obj) if row['payment_type'] == 'LOAN'), Decimal('0.00'))

    def get_remaining_usd(self, obj):
        return obj.original_usd_amount + self.get_total_loan_usd(obj) - self.get_total_paid_usd(obj)

    def get_is_fully_paid(self, obj):
        return self.get_remaining_usd(obj) <= 0


class DepositWithdrawalSerializer(serializers.ModelSerializer):
    class Meta:
        model = DepositWithdrawal
        exclude = ['deleted_at']
        read_only_fields = ['deposit', 'afn_amount', 'created_at']


class CustomerDepositSerializer(serializers.ModelSerializer):
    manual_sequence = serializers.IntegerField(write_only=True, required=False, min_value=1)
    remaining = serializers.SerializerMethodField()
    withdrawal_count = serializers.SerializerMethodField()
    money_fields_locked = serializers.SerializerMethodField()

    class Meta:
        model = CustomerDeposit
        fields = '__all__'
        read_only_fields = ['deposit_number', 'number_is_manual', 'total_afn', 'amount_to', 'final_amount', 'created_at', 'updated_at', 'deleted_at']

    def validate(self, attrs):
        kind = attrs.get('deposit_type', getattr(self.instance, 'deposit_type', 'CASH'))
        name = attrs.get('customer_name', getattr(self.instance, 'customer_name', ''))
        if not name and kind != 'EXCHANGE':
            raise serializers.ValidationError({'customer_name': 'Customer name is required.'})
        if kind == 'HAWALA' and not self.instance:
            raise serializers.ValidationError({'deposit_type':'حواله پرداخت‌نشده را از حواله اصلی و پرداخت‌های همان حواله پیگیری کنید؛ ایجاد تعهد تکراری مجاز نیست.'})
        if kind == 'HAWALA' and not (attrs.get('sender_name', getattr(self.instance, 'sender_name', '')) and attrs.get('recipient_name', getattr(self.instance, 'recipient_name', ''))):
            raise serializers.ValidationError({'sender_name': 'Hawala sender and recipient are required.'})
        if kind == 'HAWALA':
            fee = attrs.get('hawala_fee', getattr(self.instance, 'hawala_fee', Decimal('0')))
            amount = attrs.get('amount', getattr(self.instance, 'amount', Decimal('0')))
            rate = attrs.get('afn_rate', getattr(self.instance, 'afn_rate', Decimal('1')))
            total_afn = amount if attrs.get('currency_type', getattr(self.instance, 'currency_type', 'AFN')) == 'AFN' else amount * rate
            if fee < 0 or fee >= total_afn:
                raise serializers.ValidationError({'hawala_fee': 'Fee must be non-negative and lower than the total amount in AFN.'})
        if kind == 'EXCHANGE':
            from_currency = attrs.get('currency_from', getattr(self.instance, 'currency_from', ''))
            to_currency = attrs.get('currency_to', getattr(self.instance, 'currency_to', ''))
            amount_from = attrs.get('amount_from', getattr(self.instance, 'amount_from', Decimal('0')))
            rate = attrs.get('conversion_rate', getattr(self.instance, 'conversion_rate', Decimal('0')))
            if not from_currency or not to_currency or from_currency == to_currency or amount_from <= 0 or rate <= 0:
                raise serializers.ValidationError({'amount_from': 'Choose different currencies and enter a positive amount and rate.'})
            fee = attrs.get('conversion_fee', getattr(self.instance, 'conversion_fee', Decimal('0')))
            if fee < 0 or fee >= amount_from * rate:
                raise serializers.ValidationError({'conversion_fee': 'Fee must be non-negative and lower than the converted amount.'})
        else:
            amount = attrs.get('amount', getattr(self.instance, 'amount', Decimal('0')))
            rate = attrs.get('afn_rate', getattr(self.instance, 'afn_rate', Decimal('1')))
            if amount <= 0 or rate <= 0:
                raise serializers.ValidationError({'amount': 'Amount and exchange rate must be greater than zero.'})
        if kind == 'TERM':
            owner = attrs.get('owner_name', getattr(self.instance, 'owner_name', ''))
            due = attrs.get('due_date', getattr(self.instance, 'due_date', None))
            received = attrs.get('received_date', getattr(self.instance, 'received_date', None))
            if not owner or not due or (received and due < received):
                raise serializers.ValidationError({'due_date': 'Owner and a valid due date are required.'})
        if self.instance and kind != self.instance.deposit_type:
            raise serializers.ValidationError({'deposit_type': 'Deposit type cannot be changed after creation.'})
        if self.instance and self.instance.money_fields_locked:
            locked = {'currency_type', 'amount', 'afn_rate', 'total_afn', 'amount_words', 'currency_from', 'currency_to', 'amount_from', 'conversion_rate'}
            if locked.intersection(attrs):
                raise serializers.ValidationError({'amount': 'Deposit amount and currency are locked after the first withdrawal.'})
        return attrs

    def get_remaining(self, obj):
        rows = obj.withdrawals.filter(deleted_at__isnull=True)
        if obj.deposit_type == 'HAWALA':
            withdrawals = rows.filter(currency_type='AFN', withdrawal_type='WITHDRAWAL').aggregate(v=Sum('amount'))['v'] or Decimal('0.000')
            additions = rows.filter(currency_type='AFN', withdrawal_type='ADDITION').aggregate(v=Sum('amount'))['v'] or Decimal('0.000')
            return obj.total_afn - obj.hawala_fee - withdrawals + additions
        if obj.deposit_type == 'EXCHANGE':
            base = obj.final_amount
            currency = obj.currency_to
        else:
            base = obj.amount
            currency = obj.currency_type
        withdrawals = rows.filter(currency_type=currency, withdrawal_type='WITHDRAWAL').aggregate(v=Sum('amount'))['v'] or Decimal('0.000')
        additions = rows.filter(currency_type=currency, withdrawal_type='ADDITION').aggregate(v=Sum('amount'))['v'] or Decimal('0.000')
        return base - withdrawals + additions

    def get_withdrawal_count(self, obj):
        return obj.withdrawals.filter(deleted_at__isnull=True).count()

    def get_money_fields_locked(self, obj):
        return obj.money_fields_locked

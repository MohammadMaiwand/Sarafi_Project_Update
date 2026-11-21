from .audited_model import AuditedFinancialModel
from decimal import Decimal, ROUND_HALF_UP

from django.db import models
from django.utils import timezone
from .ledger_models import Currency, Agency, FinancialAccount, RateQuote, FinancialDocument, LedgerPosting, ReceiptAllocation, LedgerSetting, FinancialAudit, Province


def three_places(value):
    if value in (None, ''):
        return Decimal('0.000')
    return Decimal(value).quantize(Decimal('0.001'), rounding=ROUND_HALF_UP)


class Customer(models.Model):
    name = models.CharField(max_length=200)
    phone = models.CharField(max_length=40, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name', 'id']

    def __str__(self):
        return self.name


class Transaction(AuditedFinancialModel):
    request_key = models.CharField(max_length=100, unique=True, null=True, blank=True)
    request_hash = models.CharField(max_length=64, blank=True)
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='transactions')
    voucher_number = models.CharField(max_length=40, unique=True)
    date = models.DateField()
    sender_name = models.CharField(max_length=200, blank=True)
    receiver_name = models.CharField(max_length=200, blank=True)
    toman_amount = models.DecimalField(max_digits=15, decimal_places=3, default=Decimal('0.000'))
    usd_amount = models.DecimalField(max_digits=15, decimal_places=3, default=Decimal('0.000'))
    afghani_amount = models.DecimalField(max_digits=15, decimal_places=3, default=Decimal('0.000'))
    toman_rate = models.DecimalField(max_digits=32, decimal_places=12, default=Decimal('0.000'))
    afghani_rate = models.DecimalField(max_digits=32, decimal_places=12, default=Decimal('0.000'))
    toman_profit = models.DecimalField(max_digits=21, decimal_places=9, default=Decimal('0.000'))
    transaction_kind = models.CharField(max_length=12, default='REMITTANCE', choices=[('RECEIPT','Receipt'),('REMITTANCE','Remittance')])
    source_currency = models.CharField(max_length=8, default='TOMAN')
    destination_currency = models.CharField(max_length=8, blank=True, default='AFN')
    destination_rate = models.DecimalField(max_digits=32, decimal_places=12, null=True, blank=True)
    destination_amount = models.DecimalField(max_digits=24, decimal_places=3, null=True, blank=True)
    fee_amount = models.DecimalField(max_digits=15, decimal_places=3, default=0)
    fee_currency = models.CharField(max_length=8, default='AFN')
    fee_collection = models.CharField(max_length=12, default='SEPARATE')
    applied_conversion = models.JSONField(default=dict)
    sender_father_name = models.CharField(max_length=200, blank=True)
    depositor_cardholder = models.CharField(max_length=200, blank=True)
    depositor_card = models.CharField(max_length=200, blank=True)
    purpose_reference = models.TextField(blank=True)
    toman_in_words = models.CharField(max_length=1000, blank=True)
    expense = models.TextField(blank=True, default='')
    description = models.TextField(blank=True)
    bank_account = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date', '-id']

    def save(self, *args, **kwargs):
        self.toman_amount = three_places(self.toman_amount)
        self.toman_rate = Decimal(self.toman_rate)
        self.afghani_rate = Decimal(self.afghani_rate)
        if self.source_currency=='USD': self.toman_rate=Decimal(1)
        if self.destination_currency=='USD':
            self.afghani_rate=Decimal(1)
            self.destination_rate=Decimal(1)
        if self.toman_rate:
            self.usd_amount = three_places(self.toman_amount / self.toman_rate)
        else:
            self.usd_amount = three_places(0)
        if self.afghani_rate:
            self.afghani_amount = three_places(self.toman_amount * self.afghani_rate / self.toman_rate) if self.toman_rate else three_places(0)
        else:
            self.afghani_amount = three_places(0)
        self.toman_profit = (self.afghani_rate / self.toman_rate).quantize(Decimal('0.000000001'), rounding=ROUND_HALF_UP) if self.toman_amount and self.toman_rate else Decimal('0.000000000')
        from .conversion import convert
        # Old zero-rate records remain readable; new submissions reject invalid rates.
        if (self.source_currency=='USD' or self.toman_rate) and (not self.destination_currency or self.destination_currency=='USD' or self.destination_rate or self.afghani_rate):
            destination_rate=self.destination_rate if self.destination_rate is not None else self.afghani_rate
            converted=convert(self.toman_amount,self.source_currency,self.toman_rate,self.destination_currency,destination_rate,self.fee_amount,self.fee_currency,self.fee_collection) if self.toman_amount else {}
            if converted:
                self.applied_conversion=converted
                self.usd_amount=Decimal(converted['usd'])
                self.destination_amount=Decimal(converted['net']) if converted['net'] is not None else None
                self.afghani_amount=self.destination_amount if self.destination_currency=='AFN' else Decimal(0)
                if converted['destination_rate']:
                    effective=Decimal(converted['destination_rate'])/Decimal(converted['source_rate'])
                    if self.fee_collection=='DEDUCTED': effective-=self.fee_amount/self.toman_amount
                    self.toman_profit=effective.quantize(Decimal('.000000001'),rounding=ROUND_HALF_UP)
                else:
                    self.toman_profit=Decimal(0)
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.voucher_number} — {self.customer.name}'


class NumberSequence(models.Model):
    prefix = models.CharField(max_length=8)
    year = models.PositiveSmallIntegerField()
    last_value = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['prefix', 'year'], name='unique_record_number_sequence')]


class Expense(AuditedFinancialModel):
    CURRENCIES = [('AFN', 'AFN'), ('TOMAN', 'Toman'), ('USD', 'USD'), ('EUR', 'EUR'), ('PKR', 'PKR'), ('TRY', 'TRY')]
    expense_number = models.CharField(max_length=40, unique=True)
    number_is_manual = models.BooleanField(default=False)
    date = models.DateField(default=timezone.localdate)
    category = models.CharField(max_length=100)
    amount = models.DecimalField(max_digits=15, decimal_places=3)
    currency_type = models.CharField(max_length=8, choices=CURRENCIES, default='AFN')
    afn_rate = models.DecimalField(max_digits=15, decimal_places=6, default=Decimal('1'))
    afn_amount = models.DecimalField(max_digits=15, decimal_places=3, default=Decimal('0.000'))
    paid_by = models.CharField(max_length=150, blank=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-date', '-id']


class MudarabahContract(AuditedFinancialModel):
    CURRENCIES = Expense.CURRENCIES
    CALC_MODES = [('manual', 'Manual'), ('auto', 'Auto')]
    STATUSES = [('active', 'Active'), ('completed', 'Completed')]
    contract_number = models.CharField(max_length=40, unique=True)
    number_is_manual = models.BooleanField(default=False)
    start_date = models.DateField(default=timezone.localdate)
    investor_name = models.CharField(max_length=200)
    agent_name = models.CharField(max_length=200)
    currency_type = models.CharField(max_length=8, choices=CURRENCIES, default='AFN')
    principal_amount = models.DecimalField(max_digits=15, decimal_places=2)
    calculation_mode = models.CharField(max_length=8, choices=CALC_MODES, default='manual')
    annual_return_rate = models.DecimalField(max_digits=8, decimal_places=4, default=Decimal('0'))
    duration_months = models.PositiveSmallIntegerField(default=1)
    manual_profit_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    profit_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    investor_share_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('50.00'))
    agent_share_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('50.00'))
    investor_share_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    agent_share_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    status = models.CharField(max_length=10, choices=STATUSES, default='active')
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-start_date', '-id']

    def save(self, *args, **kwargs):
        if self.calculation_mode == 'auto':
            raw_profit = self.principal_amount * self.annual_return_rate / Decimal('100') * Decimal(self.duration_months) / Decimal('12')
            self.profit_amount = raw_profit.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        else:
            self.profit_amount = self.manual_profit_amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        self.investor_share_amount = (self.profit_amount * self.investor_share_percent / Decimal('100')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        self.agent_share_amount = (self.profit_amount * self.agent_share_percent / Decimal('100')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        super().save(*args, **kwargs)


class DebtorCustomer(AuditedFinancialModel):
    DEBTOR_TYPES = [('SMALL', 'Small'), ('LARGE', 'Large')]
    customer_number = models.CharField(max_length=40, unique=True)
    number_is_manual = models.BooleanField(default=False)
    debtor_type = models.CharField(max_length=8, choices=DEBTOR_TYPES, default='SMALL')
    customer_name = models.CharField(max_length=200)
    father_name = models.CharField(max_length=200, blank=True)
    phone_number = models.CharField(max_length=50, blank=True)
    location = models.CharField(max_length=200, blank=True)
    national_id = models.CharField(max_length=100, blank=True)
    id_card_image_ref = models.TextField(blank=True)
    fingerprint_enabled = models.BooleanField(default=False)
    fingerprint_template_ref = models.TextField(blank=True)
    original_usd_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    original_afn_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    usd_rate = models.DecimalField(max_digits=15, decimal_places=6, default=Decimal('0'))
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['customer_name', 'id']


class DebtPayment(AuditedFinancialModel):
    TYPES = [('LOAN', 'Loan'), ('PAYMENT', 'Payment')]
    debtor = models.ForeignKey(DebtorCustomer, on_delete=models.CASCADE, related_name='payments')
    payment_date = models.DateField(default=timezone.localdate)
    payment_type = models.CharField(max_length=8, choices=TYPES, default='PAYMENT')
    payment_usd_amount = models.DecimalField(max_digits=15, decimal_places=2)
    payment_afn_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    usd_rate = models.DecimalField(max_digits=15, decimal_places=6, default=Decimal('0'))
    payment_description = models.CharField(max_length=200, blank=True)
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-payment_date', '-id']


class CustomerDeposit(AuditedFinancialModel):
    TYPES = [('CASH', 'Cash'), ('HAWALA', 'Hawala'), ('EXCHANGE', 'Exchange'), ('TERM', 'Term')]
    CURRENCIES = Expense.CURRENCIES
    PREFIXES = {'CASH': 'CD', 'HAWALA': 'HW', 'EXCHANGE': 'EX', 'TERM': 'TR'}
    deposit_number = models.CharField(max_length=40, unique=True)
    number_is_manual = models.BooleanField(default=False)
    deposit_type = models.CharField(max_length=10, choices=TYPES, default='CASH')
    customer_name = models.CharField(max_length=200)
    father_name = models.CharField(max_length=200, blank=True)
    phone_number = models.CharField(max_length=50, blank=True)
    location = models.CharField(max_length=200, blank=True)
    currency_type = models.CharField(max_length=8, choices=CURRENCIES, default='AFN')
    amount = models.DecimalField(max_digits=15, decimal_places=3, default=Decimal('0.000'))
    afn_rate = models.DecimalField(max_digits=15, decimal_places=6, default=Decimal('1'))
    total_afn = models.DecimalField(max_digits=15, decimal_places=3, default=Decimal('0.000'))
    amount_words = models.CharField(max_length=500, blank=True)
    deposit_purpose = models.CharField(max_length=200, blank=True)
    deposit_duration = models.CharField(max_length=100, blank=True)
    received_date = models.DateField(default=timezone.localdate)
    due_date = models.DateField(null=True, blank=True)
    owner_name = models.CharField(max_length=200, blank=True)
    sender_name = models.CharField(max_length=200, blank=True)
    sender_phone = models.CharField(max_length=50, blank=True)
    recipient_name = models.CharField(max_length=200, blank=True)
    recipient_phone = models.CharField(max_length=50, blank=True)
    hawala_number = models.CharField(max_length=40, blank=True)
    pay_location = models.CharField(max_length=200, blank=True)
    hawala_fee = models.DecimalField(max_digits=15, decimal_places=3, default=Decimal('0.000'))
    hawala_status = models.CharField(max_length=20, default='pending')
    paid_amount = models.DecimalField(max_digits=15, decimal_places=3, default=Decimal('0.000'))
    currency_from = models.CharField(max_length=8, blank=True)
    currency_to = models.CharField(max_length=8, blank=True)
    amount_from = models.DecimalField(max_digits=15, decimal_places=3, default=Decimal('0.000'))
    amount_to = models.DecimalField(max_digits=15, decimal_places=3, default=Decimal('0.000'))
    conversion_rate = models.DecimalField(max_digits=15, decimal_places=6, default=Decimal('0'))
    conversion_fee = models.DecimalField(max_digits=15, decimal_places=3, default=Decimal('0.000'))
    final_amount = models.DecimalField(max_digits=15, decimal_places=3, default=Decimal('0.000'))
    conversion_status = models.CharField(max_length=20, default='pending')
    delay_reason = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-received_date', '-id']

    def save(self, *args, **kwargs):
        self.amount = three_places(self.amount)
        self.total_afn = three_places(self.amount * self.afn_rate) if self.currency_type != 'AFN' else three_places(self.amount)
        if self.deposit_type == 'HAWALA':
            self.paid_amount = three_places(self.paid_amount)
        if self.deposit_type == 'EXCHANGE':
            self.amount_to = three_places(self.amount_from * self.conversion_rate)
            self.final_amount = three_places(self.amount_to - self.conversion_fee)
        super().save(*args, **kwargs)

    @property
    def money_fields_locked(self):
        return self.withdrawals.filter(deleted_at__isnull=True).exists()


class DepositWithdrawal(AuditedFinancialModel):
    TYPES = [('WITHDRAWAL', 'Withdrawal'), ('ADDITION', 'Addition')]
    deposit = models.ForeignKey(CustomerDeposit, on_delete=models.CASCADE, related_name='withdrawals')
    withdrawal_date = models.DateField(default=timezone.localdate)
    withdrawal_type = models.CharField(max_length=12, choices=TYPES, default='WITHDRAWAL')
    currency_type = models.CharField(max_length=8, choices=Expense.CURRENCIES, default='AFN')
    amount = models.DecimalField(max_digits=15, decimal_places=3)
    afn_rate = models.DecimalField(max_digits=15, decimal_places=6, default=Decimal('1'))
    afn_amount = models.DecimalField(max_digits=15, decimal_places=3, default=Decimal('0.000'))
    description = models.CharField(max_length=200, blank=True)
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-withdrawal_date', '-id']

    def save(self, *args, **kwargs):
        self.amount = three_places(self.amount)
        self.afn_amount = three_places(self.amount * self.afn_rate) if self.currency_type != 'AFN' else three_places(self.amount)
        super().save(*args, **kwargs)

class Remittance(AuditedFinancialModel):
    conversionPath=models.CharField(max_length=20,default='TOMAN_TO_AFN')
    rateBaseAmount=models.PositiveIntegerField(default=1)
    tomanAmountKnown=models.BooleanField(default=True)
    afnAmountKnown=models.BooleanField(default=True)
    manualProfit=models.DecimalField(max_digits=24,decimal_places=3,null=True,blank=True)
    manualProfitCurrency=models.CharField(max_length=8,blank=True)
    customer=models.ForeignKey(Customer,null=True,blank=True,on_delete=models.PROTECT)
    kind = models.CharField(max_length=24, db_index=True)
    operationType = models.CharField(max_length=20, default='FX_RATE')
    hawalaNumber = models.CharField(max_length=50, unique=True)
    transactionDate = models.DateField()
    senderName = models.CharField(max_length=200, blank=True)
    senderFatherName = models.CharField(max_length=200, blank=True)
    receiverName = models.CharField(max_length=200, blank=True)
    receiverFatherName = models.CharField(max_length=200, blank=True)
    recipientName = models.CharField(max_length=200, blank=True)
    recipientFatherName = models.CharField(max_length=200, blank=True)
    location = models.CharField(max_length=200, blank=True)
    currencyType = models.CharField(max_length=8, default='TOMAN')
    tomanAmount = models.DecimalField(max_digits=24, decimal_places=3, default=0)
    sourceAmount = models.DecimalField(max_digits=24, decimal_places=3, default=0)
    afnUsdRate = models.DecimalField(max_digits=20, decimal_places=8, default=0)
    usdRate = models.DecimalField(max_digits=20, decimal_places=8, default=0)
    usdAmount = models.DecimalField(max_digits=24, decimal_places=3, default=0)
    afnAmount = models.DecimalField(max_digits=24, decimal_places=3, default=0)
    tomanProfit = models.DecimalField(max_digits=24, decimal_places=3, default=0)
    profitAmount = models.DecimalField(max_digits=24, decimal_places=3, default=0)
    tomanInWords = models.CharField(max_length=1000, blank=True)
    afnAmountInWords = models.CharField(max_length=1000, blank=True)
    nationalIdNumber = models.CharField(max_length=100, blank=True)
    phoneNumber = models.CharField(max_length=40, blank=True)
    idCardImageRef = models.TextField(blank=True)
    fingerprintTemplateRef = models.TextField(blank=True)
    fingerprintEnabled = models.BooleanField(default=False)
    moneyTransaction = models.CharField(max_length=100, blank=True)
    description = models.TextField(blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-transactionDate', '-id']
        indexes = [models.Index(fields=['kind', 'transactionDate']), models.Index(fields=['recipientName', 'deleted_at'])]


class ProvincialPerson(models.Model):
    recipientName = models.CharField(max_length=200, unique=True)
    recipientFatherName = models.CharField(max_length=200, blank=True)
    phoneNumber = models.CharField(max_length=40, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['recipientName', 'id']


class ProvincialDistribution(AuditedFinancialModel):
    person = models.ForeignKey(ProvincialPerson, null=True, blank=True, on_delete=models.PROTECT, related_name='entries')
    deleted_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    recipientName = models.CharField(max_length=200)
    recipientFatherName = models.CharField(max_length=200, blank=True)
    transactionDate = models.DateField()
    afnAmount = models.DecimalField(max_digits=24, decimal_places=3)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

class Colleague(models.Model):
    colleagueNumber = models.CharField(max_length=40, unique=True)
    colleagueName = models.CharField(max_length=200)
    fatherName = models.CharField(max_length=200, blank=True)
    phoneNumber = models.CharField(max_length=50, blank=True)
    location = models.CharField(max_length=200, blank=True)
    description = models.TextField(blank=True)
    createdAt = models.DateTimeField(auto_now_add=True)
    updatedAt = models.DateTimeField(auto_now=True)
    deletedAt = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-createdAt', '-id']


class ColleagueTransaction(AuditedFinancialModel):
    colleague = models.ForeignKey(Colleague, on_delete=models.PROTECT, related_name='transactions')
    transactionNumber = models.CharField(max_length=40, unique=True)
    transactionType = models.CharField(max_length=8, choices=[('RECEIVED', 'Received'), ('PAID', 'Paid')])
    transactionDate = models.DateField()
    currencyType = models.CharField(max_length=8, choices=[('USD', 'USD'), ('TOMAN', 'Toman'), ('AFN', 'AFN'), ('EUR','EUR'), ('PKR','PKR'), ('TRY','TRY')])
    amount = models.DecimalField(max_digits=15, decimal_places=3)
    usdRate = models.DecimalField(max_digits=20, decimal_places=8)
    usdAmount = models.DecimalField(max_digits=15, decimal_places=3, default=0)
    afnAmount = models.DecimalField(max_digits=15, decimal_places=3, default=0)
    description = models.TextField(blank=True)
    createdAt = models.DateTimeField(auto_now_add=True)
    updatedAt = models.DateTimeField(auto_now=True)
    deletedAt = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-transactionDate', '-id']
        indexes = [models.Index(fields=['colleague', 'transactionDate', 'deletedAt'])]

class ProvincialRemainingTransaction(models.Model):
    person = models.ForeignKey(ProvincialPerson, on_delete=models.PROTECT, related_name='remaining_transactions')
    source = models.OneToOneField(Remittance, on_delete=models.PROTECT, related_name='toman_settlement')
    amount = models.DecimalField(max_digits=24, decimal_places=3)
    balanceAfter = models.DecimalField(max_digits=24, decimal_places=3)
    createdAt = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-createdAt', '-id']

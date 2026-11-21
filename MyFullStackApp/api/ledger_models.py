from .audited_model import AuditedFinancialModel
from decimal import Decimal
from django.db import models
from django.conf import settings

class Currency(models.Model):
    code=models.CharField(max_length=8,primary_key=True)
    name=models.CharField(max_length=80)
    settlement_places=models.PositiveSmallIntegerField(default=3)

class Province(models.Model):
    code=models.CharField(max_length=6,primary_key=True)
    name=models.CharField(max_length=80)
    english_name=models.CharField(max_length=80)
    class Meta:
        ordering=['name','code']

class Agency(models.Model):
    province=models.ForeignKey(Province,null=True,blank=True,on_delete=models.PROTECT)
    name=models.CharField(max_length=200)
    phone=models.CharField(max_length=50,blank=True)
    location=models.CharField(max_length=250,blank=True)
    active=models.BooleanField(default=True)

class FinancialAccount(AuditedFinancialModel):
    province=models.ForeignKey(Province,null=True,blank=True,on_delete=models.PROTECT)
    kind=models.CharField(max_length=24,choices=[(v,v) for v in ['KABUL_DEBTOR','IRAN_DEBTOR','CREDITOR','COLLEAGUE','AGENCY','CASH','HAWALA','EXCHANGE','TERM']])
    customer=models.ForeignKey('Customer',null=True,blank=True,on_delete=models.PROTECT)
    colleague=models.ForeignKey('Colleague',null=True,blank=True,on_delete=models.PROTECT)
    agency=models.ForeignKey(Agency,null=True,blank=True,on_delete=models.PROTECT)
    name=models.CharField(max_length=200)
    profile=models.JSONField(default=dict)
    active=models.BooleanField(default=True)
    revision=models.PositiveIntegerField(default=0)
    created_at=models.DateTimeField(auto_now_add=True)

class RateQuote(models.Model):
    source=models.ForeignKey(Currency,on_delete=models.PROTECT,related_name='+')
    destination=models.ForeignKey(Currency,on_delete=models.PROTECT,related_name='+')
    source_rate=models.DecimalField(max_digits=32,decimal_places=12)
    destination_rate=models.DecimalField(max_digits=32,decimal_places=12)
    valid_from=models.DateField()
    created_at=models.DateTimeField(auto_now_add=True)
    operator=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT)
    class Meta:
        ordering=['-valid_from','-id']

class FinancialDocument(models.Model):
    province=models.ForeignKey(Province,null=True,blank=True,on_delete=models.PROTECT)
    manual_profit=models.DecimalField(max_digits=24,decimal_places=3,null=True,blank=True)
    profit_currency=models.CharField(max_length=8,blank=True)
    number=models.CharField(max_length=50,unique=True)
    request_key=models.CharField(max_length=100,unique=True)
    payload_hash=models.CharField(max_length=64)
    account=models.ForeignKey(FinancialAccount,on_delete=models.PROTECT,related_name='documents')
    agency=models.ForeignKey(Agency,null=True,blank=True,on_delete=models.PROTECT)
    category=models.CharField(max_length=32)
    date=models.DateField()
    currency=models.ForeignKey(Currency,on_delete=models.PROTECT)
    amount=models.DecimalField(max_digits=24,decimal_places=3)
    conversion=models.JSONField(default=dict)
    details=models.JSONField(default=dict)
    status=models.CharField(max_length=12,default='CONFIRMED')
    reversal_of=models.OneToOneField('self',null=True,blank=True,on_delete=models.PROTECT,related_name='reversal')
    legacy_remittance=models.OneToOneField('Remittance',null=True,blank=True,on_delete=models.PROTECT)
    tehran_transaction=models.OneToOneField('Transaction',null=True,blank=True,on_delete=models.PROTECT)
    operator=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT)
    created_at=models.DateTimeField(auto_now_add=True)

class LedgerPosting(models.Model):
    document=models.ForeignKey(FinancialDocument,on_delete=models.PROTECT,related_name='postings')
    account=models.ForeignKey(FinancialAccount,on_delete=models.PROTECT,related_name='postings')
    currency=models.ForeignKey(Currency,on_delete=models.PROTECT)
    amount=models.DecimalField(max_digits=24,decimal_places=3)
    bucket=models.CharField(max_length=24,default='ACCOUNT')

class ReceiptAllocation(models.Model):
    receipt=models.ForeignKey(FinancialDocument,on_delete=models.PROTECT,related_name='allocations')
    remittance=models.ForeignKey(FinancialDocument,on_delete=models.PROTECT,related_name='settlements')
    amount=models.DecimalField(max_digits=24,decimal_places=3)
    purpose=models.CharField(max_length=16,choices=[('BENEFICIARY','Beneficiary'),('AGENCY','Agency')])
    class Meta:
        constraints=[models.UniqueConstraint(fields=['receipt','remittance','purpose'],name='unique_receipt_allocation')]

class LedgerSetting(models.Model):
    key=models.CharField(max_length=80,primary_key=True)
    value=models.JSONField(default=dict)

class FinancialAudit(models.Model):
    model=models.CharField(max_length=80)
    object_id=models.CharField(max_length=50)
    action=models.CharField(max_length=16)
    before=models.JSONField(default=dict)
    after=models.JSONField(default=dict)
    operator=models.ForeignKey(settings.AUTH_USER_MODEL,null=True,on_delete=models.PROTECT)
    created_at=models.DateTimeField(auto_now_add=True)

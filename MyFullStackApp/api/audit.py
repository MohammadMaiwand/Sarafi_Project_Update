"""Financial corrections are auditable; personal/biometric payloads are excluded."""
from contextvars import ContextVar
from django.db.models.signals import pre_save, post_save, post_delete
from django.dispatch import receiver
from rest_framework.authentication import TokenAuthentication

operator_id=ContextVar('financial_operator',default=None)
TRACKED={'FinancialDocument','FinancialAccount','Transaction','Remittance','DebtPayment','DebtorCustomer','CustomerDeposit','DepositWithdrawal','ColleagueTransaction','ProvincialDistribution','Expense','MudarabahContract'}
SAFE_TYPES={'DecimalField','DateField','DateTimeField','BooleanField'}
SAFE_CODES={'voucher_number','hawalaNumber','customer_number','deposit_number','transactionNumber','expense_number','contract_number','currencyType','currency_type','currency_from','currency_to','source_currency','destination_currency','profit_currency','transaction_kind','payment_type','transactionType','status','conversion_status','hawala_status'}

class FinancialTokenAuthentication(TokenAuthentication):
    def authenticate(self,request):
        result=super().authenticate(request)
        if result: operator_id.set(result[0].pk)
        return result

class AuditContextMiddleware:
    def __init__(self,get_response):self.get_response=get_response
    def __call__(self,request):
        token=operator_id.set(None)
        try:return self.get_response(request)
        finally:operator_id.reset(token)

def snapshot(instance):
    values={}
    if instance.__class__.__name__=='FinancialAccount': values['approval']=instance.profile.get('approval')
    for field in instance._meta.concrete_fields:
        if field.get_internal_type() in SAFE_TYPES or field.name in SAFE_CODES:
            value=getattr(instance,field.name)
            values[field.name]=None if value is None else str(value)
    return values

@receiver(pre_save)
def before_change(sender,instance,raw=False,**kwargs):
    if raw or sender.__module__=='__fake__' or sender.__name__ not in TRACKED:return
    previous=sender.objects.filter(pk=instance.pk).first() if instance.pk else None
    instance._financial_before=snapshot(previous) if previous else {}

@receiver(post_save)
def after_change(sender,instance,created,raw=False,**kwargs):
    if raw or sender.__module__=='__fake__' or sender.__name__ not in TRACKED:return
    from .models import FinancialAudit
    before=getattr(instance,'_financial_before',{})
    after=snapshot(instance)
    if before!=after: FinancialAudit.objects.create(model=sender.__name__,object_id=str(instance.pk),action='CREATE' if created else 'CORRECTION',before=before,after=after,operator_id=operator_id.get())

@receiver(post_delete)
def after_delete(sender,instance,**kwargs):
    if sender.__module__=='__fake__' or sender.__name__ not in TRACKED:return
    from .models import FinancialAudit
    FinancialAudit.objects.create(model=sender.__name__,object_id=str(instance.pk),action='DELETE',before=snapshot(instance),operator_id=operator_id.get())

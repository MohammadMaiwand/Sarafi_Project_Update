"""Customer payments remain real cash movements even before a remittance arrives."""
from decimal import Decimal
from django.db.models import Sum
from .models import FinancialDocument, ReceiptAllocation

def customer_key(details):
    name=' '.join(str(details.get('sender_name','')).replace('ي','ی').replace('ك','ک').split()).casefold()
    phone=str(details.get('sender_phone','')).translate(str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩','01234567890123456789'))
    phone=''.join(char for char in phone if char.isdigit())
    return name+'|'+phone

def net_amount(doc):
    return Decimal(doc.conversion.get('net') or str(doc.amount))

def unit(doc):
    return doc.conversion.get('destination') or doc.currency_id

def reconcile_customer(account, details, currency):
    # The caller owns the account write lock inside ledger_service.confirm.
    # Allocations settle beneficiary obligations; they never post cash a second time.
    from .ledger_service import outstanding
    key=customer_key(details)
    rows=FinancialDocument.objects.filter(account=account,status='CONFIRMED',reversal__isnull=True,category__in=['PROVINCIAL_IN','PROVINCIAL_PAYMENT']).order_by('date','id')
    targets=[];receipts=[]
    for doc in rows:
        if unit(doc)!=currency or customer_key(doc.details)!=key:continue
        if doc.category=='PROVINCIAL_IN':
            remaining,_=outstanding(doc,'BENEFICIARY')
            if remaining>0:targets.append([doc,remaining])
        else:
            allocated=doc.allocations.filter(purpose='BENEFICIARY').aggregate(value=Sum('amount'))['value'] or Decimal(0)
            available=net_amount(doc)-allocated
            if available>0:receipts.append([doc,available])
    for receipt,available in receipts:
        for target in targets:
            amount=min(available,target[1])
            if amount<=0:continue
            allocation,created=ReceiptAllocation.objects.get_or_create(receipt=receipt,remittance=target[0],purpose='BENEFICIARY',defaults={'amount':amount})
            if not created:
                allocation.amount+=amount;allocation.save(update_fields=['amount'])
            available-=amount;target[1]-=amount
            if available<=0:break

def customer_balances(account, before=None):
    totals={}
    def entry(details,currency):
        key=customer_key(details)
        if not key.split('|')[0]:return None
        return totals.setdefault((key,currency),{'key':key,'currency':currency,'name':details.get('sender_name',''),'phone':details.get('sender_phone',''),'details':{field:details.get(field,'') for field in ['sender_name','sender_phone','sender_father','recipient_name','recipient_phone','recipient_father']},'incoming':Decimal(0),'outgoing':Decimal(0),'paid':Decimal(0)})
    docs=FinancialDocument.objects.filter(account=account,status='CONFIRMED',reversal__isnull=True,category__in=['PROVINCIAL_IN','PROVINCIAL_OUT','PROVINCIAL_PAYMENT']).order_by('date','id')
    if before:docs=docs.filter(date__lt=before)
    for doc in docs:
        row=entry(doc.details,unit(doc))
        if row is not None:row[{'PROVINCIAL_IN':'incoming','PROVINCIAL_OUT':'outgoing','PROVINCIAL_PAYMENT':'paid'}[doc.category]]+=net_amount(doc)
    # Older linked payouts are counted separately; new payments already appear above.
    allocations=ReceiptAllocation.objects.filter(remittance__account=account,remittance__category='PROVINCIAL_IN',purpose='BENEFICIARY',receipt__status='CONFIRMED').select_related('receipt','receipt__reversal_of','remittance')
    for allocation in allocations:
        receipt=allocation.receipt
        if receipt.category=='PROVINCIAL_PAYMENT' or receipt.reversal_of_id and receipt.reversal_of.category=='PROVINCIAL_PAYMENT':continue
        if before and receipt.date>=before:continue
        row=entry(allocation.remittance.details,receipt.currency_id)
        if row is not None:row['paid']+=allocation.amount
    result=[]
    for row in totals.values():
        balance=row['incoming']-row['outgoing']-row['paid']
        row.update(balance=balance,debt=max(-balance,Decimal(0)),credit=max(balance,Decimal(0)),status='بدهکار نمایندگی' if balance<0 else 'طلبکار از نمایندگی' if balance>0 else 'تصفیه‌شده')
        result.append({key:format(value,'.3f') if isinstance(value,Decimal) else value for key,value in row.items()})
    return result

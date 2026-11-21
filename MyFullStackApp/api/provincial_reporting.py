from decimal import Decimal
from django.db.models import Q
from .models import LedgerPosting, FinancialDocument

def money(value):return str(Decimal(value).quantize(Decimal('.001')))
def balance_status(value):
    value=Decimal(value)
    return {'code':'CREDITOR' if value>0 else 'DEBTOR' if value<0 else 'SETTLED','label':'طلبکار' if value>0 else 'بدهکار' if value<0 else 'تصفیه‌شده','message':'نماینده به ما بدهکار است' if value>0 else 'ما به نماینده بدهکار هستیم' if value<0 else 'حساب تصفیه‌شده است','amount':money(abs(value)),'signed':money(value)}

REPORT_CURRENCIES=('USD','AFN','EUR','TOMAN')

def agency_status(value):
    value=Decimal(value)
    office=balance_status(value)
    agency={'code':'DEBTOR' if value>0 else 'CREDITOR' if value<0 else 'SETTLED','label':'بدهکار' if value>0 else 'طلبکار' if value<0 else 'تصفیه‌شده','message':'نمایندگی بدهکار است' if value>0 else 'نمایندگی طلبکار است' if value<0 else 'حساب تصفیه‌شده است','amount':money(abs(value)),'signed':money(value),'perspective':'AGENCY'}
    office.update(perspective='OFFICE',message='صرافی طلبکار است' if value>0 else 'صرافی بدهکار است' if value<0 else 'حساب تصفیه‌شده است')
    return {**agency,'office':office,'who_owes_whom':'نمایندگی به صرافی بدهکار است' if value>0 else 'صرافی به نمایندگی بدهکار است' if value<0 else 'حساب تصفیه‌شده است'}

def account_rows(account):
    return LedgerPosting.objects.filter(account=account,document__status='CONFIRMED').filter(Q(bucket='AGENCY')|Q(bucket='ACCOUNT',account__kind='AGENCY')).select_related('document','document__operator','document__reversal_of').order_by('document__date','document_id','id')

def representative_report(account,start,end,currency,history_all=False):
    all_rows=list(account_rows(account).filter(currency_id=currency))
    opening=sum((row.amount for row in all_rows if row.document.date<start),Decimal(0))
    monthly=[row for row in all_rows if start<=row.document.date<end]
    movement=sum((row.amount for row in monthly),Decimal(0))
    cash_received=cash_sent=Decimal(0)
    received={'REPRESENTATIVE_REPAYMENT','ADVANCE_RECEIVED','AGENCY_RECEIPT','RECEIPT','PUBLIC_DEPOSIT','COLLEAGUE_DEPOSIT'}
    sent={'OFFICE_REPAYMENT','ADVANCE_SENT','AGENCY_PAYMENT','PAYMENT','DISTRIBUTION','SALARY','EXPENSE','CUSTOMER_LOAN','COLLEAGUE_LOAN'}
    for row in monthly:
        doc=row.document;category=doc.reversal_of.category if doc.reversal_of_id else doc.category
        value=abs(row.amount)*(-1 if doc.reversal_of_id else 1)
        if category in received:cash_received+=value
        elif category in sent:cash_sent+=value
    history=[];running=Decimal(0) if history_all else opening
    for row in all_rows if history_all else monthly:
        running+=row.amount
        history.append({'document':row.document_id,'document_amount':money(row.document.amount),'document_currency':row.document.currency_id,'reference':row.document.number,'date':str(row.document.date),'category':row.document.category,'amount':money(abs(row.amount)),'signed_amount':money(row.amount),'currency':currency,'balance_after':money(running),'status':balance_status(running),'operator':row.document.operator.get_username(),'reversal_of':row.document.reversal_of_id})
    profits={}
    for doc in FinancialDocument.objects.filter(account=account,status='CONFIRMED',date__gte=start,date__lt=end).exclude(manual_profit=None):
        profits[doc.profit_currency]=profits.get(doc.profit_currency,Decimal(0))+doc.manual_profit
    return {'account':account.pk,'name':account.name,'province':account.province_id or (account.agency.province_id if account.agency_id else None),'currency':currency,'dateFrom':str(start),'dateBefore':str(end),'opening':money(opening),'movement':money(movement),'closing':money(opening+movement),'opening_status':balance_status(opening),'closing_status':balance_status(opening+movement),'agency_opening_status':agency_status(opening),'agency_closing_status':agency_status(opening+movement),'perspective':'OFFICE','money_received':money(cash_received),'money_sent':money(cash_sent),'movement_count':len(monthly),'history':history,'history_all':history_all,'manual_profit_totals':[{'currency':key or None,'amount':money(value)} for key,value in profits.items()]}

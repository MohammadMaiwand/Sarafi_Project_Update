"""Agency-perspective, signed eight-line report from confirmed ledger postings.

Receipt/settlement effects keep their ledger sign, as requested. In particular,
a receipt allocated to an inbound remittance reduces its agency receivable,
so it contributes a negative amount to the receipts line, not new income.
"""
from decimal import Decimal
from django.db.models import Q, Sum
from .models import LedgerPosting
from .provincial_reporting import agency_status, money

LINES=(('RECEIPT','دریافتی',1),('PUBLIC_DEPOSIT','پول امانت مردم',1),('COLLEAGUE_DEPOSIT','امانت همکاران',1),('DISTRIBUTION','توزیع',-1),('SALARY','معاش',-1),('EXPENSE','مصارف',-1),('CUSTOMER_LOAN','قرض بالای مردم',-1),('COLLEAGUE_LOAN','قرض بالای همکاران',-1))
LINE_FOR={key:key for key,_,_ in LINES}
LINE_FOR.update(PROVINCIAL_IN='RECEIPT',PROVINCIAL_OUT='DISTRIBUTION',AGENCY_RECEIPT='RECEIPT',AGENCY_PAYMENT='DISTRIBUTION',REPRESENTATIVE_REPAYMENT='RECEIPT',OFFICE_REPAYMENT='DISTRIBUTION',ADVANCE_SENT='DISTRIBUTION',ADVANCE_RECEIVED='RECEIPT',REPRESENTATIVE_RECEIVABLE='RECEIPT',REPRESENTATIVE_OBLIGATION='DISTRIBUTION',PAYMENT='DISTRIBUTION',RELEASE='DISTRIBUTION',SHOP_RENT='EXPENSE')

def agency_postings(agency):
    return LedgerPosting.objects.filter(document__status='CONFIRMED').filter(Q(account__agency=agency)|Q(account__agency=None,document__agency=agency)).filter(Q(bucket='AGENCY')|Q(bucket='ACCOUNT',account__kind='AGENCY')).select_related('document','document__reversal_of')

def report(agency,start,end,currency):
    rows=agency_postings(agency).filter(currency_id=currency)
    opening=rows.filter(document__date__lt=start).aggregate(v=Sum('amount'))['v'] or Decimal(0)
    lines={key:{'key':key,'label':label,'operation':'ADD' if sign==1 else 'SUBTRACT','sign':sign,'amount':Decimal(0),'effect':Decimal(0),'sources':[]} for key,label,sign in LINES}
    categories={};movement=Decimal(0);documents=set()
    for row in rows.filter(document__date__gte=start,document__date__lt=end).order_by('document__date','document_id','id'):
        doc=row.document;original=doc.reversal_of if doc.reversal_of_id else doc
        category=original.category
        # Generic opening/loan/obligation and other confirmed account movements
        # reconcile in receipts with their actual signed effect, never omitted.
        key=LINE_FOR.get(category,'RECEIPT');line=lines[key]
        value=row.amount*line['sign']
        line['amount']+=value;line['effect']+=row.amount
        line['sources'].append({'document':doc.pk,'reference':doc.number,'date':str(doc.date),'category':category,'reversal':bool(doc.reversal_of_id),'amount':money(value),'effect':money(row.amount)})
        categories[doc.category]=categories.get(doc.category,Decimal(0))+row.amount
        movement+=row.amount;documents.add(doc.pk)
    principal=LedgerPosting.objects.filter(document__status='CONFIRMED',document__agency=agency,currency_id=currency,bucket__in=['ACCOUNT','DEPOSIT_PRINCIPAL'],document__date__lt=end)
    liabilities=principal.filter(Q(account__kind__in=['CASH','EXCHANGE','TERM'])|Q(account__kind='COLLEAGUE',document__category='COLLEAGUE_DEPOSIT')|Q(account__kind='COLLEAGUE',document__reversal_of__category='COLLEAGUE_DEPOSIT')).aggregate(v=Sum('amount'))['v'] or Decimal(0)
    return {'currency':currency,'opening':money(opening),'movement':money(movement),'closing':money(opening+movement),'opening_status':agency_status(opening),'closing_status':agency_status(opening+movement),'categories':{key:money(value) for key,value in categories.items()},'lines':[{**line,'amount':money(line['amount']),'effect':money(line['effect'])} for line in lines.values()],'deposit_liabilities':money(liabilities),'document_count':len(documents),'dateFrom':str(start),'dateBefore':str(end),'perspective':'AGENCY','positive_means':'نمایندگی بدهکار است؛ صرافی طلبکار است','settlement_note':'تسویه‌ها و برگشت‌ها با اثر مثبت یا منفی واقعی در قلم مربوط درج می‌شوند؛ دریافتی از نمایندگی می‌تواند طلب صرافی را کاهش دهد.'}

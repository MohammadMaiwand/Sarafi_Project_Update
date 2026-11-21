import hashlib
from decimal import Decimal

def customer_key(row):
    if row.customer_id:return f'C-{row.customer_id}'
    identity='\x1f'.join([row.senderName,row.senderFatherName,row.phoneNumber])
    return 'L-'+hashlib.sha256(identity.encode()).hexdigest()[:24]

def customer_totals(rows):
    groups={}
    for row in rows:
        key=customer_key(row)
        group=groups.setdefault(key,{'key':key,'name':row.senderName,'fatherName':row.senderFatherName,'phone':row.phoneNumber,'count':0,'afn':Decimal(0),'toman':Decimal(0),'knownAfnCount':0,'missingAfnCount':0,'knownTomanCount':0,'missingTomanCount':0})
        group['count']+=1
        if row.afnAmountKnown:group['afn']+=row.afnAmount;group['knownAfnCount']+=1
        else:group['missingAfnCount']+=1
        if row.tomanAmountKnown:group['toman']+=row.tomanAmount;group['knownTomanCount']+=1
        else:group['missingTomanCount']+=1
    return [{**group,'afn':str(group['afn']) if group['knownAfnCount'] else None,'toman':str(group['toman']) if group['knownTomanCount'] else None} for group in groups.values()]

import os
import sqlite3
import json
import hashlib
import subprocess
from pathlib import Path
from datetime import datetime

root=Path(__file__).resolve().parent
database=root/'MyFullStackApp/db.sqlite3'
folder=root/'backups';folder.mkdir(exist_ok=True)
target=folder/f'before-workspace-brief-{datetime.now():%Y%m%d-%H%M%S}.sqlite3'
tables={'api_transaction':['id','customer_id','voucher_number','date','toman_amount','usd_amount','afghani_amount','toman_rate','afghani_rate','toman_profit','bank_account','expense'], 'api_customer':['id','name','phone'],'api_remittance':['id','hawalaNumber','tomanAmount','afnAmount','deleted_at'],'api_debtorcustomer':['id','original_usd_amount','usd_rate'],'api_debtpayment':['id','debtor_id','payment_usd_amount'],'api_customerdeposit':['id','deposit_number','amount','paid_amount'],'api_depositwithdrawal':['id','deposit_id','amount'],'api_colleaguetransaction':['id','amount','usdRate']}
def fingerprint(connection):
    result={}
    for table,columns in tables.items():
        rows=connection.execute(f'SELECT {",".join(columns)} FROM {table} ORDER BY id').fetchall()
        result[table]={'count':len(rows),'digest':hashlib.sha256(json.dumps(rows,ensure_ascii=False,default=str).encode()).hexdigest()}
    return result
tables.update({
 'api_financialaccount':['id','kind','name','agency_id','profile'],
 'api_financialdocument':['id','number','request_key','account_id','agency_id','category','date','currency_id','amount','conversion','details','status','reversal_of_id'],
 'api_ledgerposting':['id','document_id','account_id','currency_id','bucket','amount'],
 'api_receiptallocation':['id','receipt_id','remittance_id','purpose','amount'],
})
with sqlite3.connect(database) as original,sqlite3.connect(target) as backup:
    original.backup(backup)
    before=fingerprint(original)
subprocess.run([str(root/'MyFullStackApp/venv/Scripts/python.exe'),str(root/'MyFullStackApp/manage.py'),'migrate','--noinput'],check=True)
with sqlite3.connect(database) as migrated:
    after=fingerprint(migrated)
assert before==after,'Existing financial values changed; inspect migration before continuing.'
report={'backup':str(target),'existing_rows_unchanged':True,'tables':{key:value['count'] for key,value in after.items()}}
(root/'MIGRATION_VERIFICATION.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('Existing IDs and financial values unchanged. Backup:',target)

import os
import json
import urllib.request
import urllib.error
import time
os.environ.setdefault('DJANGO_SETTINGS_MODULE','backend.settings')
import sys
from pathlib import Path
root=Path(__file__).resolve().parent
sys.path.insert(0,str(root/'MyFullStackApp'))
import django
django.setup()
from django.contrib.auth import get_user_model
from rest_framework.authtoken.models import Token
from api.models import FinancialDocument, LedgerPosting, FinancialAudit, NumberSequence
operator=get_user_model().objects.filter(is_active=True,is_staff=True).first()
assert operator,'An authorized operator is needed for live checks.'
token,created=Token.objects.get_or_create(user=operator)
base='http://localhost:5173/api'
for attempt in range(50):
    try:
        with urllib.request.urlopen(base+'/hello/',timeout=2) as response:
            if response.status==200:break
    except (urllib.error.URLError,TimeoutError):
        time.sleep(.2)
else:
    raise RuntimeError('Local backend did not become ready for verification.')
checks=[]
def financial_state():
    return (FinancialDocument.objects.count(),LedgerPosting.objects.count(),FinancialAudit.objects.count(),list(NumberSequence.objects.order_by('id').values_list('id','last_value')))
before=financial_state()
try:
    for path in ['/session/','/ledger/options/','/ledger/accounts/','/ledger/agencies/','/ledger/documents/','/ledger/legacy-unpaid/','/ledger/missing-identity/','/transactions/','/dashboard/stats/?calendar=afghan&month=1405-08','/expenses/?calendar=afghan&month=1405-08','/mudarabah/?calendar=afghan&month=1405-08','/finance/summary/?calendar=afghan&month=1405-08','/incoming/','/incoming/?month=1405-08','/remittances/options/','/provincial/numbering/','/provinces/','/provinces/AF-BDS/accounts/','/provinces/AF-KDZ/accounts/','/provincial/remittances/?direction=PROVINCIAL_IN&province=AF-BDS&month=1405-08','/provincial/remittances/?direction=PROVINCIAL_OUT&province=AF-KDZ&month=1405-08']:
        req=urllib.request.Request(base+path,headers={'Authorization':f'Token {token.key}'})
        with urllib.request.urlopen(req,timeout=15) as response:
            result=json.loads(response.read())
            assert response.status==200
            if path.startswith('/dashboard'): assert result['dateFrom']=='2026-10-23' and result['dateBefore']=='2026-11-22'
            if path=='/session/': assert result['username']==operator.get_username()
            if path=='/provinces/':assert len(result['results'])==34
            if path=='/provincial/numbering/':assert result['prefix']=='PVL' and result['next_number']>=result['starting_number']
            if path.startswith('/incoming/'):assert 'customerTotals' in result and 'manualProfitTotals' in result
            checks.append({'path':path,'status':200})
    try:
        urllib.request.urlopen(base+'/transactions/',timeout=15)
        raise AssertionError('Anonymous access accepted')
    except urllib.error.HTTPError as error:
        assert error.code==401
    assert financial_state()==before,'Read-only verification changed financial state'
    report={'checks':checks,'anonymous_financial_access':401,'financial_records_created':0,'report_reads_created_no_postings':True,'browser_ui_verification':'Interactive browser unavailable; actual React component markup verified separately using SSR'}
    (root/'LIVE_API_VERIFICATION.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(f'{len(checks)} authenticated live API routes passed; anonymous access rejected. No financial records created.')
finally:
    if created: token.delete()

from django.db import migrations
from django.db.models import F

def seed(apps,schema_editor):
    Province=apps.get_model('api','Province')
    rows=[('AF-BDS','بدخشان','Badakhshan'),('AF-BDG','بادغیس','Badghis'),('AF-BGL','بغلان','Baghlan'),('AF-BAL','بلخ','Balkh'),('AF-BAM','بامیان','Bamyan'),('AF-DAY','دایکندی','Daykundi'),('AF-FRA','فراه','Farah'),('AF-FYB','فاریاب','Faryab'),('AF-GHA','غزنی','Ghazni'),('AF-GHO','غور','Ghor'),('AF-HEL','هلمند','Helmand'),('AF-HER','هرات','Herat'),('AF-JOW','جوزجان','Jowzjan'),('AF-KAB','کابل','Kabul'),('AF-KAN','کندهار','Kandahar'),('AF-KAP','کاپیسا','Kapisa'),('AF-KHO','خوست','Khost'),('AF-KNR','کنر','Kunar'),('AF-KDZ','کندز','Kunduz'),('AF-LAG','لغمان','Laghman'),('AF-LOG','لوگر','Logar'),('AF-WAR','میدان وردک','Maidan Wardak'),('AF-NAN','ننگرهار','Nangarhar'),('AF-NIM','نیمروز','Nimruz'),('AF-NUR','نورستان','Nuristan'),('AF-PIA','پکتیا','Paktia'),('AF-PKA','پکتیکا','Paktika'),('AF-PAN','پنجشیر','Panjshir'),('AF-PAR','پروان','Parwan'),('AF-SAM','سمنگان','Samangan'),('AF-SAR','سرپل','Sar-e Pol'),('AF-TAK','تخار','Takhar'),('AF-URU','ارزگان','Uruzgan'),('AF-ZAB','زابل','Zabul')]
    for code,name,english in rows:Province.objects.get_or_create(code=code,defaults={'name':name,'english_name':english})
    Remittance=apps.get_model('api','Remittance')
    Remittance.objects.filter(kind='incoming').update(manualProfit=F('tomanProfit'),manualProfitCurrency='TOMAN')
    # Existing outgoing profit has no verified currency label. Preserve its amount,
    # explicitly retaining an unknown currency instead of guessing a unit.
    Remittance.objects.filter(kind='outgoing').update(manualProfit=F('profitAmount'))

class Migration(migrations.Migration):
    dependencies=[('api','0019_province_financialdocument_manual_profit_and_more')]
    operations=[migrations.RunPython(seed,migrations.RunPython.noop)]

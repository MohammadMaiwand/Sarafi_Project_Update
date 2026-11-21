from django.db import migrations

def seed(apps,schema_editor):
    Currency=apps.get_model('api','Currency')
    for code,name in [('AFN','افغانی'),('USD','دالر'),('TOMAN','تومان ایران'),('EUR','یورو'),('TRY','لیره ترکیه'),('PKR','کلدار پاکستان')]:
        Currency.objects.get_or_create(code=code,defaults={'name':name})

class Migration(migrations.Migration):
    dependencies=[('api','0011_agency_currency_ledgersetting_financialaccount_and_more')]
    operations=[migrations.RunPython(seed,migrations.RunPython.noop)]

from django.db import migrations

def mark_unknown(apps,schema_editor):
    # Preserve stored zero amounts. Only mark availability where neither a
    # recorded positive AFN value nor either usable conversion quote exists.
    Remittance=apps.get_model('api','Remittance')
    Remittance.objects.filter(kind='incoming',afnAmount=0,afnUsdRate=0,usdRate=0).update(afnAmountKnown=False)

class Migration(migrations.Migration):
    dependencies=[('api','0021_remittance_afnamountknown')]
    operations=[migrations.RunPython(mark_unknown,migrations.RunPython.noop)]

from django.db import migrations


def link_existing_people(apps, schema_editor):
    Remittance = apps.get_model('api', 'Remittance')
    Person = apps.get_model('api', 'ProvincialPerson')
    Entry = apps.get_model('api', 'ProvincialDistribution')
    for row in Remittance.objects.filter(kind='provincial-received').order_by('id').iterator():
        if row.recipientName:
            Person.objects.get_or_create(recipientName=row.recipientName, defaults={'recipientFatherName': row.recipientFatherName})
    for entry in Entry.objects.all().iterator():
        person, _ = Person.objects.get_or_create(recipientName=entry.recipientName, defaults={'recipientFatherName': entry.recipientFatherName})
        Entry.objects.filter(pk=entry.pk).update(person=person)
    Remittance.objects.filter(kind='incoming').update(operationType='TOMAN_FORMULA')
    Remittance.objects.filter(kind='outgoing', currencyType='TOMAN').update(operationType='TOMAN_FORMULA')
    Remittance.objects.filter(kind='outgoing').exclude(currencyType='TOMAN').update(operationType='AFN_DIRECT')
    Remittance.objects.filter(kind='provincial-received').update(operationType='USD_FORMULA')


class Migration(migrations.Migration):
    dependencies = [('api', '0004_provincialperson_provincialdistribution_deleted_at_and_more')]
    operations = [migrations.RunPython(link_existing_people, migrations.RunPython.noop)]

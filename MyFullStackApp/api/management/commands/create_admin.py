from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Create or update the default maihan administrator account.'

    def handle(self, *args, **options):
        User = get_user_model()
        user, created = User.objects.get_or_create(username='maihan')
        user.is_staff = True
        user.is_superuser = True
        user.is_active = True
        user.set_password('maihan')
        user.save()
        action = 'Created' if created else 'Updated'
        self.stdout.write(self.style.SUCCESS(f'{action} administrator account: maihan'))

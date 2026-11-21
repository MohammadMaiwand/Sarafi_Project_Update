from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

class AuthenticatedAPITestCase(APITestCase):
    """Existing business regression cases run as an authorized operator."""
    def setUp(self):
        super().setUp()
        operator=get_user_model().objects.create(username='regression-operator',is_staff=True)
        self.client.force_authenticate(operator)

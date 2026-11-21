from django.db import models, transaction

class AuditedFinancialModel(models.Model):
    """Persist a financial row and its post-save audit event in one transaction."""
    class Meta:
        abstract=True

    @transaction.atomic
    def save(self,*args,**kwargs):
        return super().save(*args,**kwargs)

from django.contrib import admin
from .models import Remittance, ProvincialPerson, ProvincialDistribution

@admin.register(Remittance)
class RemittanceAdmin(admin.ModelAdmin):
    list_display = ['hawalaNumber', 'kind', 'transactionDate', 'senderName', 'receiverName', 'recipientName', 'afnAmount']
    list_filter = ['kind', 'currencyType', 'moneyTransaction', 'transactionDate']
    search_fields = ['hawalaNumber', 'senderName', 'receiverName', 'recipientName', 'nationalIdNumber']
    readonly_fields = ['hawalaNumber', 'afnAmount', 'created_at', 'updated_at']
    # Use the validated application API for monetary changes.
    def has_add_permission(self, request): return False
    def has_change_permission(self, request, obj=None): return False
    def has_delete_permission(self, request, obj=None): return False

@admin.register(ProvincialPerson)
class ProvincialPersonAdmin(admin.ModelAdmin):
    list_display = ['recipientName', 'recipientFatherName', 'phoneNumber']
    search_fields = ['recipientName', 'recipientFatherName']
    def has_add_permission(self, request): return False
    def has_change_permission(self, request, obj=None): return False
    def has_delete_permission(self, request, obj=None): return False

@admin.register(ProvincialDistribution)
class ProvincialDistributionAdmin(admin.ModelAdmin):
    list_display = ['recipientName', 'transactionDate', 'afnAmount', 'deleted_at']
    search_fields = ['recipientName']
    def has_add_permission(self, request): return False
    def has_change_permission(self, request, obj=None): return False
    def has_delete_permission(self, request, obj=None): return False

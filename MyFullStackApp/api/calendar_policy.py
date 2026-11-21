"""Afghan Solar Hijri business periods; date-only storage stays Gregorian."""
import jdatetime
from django.utils import timezone
from rest_framework.exceptions import ValidationError

def month_bounds(value=None):
    try:
        if value:
            year, month = map(int, value.split('-'))
        else:
            today = jdatetime.date.fromgregorian(date=timezone.localdate())
            year, month = today.year, today.month
        if not 1200 <= year <= 1600:
            raise ValueError
        start = jdatetime.date(year, month, 1).togregorian()
        end = jdatetime.date(year+1 if month==12 else year, 1 if month==12 else month+1, 1).togregorian()
        return start, end, f'{year:04d}-{month:02d}'
    except (ValueError, TypeError, AttributeError):
        raise ValidationError({'month':'ماه هجری شمسی معتبر نیست.'})

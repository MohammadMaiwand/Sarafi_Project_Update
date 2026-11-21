"""Shared remittance validation, exact decimal calculations and Dari amount words."""
import base64
import binascii
import struct
from decimal import Decimal
from rest_framework.exceptions import ValidationError

CURRENCIES = ['TOMAN', 'AFN', 'USD', 'PKR', 'EUR', 'TRY']
MONEY_TRANSACTIONS = ['نقدی', 'حواله', 'بانکی']
MAX_FILE_SIZE = 5 * 1024 * 1024
MAX_AMOUNT = Decimal('999999999999999999999.999')
ONES = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه', 'ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده']
TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود']
HUNDREDS = ['', 'صد', 'دوصد', 'سه‌صد', 'چهارصد', 'پنج‌صد', 'شش‌صد', 'هفت‌صد', 'هشت‌صد', 'نه‌صد']
SCALES = ['', 'هزار', 'میلیون', 'میلیارد', 'تریلیون', 'کوادریلیون', 'کوینتیلیون']


def amount_words(value):
    number = Decimal(value)
    integer = int(number)
    groups = []
    index = 0
    while integer:
        group = integer % 1000
        if group:
            rest = group % 100
            words = [HUNDREDS[group // 100]]
            words.append(ONES[rest] if rest < 20 else ' و '.join(filter(None, [TENS[rest // 10], ONES[rest % 10]])))
            groups.insert(0, (' و '.join(filter(None, words)) + ' ' + SCALES[index]).strip())
        integer //= 1000
        index += 1
    result = ' و '.join(groups) or 'صفر'
    fraction = int((number % 1) * 1000)
    return result + (f' و {amount_words(fraction)} هزارم' if fraction else '')


def validate_file_data(value, field, image=False):
    if not value:
        return
    try:
        header, encoded = value.split(',', 1)
        if not header.startswith('data:') or not header.endswith(';base64'):
            raise ValueError
        if len(encoded) > ((MAX_FILE_SIZE + 2) // 3) * 4:
            raise ValueError
        raw = base64.b64decode(encoded, validate=True)
        if not raw or len(raw) > MAX_FILE_SIZE:
            raise ValueError
        if image:
            mime = header[5:-7]
            valid = ((mime == 'image/png' and raw.startswith(b'\x89PNG\r\n\x1a\n') and len(raw) >= 24 and raw[12:16] == b'IHDR') or
                     (mime == 'image/jpeg' and raw.startswith(b'\xff\xd8\xff') and raw.endswith(b'\xff\xd9')) or
                     (mime == 'image/webp' and raw.startswith(b'RIFF') and raw[8:12] == b'WEBP'))
            if not valid:
                raise ValueError
    except (ValueError, binascii.Error, TypeError, struct.error):
        raise ValidationError({field: 'فایل نامعتبر است؛ حداکثر حجم مجاز ۵ مگابایت است.'})

"""API serializers. Financial totals and generated words are authoritative on the server."""
from decimal import Decimal, ROUND_HALF_UP, localcontext
from .manual_profit import validate_profit
from rest_framework import serializers
from .models import Remittance, ProvincialDistribution, ProvincialPerson
from .remittance_domain import CURRENCIES, MONEY_TRANSACTIONS, MAX_AMOUNT, amount_words, validate_file_data


class RemittanceSerializer(serializers.ModelSerializer):
    hawalaNumber = serializers.CharField(max_length=50, required=False, allow_blank=True)
    manualNumber = serializers.IntegerField(min_value=1, max_value=999999999, required=False, allow_null=True, write_only=True)
    currencyRate = serializers.CharField(required=False, allow_blank=True, write_only=True)
    hasFingerprint = serializers.SerializerMethodField()
    hasIdCardImage = serializers.SerializerMethodField()

    class Meta:
        model = Remittance
        exclude = ['deleted_at']
        read_only_fields = ['kind', 'created_at', 'updated_at','tomanAmountKnown','afnAmountKnown']

    def get_hasFingerprint(self, row):
        return row.fingerprintEnabled and bool(row.fingerprintTemplateRef)

    def get_hasIdCardImage(self, row):
        return bool(row.idCardImageRef)

    def validate(self, attrs):
        def value(key, default=''):
            return attrs.get(key, getattr(self.instance, key, default))
        kind = self.context['kind']
        for key, item in list(attrs.items()):
            if isinstance(item, str):
                attrs[key] = item.strip()
        if self.instance:
            if attrs.get('hawalaNumber', self.instance.hawalaNumber) != self.instance.hawalaNumber:
                raise serializers.ValidationError({'hawalaNumber': 'شماره حواله پس از ثبت قابل تغییر نیست.'})
            attrs.pop('hawalaNumber', None)
        elif attrs.get('hawalaNumber'):
            if kind != 'provincial-received':
                raise serializers.ValidationError({'hawalaNumber': 'برای شماره‌گذاری دستی از شماره دستی استفاده کنید.'})
            if Remittance.objects.filter(hawalaNumber=attrs['hawalaNumber']).exists():
                raise serializers.ValidationError({'hawalaNumber': 'این شماره قبلاً ثبت شده است.'})
        provincial_usd=kind=='outgoing' and value('operationType')=='USD_FORMULA'
        required = ['recipientName', 'moneyTransaction'] if kind == 'provincial-received' else ['receiverName','moneyTransaction'] if provincial_usd else ['senderName', 'receiverName']
        for key in required:
            if not value(key):
                raise serializers.ValidationError({key: 'این خانه الزامی است.'})
        if kind == 'outgoing' and not self.instance:
            for key in ['currencyType', 'sourceAmount', 'profitAmount']:
                if key not in attrs:
                    raise serializers.ValidationError({key: 'این خانه الزامی است.'})
        if kind == 'provincial-received' and value('moneyTransaction') not in MONEY_TRANSACTIONS:
            raise serializers.ValidationError({'moneyTransaction': 'نوع معامله معتبر نیست.'})
        currency = value('currencyType', 'TOMAN')
        if currency not in CURRENCIES:
            raise serializers.ValidationError({'currencyType': 'واحد پول نامعتبر است.'})
        alias = attrs.pop('currencyRate', '')
        if alias:
            attrs['afnUsdRate'] = serializers.DecimalField(max_digits=20, decimal_places=8).run_validation(alias)
        for key in ['tomanAmount', 'sourceAmount', 'usdAmount', 'tomanProfit', 'profitAmount', 'afnAmount', 'usdRate', 'afnUsdRate']:
            if Decimal(value(key, 0)) < 0:
                raise serializers.ValidationError({key: 'مقدار منفی مجاز نیست.'})
        if 'manualProfit' not in attrs and kind=='incoming' and 'tomanProfit' in attrs:
            attrs.update(manualProfit=attrs['tomanProfit'],manualProfitCurrency='TOMAN')
        if 'manualProfit' in attrs or 'manualProfitCurrency' in attrs:
            previous_value=getattr(self.instance,'manualProfit',None)
            previous_currency=getattr(self.instance,'manualProfitCurrency','')
            unchanged=self.instance and value('manualProfit',None)==previous_value and value('manualProfitCurrency')==previous_currency
            profit,profit_currency=validate_profit(value('manualProfit',None),value('manualProfitCurrency'),field='manualProfit',currency_field='manualProfitCurrency',allow_unknown=bool(unchanged))
            attrs.update(manualProfit=profit,manualProfitCurrency=profit_currency)
        path=value('conversionPath','TOMAN_TO_AFN') if kind=='incoming' else ''
        if kind=='incoming' and path not in ['TOMAN_TO_AFN','USD_TO_AFN']:
            raise serializers.ValidationError({'conversionPath':'مسیر تبدیل معتبر نیست.'})
        if kind=='incoming':attrs['currencyType']='USD' if path=='USD_TO_AFN' else 'TOMAN'
        financial_keys={'tomanAmount','sourceAmount','usdAmount','usdRate','afnUsdRate','rateBaseAmount','conversionPath','currencyType'}
        unchanged_incoming=kind=='incoming' and self.instance and not any(key in attrs and attrs[key]!=getattr(self.instance,key) for key in financial_keys)
        amount_key = 'usdAmount' if kind=='incoming' and path=='USD_TO_AFN' else {'incoming': 'tomanAmount', 'outgoing': 'sourceAmount', 'provincial-received': 'usdAmount'}[kind]
        amount = Decimal(value(amount_key, 0))
        if amount <= 0 and not unchanged_incoming:
            raise serializers.ValidationError({amount_key: 'مبلغ باید بیشتر از صفر باشد.'})
        if provincial_usd:
            if currency!='USD':raise serializers.ValidationError({'currencyType':'واحد حواله دریافتی باید دالر باشد.'})
            if value('moneyTransaction') not in MONEY_TRANSACTIONS:raise serializers.ValidationError({'moneyTransaction':'نوع معامله معتبر نیست.'})
            attrs['usdAmount']=amount
        direct = kind == 'outgoing' and currency != 'TOMAN' and not provincial_usd
        if direct:
            if self.instance and self.instance.currencyType != currency and 'afnAmount' not in attrs:
                raise serializers.ValidationError({'afnAmount': 'پس از تغییر ارز، مبلغ افغانی را وارد کنید.'})
            if 'afnAmount' not in attrs and not self.instance:
                raise serializers.ValidationError({'afnAmount': 'مبلغ افغانی را مستقیم وارد کنید.'})
            afn = Decimal(value('afnAmount', 0))
            if afn <= 0:
                raise serializers.ValidationError({'afnAmount': 'مبلغ افغانی باید بیشتر از صفر باشد.'})
            attrs.update(operationType='AFN_DIRECT', afnUsdRate=Decimal(0), tomanInWords='')
        else:
            rate_key = 'usdRate' if provincial_usd or kind == 'provincial-received' or kind=='incoming' and path=='USD_TO_AFN' else 'afnUsdRate'
            rate = Decimal(value(rate_key, 0))
            if rate <= 0 and not unchanged_incoming:
                raise serializers.ValidationError({rate_key: 'نرخ باید بیشتر از صفر باشد.'})
            base=Decimal(value('rateBaseAmount',1)) if kind=='incoming' and path=='TOMAN_TO_AFN' else Decimal(1)
            if base not in [1,1000]:raise serializers.ValidationError({'rateBaseAmount':'پایه نرخ باید یک یا هزار تومان باشد.'})
            with localcontext() as decimal_context:
                decimal_context.prec=60
                afn = amount * rate / base
            if kind=='incoming':
                attrs['afnAmountKnown']=self.instance.afnAmountKnown if unchanged_incoming else True
                if path=='USD_TO_AFN' and not self.instance:attrs['tomanAmountKnown']=bool(attrs.get('tomanAmount',0))
                elif 'tomanAmount' in attrs:attrs['tomanAmountKnown']=bool(attrs['tomanAmount']) if path=='USD_TO_AFN' else True
                else:attrs.setdefault('tomanAmountKnown',getattr(self.instance,'tomanAmountKnown',True))
            attrs['operationType'] = 'USD_FORMULA' if provincial_usd or kind == 'provincial-received' or kind=='incoming' and path=='USD_TO_AFN' else 'TOMAN_FORMULA'
            if kind != 'provincial-received' and not provincial_usd and not (kind=='incoming' and path=='USD_TO_AFN'):
                attrs['tomanInWords'] = value('tomanInWords') or amount_words(amount)
        if afn > MAX_AMOUNT:
            raise serializers.ValidationError({'afnAmount': 'حاصل محاسبه از حد مجاز بزرگ‌تر است.'})
        if self.instance:
            financial_keys={'tomanAmount','sourceAmount','usdAmount','usdRate','afnUsdRate','rateBaseAmount','conversionPath','currencyType'}
            if direct:financial_keys.add('afnAmount')
            if not any(key in attrs and attrs[key]!=getattr(self.instance,key) for key in financial_keys):afn=self.instance.afnAmount
        attrs['afnAmount'] = afn.quantize(Decimal('.001'), rounding=ROUND_HALF_UP)
        attrs['afnAmountInWords'] = amount_words(attrs['afnAmount'])
        validate_file_data(value('idCardImageRef'), 'idCardImageRef', image=True)
        validate_file_data(value('fingerprintTemplateRef'), 'fingerprintTemplateRef')
        # TODO(FINGERPRINT_DEVICE_INTEGRATION): Deferred by user. Add the device SDK here;
        # never synthesize a biometric template or claim capture succeeded without hardware.
        if value('fingerprintEnabled', False) and not value('fingerprintTemplateRef'):
            raise serializers.ValidationError({'fingerprintTemplateRef': 'فایل قالب اثر انگشت لازم است.'})
        if not value('fingerprintEnabled', False):
            attrs['fingerprintTemplateRef'] = ''
        return attrs


class RemittanceListSerializer(RemittanceSerializer):
    """Keep biometric templates and large images out of list responses."""
    class Meta(RemittanceSerializer.Meta):
        exclude = ['deleted_at', 'fingerprintTemplateRef', 'idCardImageRef']


class DistributionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProvincialDistribution
        exclude = ['deleted_at']
        read_only_fields = ['person', 'created_at', 'updated_at']

    def validate_afnAmount(self, value):
        if value <= 0:
            raise serializers.ValidationError('مبلغ باید بیشتر از صفر باشد.')
        return value


class ProvincialPersonSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProvincialPerson
        fields = '__all__'
        read_only_fields = ['created_at']

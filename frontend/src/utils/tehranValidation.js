import { isoDate, parseAmount } from './remittance.js'
import { calculateTehranTransaction } from './tehranTransaction.js'

export function validateTehranForm(form, dateText, customerId) {
  const errors = {}
  if (!customerId && !form.customer_name?.trim()) errors.customer_name = 'نام مشتری را وارد کنید یا مشتری موجود را انتخاب کنید.'
  if (!form.voucher_number?.trim()) errors.voucher_number = 'نمبر حواله الزامی است.'
  try { isoDate(dateText) } catch (error) { errors.date = error.message }
  for (const key of ['toman_amount', 'toman_rate', 'afghani_rate']) {
    if (key==='toman_rate' && form.source_currency==='USD') continue
    if (key==='afghani_rate' && form.source_currency && (!form.destination_currency || form.destination_currency==='USD')) continue
    const raw = parseAmount(form[key])
    const places=key==='toman_amount'?3:12
    if (!new RegExp(`^\\d{1,12}(\\.\\d{0,${places}})?$`).test(raw) || Number(raw) <= 0) errors[key] = `عدد معتبر و بیشتر از صفر، با حداکثر ${places} رقم اعشار وارد کنید.`
  }
  if (form.fee_amount !== undefined) {
    if (!/^\d+(\.\d{0,3})?$/.test(parseAmount(form.fee_amount))) errors.fee_amount='فیس معتبر وارد کنید.'
    if (form.fee_collection==='DEDUCTED' && (!form.destination_currency || form.fee_currency!==form.destination_currency)) errors.fee_amount='واحد فیس کسرشده باید با مقصد یکسان باشد.'
    const amount=Number(parseAmount(form.toman_amount)),rate=form.source_currency==='USD'?1:Number(parseAmount(form.toman_rate)),dest=form.destination_currency==='USD'?1:Number(parseAmount(form.afghani_rate))
    if(form.fee_collection==='DEDUCTED' && rate>0 && Number(parseAmount(form.fee_amount))>amount/rate*dest)errors.fee_amount='فیس از مبلغ مقصد بیشتر است.'
  }
  const limits = {customer_name:200, customer_phone:40, voucher_number:40, sender_name:200, receiver_name:200, bank_account:200, toman_in_words:1000}
  for (const [key, limit] of Object.entries(limits)) if (String(form[key] || '').length > limit) errors[key] = `حداکثر ${limit} حرف مجاز است.`
  if (!['toman_amount','toman_rate','afghani_rate'].some(key=>errors[key])) {
    const calculated = calculateTehranTransaction(form)
    if (Number(calculated.usd) > 999999999999.999) errors.toman_rate = 'مقدار دالر محاسبه‌شده از حد مجاز بیشتر است.'
    if (Number(calculated.afghani) > 999999999999.999) errors.afghani_rate = 'مقدار افغانی محاسبه‌شده از حد مجاز بیشتر است.'
    if (Number(calculated.profit) > 999999999999.999) errors.toman_amount = 'مفاد محاسبه‌شده از حد مجاز بیشتر است.'
  }
  return errors
}

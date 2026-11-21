import {presentNumber} from '../utils/presentation'
import {sumAllocations} from '../utils/ledgerMath'

export default function AgencySettlementAmounts({row}){
 const inbound=row.category==='PROVINCIAL_IN',unit=row.details.agency_currency||row.conversion.destination||row.currency
 return <div className="space-y-1 text-sm"><p>تعهد نمایندگی: <span dir="ltr">{presentNumber(sumAllocations({paid:row.agency.paid,remaining:row.agency.outstanding}))} {unit}</span></p><p>{inbound?'دریافت از نمایندگی':'پرداخت به نمایندگی'}: <span dir="ltr">{presentNumber(row.agency.paid)} {unit}</span></p><p className="font-semibold">ماندهٔ تسویه نمایندگی: <span dir="ltr">{presentNumber(row.agency.outstanding)} {unit}</span></p></div>
}

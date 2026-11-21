import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {MemoryRouter} from 'react-router-dom'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import assert from 'node:assert/strict'

const server=await createServer({configFile:false,cacheDir:'node_modules/.vite-provincial64',plugins:[react()],server:{middlewareMode:true},appType:'custom'})
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>null}})
try{
 const {default:AgencyMonthlyReport}=await server.ssrLoadModule('/src/components/AgencyMonthlyReport.jsx')
 const {default:ProvincialPartyForm}=await server.ssrLoadModule('/src/components/ProvincialPartyForm.jsx')
 const {default:ProvincialPartyDetails}=await server.ssrLoadModule('/src/components/ProvincialPartyDetails.jsx')
 const {default:ProvincialNumbering}=await server.ssrLoadModule('/src/components/ProvincialNumbering.jsx')
 const {default:AgencySettlementAmounts}=await server.ssrLoadModule('/src/components/AgencySettlementAmounts.jsx')
 const {ProvincialRemittanceForm}=await server.ssrLoadModule('/src/pages/ProvincialPage.jsx')
 const {LanguageContext}=await server.ssrLoadModule('/src/hooks/LanguageContext.js')
 const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}})
 const render=child=>renderToStaticMarkup(createElement(MemoryRouter,{initialEntries:['/agency-reports']},createElement(QueryClientProvider,{client},createElement(LanguageContext.Provider,{value:{ui:text=>text,lang:'fa',t:text=>text,isRTL:true}},child))))
 const status=(amount,zero=false)=>({amount,label:zero?'تصفیه‌شده':'بدهکار',message:zero?'حساب تصفیه‌شده است':'نمایندگی بدهکار است',who_owes_whom:zero?'حساب تصفیه‌شده است':'نمایندگی به صرافی بدهکار است',office:{label:zero?'تصفیه‌شده':'طلبکار',message:zero?'حساب تصفیه‌شده است':'صرافی طلبکار است'}})
 const labels=['دریافتی','پول امانت مردم','امانت همکاران','توزیع','معاش','مصارف','قرض بالای مردم','قرض بالای همکاران']
 const report={agency:'Actual agency',month:'1405-07',settlement_note:'تسویه‌ها با اثر مثبت یا منفی',balances_by_currency:['USD','AFN','EUR','TOMAN'].map(currency=>({currency,opening_status:status(currency==='AFN'?'20000':'0',currency!=='AFN'),closing_status:status(currency==='AFN'?'12000':'0',currency!=='AFN'),movement:currency==='AFN'?'-8000':'0',deposit_liabilities:'0',lines:labels.map((label,i)=>({key:label,label,operation:i<3?'ADD':'SUBTRACT',amount:'0',effect:'0',sources:[]}))}))}
 const markup=render(createElement(AgencyMonthlyReport,{report}))
 for(const value of ['USD','AFN','EUR','TOMAN','20,000','-8,000','12,000','نمایندگی بدهکار است','صرافی طلبکار است','از دید نمایندگی','از دید صرافی','تصفیه‌شده',...labels])assert.ok(markup.includes(value),value)
 for(const label of labels)assert.equal(markup.split(`<td class="p-2">${label}</td>`).length-1,4,label)
 const details={sender_name:'Sender',recipient_name:'Recipient',sender_phone:'0070123456',recipient_phone:'0093770012345'}
 const base={id:1,account:1,number:'PVL-1405-200',currency:'AFN',amount:'25000',details,conversion:{},agency:{paid:'10000',outstanding:'15000'}}
 for(const direction of ['PROVINCIAL_IN','PROVINCIAL_OUT']){
  const row={...base,category:direction}
  const form=render(createElement(ProvincialPartyForm,{row,onClose(){},onSaved(){}})),view=render(createElement(ProvincialPartyDetails,{details}))
  const create=render(createElement(ProvincialRemittanceForm,{direction,province:'AF-BDS',accounts:[{id:1,name:'Actual agency',profile:{}}],onClose(){},onSaved(){}}))
  for(const label of ['شماره تماس فرستنده','شماره تماس گیرنده']){assert.ok(form.includes(label));assert.ok(view.includes(label));assert.ok(create.includes(label))}
  for(const value of ['0070123456','0093770012345']){assert.ok(form.includes(`value="${value}"`));assert.ok(view.includes(value))}
  const settlements=render(createElement(AgencySettlementAmounts,{row}))
  for(const value of ['25,000','10,000','15,000',direction==='PROVINCIAL_IN'?'دریافت از نمایندگی':'پرداخت به نمایندگی'])assert.ok(settlements.includes(value),value)
 }
 client.setQueryData(['provincial-numbering'],{can_configure:true,next_reference:'PVL-1405-200',starting_number:200})
 assert.ok(render(createElement(ProvincialNumbering)).includes('تنظیم شماره آغاز حواله ولایتی'))
 client.setQueryData(['provincial-numbering'],{can_configure:false,next_reference:'PVL-1405-200',starting_number:200})
 assert.ok(!render(createElement(ProvincialNumbering)).includes('تنظیم شماره آغاز حواله ولایتی'))
 console.log('Agency-perspective four-currency eight-line report, 20,000 → 12,000 example, contacts in create/edit/detail, independent inbound/outbound settlements and authorized numbering controls render correctly.')
}finally{await server.close()}

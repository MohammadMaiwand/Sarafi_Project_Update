import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {MemoryRouter} from 'react-router-dom'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import assert from 'node:assert/strict'
const server=await createServer({configFile:false,cacheDir:'node_modules/.vite-latest-remittances',plugins:[react()],server:{middlewareMode:true},appType:'custom'})
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>null}})
try{
 const {LanguageContext}=await server.ssrLoadModule('/src/hooks/LanguageContext.js')
 const {default:RemittanceForm}=await server.ssrLoadModule('/src/components/RemittanceForm.jsx')
 const {RemittanceListPage}=await server.ssrLoadModule('/src/pages/RemittancePage.jsx')
 const {default:NewTransaction}=await server.ssrLoadModule('/src/pages/NewTransaction.jsx')
 const {transactionReceiptMarkup}=await server.ssrLoadModule('/src/utils/pdfGenerator.js')
 const {default:ProvincialPage,ProvincialLanding,ProvincialRemittanceForm,RepresentativeSummary,ManualProfitFields}=await server.ssrLoadModule('/src/pages/ProvincialPage.jsx')
 const language={ui:text=>text,lang:'fa',t:text=>text,isRTL:true}
 const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}})
 client.setQueryData(['remittance-options'],{currencies:['AFN','USD','TOMAN'],moneyTransactions:[],customers:[]})
 client.setQueryData(['provinces'],{results:[{code:'AF-BDS',name:'بدخشان',english_name:'Badakhshan'},{code:'AF-KDZ',name:'کندز',english_name:'Kunduz'}]})
 const account={id:1,name:'Configured representative',province:'AF-BDS',agency:1,profile:{phone:'00123'},representativeBalances:[{currency:'AFN',amount:'5000.000'}]}
 client.setQueryData(['province-accounts','AF-BDS'],{results:[account],agencies:[]})
 const doc={id:1,account:1,agency_id:1,number:'FIN-1405-200',date:'2026-11-06',representative_name:account.name,currency:'AFN',amount:'25000.000',conversion:{},details:{sender_name:'Sender',recipient_name:'Recipient'},beneficiary:{paid:'10000',outstanding:'15000',status:'PARTIAL'},agency:{outstanding:'25000'},manual_profit:'0.000',profit_currency:'USD'}
 client.setQueryDefaults(['provincial-remittances'],{initialData:{results:[doc],count:1,page:1,pageSize:20,totalPages:1,totals:[{currency:'AFN',payable:'25000',paid:'10000',remaining:'15000'}],profitTotals:[{currency:'USD',amount:'0.000'}]}})
 const render=(child,path='/incoming')=>renderToStaticMarkup(createElement(MemoryRouter,{initialEntries:[path]},createElement(QueryClientProvider,{client},createElement(LanguageContext.Provider,{value:language},child))))
 const incoming=render(createElement(RemittanceListPage,{kind:'incoming'}))
 assert.ok(incoming.includes('حواله تهران کابل'));assert.ok(incoming.includes('مقدار افغانی'));assert.ok(incoming.includes('مقدار تومان'))
 const incomingForm=render(createElement(RemittanceForm,{kind:'incoming',initial:{transactionDate:'2026-11-06',rateBaseAmount:1000,tomanAmount:'10000000',afnUsdRate:'.7',manualProfit:'0.000',manualProfitCurrency:'AFN'},onSubmit(){}}))
 for(const value of ['نرخ تومان به افغانی','AFN / 1,000 TOMAN','7,000','مفاد'])assert.ok(incomingForm.includes(value),value)
 const usdForm=render(createElement(RemittanceForm,{kind:'incoming',initial:{transactionDate:'2026-11-06',conversionPath:'USD_TO_AFN',usdAmount:'100',usdRate:'70'},onSubmit(){}}))
 assert.ok(usdForm.includes('نرخ دالر به افغانی'));assert.ok(usdForm.includes('7,000'))
 const transaction={id:1,date:'2026-11-06',customer:{id:1,name:'Existing'},voucher_number:'0200',depositor_cardholder:'Cardholder',depositor_card:'001234567890',bank_account:'0202413316',expense:'Reference'}
 const form=render(createElement(NewTransaction,{modal:true,transaction,onClose(){}}))
 const receipt=transactionReceiptMarkup(transaction)
 for(const label of ['نام صاحب کارت','شماره کارت بانکی واریزکننده','شماره کارت بانکی (گیرنده)','مرجع مصرف']){assert.ok(form.includes(label),label);assert.ok(receipt.includes(label),label)}
 assert.ok(form.includes('value="001234567890"'));assert.ok(form.includes('value="0202413316"'))
 assert.ok(receipt.includes('1405/08/15'));assert.ok(!receipt.includes('001234567890'));assert.ok(!receipt.includes('0202413316'))
 const landing=render(createElement(ProvincialLanding))
 for(const label of ['حواله ولایتی آمد','حواله ولایتی رفت'])assert.ok(landing.includes(label))
 const picker=render(createElement(ProvincialPage,{direction:'PROVINCIAL_IN'}),'/provincial-inbound')
 assert.ok(picker.includes('بدخشان'));assert.ok(picker.includes('کندز'))
 const list=render(createElement(ProvincialPage,{direction:'PROVINCIAL_IN'}),'/provincial-inbound?province=AF-BDS')
 for(const label of ['Configured representative','قسمی پرداخت‌شده','15,000','ویرایش مفاد','پرداخت و تاریخچه'])assert.ok(list.includes(label),label)
 const provinceForm=render(createElement(ProvincialRemittanceForm,{province:'AF-BDS',provinceName:'بدخشان',direction:'PROVINCIAL_OUT',accounts:[account],onClose(){},onSaved(){}}))
 assert.ok(provinceForm.includes('حواله ولایتی رفت'));assert.ok(provinceForm.includes('مفاد؛ دستی'))
 const zero=render(createElement(ManualProfitFields,{value:'0',currency:'AFN',onValue(){},onCurrency(){}}))
 const blank=render(createElement(ManualProfitFields,{value:'',currency:'',onValue(){},onCurrency(){}}))
 assert.notEqual(zero,blank)
 const status={amount:'5000.000',label:'طلبکار',message:'نماینده به ما بدهکار است'}
 const summary=render(createElement(RepresentativeSummary,{report:{account:1,name:account.name,month:'1405-07',currency:'AFN',opening_status:status,closing_status:status,movement:'0',money_received:'0',money_sent:'0'}}))
 for(const label of ['میزان 1405','ماندهٔ انتقالی از ماه قبل','گردش ماه جاری','ماندهٔ پایان ماه','نماینده به ما بدهکار است'])assert.ok(summary.includes(label),label)
 console.log('Tehran create/edit/receipt labels and card strings, incoming quote paths and customer columns, both provincial routes, configured representatives, partial-payment rows, manual profit and monthly summaries render correctly.')
}finally{await server.close()}

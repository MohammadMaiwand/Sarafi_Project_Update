import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {MemoryRouter} from 'react-router-dom'
import assert from 'node:assert/strict'
const server=await createServer({configFile:false,plugins:[react()],server:{middlewareMode:true},appType:'custom'})
try {
 const {default:NewTransaction}=await server.ssrLoadModule('/src/pages/NewTransaction.jsx')
 const {LanguageContext}=await server.ssrLoadModule('/src/hooks/LanguageContext.js')
 const language={ui:text=>text,lang:'fa',t:text=>text,isRTL:true}
 const render=(child,path)=>renderToStaticMarkup(createElement(MemoryRouter,{initialEntries:[path]},createElement(LanguageContext.Provider,{value:language},child)))
 const newForm=render(createElement(NewTransaction,{modal:true,onClose(){}}),'/tehran-remittances')
 for(const name of ['transaction_kind','source_currency','destination_currency','fee_currency','bank_account','fee_amount','fee_collection','purpose_reference','expense'])assert.ok(!newForm.includes(`name="${name}"`),`Removed create field: ${name}`)
 for(const name of ['toman_amount','toman_rate','afghani_rate','usd_amount','afghani_amount'])assert.ok(newForm.includes(`name="${name}"`),`Preserved monetary field: ${name}`)
 assert.ok(!newForm.includes('name="toman_profit"'))
 const customerForm=render(createElement(NewTransaction,{customerIdOverride:1}),'/transactions/new?customer=1')
 assert.ok(!customerForm.includes('name="fee_amount"'))
 const edit=render(createElement(NewTransaction,{transaction:{id:1,customer:{id:1},fee_amount:'5',bank_account:'00123'}}),'/transactions/new')
 assert.ok(edit.includes('name="fee_amount"'))
 assert.ok(edit.includes('value="00123"'))
 console.log('New Tehran forms omit redundant fields, retain monetary inputs, and preserve existing record editing.')
} finally {await server.close()}

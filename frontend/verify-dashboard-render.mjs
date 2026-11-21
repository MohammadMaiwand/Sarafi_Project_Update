import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {MemoryRouter} from 'react-router-dom'
import assert from 'node:assert/strict'
const server=await createServer({configFile:false,cacheDir:'node_modules/.vite-dashboard-verification',plugins:[react()],server:{middlewareMode:true},appType:'custom'})
try {
 const {DashboardFigures,default:Dashboard}=await server.ssrLoadModule('/src/pages/Dashboard.jsx')
 const {default:Header}=await server.ssrLoadModule('/src/components/Header.jsx')
 const {LanguageContext}=await server.ssrLoadModule('/src/hooks/LanguageContext.js')
 const language={ui:text=>text,lang:'fa',t:text=>text,isRTL:true}
 const wrap=child=>createElement(MemoryRouter,null,createElement(LanguageContext.Provider,{value:language},child))
 const figures=renderToStaticMarkup(wrap(createElement(DashboardFigures,{stats:{total_toman:'2010000',total_usd:'393504.273',total_afghani:'25573333.334',toman_purchase_profit:'12.72305141'}})))
 for(const value of ['2,010,000','393,504.27','25,573,333.33','12.72'])assert.ok(figures.includes(value),value)
 const dashboard=renderToStaticMarkup(wrap(createElement(Dashboard)))
 const header=renderToStaticMarkup(wrap(createElement(Header,{...language,languages:[{code:'fa'}],username:'QA',navigationMode:'menubar',theme:'light'})))
 for(const route of ['/creditors','/custody','/financial-accounts','/agency-reports','/provincial-remittances','/unpaid-remittances','/identity-review']){
  assert.ok(dashboard.includes(`href="${route}"`),`dashboard ${route}`)
  assert.ok(header.includes(`href="${route}"`),`header ${route}`)
 }
 assert.ok(header.includes('flex-wrap'))
 console.log('Rendered dashboard figures match saved totals; all new workflow links render in both dashboard and main navigation.')
} finally {await server.close()}

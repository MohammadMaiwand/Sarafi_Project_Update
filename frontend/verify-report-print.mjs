import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import {readFile,writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url)
const {chromium}=require('C:/Users/Maihan/AppData/Local/OpenAI/Codex/runtimes/cua_node/c4873bdffed0b168/bin/node_modules/playwright')
const server=await createServer({configFile:false,plugins:[react()],server:{middlewareMode:true},appType:'custom'})
let browser
try{
 const {systemReportHtml}=await server.ssrLoadModule('/src/utils/systemReportPrint.jsx')
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true})
 for(const kind of ['tehran','system']){
  const data=JSON.parse(await readFile(`../.qa/report-${kind}-fixture.json`,'utf8'))
  const html=systemReportHtml(data,true)
  assert.ok(html.includes('report-document-header'))
  const page=await browser.newPage({viewport:{width:1122,height:794}})
  await page.setContent(html);await page.emulateMedia({media:'print'});await page.evaluate(()=>document.fonts.ready)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  await page.pdf({path:`../.qa/report-${kind}-print.pdf`,preferCSSPageSize:true,printBackground:true,displayHeaderFooter:true,headerTemplate:'<span></span>',footerTemplate:'<div style="font:9px Arial;width:100%;text-align:center;color:#64748b"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'})
  await writeFile(`../.qa/report-${kind}-print.html`,html)
  console.log(`${kind}: print HTML, A4 landscape PDF, wrapping and width verified`)
  await page.close()
 }
}finally{await browser?.close();await server.close()}

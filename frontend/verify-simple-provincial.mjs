import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import assert from 'node:assert/strict'
const server=await createServer({configFile:false,plugins:[react()],server:{middlewareMode:true},appType:'custom'})
try{
 const {default:Form}=await server.ssrLoadModule('/src/components/SimpleProvincialForm.jsx')
 const {LanguageContext}=await server.ssrLoadModule('/src/hooks/LanguageContext.js')
 for(const direction of ['PROVINCIAL_IN','PROVINCIAL_OUT']){
  const html=renderToStaticMarkup(createElement(LanguageContext.Provider,{value:{ui:text=>text}},createElement(Form,{province:'AF-BDS',direction,initialAccount:1,accounts:[{id:1,name:'Account'}],onClose(){},onSaved(){}})))
  for(const id of ['number','date','sender_name','recipient_name','sender_father','recipient_father','currency','amount','words','rate','afn','profit','recipient_id','recipient_phone','image'])assert.equal((html.match(new RegExp(`id="simple-${id}"`,'g'))||[]).length,1,id)
  assert.ok(!html.includes('province-fee'))
  assert.ok(!html.includes('province-destination'))
  assert.ok(html.includes('image/jpeg,image/png,image/webp'))
  assert.ok(html.includes('عدم ذخیره اثر انگشت'))
 }
 console.log('Both provincial forms rendered with the requested unique fields.')
}finally{await server.close()}

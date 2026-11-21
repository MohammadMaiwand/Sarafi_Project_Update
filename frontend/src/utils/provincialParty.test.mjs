import test from 'node:test'
import assert from 'node:assert/strict'
import {partyDetailsPatch} from '../provincialFields.js'
test('Contact edits preserve masked identifiers and change only explicitly edited details',()=>{
 const original={sender_name:'Sender',sender_id:'••••0012',recipient_id:'••••3456',sender_phone:'0070012345'}
 const form={...original,recipient_phone:'',notes:''}
 assert.deepEqual(partyDetailsPatch(original,form),{})
 assert.deepEqual(partyDetailsPatch(original,{...form,sender_phone:'0001234'}),{sender_phone:'0001234'})
 assert.deepEqual(partyDetailsPatch(original,{...form,sender_id:'00009999',sender_phone:''}),{sender_id:'00009999',sender_phone:''})
})

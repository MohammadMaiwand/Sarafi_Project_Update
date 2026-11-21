import test from 'node:test'
import assert from 'node:assert/strict'
import {authHeaders,handleAuthResponse,SESSION_EXPIRED} from './authSession.js'
const session=new Map(),local=new Map(),events=[]
globalThis.sessionStorage={getItem:key=>session.get(key)||null,removeItem:key=>session.delete(key)}
globalThis.localStorage={removeItem:key=>local.delete(key)}
globalThis.window={dispatchEvent:event=>events.push(event.type)}
test('Stale credentials never accompany a new login; protected requests still use the token',()=>{
 session.set('app_token','stale-token')
 assert.deepEqual(authHeaders('/login/'),{})
 assert.deepEqual(authHeaders('/dashboard/stats/'),{Authorization:'Token stale-token'})
})
test('Unauthorized data requests expire the session rather than leave an empty authenticated dashboard',()=>{
 session.set('app_token','invalid-token');local.set('app_username','previous-name')
 handleAuthResponse({status:401},'/ledger/accounts/')
 assert.equal(session.has('app_token'),false);assert.equal(local.has('app_username'),false)
 assert.equal(events.at(-1),SESSION_EXPIRED)
})

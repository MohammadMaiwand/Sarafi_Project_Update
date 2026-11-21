import test from 'node:test'
import assert from 'node:assert/strict'
import {businessSections,isSectionActive,navigationGroups} from './navigation.js'
test('Every new workflow is discoverable directly from the main navigation and dashboard',()=>{
 const routes=businessSections.map(section=>section.to)
 for(const route of ['/creditors','/custody','/financial-accounts','/agency-reports','/provincial-remittances','/unpaid-remittances','/identity-review'])assert.ok(routes.includes(route),route)
 assert.equal(new Set(routes).size,routes.length)
})

test('Grouped navigation preserves all workflows in priority order without duplicates',()=>{
 assert.deepEqual(navigationGroups.map(group=>group.id),['operations','customers','finance','reports','preferences'])
 const routes=navigationGroups.flatMap(group=>group.items.map(item=>item.to))
 assert.equal(new Set(routes).size,routes.length)
 for(const section of businessSections)assert.ok(routes.includes(section.to),section.to)
 assert.deepEqual(navigationGroups[0].items.slice(0,4).map(item=>item.to),['/tehran-remittances','/incoming','/provincial-remittances','/outgoing'])
 assert.equal(isSectionActive({pathname:'/provincial-accounts/1',search:''},'/provincial-remittances'),true)
})
test('Financial, Kabul and Iran navigation select exactly one section',()=>{
 const targets=businessSections.filter(section=>section.to.startsWith('/financial-accounts'))
 for(const section of targets){
  const url=new URL(section.to,'http://app.local'),location={pathname:url.pathname,search:url.search}
  assert.deepEqual(targets.filter(target=>isSectionActive(location,target.to)).map(target=>target.to),[section.to])
 }
 assert.equal(isSectionActive({pathname:'/financial-accounts/12',search:''},'/financial-accounts'),true)
 assert.equal(isSectionActive({pathname:'/creditors',search:''},'/financial-accounts'),false)
})

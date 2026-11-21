export const businessSections=[
 {to:'/financial-accounts',label:'حساب‌های مالی'},
 {to:'/financial-accounts?kind=KABUL_DEBTOR',label:'بدهکاران کابل'},
 {to:'/financial-accounts?kind=IRAN_DEBTOR',label:'بدهکاران ایران'},
 {to:'/creditors',label:'طلبکاران'},
 {to:'/custody',label:'امانت‌ها و سپرده‌ها'},
 {to:'/provincial-remittances',label:'حواله ولایتی'},
 {to:'/toman-profit',label:'مفاد تومان'},
 {to:'/unpaid-remittances',label:'حواله‌های پرداخت‌نشده'},
 {to:'/identity-review',label:'نواقص هویت و تماس'},
 {to:'/agency-reports',label:'مرکز گزارش‌های مالی'},
]

// Report destinations exposed to the operator; the dashboard card counts them.
export const reportSections=[
 {to:'/agency-reports',label:'مرکز گزارش‌های مالی'},
 {to:'/agency-reports/representatives',label:'گزارش ماهانه نمایندگی‌ها'},
 {to:'/toman-profit',label:'مفاد تومان'},
 {to:'/unpaid-remittances',label:'حواله‌های پرداخت‌نشده'},
 {to:'/identity-review',label:'نواقص هویت و تماس'},
 {to:'/financial-accounts',label:'حساب‌های مالی'},
 {to:'/creditors',label:'طلبکاران'},
 {to:'/custody',label:'امانت‌ها و سپرده‌ها'},
]

export const navigationGroups=[
 {id:'operations',label:'عملیات حواله',items:[
  {to:'/tehran-remittances',label:'دریافتی و حواله به تهران',icon:'invoice'},
  {to:'/incoming',label:'حواله تهران کابل',icon:'money'},
  {to:'/provincial-remittances',label:'حواله ولایتی',icon:'money'},
  {to:'/outgoing',label:'لیست حواله دریافتی ولایتی',icon:'money'},
  {to:'/unpaid-remittances',label:'حواله‌های پرداخت‌نشده',icon:'invoice'},
  {to:'/identity-review',label:'نواقص هویت و تماس',icon:'people'},
 ]},
 {id:'customers',label:'مشتریان و همکاران',items:[
  {to:'/debtors',label:'مشتری‌های بدهکار',icon:'people'},
  {to:'/colleagues',label:'گرفت و پرداخت همکاران',icon:'handshake'},
  {to:'/deposits',label:'امانت مشتریان',icon:'money'},
 ]},
 {id:'finance',label:'امور مالی',items:[
  {to:'/financial-accounts',label:'حساب‌های مالی',icon:'money'},
  {to:'/financial-accounts?kind=KABUL_DEBTOR',label:'بدهکاران کابل',icon:'people'},
  {to:'/financial-accounts?kind=IRAN_DEBTOR',label:'بدهکاران ایران',icon:'people'},
  {to:'/creditors',label:'طلبکاران',icon:'money'},
  {to:'/custody',label:'امانت‌ها و سپرده‌ها',icon:'money'},
  {to:'/mudarabah',label:'مضاربه',icon:'handshake'},
  {to:'/expenses',label:'مصارف',icon:'invoice'},
 ]},
 {id:'reports',label:'گزارش‌ها',items:[
  {to:'/agency-reports',label:'مرکز گزارش‌های مالی',icon:'invoice'},
  {to:'/agency-reports/representatives',label:'گزارش ماهانه نمایندگی‌ها',icon:'invoice'},
  {to:'/toman-profit',label:'مفاد تومان',icon:'money'},
 ]},
 {id:'preferences',label:'تنظیمات',items:[
  {to:'/personalization',label:'تنظیمات شخصی‌سازی',icon:'settings'},
 ]},
]

export function isSectionActive(location,to,{end=false}={}) {
 if(to==='/provincial-remittances'&&location.pathname.startsWith('/provincial-accounts/'))return true
 const target=new URL(to,'http://app.local')
 const matches=location.pathname===target.pathname||(!end&&target.pathname!=='/'&&location.pathname.startsWith(target.pathname+'/'))
 if(!matches)return false
 const current=new URLSearchParams(location.search)
 if(target.pathname==='/financial-accounts')return (current.get('kind')||'')===(target.searchParams.get('kind')||'')
 return [...target.searchParams].every(([key,value])=>current.get(key)===value)
}

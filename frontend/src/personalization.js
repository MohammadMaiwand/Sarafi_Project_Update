export const sectionNames = [
 ['dashboard','داشبورد'],
 ['tehran','دریافتی و حواله به تهران'],
 ['incoming','حواله تهران کابل'],
 ['outgoing','حواله‌های صادره'],
 ['provincial','گزارش نمایندگی‌ها'],
 ['debtors','مشتری‌های بدهکار'],
 ['colleagues','گرفت و پرداخت همکاران'],
 ['mudarabah','مضاربه'],
 ['deposits','امانت مشتریان'],
 ['expenses','مصارف'],
 ['provincialSummary','خلاصه مشتریان ولایتی'],
 ['provincialHistory','تاریخچه تبادلات مشتری'],
 ['provincialRemaining','کسر باقی‌مانده تومان'],
 ['personalization','تنظیمات شخصی‌سازی'],
]
const key='app_section_names_v1'
export function readSectionNames(){
 try { const value=JSON.parse(localStorage.getItem(key)||'{}');return cleanSectionNames(value) } catch { return {} }
}
export function cleanSectionNames(value){
 return Object.fromEntries(sectionNames.flatMap(([id])=>typeof value?.[id]==='string'&&value[id].trim()?[[id,value[id].trim().slice(0,80)]]:[]))
}
export function storeSectionNames(value){const clean=cleanSectionNames(value);localStorage.setItem(key,JSON.stringify(clean));return clean}
export function customSectionName(text,names){
 if(text==='حواله‌های دریافتی ولایتی')return names.provincial
 const section=sectionNames.find(([,label])=>label===text)
 return section?names[section[0]]:undefined
}

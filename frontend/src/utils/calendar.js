import { isoDate, shamsi } from './remittance.js'
export const afghanMonths = ['حمل','ثور','جوزا','سرطان','اسد','سنبله','میزان','عقرب','قوس','جدی','دلو','حوت']
export const englishMonths = ['Hamal','Sawr','Jawza','Saratan','Asad','Sunbula','Mizan','Aqrab','Qaws','Jadi','Dalw','Hut']
export const businessToday = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kabul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
export const solarMonth = () => shamsi(businessToday()).slice(0,7).replace('/','-')
export function monthRange(value) {
  const [year,month] = value.split('-').map(Number)
  if (!year || month<1 || month>12) throw new Error('ماه شمسی معتبر نیست.')
  return {dateFrom:isoDate(`${year}/${month}/01`),dateBefore:isoDate(`${month===12?year+1:year}/${month===12?1:month+1}/01`)}
}
export const monthTitle = (value,english=false) => {const [year,month]=value.split('-');return `${(english?englishMonths:afghanMonths)[Number(month)-1]} ${year}`}

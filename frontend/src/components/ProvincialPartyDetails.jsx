import {simplePartyFields as provincialPartyFields} from '../provincialFields'
export default function ProvincialPartyDetails({details}){
 return <dl className="grid gap-3 sm:grid-cols-2">{Object.entries(provincialPartyFields).map(([key,label])=><div key={key}><dt className="text-sm text-gray-500">{label}</dt><dd dir={key.endsWith('phone')?'ltr':'auto'}>{details[key]||'—'}</dd></div>)}</dl>
}

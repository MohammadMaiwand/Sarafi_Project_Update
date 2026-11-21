import {Component} from 'react'

export default class PageErrorBoundary extends Component {
 state={failed:false}
 static getDerivedStateFromError(){return {failed:true}}
 render(){
  if(this.state.failed)return <main role="alert" dir="rtl" className="mx-auto my-8 max-w-2xl rounded-xl border border-red-200 bg-red-50 p-6 text-red-800"><h1 className="font-bold">نمایش این صفحه با مشکل روبه‌رو شد.</h1><p className="mt-3">برای بارگذاری دوباره از دکمهٔ زیر استفاده کنید یا از منو بخش دیگری را باز کنید.</p><button type="button" className="mt-4 rounded-lg border border-red-300 bg-white px-4 py-2" onClick={()=>window.location.reload()}>بارگذاری دوباره</button></main>
  return this.props.children
 }
}

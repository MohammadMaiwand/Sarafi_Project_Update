export const remittanceTitles = {incoming:'حواله تهران کابل',outgoing:'لیست حواله دریافتی ولایتی','provincial-received':'سوابق حواله‌های ولایتی'}
export const remittanceLabels = {
 manualProfit:'مفاد',manualProfitCurrency:'واحد مفاد',
 manualNumber:'شماره دستی',
 hawalaNumber:'شماره حواله',transactionDate:'تاریخ شمسی',senderName:'نام فرستنده',senderFatherName:'نام پدر فرستنده',receiverName:'نام گیرنده',receiverFatherName:'نام پدر گیرنده',recipientName:'نام دریافت‌کننده',recipientFatherName:'نام پدر دریافت‌کننده',location:'محل',currencyType:'واحد پول',tomanAmount:'مبلغ تومان',sourceAmount:'مبلغ اصلی',afnUsdRate:'نرخ تومان به افغانی',usdRate:'نرخ دالر به افغانی',usdAmount:'مبلغ دالر',tomanProfit:'مفاد تومان',profitAmount:'مفاد حواله صادره',tomanInWords:'تومان به حروف',nationalIdNumber:'شماره تذکره',phoneNumber:'شماره تماس',moneyTransaction:'نوع معامله',description:'توضیحات',afnAmount:'مبلغ افغانی',afnAmountInWords:'افغانی به حروف'
}
export const numericFields=['tomanAmount','sourceAmount','afnUsdRate','usdRate','usdAmount','tomanProfit','profitAmount','afnAmount','manualProfit']
export const remittanceFields={
 incoming:['senderName','receiverName','senderFatherName','location','tomanAmount','tomanInWords','afnUsdRate','usdAmount','usdRate','manualProfit','manualProfitCurrency','nationalIdNumber','phoneNumber'],
 outgoing:['senderName','receiverName','senderFatherName','receiverFatherName','currencyType','sourceAmount','tomanInWords','afnUsdRate','afnAmount','profitAmount','nationalIdNumber','phoneNumber'],
 'provincial-received':['recipientName','recipientFatherName','usdRate','usdAmount','tomanAmount','moneyTransaction','description']
}
export const remittanceColumns={
 incoming:['hawalaNumber','transactionDate','senderName','receiverName','tomanAmount','afnAmount','senderFatherName','location','tomanInWords','afnUsdRate','usdAmount','usdRate','manualProfit','manualProfitCurrency','nationalIdNumber','phoneNumber'],
 outgoing:['hawalaNumber','transactionDate','senderName','senderFatherName','receiverName','receiverFatherName','currencyType','sourceAmount','afnAmount','profitAmount','nationalIdNumber','phoneNumber'],
 'provincial-received':['hawalaNumber','recipientName','recipientFatherName','transactionDate','usdRate','usdAmount','tomanAmount','afnAmount','afnAmountInWords','moneyTransaction','description']
}
export const defaultOptions={currencies:['TOMAN','AFN','USD','PKR','EUR','TRY'],moneyTransactions:['نقدی','حواله','بانکی']}
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kabul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
export const emptyFilters={search:'',dateFrom:'',dateTo:'',year:'',currencyType:'',moneyTransaction:'',page:1,pageSize:20,sortBy:'transaction_date',sortDir:'desc'}

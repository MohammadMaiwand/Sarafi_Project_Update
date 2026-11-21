export const accountLabels={KABUL_DEBTOR:'بدهکار کابل',IRAN_DEBTOR:'بدهکار ایران',CREDITOR:'طلبکار',COLLEAGUE:'همکار',AGENCY:'نمایندگی',CASH:'امانت نقدی',HAWALA:'حواله پرداخت‌نشده',EXCHANGE:'انتظار تبدیل ارز',TERM:'امانت قراردادی'}
export const bucketLabel=value=>({ACCOUNT:'مانده حساب',BENEFICIARY:'تعهد گیرنده',AGENCY:'تسویه نمایندگی',DEPOSIT_PRINCIPAL:'اصل امانت؛ تعهد جداگانه',FEE:'فیس جداگانه'}[value]||value)
export const statusLabel=value=>({CONFIRMED:'تأییدشده',REVERSED:'برگشت‌شده',UNPAID:'پرداخت‌نشده',PARTIAL:'پرداخت قسمی',PAID:'پرداخت کامل'}[value]||value)

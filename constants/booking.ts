export const bookingStatus = {
  official: 1,
  temporary: 2,
  waitingCancel: 3
} as const

export const layoutTypes = {
  mounth: { value: 1, label: 'ロ型' },
  s: { value: 2, label: 'S型' },
  interview: { value: 3, label: '面接' },
  banquet: { value: 4, label: '宴会' },
  theater: { value: 5, label: 'シアター型' },
  others: { value: 6, label: 'その他' }
} as const

export const typeOfExports = {
  confirm: 1,
  quote: 2,
  confirmAndQuote: 3
} as const

export const titleFileBookingTemporary = {
  bookingConfirm: { value: 1, label: '確認書' },
  priceQuotation: { value: 2, label: '仮確認書' }
} as const

export const subtotalTypes = {
  serviceFee: { value: 1, label: 'サービス料' },
  consumptionTax: { value: 2, label: '消費税' },
  nonTaxable: { value: 3, label: '非課税' }
} as const

export const bookingDetailStatuses = {
  blocked: -1,
  official: 1,
  temporary: 2,
  waitingCancel: 3,
  checkIn: 4,
  withholdPayment: 5,
  completePayment: 6,
  canceled: 7
} as const

export const invoicePdfType = {
  confirm: 1,
  quote: 2,
} as const

export const bookingInvoicePdfTitles = {
  confirmation: {
    official: {
      value: 1,
      label: '確認書'
    },
    temporary: {
      value: 2,
      label: '仮確認書'
    }
  },
  invoice: {
    official: {
      value: 1,
      label: '御見積書'
    },
    temporary: {
      value: 2,
      label: '仮見積書'
    },
    bill: {
      value: 3,
      label: '請求書'
    },
    acceptanceMinutes: {
      value: 4,
      label: '納品書'
    }
  }
} as const

export const bookingTypes = {
  official: 1,
  temporary: 2,
  bill: 3,
  acceptanceMinutes: 4
}

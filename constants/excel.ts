export const excelRevenueInfoCell = {
  totalGuestCount: '利用者数',
  totalNumberMonthsBooking: '会議室',
  totalBasicAmount: 'R基本料金',
  totalOvertimeAmount: 'R延長料金',
  totalBasicAndOverAmount: 'ルーム計',
  totalFoodAmount: '料理',
  totalBoxLunchAmount: '弁当',
  totalDrinkAmount: '飲物',
  totalDeviceFee: '機器使用料',
  totalServiceFeeAmount: 'サービス料',
  totalCancelFeeAmount: 'キャンセル',
  totalServiceAmount: '<売上計>',
  totalBringingFeeAmount: '持込料',
  totalPrepaidFeeAmount: '立替',
  totalCopyFeeAmount: 'コピー',
  totalDeliveryFeeAmount: '通話料',
  totalOtherServiceFeeAmount: '<雑収入計>',
  totalDiscountWithoutTaxAmount: '値引',
  totalWithoutTaxAmount: '純売上計',
  totalTaxAmount: '消費税',
  totalAmount: '売上総合計',
  totalCashPaymentAmount: '現金',
  totalCreditPaymentAmount: '売掛',
  totalCardPaymentAmount: 'カード',
  totalDepositAmount: '前受金',
  totalRevenueAmount: '<入金合計>'
}

export const excelLabelMonthlyRows = [
  {
    label: '利用者数',
    key: 'totalGuestCountDay'
  },
  {
    label: '会議室',
    key: 'countBookingDetail'
  },
  {
    label: 'R2時間迄',
    key: 'totalAmountBasicFeeDay'
  },
  {
    label: 'R2時間超',
    key: 'totalAmountOvertimeFeeDay'
  },
  {
    label: 'ルーム計',
    key: 'totalBookingFeeDay'
  },
  {
    label: '料理',
    key: 'totalAmountFoodDay'
  },
  {
    label: '弁当',
    key: 'totalAmountBoxLunchDay'
  },
  {
    label: '飲物',
    key: 'totalAmountDrinksDay'
  },
  {
    label: '機器使用料',
    key: 'totalAmountDeviceFeeDay'
  },
  {
    label: 'サービス料',
    key: 'totalServiceWithoutTaxAmount'
  },
  {
    label: 'キャンセル',
    key: 'totalAmountCancelFeeDay'
  },
  {
    label: '<売上計>',
    key: 'totalInsideServiceAmount'
  },
  {
    label: '持込料',
    key: 'totalAmountBringingFeeDay'
  },
  {
    label: '立替',
    key: 'totalAmountPrepaidFeeDay'
  },
  {
    label: 'コピー',
    key: 'totalAmountCopyFeeDay'
  },
  {
    label: '通話料',
    key: 'totalAmountDeliveryFeeDay'
  },
  {
    label: '<雑収入計>',
    key: 'totalOutsideServiceAmount'
  },
  {
    label: '値引',
    key: 'totalDiscountWithoutTaxAmount'
  },
  {
    label: '純売上計',
    key: 'sumTotalWithoutTaxAmount'
  },
  {
    label: '消費税',
    key: 'sumTotalTaxAmount'
  },
  {
    label: '売上総合計',
    key: 'sumTotalAmount'
  },
  {
    label: '現金',
    key: 'totalCashPaymentAmount'
  },
  {
    label: '売掛',
    key: 'totalCreditPaymentAmount'
  },

  {
    label: 'カード',
    key: 'totalCardPaymentAmount'
  },

  {
    label: '前受金',
    key: 'totalDepositAmount'
  },
  {
    label: '<入金合計>',
    key: 'totalAmountReceived'
  }
]

export const rowRevenueUsedBackground = [6, 13, 18, 20, 22, 27]

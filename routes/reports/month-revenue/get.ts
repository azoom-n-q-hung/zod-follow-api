import z from 'zod'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear
} from 'date-fns'
import { prisma } from '@root/database'
import { encodeFileName } from '@root/util'
import { Request, Response } from 'express'
import { types } from '@constants/service'
import { excelRevenueInfoCell } from '@constants/excel'
import { invoiceStatuses } from '@constants/invoice'
import { bookingDetailStatuses } from '@constants/booking'
import { createRevenueExcelFile } from '@helpers/excel'
import { validYearRules } from '@lib/abo'

export const apiDefinition = {
  alias: 'getMonthRevenueReport',
  description: 'Get month revenue report',
  parameters: [
    {
      name: 'year',
      type: 'Query',
      description: 'Year',
      schema: validYearRules()
    }
  ],
  response: z.any(),
  errorStatuses: [400, 403]
}

export default async (req: Request, res: Response) => {
  const { year } = req.query

  const currentDate = format(new Date(), 'yyyy/M/d')
  const months = new Array(12).fill(null).map((_, month) => month + 1);
  const monthRevenues = await Promise.all(months.map(async (month) =>
    await getMonthRevenueData(startOfMonth(new Date(`${year}-${month}`)), endOfMonth(new Date(`${year}-${month}`)), Number(month))
  ))
  const yearRevenue = await getMonthRevenueData(startOfYear(new Date(`${year}`)), endOfYear(new Date(`${year}`)), 0)

  const colsData = [
    { title: `${year}年分`, ...excelRevenueInfoCell },
    ...monthRevenues,
    yearRevenue,
    { title: `発行日：${currentDate}`}
  ]

  const sheetName = '月別売上報告書'
  const excelFile = await createRevenueExcelFile(sheetName, colsData)

  res.setHeader('X-File-Name', encodeFileName(`月別売上報告書_${format(new Date(), 'yyyyMMdd')}.xlsx`))
  res.writeHead(200, {
    'Content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment;filename=month-revenue.xlsx`
  })

  excelFile.xlsx.write(res)
}

async function getMonthRevenueData(start: Date, end: Date, month: Number|undefined) {
  const {
    _count: totalNumberMonthsBooking,
    _sum: totalGuestCount
  } = await getTotalNumber(start, end)
  const title = month ? `${month}月`: '累計'

  return {
    title,
    totalGuestCount: totalGuestCount.guestCount || 0,
    totalNumberMonthsBooking,
    ...await (getTotalAmountWithServiceType(start, end)),
    ...await (getTotalAmount(start, end))
  }
}

function getTotalNumber(start: Date, end: Date) {
  return prisma.bookingDetail.aggregate({
    where: {
      status: bookingDetailStatuses.completePayment,
      startDatetime: {
        gte: start,
        lte: end
      }
    },
    _count: true,
    _sum: { guestCount: true }
  })
}

async function getTotalAmountWithServiceType(start: Date, end: Date) {
  const invoiceItems = await getInvoiceItems(start, end)

  return invoiceItems.reduce(( total, invoiceItem ) => {
    const amountWithoutTax = Number(invoiceItem.subtotalWithoutTaxAmount)
    const totalBasicAmount = invoiceItem.type === types.basicFee ? amountWithoutTax : 0
    const totalOvertimeAmount = invoiceItem.type === types.overtimeFee ? amountWithoutTax : 0
    const totalFoodAmount = invoiceItem.type === types.food ? amountWithoutTax : 0
    const totalBoxLunchAmount = invoiceItem.type === types.boxLunch ? amountWithoutTax : 0
    const totalDrinkAmount = invoiceItem.type === types.drinks ? amountWithoutTax : 0
    const totalDeviceFee = invoiceItem.type === types.deviceFee ? amountWithoutTax : 0
    const totalServiceFeeAmount = invoiceItem.invoice?.serviceWithoutTaxAmount || 0
    const totalCancelFeeAmount = invoiceItem.type === types.cancelFee ? amountWithoutTax : 0
    const totalServiceAmount = totalFoodAmount + totalBoxLunchAmount + totalDrinkAmount + totalDeviceFee + Number(totalServiceFeeAmount) + totalCancelFeeAmount
    const totalBringingFeeAmount = invoiceItem.type === types.bringingFee ? amountWithoutTax : 0
    const totalPrepaidFeeAmount = invoiceItem.type === types.prepaidFee ? amountWithoutTax : 0
    const totalCopyFeeAmount = invoiceItem.type === types.copyFee ? amountWithoutTax : 0
    const totalDeliveryFeeAmount = invoiceItem.type === types.deliveryFee ? amountWithoutTax : 0
    const totalOtherServiceFeeAmount = totalBringingFeeAmount + totalPrepaidFeeAmount + totalCopyFeeAmount + totalDeliveryFeeAmount

    return {
      totalBasicAmount: total.totalBasicAmount + totalBasicAmount,
      totalOvertimeAmount: total.totalOvertimeAmount + totalOvertimeAmount,
      totalBasicAndOverAmount: total.totalBasicAndOverAmount + totalBasicAmount + totalOvertimeAmount,
      totalFoodAmount: total.totalFoodAmount + totalFoodAmount,
      totalBoxLunchAmount: total.totalBoxLunchAmount + totalBoxLunchAmount,
      totalDrinkAmount: total.totalDrinkAmount + totalDrinkAmount,
      totalDeviceFee: total.totalDeviceFee + totalDeviceFee,
      totalServiceFeeAmount: total.totalServiceFeeAmount + Number(totalServiceFeeAmount),
      totalCancelFeeAmount: total.totalCancelFeeAmount + totalCancelFeeAmount,
      totalServiceAmount: total.totalServiceAmount + totalServiceAmount,
      totalBringingFeeAmount: total.totalBringingFeeAmount + totalBringingFeeAmount,
      totalPrepaidFeeAmount: total.totalPrepaidFeeAmount + totalPrepaidFeeAmount,
      totalCopyFeeAmount: total.totalCopyFeeAmount + totalCopyFeeAmount,
      totalDeliveryFeeAmount: total.totalDeliveryFeeAmount + totalDeliveryFeeAmount,
      totalOtherServiceFeeAmount: total.totalOtherServiceFeeAmount + totalOtherServiceFeeAmount,
    }
  }, {
    totalBasicAmount: 0,
    totalOvertimeAmount: 0,
    totalBasicAndOverAmount: 0,
    totalFoodAmount: 0,
    totalBoxLunchAmount: 0,
    totalDrinkAmount: 0,
    totalDeviceFee: 0,
    totalServiceFeeAmount: 0,
    totalCancelFeeAmount: 0,
    totalServiceAmount: 0,
    totalBringingFeeAmount: 0,
    totalPrepaidFeeAmount: 0,
    totalCopyFeeAmount: 0,
    totalDeliveryFeeAmount: 0,
    totalOtherServiceFeeAmount: 0
  })
}

function getInvoiceItems(start: Date, end: Date) {
  const startDate = format(new Date(start), 'yyyy-MM-dd')
  const endDate = format(new Date(end), 'yyyy-MM-dd')

  return prisma.invoiceItem.findMany({
    where: {
      invoice: { status: invoiceStatuses.completed },
      OR: [
        {
          invoice: {
            bookingId: null,
            paymentDate: {
              gte: new Date(startDate),
              lte: new Date(endDate)
            }
          }
        },
        {
          bookingDetail: {
            status: bookingDetailStatuses.completePayment,
            startDatetime: {
              gte: start,
              lte: end
            }
          }
        }
      ]
    },
    include: { invoice: true }
  })
}

async function getTotalAmount(start: Date, end: Date) {
  const invoices = await getInvoices(start, end)

  return invoices.reduce((total, invoice) => {
    return {
      totalDiscountWithoutTaxAmount: total.totalDiscountWithoutTaxAmount - Number(invoice.discountWithoutTaxAmount),
      totalWithoutTaxAmount: total.totalWithoutTaxAmount + Number(invoice.totalWithoutTaxAmount),
      totalTaxAmount: total.totalTaxAmount + Number(invoice.totalTaxAmount),
      totalAmount: total.totalAmount + Number(invoice.totalAmount),
      totalCashPaymentAmount: total.totalCashPaymentAmount + Number(invoice.cashPaymentAmount),
      totalCreditPaymentAmount: total.totalCreditPaymentAmount + Number(invoice.creditPaymentAmount),
      totalCardPaymentAmount: total.totalCardPaymentAmount + Number(invoice.cardPaymentAmount),
      totalDepositAmount: total.totalDepositAmount + Number(invoice.depositAmount),
      totalRevenueAmount: total.totalRevenueAmount
        + Number(invoice.cashPaymentAmount)
        + Number(invoice.creditPaymentAmount)
        + Number(invoice.cardPaymentAmount)
        + Number(invoice.depositAmount)
    }
  }, {
    totalDiscountWithoutTaxAmount: 0,
    totalWithoutTaxAmount: 0,
    totalTaxAmount: 0,
    totalAmount: 0,
    totalCashPaymentAmount: 0,
    totalCreditPaymentAmount: 0,
    totalCardPaymentAmount: 0,
    totalDepositAmount: 0,
    totalRevenueAmount: 0
  })
}

function getInvoices(start: Date, end: Date) {
  const startDate = format(new Date(start), 'yyyy-MM-dd')
  const endDate = format(new Date(end), 'yyyy-MM-dd')

  return prisma.invoice.findMany({
    where : {
      status: invoiceStatuses.completed,
      OR: [
        {
          bookingId: null,
          paymentDate: {
            gte: new Date(startDate),
            lte: new Date(endDate)
          }
        },
        {
          invoiceItems: {
            some: {
              bookingDetail: {
                status: bookingDetailStatuses.completePayment,
                startDatetime: {
                  gte: start,
                  lte: end
                }
              }
            }
          }
        }
      ]
    }
  })
}

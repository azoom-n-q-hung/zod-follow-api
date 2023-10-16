import { z } from 'zod'
import { format, startOfMonth, endOfMonth, getDaysInMonth } from 'date-fns'
import { Request, Response } from 'express'
import { prisma } from '@root/database'
import { encodeFileName } from '@root/util'
import { createRevenueBetweenMonthlyExcelFile } from '@helpers/excel'
import { excelLabelMonthlyRows } from '@constants/excel'
import { bookingDetailStatuses } from '@constants/booking'
import { types as serviceTypes } from '@constants/service'
import { invoiceStatuses } from '@constants/invoice'
import {
  Invoice,
  InvoiceWithRelations,
  validYearRules,
  validMonthRules,
  InvoiceItem
} from '@lib/abo'
import { getWeekJp } from '@root/helpers/date'

export const apiDefinition = {
  alias: 'Export-Monthly-Revenue',
  description: 'Export Monthly Revenue',
  parameters: [
    {
      name: 'month',
      type: 'query',
      description: 'Monthly',
      schema: validMonthRules()
    },
    {
      name: 'year',
      type: 'query',
      description: 'Year Revenue',
      schema: validYearRules()
    }
  ],
  response: z.any(),
  errorStatuses: [400, 403, 404]
}

const initialRevenue = {
  totalGuestCountDay: 0,
  countBookingDetail: 0,

  totalAmountBasicFeeDay: 0,
  totalAmountOvertimeFeeDay: 0,
  totalBookingFeeDay: 0,

  totalAmountFoodDay: 0,
  totalAmountBoxLunchDay: 0,
  totalAmountDrinksDay: 0,
  totalAmountCancelFeeDay: 0,
  totalAmountDeviceFeeDay: 0,
  totalServiceWithoutTaxAmount: 0,
  totalInsideServiceAmount: 0,

  totalAmountBringingFeeDay: 0,
  totalAmountPrepaidFeeDay: 0,
  totalAmountCopyFeeDay: 0,
  totalAmountDeliveryFeeDay: 0,
  totalOutsideServiceAmount: 0,

  totalDiscountWithoutTaxAmount: 0,
  sumTotalWithoutTaxAmount: 0,
  sumTotalTaxAmount: 0,
  sumTotalAmount: 0,

  totalCashPaymentAmount: 0,
  totalCreditPaymentAmount: 0,
  totalCardPaymentAmount: 0,
  totalDepositAmount: 0,
  totalAmountReceived: 0
}

export default async (req: Request, res: Response) => {
  const { month, year } = req.query

  const currentDate = new Date(`${year}-${month}-01`)
  const bookingDetails = await getBookingDetails(currentDate)
  const datesInMonth = generateDaysOfMonth(Number(year), Number(month))
  const lobbyInvoices = await getLobbyInvoices(currentDate)
  const formattedData = await formatExcelData(
    bookingDetails,
    datesInMonth,
    lobbyInvoices
  )

  const sheetName = '月間売上報告書'
  const excelTitles = generateExcelTitles(Number(year), Number(month))
  const rowsData = generateExcelRows(formattedData)
  const excelFile = await createRevenueBetweenMonthlyExcelFile(
    rowsData,
    sheetName,
    excelTitles
  )

  res.setHeader(
    'X-File-Name',
    encodeFileName(`月間売上報告書_${format(new Date(), 'yyyyMMdd')}.xlsx`)
  )
  res.writeHead(200, {
    'Content-type':
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment;filename=monthly-revenue.xlsx`
  })
  excelFile.xlsx.write(res)
}

function getBookingDetails(currentDate: Date) {
  return prisma.bookingDetail.findMany({
    where: {
      status: bookingDetailStatuses.completePayment,
      startDatetime: {
        gte: startOfMonth(currentDate),
        lte: endOfMonth(currentDate)
      }
    },
    select: {
      id: true,
      startDatetime: true,
      guestCount: true
    }
  })
}

function getLobbyInvoices(currentDate: Date) {
  return prisma.invoice.findMany({
    where: {
      status: invoiceStatuses.completed,
      bookingId: null,
      paymentDate: {
        gte: startOfMonth(currentDate),
        lte: endOfMonth(currentDate)
      }
    },
    include: {
      invoiceItems: true
    }
  })
}

async function getMeetingInvoices(bookingDetailIds: number[]) {
  const invoices = await prisma.invoice.findMany({
    where: {
      invoiceItems: {
        some: {
          bookingDetail: {
            id: {
              in: bookingDetailIds
            }
          }
        }
      }
    },
    include: {
      invoiceItems: true
    }
  })

  return invoices.reduce(
    (result: any, invoice) => {
      const { invoiceItems, ...invoiceInfo } = invoice
      result.invoices = [...result.invoices, invoiceInfo]
      result.invoiceItems = [...result.invoiceItems, ...invoiceItems]

      return result
    },
    {
      invoices: [],
      invoiceItems: []
    }
  )
}

async function formatExcelData(
  bookingDetails: any[],
  datesInMonth: any[],
  lobbyInvoices: InvoiceWithRelations[]
) {
  const allBookingDetailId = bookingDetails.map(
    bookingDetail => bookingDetail.id
  )
  const { invoices: allMeetingInvoice, invoiceItems: allMeetingInvoiceItem } =
    await getMeetingInvoices(allBookingDetailId)

  const excelData = datesInMonth.map(date => {
    const bookingDetailsForDay = bookingDetails.filter(
      bookingDetail =>
        date === format(new Date(bookingDetail.startDatetime), 'yyyy-MM-dd')
    )
    const { totalGuestCountDay, bookingDetailIds } =
      bookingDetailsForDay.reduce(
        (result, bookingDetail) => {
          result.bookingDetailIds = [
            ...result.bookingDetailIds,
            bookingDetail.id
          ]
          result.totalGuestCountDay += bookingDetail.guestCount
          return result
        },
        { bookingDetailIds: [], totalGuestCountDay: 0 }
      )

    const meetingInvoiceItems = allMeetingInvoiceItem.filter(
      ({ bookingDetailId }: InvoiceItem) =>
        bookingDetailIds.includes(bookingDetailId)
    )

    const meetingInvoiceItemIds = [
      ...new Set(
        meetingInvoiceItems.map(({ invoiceId }: InvoiceItem) => invoiceId)
      )
    ]
    const meetingInvoices = allMeetingInvoice.filter(({ id }: Invoice) =>
      meetingInvoiceItemIds.includes(id)
    )

    const { invoicesForDay, invoiceItemsForDay } = breakInvoice(
      lobbyInvoices,
      date
    )

    const {
      totalAmountBasicFeeDay,
      totalAmountOvertimeFeeDay,
      totalAmountFoodDay,
      totalAmountBoxLunchDay,
      totalAmountDrinksDay,
      totalAmountCancelFeeDay,
      totalAmountDeliveryFeeDay,
      totalAmountCopyFeeDay,
      totalAmountBringingFeeDay,
      totalAmountPrepaidFeeDay,
      totalAmountDeviceFeeDay
    } = calculateServiceAmount([...invoiceItemsForDay, ...meetingInvoiceItems])

    const {
      totalServiceWithoutTaxAmount,
      totalDiscountWithoutTaxAmount,
      sumTotalWithoutTaxAmount,
      sumTotalTaxAmount,
      sumTotalAmount,
      totalCashPaymentAmount,
      totalCreditPaymentAmount,
      totalCardPaymentAmount,
      totalDepositAmount
    } = calculateInvoiceAmount([...invoicesForDay, ...meetingInvoices])

    return {
      totalGuestCountDay,
      countBookingDetail: bookingDetailsForDay.length,
      totalAmountBasicFeeDay,
      totalAmountOvertimeFeeDay,
      totalBookingFeeDay: totalAmountBasicFeeDay + totalAmountOvertimeFeeDay,
      totalAmountFoodDay,
      totalAmountBoxLunchDay,
      totalAmountDrinksDay,
      totalAmountDeviceFeeDay,
      totalServiceWithoutTaxAmount,
      totalAmountCancelFeeDay,
      totalInsideServiceAmount:
        totalAmountFoodDay +
        totalAmountDrinksDay +
        totalAmountDeviceFeeDay +
        totalServiceWithoutTaxAmount +
        totalAmountCancelFeeDay,
      totalAmountDeliveryFeeDay,
      totalAmountCopyFeeDay,
      totalAmountBringingFeeDay,
      totalAmountPrepaidFeeDay,
      totalOutsideServiceAmount:
        totalAmountDeliveryFeeDay +
        totalAmountCopyFeeDay +
        totalAmountBringingFeeDay +
        totalAmountPrepaidFeeDay,
      totalDiscountWithoutTaxAmount,
      sumTotalWithoutTaxAmount,
      sumTotalTaxAmount,
      sumTotalAmount,
      totalCashPaymentAmount,
      totalCreditPaymentAmount,
      totalCardPaymentAmount,
      totalDepositAmount,
      totalAmountReceived:
        totalAmountFoodDay +
        totalAmountBoxLunchDay +
        totalAmountDrinksDay +
        totalAmountDeviceFeeDay +
        totalServiceWithoutTaxAmount +
        totalAmountCancelFeeDay
    }
  })

  const sumStartOfMonth = calculateTotalRevenue(excelData.slice(0, 10))
  const sumMiddleOfMonth = calculateTotalRevenue(excelData.slice(10, 20))
  const sumEndOfMonth = calculateTotalRevenue(excelData.slice(20))
  const totalOfMoth = calculateTotalRevenue(excelData)

  return [
    ...excelData.slice(0, 10),
    sumStartOfMonth,
    ...excelData.slice(10, 20),
    sumMiddleOfMonth,
    ...excelData.slice(20),
    sumEndOfMonth,
    totalOfMoth
  ]
}

function breakInvoice(invoices: InvoiceWithRelations[], currentDate: string) {
  return invoices.reduce(
    (result: any, invoice) => {
      const { invoiceItems, ...invoiceInfo } = invoice
      const paymentDate =
        invoiceInfo.paymentDate &&
        format(new Date(invoiceInfo.paymentDate), 'yyyy-MM-dd')
      if (paymentDate === currentDate) {
        result.invoicesForDay = [...result.invoicesForDay, invoiceInfo]
        result.invoiceItemsForDay = [
          ...result.invoiceItemsForDay,
          ...invoiceItems
        ]
      }

      return result
    },
    {
      invoicesForDay: [],
      invoiceItemsForDay: []
    }
  )
}

function calculateServiceAmount(invoiceItems: any[]) {
  return invoiceItems.reduce(
    (result, invoiceItem) => {
      const subtotalWithoutTaxAmount = Number(
        invoiceItem.subtotalWithoutTaxAmount
      )

      if (invoiceItem.type === serviceTypes.basicFee) {
        result.totalAmountBasicFeeDay += subtotalWithoutTaxAmount
      }
      if (invoiceItem.type === serviceTypes.overtimeFee) {
        result.totalAmountOvertimeFeeDay += subtotalWithoutTaxAmount
      }
      if (invoiceItem.type === serviceTypes.food) {
        result.totalAmountFoodDay += subtotalWithoutTaxAmount
      }
      if (invoiceItem.type === serviceTypes.boxLunch) {
        result.totalAmountBoxLunchDay += subtotalWithoutTaxAmount
      }
      if (invoiceItem.type === serviceTypes.drinks) {
        result.totalAmountDrinksDay += subtotalWithoutTaxAmount
      }
      if (invoiceItem.type === serviceTypes.cancelFee) {
        result.totalAmountCancelFeeDay += subtotalWithoutTaxAmount
      }
      if (invoiceItem.type === serviceTypes.deliveryFee) {
        result.totalAmountDeliveryFeeDay += subtotalWithoutTaxAmount
      }
      if (invoiceItem.type === serviceTypes.copyFee) {
        result.totalAmountCopyFeeDay += subtotalWithoutTaxAmount
      }
      if (invoiceItem.type === serviceTypes.bringingFee) {
        result.totalAmountBringingFeeDay += subtotalWithoutTaxAmount
      }
      if (invoiceItem.type === serviceTypes.prepaidFee) {
        result.totalAmountPrepaidFeeDay += subtotalWithoutTaxAmount
      }
      if (invoiceItem.type === serviceTypes.deviceFee) {
        result.totalAmountDeviceFeeDay += subtotalWithoutTaxAmount
      }

      return result
    },
    {
      totalAmountBasicFeeDay: 0,
      totalAmountOvertimeFeeDay: 0,
      totalAmountFoodDay: 0,
      totalAmountBoxLunchDay: 0,
      totalAmountDrinksDay: 0,
      totalAmountCancelFeeDay: 0,
      totalAmountDeliveryFeeDay: 0,
      totalAmountCopyFeeDay: 0,
      totalAmountBringingFeeDay: 0,
      totalAmountPrepaidFeeDay: 0,
      totalAmountDeviceFeeDay: 0
    }
  )
}

function calculateInvoiceAmount(invoices: Invoice[]) {
  return invoices.reduce(
    (result: any, invoice: Invoice) => {
      result.sumTotalWithoutTaxAmount += Number(invoice.totalWithoutTaxAmount)
      result.sumTotalTaxAmount += Number(invoice.totalTaxAmount)
      result.sumTotalAmount += Number(invoice.totalAmount)
      result.totalCashPaymentAmount += Number(invoice.cashPaymentAmount)
      result.totalCreditPaymentAmount += Number(invoice.creditPaymentAmount)
      result.totalCardPaymentAmount += Number(invoice.cardPaymentAmount)
      result.totalDepositAmount += Number(invoice.depositAmount)
      result.totalServiceWithoutTaxAmount += Number(
        invoice.serviceWithoutTaxAmount
      )
      result.totalDiscountWithoutTaxAmount += Number(
        invoice.discountWithoutTaxAmount
      )

      return result
    },
    {
      totalServiceWithoutTaxAmount: 0,
      totalDiscountWithoutTaxAmount: 0,
      sumTotalWithoutTaxAmount: 0,
      sumTotalTaxAmount: 0,
      sumTotalAmount: 0,
      totalCashPaymentAmount: 0,
      totalCreditPaymentAmount: 0,
      totalCardPaymentAmount: 0,
      totalDepositAmount: 0
    }
  )
}

function calculateTotalRevenue(revenues: any[]) {
  return revenues.reduce(
    (result, revenue) => {
      result.totalGuestCountDay += revenue.totalGuestCountDay
      result.countBookingDetail += revenue.countBookingDetail
      result.totalAmountBasicFeeDay += revenue.totalAmountBasicFeeDay
      result.totalAmountOvertimeFeeDay += revenue.totalAmountOvertimeFeeDay
      result.totalBookingFeeDay += revenue.totalBookingFeeDay
      result.totalAmountFoodDay += revenue.totalAmountFoodDay
      result.totalAmountBoxLunchDay += revenue.totalAmountBoxLunchDay
      result.totalAmountDrinksDay += revenue.totalAmountDrinksDay
      result.totalAmountCancelFeeDay += revenue.totalAmountCancelFeeDay
      result.totalAmountDeviceFeeDay += revenue.totalAmountDeviceFeeDay
      result.totalServiceWithoutTaxAmount +=
        revenue.totalServiceWithoutTaxAmount
      result.totalInsideServiceAmount += revenue.totalInsideServiceAmount
      result.totalAmountBringingFeeDay += revenue.totalAmountBringingFeeDay
      result.totalAmountPrepaidFeeDay += revenue.totalAmountPrepaidFeeDay
      result.totalAmountCopyFeeDay += revenue.totalAmountCopyFeeDay
      result.totalAmountDeliveryFeeDay += revenue.totalAmountDeliveryFeeDay
      result.totalOutsideServiceAmount += revenue.totalOutsideServiceAmount
      result.totalDiscountWithoutTaxAmount +=
        revenue.totalDiscountWithoutTaxAmount
      result.sumTotalWithoutTaxAmount += revenue.sumTotalWithoutTaxAmount
      result.sumTotalTaxAmount += revenue.sumTotalTaxAmount
      result.sumTotalAmount += revenue.sumTotalAmount
      result.totalCashPaymentAmount += revenue.totalCashPaymentAmount
      result.totalCreditPaymentAmount += revenue.totalCreditPaymentAmount
      result.totalCardPaymentAmount += revenue.totalCardPaymentAmount
      result.totalDepositAmount += revenue.totalDepositAmount
      result.totalAmountReceived += revenue.totalAmountReceived

      return result
    },
    { ...initialRevenue }
  )
}

function generateDaysOfMonth(year: number, month: number) {
  const daysInMonth = getDaysInMonth(new Date(`${year}-${month}-01`))

  return new Array(daysInMonth).fill(null).map((_, day: number) => {
    return format(new Date(`${year}-${month}-${day + 1}`), 'yyyy-MM-dd')
  })
}

function generateExcelTitles(year: number, month: number) {
  const daysInMonth = getDaysInMonth(new Date(year, month - 1))
  const currentDate = format(new Date(), 'yyyy/M/d')
  const excelTitles = new Array(daysInMonth).fill(null).map((_, day) => {
    const dayOfWeekInJP = getWeekJp(
      new Date(`${year}-${month}-${day + 1}`).getDay()
    )
    return {
      title: `${day + 1}日(${dayOfWeekInJP})`,
      width: 15
    }
  })

  return [
    {
      title: `${year}年${month}月分`,
      width: 15
    },
    ...excelTitles.slice(0, 10),
    { title: '小計', width: 15 },
    ...excelTitles.slice(10, 20),
    { title: '小計', width: 15 },
    ...excelTitles.slice(20),
    { title: '小計', width: 15 },
    { title: '累計', width: 15 },
    { title: `発行日：${currentDate}`, width: 15 }
  ]
}

function generateExcelRows(data: any[]) {
  return excelLabelMonthlyRows.map(row => {
    const values = data.map((item: any) => {
      return item[row.key]
    })
    return [row.label, ...values]
  })
}

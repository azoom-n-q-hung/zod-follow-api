import { z } from 'zod'
import {
  format,
  addDays,
  subHours
} from 'date-fns'
import { Request, Response } from 'express'
import { prisma } from '@root/database'
import { encodeFileName } from '@root/util'
import _ from 'lodash/fp'
import ExcelJS from 'exceljs'
import { bookingDetailStatuses } from '@constants/booking'
import { types as serviceTypes } from '@constants/service'
import {
  validDateField
} from '@lib/abo'
import {
  calculateAmountsByInvoiceItemIds
} from '@helpers/amountCalculation'

export const apiDefinition = {
  alias: 'Day Revenue Report',
  description: 'Export Day Revenue Report',
  parameters: [
    {
      name: 'date',
      type: 'Query',
      description: 'Search Target Date',
      schema: validDateField({
        required_error: '未入力です',
        invalid_type_error: '無効な日付です',
        invalid_date: '無効な日付です'
      })
    }
  ],
  response: z.any(),
  errorStatuses: [400, 403, 404]
}

// TODO
const labels =  {
  bookingDetailCount: '会議数',
  guestCount: '延利用者数',
  basicFee: 'R2時間迄',
  overtimeFee: 'R2時間超',
  food: '料理',
  boxLunch: '弁当',
  drinks: '飲物',
  deviceFee: '機器使用料',
  totalServiceWithoutTaxAmount: 'サービス料',
  cancelFee: 'キャンセル',
  totalSubtotalSales: '<売上計>',
  deliveryFee: '通話料',
  copyFee: 'コピー',
  bringingFee: '持ち込み料',
  prepaidFee: '立替',
  totalMiscellaneousIncome: '<雑収入計>',
  totalDiscountWithoutTaxAmount: '値引',
  totalNetSales: '<純売上計>',
  totalTaxAmount: '消費税',
  totalSales: '<売上総合計>',
  totalCashPaymentAmount: '現金',
  totalCardPaymentAmount: 'カード',
  totalCreditPaymentAmount: '売掛',
  totalDepositAmount: '前受金',
  totalPaymentAmount: '<入金合計>'
}

// TODO
const totalDisplayRows = [12, 17, 19, 21, 26]

export default async (req: Request, res: Response) => {
  const { date } = req.query
  if (!date) return res.sendStatus(400)

  const targetDate = new Date(date as string)

  const allDailySales = await calculateAllDailySales(targetDate)
  const pastSales = await calculatePastSales(targetDate)
  const dailySales = calculateDailySales(allDailySales, pastSales)
  const roomSales = await calculateRoomSales(targetDate)

  const excelFile = await generateExcel(allDailySales, pastSales, dailySales, roomSales, targetDate)

  res.setHeader('X-File-Name', encodeFileName(`売上仕訳日計表_${format(new Date(), 'yyyyMMdd')}.xlsx`))
  res.writeHead(200, {
    'Content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment;filename=day-revenue.xlsx`
  })
  excelFile.xlsx.write(res)
}

async function calculateAllDailySales(targetDate: Date) {
  const results = await Promise.all([
    calculateBookingSales(targetDate),
    calculateLobbySales(targetDate)
  ])

  return results.reduce((res: { [key: string]: number }, x) => {
    Object.entries(x).forEach(([key, value]) => {
      res[key] === undefined
        ? res[key] = value
        : res[key] += value
    })
    return res
  }, {})
}

async function calculatePastSales(targetDate: Date) {
  const invoiceItems = await fetchInvoiceItems(targetDate, true)
  const pastInvoiceIds = _.uniq(invoiceItems.map((x: any) => x.invoice.pastInvoiceId))
  const pastInvoiceItems = await fetchInvoiceItems(targetDate, true, pastInvoiceIds)

  const results = await Promise.all([
    totalize(invoiceItems),
    totalize(pastInvoiceItems)
  ])

  return results.reduce((res: { [key: string]: number }, x) => { 
    Object.entries(x).forEach(([key, value]) => {
      res[key] === undefined
        ? res[key] = value
        : res[key] -= value
    })
    return res
  }, { bookingDetailCount: 0, guestCount: 0 })
}

async function calculateBookingSales(targetDate: Date) {
  const invoiceItems = await fetchInvoiceItemsAttachedBooking(targetDate)
  
  return {
    ...await calculateBookingDetailCounts(targetDate),
    ...await totalize(invoiceItems, true, targetDate)
  }
}

async function calculateBookingDetailCounts(targetDate: Date) {
  const start = subHours(targetDate, 9)
  const end = subHours(addDays(targetDate, 1), 9)
  const { _sum, _count } = await prisma.bookingDetail.aggregate({
    _count: {
      id: true
    },
    _sum: {
      guestCount: true
    },
    where: {
      startDatetime: {
        gte: start,
        lt: end
      },
      status: {
        in: [
          bookingDetailStatuses.official,
          bookingDetailStatuses.checkIn,
          bookingDetailStatuses.withholdPayment,
          bookingDetailStatuses.completePayment
        ]
      },
      cancelDatetime: null
    }
  })

  return {
    bookingDetailCount: _count?.id || 0,
    guestCount: _sum?.guestCount || 0
  }
}

async function calculateLobbySales(targetDate: Date) {
  const results = await fetchInvoiceItems(targetDate)
  return totalize(results)
}

async function fetchInvoiceItems(targetDate: Date, isPastRevision: boolean = false, invoiceIds: any[] = []) {
  const conditions = invoiceIds.length > 0
    ? { id: { in: invoiceIds } }
    : isPastRevision
    ? { paymentDate: targetDate, pastInvoiceId: { not: null } }
    : { paymentDate: targetDate, pastInvoiceId: null, bookingId: null }

  return await prisma.invoiceItem.findMany({
    select: {
      id: true,
      invoiceId: true,
      subtotalWithoutTaxAmount: true,
      type: true,
      invoice: {
        select: {
          pastInvoiceId: true
        }
      }
    },
    where: {
      invoice: {
        ...conditions
      }
    }
  })
}

async function fetchInvoiceItemsAttachedBooking(targetDate: Date) {
  const start = subHours(targetDate, 9)
  const end = subHours(addDays(targetDate, 1), 9)

  return await prisma.invoiceItem.findMany({
    select: {
      id: true,
      bookingDetailId: true,
      invoiceId: true,
      subtotalWithoutTaxAmount: true,
      type: true,
      bookingDetail: {
        select: {
          roomId: true,
          guestCount: true,
          taxRate: true
        }
      },
      invoice: {
        select: {
          paymentDate: true,
        }
      }
    },
    where: {
      invoiceId: {
        not: null
      },
      bookingDetail: {
        status: bookingDetailStatuses.completePayment,
        startDatetime: {
          gte: start,
          lt: end
        }
      },
      invoice: {
        pastInvoiceId: null,
      }
    }
  })
}

async function totalize(
  invoiceItems: any[],
  isBookingSales: boolean = false,
  targetDate: Date | null = null
) {
  const invoices = _.uniqBy('invoiceId', invoiceItems)
  const uniqInvoiceItems = _.uniqBy('id', invoiceItems)
  const invoiceItemsPerBookingDetail = isBookingSales
    ? summarizeInvoiceItemsPerBookingDetail(uniqInvoiceItems)
    : {}

  const serviceSalesAmounts = calculateServiceSalesAmount(uniqInvoiceItems)
  const invoiceAmounts = await totalizeInvoice(invoices.map(x => x.invoiceId), targetDate)
  const { basicFee, overtimeFee, food, boxLunch, drinks, cancelFee,
    deviceFee, deliveryFee, copyFee, bringingFee, prepaidFee
  } = serviceSalesAmounts
  const {
    serviceWithoutTaxAmount, taxAmount, discountWithoutTaxAmount,
    totalCashPaymentAmount, totalCardPaymentAmount, totalCreditPaymentAmount, totalDepositAmount
  } = invoiceAmounts
  const bookingDetailAmounts = await totalizeBookingDetailAmounts(invoiceItemsPerBookingDetail)

  const totalServiceWithoutTaxAmount = isBookingSales
    ? bookingDetailAmounts?.serviceFee || 0
    : serviceWithoutTaxAmount
  const totalSubtotalSales = basicFee + overtimeFee + food + boxLunch + drinks + cancelFee + deviceFee + totalServiceWithoutTaxAmount
  const totalMiscellaneousIncome = deliveryFee + copyFee + bringingFee + prepaidFee
  const totalDiscountWithoutTaxAmount = isBookingSales
    ? bookingDetailAmounts?.discountWithoutTaxAmount || 0
    : discountWithoutTaxAmount
  const totalNetSales = totalSubtotalSales + totalMiscellaneousIncome + totalDiscountWithoutTaxAmount
  const totalTaxAmount = isBookingSales
    ? bookingDetailAmounts?.taxAmount || 0
    : taxAmount
  const totalSales = totalNetSales + totalTaxAmount
  const totalPaymentAmount = totalCashPaymentAmount + totalCardPaymentAmount + totalCreditPaymentAmount + totalDepositAmount

  return {
    ...serviceSalesAmounts,
    ...invoiceAmounts,
    totalServiceWithoutTaxAmount,
    totalSubtotalSales,
    totalDiscountWithoutTaxAmount,
    totalMiscellaneousIncome,
    totalNetSales,
    totalTaxAmount,
    totalSales,
    totalPaymentAmount
  }
}

function calculateServiceSalesAmount(invoiceItems: any[]) {
  return Object.entries(serviceTypes).reduce((res: { [key: string]: number }, [key, v]) => {
    if (!res[key]) res[key] = 0
    invoiceItems.forEach(x => {
      if (x.type === v) res[key] += +x.subtotalWithoutTaxAmount
    })
    return res
  }, {})
}

async function totalizeInvoice(invoiceIds: number[], targetDate: Date | null = null) {
  const whereConditions = targetDate
    ? {
      id: {
        in: invoiceIds
      },
      paymentDate: targetDate
    }
    : {
      id: {
        in: invoiceIds
      }
    }

  const { _sum } = await prisma.invoice.aggregate({
    _sum: {
      totalAmount: true,
      totalWithoutTaxAmount: true,
      serviceWithoutTaxAmount: true,
      discountWithoutTaxAmount: true,
      totalTaxAmount: true,
      cashPaymentAmount: true,
      cardPaymentAmount: true,
      creditPaymentAmount: true,
      depositAmount: true
    },
    where: whereConditions
  })

  return {
    serviceWithoutTaxAmount: Number(_sum?.serviceWithoutTaxAmount) || 0,
    taxAmount: Number(_sum?.totalTaxAmount) || 0,
    discountWithoutTaxAmount: -Number(_sum?.discountWithoutTaxAmount) || 0,
    totalCashPaymentAmount: Number(_sum?.cashPaymentAmount) || 0,
    totalCardPaymentAmount: Number(_sum?.cardPaymentAmount) || 0,
    totalCreditPaymentAmount: Number(_sum?.creditPaymentAmount) || 0,
    totalDepositAmount: Number(_sum?.depositAmount) || 0
  }
}

async function totalizeBookingDetailAmounts(invoiceItemsPerBookingDetail: any) {
  const amounts = await Promise.all(
    Object.values(invoiceItemsPerBookingDetail).map((value: any) => 
      calculateAmountsByInvoiceItemIds(value.invoiceIds, value.taxRate)
    )
  )
  const amountInfo = amounts.reduce((res: any, x: any) => {
    Object.entries(x).forEach(([key, value]) => {
      res[key] === undefined
        ? res[key] = value
        : res[key] += value
    })
    return res
  }, {})
  return amountInfo
}

function summarizeInvoiceItemsPerBookingDetail(invoiceItems: any[]) {
  return invoiceItems.reduce((res: any, x: any) => {
    const { bookingDetailId, id, bookingDetail } = x
    !res[bookingDetailId]
      ? res[bookingDetailId] = {
        invoiceIds: [id],
        taxRate: bookingDetail.taxRate
      }
      : res[bookingDetailId].invoiceIds.push(id)
    return res
  }, {})
}

function calculateDailySales(allDailySales: { [key: string]: number }, pastSales: { [key: string]: number }) {
  return Object.entries(allDailySales).reduce((res: { [key: string]: number }, [key, value]) => {
    if (res[key] === undefined) res[key] = value
    res[key] = value + (pastSales[key] || 0)
    return res
  }, {})
}

async function generateExcel(
  allDailySales: { [key: string]: number },
  pastSales: { [key: string]: number },
  dailySales: { [key: string]: number },
  roomSales: any[],
  targetDate: Date
) {
  const issuedDate = new Date()
  const targetDateText = format(targetDate, 'yyyy/MM/dd')
  const issuedDateText = format(issuedDate, 'yyyy/MM/dd')

  const workbook = new ExcelJS.Workbook()
  createSalesSheet(workbook, allDailySales, pastSales, dailySales, targetDateText, issuedDateText)
  createRoomSalesSheet(workbook, roomSales, targetDateText, issuedDateText)

  return workbook
}

function createSalesSheet(
  workbook: any,
  allDailySales: { [key: string]: number },
  pastSales: { [key: string]: number },
  dailySales: { [key: string]: number },
  targetDateText: String,
  issuedDateText: String
) {
  const sheet = workbook.addWorksheet('売上')
  sheet.columns = [
    { header: '分類名', key: 'label', width: 15 },
    { header: '売上', key: 'allDailySalesAmount', width: 15, style: { numFmt: '#,##0' } },
    { header: '過去分修正', key: 'pastSalesAmount', width: 15, style: { numFmt: '#,##0' } },
    { header: '本日分売上', key: 'dailySalesAmount', width: 15, style: { numFmt: '#,##0' } },
    { header: `対象日: ${targetDateText}`, key: 'targetDate', width: 20 },
    { header: `発行日: ${issuedDateText}`, key: 'issuedDate', width: 20 },
  ]

  Object.entries(labels).forEach(([key, value]) => {
    sheet.addRow({
      label: value,
      allDailySalesAmount: allDailySales[key],
      pastSalesAmount: pastSales[key],
      dailySalesAmount: dailySales[key]
    })
  })

  sheet.getRow(1).fill = { 
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'D9EAD3' }
  }

  totalDisplayRows.map((row) => {
    sheet.getRow(row).eachCell({}, (cell: any) => {
      cell.fill = {
        ...cell.fill,
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'ffcc99' }
      }
    })
  })
}

function createRoomSalesSheet(
  workbook: any,
  roomSales: any[],
  targetDateText: String,
  issuedDateText: String
) {
  const sheet = workbook.addWorksheet('内訳')
  sheet.columns = [
    { header: '品名', key: 'title', width: 20 },
    { header: '単価', key: 'unitAmount', width: 15, style: { numFmt: '#,##0' } },
    { header: '回数', key: 'count', width: 15, style: { numFmt: '#,##0' } },
    { header: '時間', key: 'usageTime', width: 15 },
    { header: '利用人数', key: 'guestCount', width: 15, style: { numFmt: '#,##0' } },
    { header: '売上合計', key: 'totalAmount', width: 15, style: { numFmt: '#,##0' } },
    { header: '売上単価', key: 'salesUnitAmount', width: 15, style: { numFmt: '#,##0' } },
    { header: `対象日: ${targetDateText}`, key: 'targetDate', width: 20 },
    { header: `発行日: ${issuedDateText}`, key: 'issuedDate', width: 20 },
  ]

  roomSales.forEach((x: any) => {
    sheet.addRow(x)
  })

  const basicFeeSales = roomSales.filter((x: any) => x.type === serviceTypes.basicFee)
  const overtimeFeeSales = roomSales.filter((x: any) => x.type === serviceTypes.overtimeFee)

  sheet.addRows([
    {
      'title': '(R2時間迄合計)',
      'unitAmount': _.sumBy('unitAmount', basicFeeSales),
      'count': _.sumBy('count', basicFeeSales),
      'usageTime': _.sumBy('usageTime', basicFeeSales),
      'guestCount': _.sumBy('guestCount', basicFeeSales),
      'totalAmount': 0,
      'salesUnitAmount': 0
    },
    {
      'title': '(R2時間超合計)',
      'unitAmount': _.sumBy('unitAmount', overtimeFeeSales),
      'count': _.sumBy('count', overtimeFeeSales),
      'usageTime': _.sumBy('usageTime', overtimeFeeSales),
      'guestCount': _.sumBy('guestCount', overtimeFeeSales),
      'totalAmount': 0,
      'salesUnitAmount': 0
    },
    {
      'title': '(ルーム料金合計)',
      'unitAmount': _.sumBy('unitAmount', roomSales),
      'count': _.sumBy('count', roomSales),
      'usageTime': _.sumBy('usageTime', roomSales),
      'guestCount': _.sumBy('guestCount', roomSales),
      'totalAmount': _.sumBy('totalAmount', roomSales),
      'salesUnitAmount': _.sumBy('salesUnitAmount', roomSales)
    }
  ])
}

async function calculateRoomSales(targetDate: Date) {
  const rooms = await fetchRooms(targetDate)
  const sales = await Promise.all(rooms.map((room: any) => fetchRoomSales(room, targetDate)))
  const totalSales = _.sortBy(['roomId', 'type'], _.flatten(sales))
  return totalSales
}

async function fetchRooms(targetDate: Date) {
  return await prisma.room.findMany({
    select: {
      id: true,
      name: true,
      roomCharges: {
        select: {
          basicPrice: true,
          extensionPrice : true,
        },
        where: {
          startDate: {
            lte: targetDate
          },
          OR: [
            {
              endDate: {
                gt: targetDate
              }
            },
            {
              endDate: null
            }
          ]
        }
      }
    }
  })
}

async function fetchRoomSales(room: any, targetDate: Date) {
  const start = subHours(targetDate, 9)
  const end = subHours(addDays(targetDate, 1), 9)
  const whereConditions = {
    type: serviceTypes.basicFee,
    invoiceId: {
      not: null
    },
    bookingDetail: {
      roomId: room.id,
      status: bookingDetailStatuses.completePayment,
      startDatetime: {
        gte: start,
        lt: end
      }
    },
    invoice: {
      pastInvoiceId: null,
    }
  }

  const basicFeeInfo = await prisma.invoiceItem.aggregate({
    _sum: {
      subtotalWithoutTaxAmount: true,
    },
    where: whereConditions
  })

  whereConditions.type = serviceTypes.overtimeFee
  const overtimeFeeInfo = await prisma.invoiceItem.aggregate({
    _sum: {
      subtotalWithoutTaxAmount: true,
    },
    where: whereConditions
  })

  const whereConditionsForBookingDetail = {
    roomId: room.id,
    status: bookingDetailStatuses.completePayment,
    startDatetime: {
      gte: start,
      lt: end
    }
  }
  const { _count, _sum } = await prisma.bookingDetail.aggregate({
    _count: {
      id: true
    },
    _sum: {
      guestCount: true
    },
    where: whereConditionsForBookingDetail
  })
  const usageTimes = await prisma.bookingDetail.findMany({
    select: {
      startDatetime: true,
      endDatetime: true
    },
    where: whereConditionsForBookingDetail
  })

  const count = _count?.id || 0
  const usageTime = usageTimes.reduce((res: number, x: any) => {
    const start = new Date(x.startDatetime)
    const end = new Date(x.endDatetime)
    const diff = end.getTime() - start.getTime()
    return res + (diff / 1000 / 60 / 60)
  }, 0)
  const guestCount = Number(_sum?.guestCount) || 0
  const basicFeeAmount = Number(basicFeeInfo._sum?.subtotalWithoutTaxAmount) || 0
  const overtimeFeeAmount = Number(overtimeFeeInfo._sum?.subtotalWithoutTaxAmount) || 0
  const totalAmount = basicFeeAmount + overtimeFeeAmount
  const salesUnitAmount = count === 0 ? 0 : totalAmount / count

  return [
    {
      roomId: room.id,
      type: serviceTypes.basicFee,
      title: `${room.id} ${room.name} R2時間迄`,
      unitAmount: Number(room.roomCharges[0].basicPrice),
      count,
      usageTime,
      guestCount,
      totalAmount,
      salesUnitAmount
    },
    {
      roomId: room.id,
      type: serviceTypes.overtimeFee,
      title: `${room.id} ${room.name} R2時間超`,
      unitAmount: Number(room.roomCharges[0].extensionPrice),
      count: 0,
      usageTime: 0,
      guestCount: 0,
      totalAmount: 0,
      salesUnitAmount: 0
    }
  ]
}
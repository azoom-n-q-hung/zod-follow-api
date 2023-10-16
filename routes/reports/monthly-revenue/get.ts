import { z } from 'zod'
import {
  format,
  addMonths,
  subHours,
  startOfMonth,
  endOfMonth
} from 'date-fns'
import { Request, Response } from 'express'
import { prisma } from '@root/database'
import { encodeFileName } from '@root/util'
import _ from 'lodash/fp'
import ExcelJS from 'exceljs'
import { bookingDetailStatuses } from '@constants/booking'
import { types as serviceTypes } from '@constants/service'
import {
  validYearRules,
  validMonthRules,
} from '@lib/abo'

export const apiDefinition = {
  alias: 'Monthly Revenue Report',
  description: 'Export Monthly Revenue Report',
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

// TODO
const labels =  {
  bookingDetailCount: '会議数',
  guestCount: '延利用者数',
  basicFee: 'R2時間迄',
  overtimeFee: 'R2時間超',
  totalRoomAmount: '<ルーム計>',
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
  totalRoomAmountByAverageDay: '<ルーム料 / 日>',
  totalRoomAmountByAverageArea: '<ルーム料 / 坪>',
  totalCashPaymentAmount: '現金',
  totalCardPaymentAmount: 'カード',
  totalCreditPaymentAmount: '売掛',
  totalDepositAmount: '前受金',
  totalPaymentAmount: '<入金合計>'
}

// TODO
const totalDisplayRows = [6, 13, 18, 20, 22, 23, 24, 29]

export default async (req: Request, res: Response) => {
  const { month, year } = req.query
  if (!month || !year) return res.sendStatus(400)

  const monthNumber = Number(month) > 9
    ? month
    : `0${month}`

  const targetDate = new Date(`${year}-${monthNumber}-01`)

  const allMonthlySales = await calculateAllMonthlySales(targetDate)
  const pastSales = await calculatePastSales(targetDate)
  const monthlySales = calculateMonthlySales(allMonthlySales, pastSales)
  const roomSales = await calculateRoomSales(targetDate)

  const excelFile = await generateExcel(allMonthlySales, pastSales, monthlySales, roomSales, targetDate)

  res.setHeader('X-File-Name', encodeFileName(`売上仕訳月報_${format(new Date(), 'yyyyMMdd')}.xlsx`))
  res.writeHead(200, {
    'Content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment;filename=monthly-revenue.xlsx`
  })
  excelFile.xlsx.write(res)
}

async function calculateAllMonthlySales(targetDate: Date) {
  const results = await Promise.all([
    calculateBookingSales(targetDate),
    calculateLobbySales(targetDate)
  ])

  return results.reduce((res: { [key: string]: number }, x) => {
    Object.entries(x).forEach(([key, value]) => {
      if (!res[key]) {
        res[key] = value
      } else {
        res[key] += value
      }
    })
    return res
  }, {})
}

async function calculatePastSales(targetDate: Date) {
  const invoiceItems = await fetchInvoiceItems(targetDate, true)
  const pastInvoiceIds = _.uniq(invoiceItems.map((x: any) => x.invoice.pastInvoiceId))
  const pastInvoiceItems = await fetchInvoiceItems(targetDate, false, pastInvoiceIds)

  const results = await Promise.all([
    totalize(invoiceItems),
    totalize(pastInvoiceItems)
  ])

  return results.reduce((res: { [key: string]: number }, x) => { 
    Object.entries(x).forEach(([key, value]) => {
      if (!res[key]) {
        res[key] = value
      } else {
        res[key] -= value
      }
    })
    return res
  }, {
    bookingDetailCount: 0,
    guestCount: 0,
    totalRoomAmountByAverageArea: 0,
    totalRoomAmountByAverageDay: 0
  })
}

async function calculateBookingSales(targetDate: Date) {
  const lastDay = Number(format(endOfMonth(targetDate), 'dd'))

  const [
    invoiceItems,
    unsettledInvoiceItems,
    { bookingDetailCount, guestCount }
  ] = await Promise.all([
    fetchInvoiceItemsAttachedBooking(targetDate),
    fetchInvoiceItemsAttachedBooking(targetDate, true),
    calculateBookingDetailCounts(targetDate)
  ])
  const invoiceAmounts = await totalize(invoiceItems)
  const unsettledInvoiceAmounts = await totalize(unsettledInvoiceItems, true)
  const totalAmounts = sumBookingSales(invoiceAmounts, unsettledInvoiceAmounts)

  const totalRoomAmountByAverageArea = Math.floor(+totalAmounts.totalRoomAmount / 229.77) // TODO
  const totalRoomAmountByAverageDay = bookingDetailCount === 0
    ? 0
    : Math.floor(+totalAmounts.totalRoomAmount / lastDay)
  
  return {
    bookingDetailCount,
    guestCount,
    ...totalAmounts,
    totalRoomAmountByAverageArea,
    totalRoomAmountByAverageDay
  }
}

function sumBookingSales(invoiceAmounts: any, unsettledInvoiceItems: any) {
  return Object.entries(invoiceAmounts).reduce((res: { [key: string]: number }, [k, v]) => {
    if (!res[k]) res[k] = v + unsettledInvoiceItems[k]
    return res
  } , {})
}

async function calculateBookingDetailCounts(targetDate: Date) {
  const start = subHours(targetDate, 9)
  const end = subHours(addMonths(targetDate, 1), 9)
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
    ? { paymentDate: {
          gte: startOfMonth(targetDate),
          lte: endOfMonth(targetDate)
        },
        pastInvoiceId: { not: null }
      }
    : { paymentDate: {
          gte: startOfMonth(targetDate),
          lte: endOfMonth(targetDate)
        },
        pastInvoiceId: null,
        bookingId: null
      }

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

async function fetchInvoiceItemsAttachedBooking(targetDate: Date, isUnsettled: boolean = false) {
  const start = subHours(targetDate, 9)
  const end = subHours(addMonths(targetDate, 1), 9)
  const whereConditions = isUnsettled
    ? {
        bookingDetail: {
          status: {
            in: [
              bookingDetailStatuses.official,
              bookingDetailStatuses.checkIn,
              bookingDetailStatuses.withholdPayment
            ]
          },
          startDatetime: {
            gte: start,
            lt: end
          }
        }
      }
    : {
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
          totalServiceWithoutTaxAmount: true,
          discountAmount: true,
          depositAmount: true,
        }
      }
    },
    where: whereConditions
  })
}

async function totalize(invoiceItems: any[], isUnsettled: boolean = false) {
  const invoices = _.uniqBy('invoiceId', invoiceItems)
  const uniqInvoiceItems = _.uniqBy('id', invoiceItems)

  const serviceSalesAmounts = calculateServiceSalesAmount(uniqInvoiceItems)
  const invoiceAmounts = isUnsettled
    ? totalizeUnsettledInvoice(uniqInvoiceItems)
    : await totalizeInvoice(invoices.map(x => x.invoiceId))
  const { basicFee, overtimeFee, food, boxLunch, drinks, cancelFee,
    deviceFee, deliveryFee, copyFee, bringingFee, prepaidFee
  } = serviceSalesAmounts
  const {
    totalServiceWithoutTaxAmount, totalDiscountWithoutTaxAmount, totalTaxAmount,
    totalCashPaymentAmount, totalCardPaymentAmount, totalCreditPaymentAmount, totalDepositAmount
  } = invoiceAmounts

  const totalSubtotalSales = basicFee + overtimeFee + food + boxLunch + drinks + cancelFee + deviceFee + totalServiceWithoutTaxAmount
  const totalMiscellaneousIncome = deliveryFee + copyFee + bringingFee + prepaidFee
  const totalNetSales = totalSubtotalSales + totalMiscellaneousIncome - totalDiscountWithoutTaxAmount
  const totalSales = totalNetSales + totalTaxAmount
  const totalPaymentAmount = totalCashPaymentAmount + totalCardPaymentAmount + totalCreditPaymentAmount + totalDepositAmount
  const totalRoomAmount = basicFee + overtimeFee

  return {
    ...serviceSalesAmounts,
    ...invoiceAmounts,
    totalSubtotalSales,
    totalMiscellaneousIncome,
    totalNetSales,
    totalSales,
    totalPaymentAmount,
    totalRoomAmount
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

async function totalizeInvoice(invoiceIds: number[]) {
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
    where: {
      id: {
        in: invoiceIds
      }
    }
  })

  return {
    totalServiceWithoutTaxAmount: Number(_sum?.serviceWithoutTaxAmount) || 0,
    totalDiscountWithoutTaxAmount: Number(_sum?.discountWithoutTaxAmount) || 0,
    totalTaxAmount: Number(_sum?.totalTaxAmount) || 0,
    totalCashPaymentAmount: Number(_sum?.cashPaymentAmount) || 0,
    totalCardPaymentAmount: Number(_sum?.cardPaymentAmount) || 0,
    totalCreditPaymentAmount: Number(_sum?.creditPaymentAmount) || 0,
    totalDepositAmount: Number(_sum?.depositAmount) || 0
  }
}

function totalizeUnsettledInvoice(invoiceItems: any[]) {
  const amounts = invoiceItems.reduce((res: { [key: string]: { [key: string]: number } }, x) => {
    if (!res[x.bookingDetailId]) res[x.bookingDetailId] = { 
      totalWithoutTaxAmount: 0,
      serviceWithoutTaxAmount: +x.bookingDetail.totalServiceWithoutTaxAmount || 0,
      discountWithoutTaxAmount: +x.bookingDetail.discountAmount || 0,
      totalTaxAmount: 0,
      depositAmount: +x.bookingDetail.depositAmount || 0
    }
    res[x.bookingDetailId].totalWithoutTaxAmount += (+x.subtotalWithoutTaxAmount || 0)
    res[x.bookingDetailId].totalTaxAmount = Math.floor(
      ( res[x.bookingDetailId].totalWithoutTaxAmount
        + +res[x.bookingDetailId].serviceWithoutTaxAmount
        - +res[x.bookingDetailId].discountWithoutTaxAmount
      ) * 0.1
    )
    return res
  }, {})

  const {
    totalServiceWithoutTaxAmount,
    totalDiscountWithoutTaxAmount,
    totalTaxAmount,
    totalDepositAmount
  } = Object.entries(amounts).reduce((res: { [key: string]: number }, [key, value]) => {
    res.totalServiceWithoutTaxAmount += value.serviceWithoutTaxAmount
    res.totalDiscountWithoutTaxAmount += value.discountWithoutTaxAmount
    res.totalTaxAmount += value.totalTaxAmount
    res.totalDepositAmount += value.depositAmount
    return res
  }, {
    totalServiceWithoutTaxAmount: 0,
    totalDiscountWithoutTaxAmount: 0,
    totalTaxAmount: 0,
    totalDepositAmount: 0
  })

  return {
    totalServiceWithoutTaxAmount,
    totalDiscountWithoutTaxAmount,
    totalTaxAmount,
    totalDepositAmount,
    totalCashPaymentAmount: 0,
    totalCardPaymentAmount: 0,
    totalCreditPaymentAmount: 0,
  }
}

function calculateMonthlySales(allMonthlySales: { [key: string]: number }, pastSales: { [key: string]: number }) {
  return Object.entries(allMonthlySales).reduce((res: { [key: string]: number }, [key, value]) => {
    if (!res[key]) res[key] = value
    res[key] = value + (pastSales[key] || 0)
    return res
  }, {})
}

async function generateExcel(
  allMonthlySales: { [key: string]: number },
  pastSales: { [key: string]: number },
  monthlySales: { [key: string]: number },
  roomSales: any[],
  targetDate: Date
) {
  const issuedDate = new Date()
  const targetMonthText = format(targetDate, 'yyyy/MM')
  const issuedDateText = format(issuedDate, 'yyyy/MM/dd')

  const workbook = new ExcelJS.Workbook()
  createSalesSheet(workbook, allMonthlySales, pastSales, monthlySales, targetMonthText, issuedDateText)
  createRoomSalesSheet(workbook, roomSales, targetMonthText, issuedDateText)
  return workbook
}

function createSalesSheet(
  workbook: any,
  allMonthlySales: { [key: string]: number },
  pastSales: { [key: string]: number },
  monthlySales: { [key: string]: number },
  targetMonthText: String,
  issuedDateText: String
) {
  const sheet = workbook.addWorksheet('売上')
  sheet.columns = [
    { header: '分類名', key: 'label', width: 15 },
    { header: '売上', key: 'allMonthlySalesAmount', width: 15, style: { numFmt: '#,##0' } },
    { header: '過去分修正', key: 'pastSalesAmount', width: 15, style: { numFmt: '#,##0' } },
    { header: '今月分売上', key: 'monthlySalesAmount', width: 15, style: { numFmt: '#,##0' } },
    { header: `対象月: ${targetMonthText}`, key: 'targetMonth', width: 20 },
    { header: `発行日: ${issuedDateText}`, key: 'issuedDate', width: 20 },
  ]

  Object.entries(labels).forEach(([key, value]) => {
    sheet.addRow({
      label: value,
      allMonthlySalesAmount: allMonthlySales[key],
      pastSalesAmount: pastSales[key],
      monthlySalesAmount: monthlySales[key]
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
  targetMonthText: String,
  issuedDateText: String
) {
  const sheet = workbook.addWorksheet('内訳')
  sheet.columns = [
    { header: '品名', key: 'title', width: 20 },
    { header: '単価', key: 'unitAmount', width: 15, style: { numFmt: '#,##0' } },
    { header: '回数', key: 'count', width: 15, style: { numFmt: '#,##0' } },
    { header: '時間', key: 'usageTime', width: 15 },
    { header: '平均利用時間', key: 'averageUsageTime', width: 15, style: { numFmt: '0.00' } },
    { header: '売上金額', key: 'subtotalAmount', width: 15, style: { numFmt: '#,##0' } },
    { header: '売上合計', key: 'totalAmount', width: 15, style: { numFmt: '#,##0' } },
    { header: '売上単価', key: 'salesUnitAmount', width: 15, style: { numFmt: '#,##0' } },
    { header: `対象月: ${targetMonthText}`, key: 'targetMonth', width: 20 },
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
      'averageUsageTime': _.sumBy('averageUsageTime', basicFeeSales),
      'subtotalAmount': _.sumBy('subtotalAmount', basicFeeSales),
      'totalAmount': _.sumBy('totalAmount', basicFeeSales),
      'salesUnitAmount': _.sumBy('salesUnitAmount', basicFeeSales)
    },
    {
      'title': '(R2時間超合計)',
      'unitAmount': _.sumBy('unitAmount', overtimeFeeSales),
      'count': _.sumBy('count', overtimeFeeSales),
      'usageTime': _.sumBy('usageTime', overtimeFeeSales),
      'averageUsageTime': _.sumBy('averageUsageTime', overtimeFeeSales),
      'subtotalAmount': _.sumBy('subtotalAmount', overtimeFeeSales),
      'totalAmount': _.sumBy('totalAmount', overtimeFeeSales),
      'salesUnitAmount': _.sumBy('salesUnitAmount', overtimeFeeSales)
    },
    {
      'title': '(ルーム料金合計)',
      'unitAmount': _.sumBy('unitAmount', roomSales),
      'count': _.sumBy('count', roomSales),
      'usageTime': _.sumBy('usageTime', roomSales),
      'averageUsageTime': _.sumBy('averageUsageTime', roomSales),
      'subtotalAmount': _.sumBy('subtotalAmount', roomSales),
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
  const end = subHours(addMonths(targetDate, 1), 9)
  const whereConditions = {
    type: serviceTypes.basicFee,
    OR: [
      {
        bookingDetail: {
          roomId: room.id,
          status: {
            in: [
              bookingDetailStatuses.official, 
              bookingDetailStatuses.checkIn,
              bookingDetailStatuses.withholdPayment
            ]
          },
          startDatetime: {
            gte: start,
            lt: end
          }
        }
      },
      {
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
    ]
  }

  const basicFeeInfo = await prisma.invoiceItem.aggregate({
    _sum: {
      subtotalWithoutTaxAmount: true
    },
    where: whereConditions
  })

  whereConditions.type = serviceTypes.overtimeFee
  const overtimeFeeInfo = await prisma.invoiceItem.aggregate({
    _sum: {
      subtotalWithoutTaxAmount: true
    },
    where: whereConditions
  })

  const whereConditionsForBookingDetail = {
    roomId: room.id,
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

  const { _count } = await prisma.bookingDetail.aggregate({
    _count: {
      id: true
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
  const basicFeeAmount = Number(basicFeeInfo._sum?.subtotalWithoutTaxAmount) || 0
  const overtimeFeeAmount = Number(overtimeFeeInfo._sum?.subtotalWithoutTaxAmount) || 0
  const averageUsageTime = count === 0 ? 0 : usageTime / count
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
      averageUsageTime,
      subtotalAmount: basicFeeAmount,
      totalAmount,
      salesUnitAmount,
    },
    {
      roomId: room.id,
      type: serviceTypes.overtimeFee,
      title: `${room.id} ${room.name} R2時間超`,
      unitAmount: Number(room.roomCharges[0].extensionPrice),
      count: 0,
      usageTime: 0,
      averageUsageTime: 0,
      subtotalAmount: overtimeFeeAmount,
      totalAmount: 0,
      salesUnitAmount: 0
    }
  ]
}

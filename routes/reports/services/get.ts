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
import { invoiceStatuses } from '@constants/invoice'
import { bookingDetailStatuses } from '@constants/booking'
import {
  validDateField
} from '@lib/abo'

export const apiDefinition = {
  alias: 'Service Sales Report',
  description: 'Export Service Sales Report',
  parameters: [
    {
      name: 'date',
      type: 'Query',
      description: 'Search Target Date',
      schema: validDateField({
        required_error: '未入力です',
        invalid_type_error: '未入力です',
        invalid_date: '未入力です'
      })
    }
  ],
  response: z.any(),
  errorStatuses: [400, 403, 404]
}

// TODO
const serviceTypes = {
  basicFee: { value: 1, label: 'R2時間迄' },
  overtimeFee: { value: 2, label: 'R2時間超' },
  food: { value: 3, label: '料理' },
  boxLunch: { value: 4, label: '弁当' },
  drinks: { value: 5, label: '飲物' },
  cancelFee: { value: 6, label: 'キャンセル' },
  deliveryFee: { value: 7, label: '通話料' },
  copyFee: { value: 8, label: 'コピー' },
  bringingFee: { value: 9, label: '持込料' },
  prepaidFee: { value: 10, label: '立替' },
  deviceFee: { value: 11, label: '機器使用料' },
  devices: { value: 12, label: '備品' }
}

export default async (req: Request, res: Response) => {
  const { date } = req.query
  if (!date) return res.sendStatus(400)

  const targetDate = new Date(date as string)

  const services = await fetchServices()
  const serviceResults = await calculateServiceSales(services, targetDate)
  const serviceTypeResults = calculateServiceTypeResults(serviceResults)
  const excelFile = await generateExcel(serviceResults, serviceTypeResults, targetDate)

  res.setHeader('X-File-Name', encodeFileName(`商品別売上報告書_${format(new Date(), 'yyyyMMdd')}.xlsx`))
  res.writeHead(200, {
    'Content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment;filename=service-sales.xlsx`
  })
  excelFile.xlsx.write(res)
}

async function fetchServices() {
  const { food, boxLunch, drinks, prepaidFee, deviceFee } = serviceTypes
  return await prisma.service.findMany({
    select: {
      id: true,
      type: true,
      name: true,
      unitPrice: true
    },
    where: {
      type: {
        in: [food.value, boxLunch.value, drinks.value, prepaidFee.value, deviceFee.value]
      }
    }
  })
}

async function calculateServiceSales(
  services: any[],
  targetDate: Date
) {
  return await Promise.all(
    services.map(service => calculateEachServiceSales(service, targetDate))
  )
}

async function calculateEachServiceSales(
  service: any,
  targetDate: Date
) {
  const { id, name, unitPrice, type } = service
  const utcDatetime = subHours(targetDate, 9)

  const salesByBooking: any[] = await prisma.invoiceItem.findMany({
    select: {
      id: true,
      invoiceId: true,
      bookingDetail: {
        select: {
          id: true,
          startDatetime: true,
        }
      }
    },
    where: {
      serviceId: id,
      bookingDetail: {
        status: bookingDetailStatuses.completePayment,
        startDatetime: {
          gte: utcDatetime,
          lte: addDays(utcDatetime, 1)
        },
      },
      invoice: {
        status: invoiceStatuses.completed
      }
    }
  })

  const salesByLobby: any[] = await prisma.invoiceItem.findMany({
    select: {
      id: true,
      invoiceId: true,
      invoice: {
        select: {
          paymentDate: true,
        }
      }
    },
    where: {
      serviceId: id,
      invoice: {
        status: invoiceStatuses.completed,
        bookingId: null,
        paymentDate: targetDate
      }
    }
  })

  const totalSalesByBooking: any[] = await prisma.invoiceItem.findMany({
    select: {
      id: true,
      invoiceId: true,
      bookingDetail: {
        select: {
          id: true,
          startDatetime: true,
        }
      }
    },
    where: {
      serviceId: id,
      bookingDetail: {
        status: bookingDetailStatuses.completePayment
      },
      invoice: {
        status: invoiceStatuses.completed
      }
    },
  })

  const totalSalesByLobby: any[] = await prisma.invoiceItem.findMany({
    select: {
      id: true,
      invoiceId: true,
      invoice: {
        select: {
          paymentDate: true,
        }
      }
    },
    where: {
      serviceId: id,
      invoice: {
        bookingId: null,
        status: invoiceStatuses.completed
      }
    },
  })

  const invoiceIds = _.uniq(
    salesByBooking.concat(salesByLobby)
      .map((x: any) => x.invoiceId)
  )
  const totalInvoiceIds = _.uniq(
    totalSalesByBooking.concat(totalSalesByLobby)
      .map((x: any) => x.invoiceId)
  )

  const {
    count: totalCount,
    amount: totalAmount
  } = await caluculateTotals(id, invoiceIds)
  const { 
    count: accumulatedTotalCount,
    amount: accumulatedTotalAmount
  } = await caluculateTotals(id, totalInvoiceIds)

  return {
    id,
    type,
    name,
    unitAmount: +unitPrice,
    totalCount,
    totalAmount,
    invoiceIds: invoiceIds.join(','),
    salesByBooking,
    salesByLobby,
    totalSalesByBooking,
    totalSalesByLobby,
    accumulatedTotalCount,
    accumulatedTotalAmount
  }
}

async function caluculateTotals(
  id: Number,
  invoiceIds: any[]
) {
  const { _sum } = await prisma.invoiceItem.aggregate({
    where: {
      serviceId: +id,
      invoiceId: {
        in: invoiceIds
      }
    },
    _sum: {
      count: true,
      subtotalWithoutTaxAmount: true
    },
  })

  return {
    count: _sum.count ? +_sum.count : 0,
    amount: _sum.subtotalWithoutTaxAmount ? +_sum.subtotalWithoutTaxAmount : 0
  }
}

function calculateServiceTypeResults(serviceResults: any[]) {
  const { food, boxLunch, drinks, prepaidFee, deviceFee } = serviceTypes
  return Object.entries(serviceTypes).reduce((res: any[], [key, v]) => {
    const { value, label } = v
    if (![food, boxLunch, drinks, prepaidFee, deviceFee].find(x => x.value === value)) return res
    const targetServiceTypeResults = serviceResults.filter(x => x.type === value)

    res.push({
      type: value,
      label,
      totalCount: _.sumBy('totalCount', targetServiceTypeResults),
      totalAmount: _.sumBy('totalAmount', targetServiceTypeResults),
      accumulatedTotalCount: _.sumBy('accumulatedTotalCount', targetServiceTypeResults),
      accumulatedTotalAmount: _.sumBy('accumulatedTotalAmount', targetServiceTypeResults),
    })
    return res
  }, [])
}

async function generateExcel(
  serviceResults: any[],
  serviceTypeResults: any[],
  targetDate: Date
) {
  const issuedDate = new Date()
  const targetDateText = format(targetDate, 'yyyy/MM/dd')
  const issuedDateText = format(issuedDate, 'yyyy/MM/dd')

  const workbook = new ExcelJS.Workbook()
  createServiceSheet(workbook, serviceResults, targetDateText, issuedDateText)
  createServiceTypeSheet(workbook, serviceTypeResults, targetDateText, issuedDateText)

  return workbook
}

function createServiceSheet(
  workbook: any,
  serviceResults: any[],
  targetDateText: String,
  issuedDateText: String
) {
  const sheet = workbook.addWorksheet('商品別売上')
  sheet.columns = [
    { header: '商品コード', key: 'id', width: 12 },
    { header: '商品名', key: 'name', width: 25 },
    { header: '単価', key: 'unitAmount', width: 15, style: { numFmt: '#,##0' } },
    { header: '数量', key: 'totalCount', width: 15, style: { numFmt: '#,##0' } },
    { header: '金額', key: 'totalAmount', width: 15, style: { numFmt: '#,##0' } },
    { header: '精算番号', key: 'invoiceIds', width: 15 },
    { header: '累計数量', key: 'accumulatedTotalCount', width: 15, style: { numFmt: '#,##0' } },
    { header: '累計金額', key: 'accumulatedTotalAmount', width: 15, style: { numFmt: '#,##0' } },
    { header: `対象日: ${targetDateText}`, key: 'targetDate', width: 20 },
    { header: `発行日: ${issuedDateText}`, key: 'issuedDate', width: 20 },
  ]
  sheet.addRows(serviceResults)

  sheet.getRow(1).fill = { 
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'D9EAD3' }
  }
}

function createServiceTypeSheet(
  workbook: any,
  serviceTypeResults: any[],
  targetDateText: String,
  issuedDateText: String
) {
  const sheet = workbook.addWorksheet('商品項目別売上')
  sheet.columns = [
    { header: '商品項目別合計', key: 'label', width: 15 },
    { header: '数量', key: 'totalCount', width: 15, style: { numFmt: '#,##0' } },
    { header: '金額', key: 'totalAmount', width: 15, style: { numFmt: '#,##0' } },
    { header: '累計数量', key: 'accumulatedTotalCount', width: 15, style: { numFmt: '#,##0' } },
    { header: '累計金額', key: 'accumulatedTotalAmount', width: 15, style: { numFmt: '#,##0' } },
    { header: `対象日: ${targetDateText}`, key: 'targetDate', width: 20 },
    { header: `発行日: ${issuedDateText}`, key: 'issuedDate', width: 20 },
  ]
  sheet.addRows(serviceTypeResults)
  sheet.addRow({
    label: '合計',
    totalCount: _.sumBy('totalCount', serviceTypeResults),
    totalAmount: _.sumBy('totalAmount', serviceTypeResults),
    accumulatedTotalCount: _.sumBy('accumulatedTotalCount', serviceTypeResults),
    accumulatedTotalAmount: _.sumBy('accumulatedTotalAmount', serviceTypeResults)
  })

  sheet.getRow(1).fill = { 
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'D9EAD3' }
  }
}

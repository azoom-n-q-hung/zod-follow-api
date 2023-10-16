import fs from 'fs'
import { z } from 'zod'
import { format, differenceInMinutes } from 'date-fns'
import { Request, Response } from 'express'
import { prisma } from '@root/database'
import { encodeFileName } from '@root/util'
import generatePdf from '@helpers/generate-pdf'
import { formatPrice } from '@helpers/string'
import { getDayJp } from '@helpers/date'
import { sortBookingDetail } from '@helpers/booking'
import { subtotalTypes } from '@constants/service'
import { provisos } from '@constants/invoice'
import {
  BookingSchema,
  InvoiceItemSchema,
  InvoiceSchema
} from '@root/lib/abo/schemas'

const docGalleryPaymentInvoiceTemplateName = 'abo_payment-invoice_1.0.9'

const InvoiceWithRelations = InvoiceSchema.extend({
  invoiceItems: InvoiceItemSchema.array()
})

type InvoiceType = z.infer<typeof InvoiceWithRelations>
type InvoiceItemType = z.infer<typeof InvoiceItemSchema>

export const apiDefinition = {
  alias: 'exportPaymentInvoice',
  description: 'Export Payment Invoice',
  parameters: [
    {
      name: 'id',
      type: 'Path',
      description: 'invoiceId',
      schema: InvoiceSchema.shape.id
    },
    {
      name: 'bookingId',
      type: 'Query',
      description: 'booking Id',
      schema: BookingSchema.shape.id
    }
  ],
  response: z.any(),
  errorStatuses: [400, 404]
}

export default async (req: Request, res: Response) => {
  const { id } = req.params
  const { bookingId } = req.query

  const booking = await getBooking(Number(bookingId))
  if (!booking) return res.sendStatus(404)

  const invoice = await getInvoice(Number(id), Number(bookingId))
  if (!invoice) return res.sendStatus(404)

  const formattedInvoice = await formatDataForInvoicePdf(invoice, booking)

  const  customerName  = booking.customerName || booking.customer?.name
  const formName = '請求書'
  const fileName = `${formName}_${customerName}様_${format(
    new Date(),
    'yyyyMMdd'
  )}`

  const { filePath, downloadFileName } = await generatePdf(
    docGalleryPaymentInvoiceTemplateName,
    formattedInvoice,
    fileName
  )
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('X-File-Name', encodeFileName(downloadFileName))

  return res.send(fs.readFileSync(filePath))
}

function getInvoice(id: number, bookingId: number) {
  return prisma.invoice.findFirst({
    include: {
      invoiceItems: true
    },
    where: {
      id,
      bookingId
    }
  })
}

async function getBooking(bookingId: number | string) {
  const booking = await prisma.booking.findFirst({
    where: { id: Number(bookingId) },
    include: {
      bookingDetails: {
        include: { room: true }
      },
      customer: true
    }
  })
  return {
    ...booking,
    bookingDetails: booking?.bookingDetails?.length 
      ? booking.bookingDetails.sort(sortBookingDetail)
      : []
  }
}

async function formatDataForInvoicePdf(invoice: InvoiceType, booking: any) {
  const { invoiceItems: allInvoiceItem, ...invoiceInfo } = invoice
  const serviceIds = [
    ...new Set(allInvoiceItem.map(invoiceItem => invoiceItem.serviceId))
  ]
  const services = await getServices(serviceIds)
  const formattedBookingDetails = booking.bookingDetails.map(
    (bookingDetail: any) => {
      const endDateTime = format(new Date(bookingDetail.endDatetime), 'yyyy-MM-dd HH:mm:ii')
      const endTime = endDateTime == format(new Date(bookingDetail.endDatetime), 'yyyy-MM-dd 00:00:ii')
        ? format(new Date(bookingDetail.endDatetime), 'yyyy-MM-dd 24:00:00')
        : endDateTime

      const sortedInvoiceItems = allInvoiceItem.sort(
        (beforeInvoiceItem, afterInvoiceItem) => beforeInvoiceItem.serviceId - afterInvoiceItem.serviceId
      )
      const invoiceItemsOfBooking = sortedInvoiceItems.reduce(
        (results: any, invoiceItem: InvoiceItemType) => {
          const service = services.find(
            service => service.id === invoiceItem.serviceId
          )
          if (bookingDetail.id === invoiceItem.bookingDetailId) {
            results = [
              ...results,
              {
                id: invoiceItem.id,
                name: invoiceItem.name || '',
                type: invoiceItem.type,
                unitAmount: Number(invoiceItem.unitAmount),
                taxAmount: Number(invoiceItem.taxAmount),
                count: Number(invoiceItem.count),
                subtotalAmount: Number(invoiceItem.subtotalAmount),
                subtotalType: service
                  ? service.subtotalType
                  : subtotalTypes.consumptionTax
              }
            ]
          }

          return results
        },
        []
      )

      return {
        id: bookingDetail.id,
        roomName: bookingDetail.room.name || '',
        guestCount: bookingDetail.guestCount || 0,
        subtotalType: bookingDetail.subtotalType,
        dayWithoutYearJp: format(bookingDetail.startDatetime, 'M月d日'),
        startDatetime: bookingDetail.startDatetime,
        bookingDate: getDayJp(bookingDetail.startDatetime),
        startTime: format(new Date(bookingDetail.startDatetime), 'HH:mm'),
        endTime: format(new Date(bookingDetail.endDatetime), 'HH:mm'),
        totalHour: differenceInMinutes(new Date(endTime), bookingDetail.startDatetime)/60,
        invoiceItems: invoiceItemsOfBooking
      }
    }
  ).filter((bookingDetail:any) => !!Object.keys(bookingDetail.invoiceItems).length)
  const sortedBookingDetailByStartDateTime = [...formattedBookingDetails].sort(
    (beforeBookingDetail: any, afterBookingDetail: any) =>
      afterBookingDetail.startDatetime - beforeBookingDetail.startDatetime
  )
  const paymentDate = sortedBookingDetailByStartDateTime[0]?.startDatetime

  return {
    id: booking.id,
    customerId: booking.customerId,
    customerName: booking.customerName || booking.customer.name || '',
    customerTel: booking.customerTel || booking.customer.tel || '',
    customerFax: booking.customerFax || booking.customer.fax || '',
    customerMail: booking.customerMail,
    customerRepName: booking.customerRepName || '',
    currentTime: format(new Date(), 'yyyy/MM/dd'),
    currentTimeJP: format(new Date(), 'yyyy年MM月dd日'),
    currentHour: format(new Date(), 'HH:mm'),
    bookingDetails: formattedBookingDetails,
    invoice: {
      ...invoiceInfo,
      settlementWithoutTaxAmount: Number(
        invoiceInfo.settlementWithoutTaxAmount
      ),
      paymentDate: paymentDate
        ? format(new Date(paymentDate), 'yyyy年MM月dd日')
        : '',
      settlementAmount: Number(invoiceInfo.settlementAmount),
      serviceWithoutTaxAmount: Number(invoiceInfo.serviceWithoutTaxAmount),
      serviceAmount: Number(invoiceInfo.serviceAmount),
      discountWithoutTaxAmount: Number(invoiceInfo.discountWithoutTaxAmount),
      discountAmount: Number(invoiceInfo.discountAmount),
      depositAmount: Number(invoiceInfo.depositAmount),
      totalWithoutTaxAmount: Number(invoiceInfo.totalWithoutTaxAmount),
      totalTaxAmount: Number(invoiceInfo.totalTaxAmount),
      totalAmount: Number(invoiceInfo.totalAmount),
      cashPaymentAmount: Number(invoiceInfo.cashPaymentAmount),
      creditPaymentAmount: Number(invoiceInfo.creditPaymentAmount),
      cardPaymentAmount: Number(invoiceInfo.cardPaymentAmount),
      provisoLabel: provisos.labelOf(
        invoiceInfo.proviso,
        formatPrice(Number(invoiceInfo.totalTaxAmount))
      )
    }
  }
}

function getServices(serviceIds: number[]) {
  return prisma.service.findMany({
    where: {
      id: { in: serviceIds }
    }
  })
}

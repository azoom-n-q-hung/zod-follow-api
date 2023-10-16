import fs from 'fs'
import { z } from 'zod'
import { format, subDays, differenceInMinutes } from 'date-fns'
import { Request, Response } from 'express'
import { prisma } from '@root/database'
import { encodeFileName } from '@root/util'
import generatePdf from '@helpers/generate-pdf'
import { getDayJp, getDayWithoutYearJp } from '@helpers/date'
import { sortBookingDetail } from '@helpers/booking'
import { bookingInvoicePdfTitles, invoicePdfType, bookingTypes } from '@constants/booking'
import { subtotalTypes, types } from '@constants/service'
import {
  BookingDetailSchema,
  BookingSchema,
  RoomSchema,
  StaffSchema,
  InvoiceItemSchema,
  ServiceSchema,
  InvoiceSchema
} from '@root/lib/abo/schemas'

const docGalleryBookingInvoiceTemplateName = 'abo_booking-invoice_1.0.5'

const InvoiceInfoParameter = z.object({
  invoicePdfTypes: z.array(z.number()),
  bookingType: BookingDetailSchema.shape.status,
  cancelType: BookingDetailSchema.shape.cancelType.optional(),
  confirmationNote: z.string().optional(),
  isDisplayStamp: z.boolean(),
  bookingDetailIds: z.array(z.number())
})
const BookingDetailWithRelations = BookingDetailSchema.extend({
  room: RoomSchema,
  invoiceItems: InvoiceItemSchema.extend({ invoice: InvoiceSchema }).array()
})
const BookingWithRelations = BookingSchema.extend({
  createdStaff: StaffSchema
})

type InvoiceInfoType = z.infer<typeof InvoiceInfoParameter>
type BookingDetailWithRelationsType = z.infer<typeof BookingDetailWithRelations>
type BookingWithRelationsType = z.infer<typeof BookingWithRelations>
type ServiceType = z.infer<typeof ServiceSchema>

export const apiDefinition = {
  alias: 'Export Booking Invoice',
  description: 'export booking invoice',
  parameters: [
    {
      name: 'id',
      type: 'Path',
      description: 'bookingId',
      schema: BookingSchema.shape.id
    },
    {
      name: 'Invoice Info',
      type: 'Body',
      description: 'invoice info',
      schema: InvoiceInfoParameter
    }
  ],
  response: z.any(),
  errorStatuses: [400, 403, 404]
}

export default async (req: Request, res: Response) => {
  const { id } = req.params
  const invoiceInfo = req.body

  const booking = await getBooking(id)
  if (!booking) return res.sendStatus(404)

  const bookingDetails = await getBookingDetails(id, invoiceInfo)
  if (bookingDetails.length !== invoiceInfo.bookingDetailIds.length) return res.sendStatus(400)

  const formattedDataForInvoicePdf = await formatDataForInvoicePdf(bookingDetails, booking, invoiceInfo)
  const invoiceName = [formattedDataForInvoicePdf.bookingConfirmationTitle, formattedDataForInvoicePdf.bookingQuotationTitle].filter(title => title).join('_')
  const fileName = `${invoiceName}_${formattedDataForInvoicePdf.customerName}様_${format(
    new Date(),
    'yyyyMMdd'
  )}`

  const { filePath, downloadFileName } = await generatePdf(
    docGalleryBookingInvoiceTemplateName,
    formattedDataForInvoicePdf,
    fileName
  )
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('X-File-Name', encodeFileName(downloadFileName))

  return res.send(fs.readFileSync(filePath))
}

function getBooking(bookingId: number|string) {
  return prisma.booking.findFirst({
    where: { id: Number(bookingId) },
    include: { createdStaff: true }
  })
}

async function getBookingDetails(bookingId: number|string, invoiceInfo: InvoiceInfoType) {
  const bookingDetails = await prisma.bookingDetail.findMany({
    where: {
      id: { in: invoiceInfo.bookingDetailIds },
      booking: { id: Number(bookingId) }
    },
    include: {
      booking: true,
      room: true,
      invoiceItems: {
        include: { invoice: true }
      }
    }
  })
  return bookingDetails?.length ? bookingDetails.sort(sortBookingDetail) : []
}

async function formatDataForInvoicePdf(
  bookingDetails: any[],
  booking: BookingWithRelationsType,
  invoiceInfo: InvoiceInfoType
) {
  let totalServiceWithoutTaxAmount = 0
  let totalDiscountAmount = 0
  const services = await getServices(bookingDetails)

  const formattedBookingDetails =  bookingDetails.map((bookingDetail: BookingDetailWithRelationsType) => {
    let totalService = 0
    const endDateTime = format(new Date(bookingDetail.endDatetime), 'yyyy-MM-dd HH:mm:ii')
    const endTime = endDateTime == format(new Date(bookingDetail.endDatetime), 'yyyy-MM-dd 00:00:ii')
      ? format(new Date(bookingDetail.endDatetime), 'yyyy-MM-dd 24:00:00')
      : endDateTime

    const sortedInvoiceItems = bookingDetail.invoiceItems.sort(
      (beforeInvoiceItem, afterInvoiceItem) => beforeInvoiceItem.serviceId - afterInvoiceItem.serviceId
    )
    const invoiceItems = sortedInvoiceItems.map(invoiceItem => {
      if (invoiceItem.invoice?.status == 0) return {}
      const service = services.filter(service => service.id === invoiceItem.serviceId)
      const serviceAmount = service[0]?.subtotalType == subtotalTypes.serviceFee
        ? Number(invoiceItem.unitAmount) * Number(invoiceItem.count)
        : 0
      totalService += serviceAmount

      return {
        id: invoiceItem.id,
        name: invoiceItem.name || '',
        type: invoiceItem.type,
        serviceId: invoiceItem.serviceId,
        unitAmount: Number(invoiceItem.unitAmount),
        taxAmount: Number(invoiceItem.taxAmount),
        count: Number(invoiceItem.count),
        subtotalTaxAmount: Number(invoiceItem.subtotalTaxAmount),
        subtotalWithoutTaxAmount: Number(invoiceItem.subtotalWithoutTaxAmount),
        subtotalAmount: Number(invoiceItem.subtotalAmount),
        subtotalType: service.length ? service[0].subtotalType : subtotalTypes.consumptionTax
      }
    }).filter(invoiceItem => !!Object.keys(invoiceItem).length)
    totalServiceWithoutTaxAmount += totalService
    totalDiscountAmount += Number(bookingDetail.discountAmount)

    return {
      invoiceItems,
      id: bookingDetail.id,
      roomName: bookingDetail.room.name || '',
      guestCount: bookingDetail.guestCount || 0,
      subtotalType: bookingDetail.subtotalType,
      dayWithoutYearJp: getDayWithoutYearJp(bookingDetail.startDatetime),
      bookingDate: getDayJp(bookingDetail.startDatetime),
      startTime: format(new Date(bookingDetail.startDatetime), 'HH:mm'),
      endTime: format(new Date(bookingDetail.endDatetime), 'HH:mm'),
      totalHour: differenceInMinutes(new Date(endTime), bookingDetail.startDatetime)/60
    }
  })
  totalServiceWithoutTaxAmount = Math.floor(totalServiceWithoutTaxAmount * 0.1)

  const { totalAmountWithoutTax, totalTax } = getPriceInfo(
    formattedBookingDetails,
    totalServiceWithoutTaxAmount,
    totalDiscountAmount,
    services
  )

  return {
    id: booking.id,
    customerName: booking.customerName || '',
    customerTel: booking.customerTel || '',
    customerFax: booking.customerFax || '',
    customerMail: booking.customerMail || '',
    customerRepName: booking.customerRepName || '',
    staffName: booking.createdStaff.name || '',
    bookingNote: booking.note || '',
    invoicePdfTypes: invoiceInfo.invoicePdfTypes,
    bookingType: invoiceInfo.bookingType,
    cancelType: invoiceInfo.cancelType,
    confirmationNote: invoiceInfo.confirmationNote || '',
    isDisplayStamp: invoiceInfo.isDisplayStamp,
    currentTime: format(new Date(), 'yyyy/MM/dd'),
    currentTimeJP: format(new Date(getPublishDate(bookingDetails, invoiceInfo.bookingType)), 'yyyy年MM月dd日'),
    bookingConfirmationTitle: getInvoiceTitle(
      invoicePdfType.confirm,
      invoiceInfo.invoicePdfTypes,
      invoiceInfo.bookingType
    ),
    bookingQuotationTitle: getInvoiceTitle(
      invoicePdfType.quote,
      invoiceInfo.invoicePdfTypes,
      invoiceInfo.bookingType
    ),
    bookingDetails: formattedBookingDetails,
    totalDiscountAmount,
    totalServiceWithoutTaxAmount,
    totalAmountWithoutTax,
    totalTax: Math.floor(totalTax * 0.1),
    totalAmount: totalAmountWithoutTax + Math.floor(totalTax * 0.1)
  }
}

function getPriceInfo(
  bookingDetails: any[],
  totalServiceWithoutTaxAmount: number,
  totalDiscountAmount: number,
  services: ServiceType[]
) {
  const priceInfos = bookingDetails.map((bookingDetail: BookingDetailWithRelationsType) => {
    return bookingDetail.invoiceItems.reduce((accumulator, invoiceItem) => {
      const service = services.filter(service => service.id === invoiceItem.serviceId)
      const subtotalWithoutTaxAmount = invoiceItem.subtotalWithoutTaxAmount || 0
      const tax = service[0]?.subtotalType !== subtotalTypes.nonTaxable
        ? subtotalWithoutTaxAmount
        : 0

      return {
        amountWithoutTax: accumulator.amountWithoutTax + Number(subtotalWithoutTaxAmount),
        tax: accumulator.tax + Number(tax)
      }
    }, {
      amountWithoutTax: 0,
      tax: 0
    })
  })

  return priceInfos.reduce((accumulator, priceInfo) => {
    return {
      totalAmountWithoutTax: accumulator.totalAmountWithoutTax + priceInfo.amountWithoutTax,
      totalTax: accumulator.totalTax + priceInfo.tax,
    }
  }, {
    totalAmountWithoutTax: totalServiceWithoutTaxAmount - totalDiscountAmount,
    totalTax: totalServiceWithoutTaxAmount - totalDiscountAmount
  })
}

function getServices(bookingDetails: any[]) {
  const serviceIds = bookingDetails.reduce((ids, bookingDetail: BookingDetailWithRelationsType) => {
    const invoiceIds = bookingDetail.invoiceItems.map(invoiceItem => invoiceItem.serviceId)

    return [...ids, ...invoiceIds]
  }, [])

  return prisma.service.findMany({ where: { id: { in: serviceIds }}})
}

function getInvoiceTitle(type: number, invoicePdfTypes: Object[], bookingType: number) {
  if (type == invoicePdfType.confirm && invoicePdfTypes.includes(invoicePdfType.confirm)) {
    return Object.values(bookingInvoicePdfTitles.confirmation).find(
      title => title.value == bookingType
    )?.label ?? ''
  }

  if (type == invoicePdfType.quote && invoicePdfTypes.includes(invoicePdfType.quote)) {
    return Object.values(bookingInvoicePdfTitles.invoice).find(
      title => title.value == bookingType
    )?.label ?? ''
  }

  return ''
}

function getPublishDate(bookingDetails: any[], bookingType: number) {
  const currentTime = format(new Date(), 'yyyy/MM/dd')
  const minTime = getMinTime(bookingDetails)

  if (currentTime < minTime) return currentTime

  return bookingType === bookingTypes.bill || bookingType === bookingTypes.acceptanceMinutes
    ? minTime
    : subDays(new Date(minTime), 1)
}

function getMinTime(bookingDetails: any[]) {
  const startDateTimes = bookingDetails.map(bookingDetail => format(new Date(bookingDetail.startDatetime), 'yyyy/MM/dd'))
  const sortedStartDate = startDateTimes.sort(function (a,b) {
    if (a > b) { return 1 }
    if (a < b) { return -1 }
    return 0
  })

  return sortedStartDate[0]
}

import { z } from 'zod'
import { Request, Response } from 'express'
import { prisma } from '@root/database'
import {
  BookingSchema,
  BookingDetailSchema,
  InvoiceItemSchema,
  InvoiceSchema,
  RoomSchema
} from '@lib/abo'
import { subtotalTypes } from '@constants/service'

const InvoiceItems = InvoiceItemSchema.extend({
  invoice: z
    .object({
      id: InvoiceSchema.shape.id,
      voucherNum: InvoiceSchema.shape.voucherNum,
      segmentNum: InvoiceSchema.shape.segmentNum,
      settlementAmount: InvoiceSchema.shape.settlementAmount,
      totalAmount: InvoiceSchema.shape.totalAmount
    })
    .nullable()
}).array()

const BookingDetail = BookingDetailSchema.extend({
  invoiceItems: InvoiceItems,
  room: RoomSchema
})
type BookingDetailType = z.infer<typeof BookingDetail>

export const apiDefinition = {
  alias: 'getInvoiceItemsOfBookingDetails',
  description: 'Get invoice items of booking details',
  parameters: [
    {
      name: 'bookingId',
      type: 'Query',
      description: 'booking id',
      schema: BookingSchema.shape.id
    },
    {
      name: 'bookingDetailIds',
      type: 'Query',
      description: 'booking detail ids',
      schema: z.string()
    }
  ],
  response: BookingDetail.array(),
  errorStatuses: [403]
}

export default async (req: Request, res: Response) => {
  const { bookingId, bookingDetailIds } = req.query as any
  const booking = await getBooking(bookingId)
  if (!booking) return res.sendStatus(404)
  const bookingDetails = await getBookingDetails(bookingId, bookingDetailIds)
  const formattedBookingDetails = await formatDataBookingDetails(
    booking,
    // @ts-ignore
    bookingDetails
  )

  return res.send(formattedBookingDetails)
}

function getBooking(bookingId: number | string) {
  return prisma.booking.findFirst({
    where: { id: Number(bookingId) }
  })
}

function getBookingDetails(
  bookingId: number | string,
  bookingDetailIds: string
) {
  return prisma.bookingDetail.findMany({
    where: {
      id: {
        in: bookingDetailIds ? bookingDetailIds.split(',').map(Number) : []
      },
      booking: { id: Number(bookingId) }
    },
    include: {
      room: true,
      invoiceItems: {
        include: {
          invoice: true
        }
      }
    }
  })
}

async function formatDataBookingDetails(
  booking: z.infer<typeof BookingSchema>,
  bookingDetails: BookingDetailType[]
) {
  const services = await getServices(bookingDetails)

  return bookingDetails.map((bookingDetail: BookingDetailType) => {
    const taxRate = Number(bookingDetail.taxRate) / 100
    const serviceTaxRate = 0.1
    let toCalculateTotalServiceAmount = 0
    let invoiceItems: any[] = []
    const customerDisplayName = [booking.customerName, booking.customerRepName]
      .filter(name => name)
      .join(' ')
    const discountAmount = bookingDetail.discountAmount
      ? Number(bookingDetail.discountAmount)
      : 0
    const { amountWithoutTax, taxAmount } = bookingDetail.invoiceItems.reduce(
      (accumulator, invoiceItem) => {
        const service = services.filter(
          service => service.id === invoiceItem.serviceId
        )
        const serviceAmount =
          service[0]?.subtotalType == subtotalTypes.serviceFee
            ? Number(invoiceItem.subtotalWithoutTaxAmount)
            : 0
        toCalculateTotalServiceAmount += serviceAmount

        const subtotalType =
          service[0]?.subtotalType || subtotalTypes.consumptionTax
        invoiceItems = [...invoiceItems, { ...invoiceItem, subtotalType }]

        const amountWithoutTax =
          accumulator.amountWithoutTax +
          Number(invoiceItem.subtotalWithoutTaxAmount)
        const taxAmount =
          subtotalType !== subtotalTypes.nonTaxable
            ? accumulator.taxAmount +
              Number(invoiceItem.subtotalWithoutTaxAmount) * taxRate
            : accumulator.taxAmount

        return { amountWithoutTax, taxAmount }
      },
      {
        amountWithoutTax: 0,
        taxAmount: 0
      }
    )
    const totalServiceAmountWithoutTax = Math.floor(toCalculateTotalServiceAmount * serviceTaxRate)
    const totalServiceTaxAmount = Math.floor(totalServiceAmountWithoutTax * taxRate)
    const totalTax = Math.floor(taxAmount)
    const totalAmount = amountWithoutTax + totalTax
    const totalAmountWithDiscountService = 
      amountWithoutTax + Math.floor(totalServiceAmountWithoutTax - discountAmount)
    const totalTaxWithDiscount = 
      Math.floor(taxAmount + totalServiceAmountWithoutTax * taxRate - discountAmount * taxRate)

    return {
      ...bookingDetail,
      invoiceItems,
      customerName: booking.customerName,
      customerDisplayName,
      totalAmountWithoutTax: amountWithoutTax,
      totalAmountWithDiscountService,
      totalTax: totalTax + totalServiceTaxAmount,
      totalAmount:
        totalAmount + totalServiceTaxAmount + totalServiceAmountWithoutTax,
      totalTaxWithDiscount,
      totalAmountWithDiscount: totalAmountWithDiscountService + totalTaxWithDiscount,
      totalServiceAmountWithoutTax
    }
  })
}

function getServices(bookingDetails: BookingDetailType[]) {
  const ids = bookingDetails.reduce(
    (ids: number[], bookingDetail: BookingDetailType) => {
      const serviceIds = [
        ...new Set(
          bookingDetail.invoiceItems.map(invoiceItem => invoiceItem.serviceId)
        )
      ]

      return [...ids, ...serviceIds]
    },
    []
  )

  return prisma.service.findMany({ where: { id: { in: ids } } })
}

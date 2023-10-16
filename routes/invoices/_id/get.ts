import { Request, Response } from 'express'
import { prisma } from '@root/database'
import {
  InvoiceSchema,
  InvoiceItemSchema,
  BookingSchema,
  Invoice,
  InvoiceItem,
  BookingDetailSchema
} from '@lib/abo'

export const apiDefinition = {
  alias: 'getInvoice',
  description: 'Get detail of invoice-id',
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
      schema: BookingSchema.shape.id.optional()
    }
  ],
  response: InvoiceSchema.extend({
    invoiceItems: InvoiceItemSchema.array(),
    booking: BookingSchema,
    bookingDetails: BookingDetailSchema.array()
  }),
  errorStatuses: [400, 404]
}

export default async (req: Request, res: Response) => {
  const { id } = req.params
  const { bookingId } = req.query

  const booking = bookingId && (await getBooking(Number(bookingId)))
  if (bookingId && !booking) return res.sendStatus(404)

  const invoice = await getInvoice(Number(id), Number(bookingId))
  if (!invoice) return res.sendStatus(404)

  const serviceIds = invoice.invoiceItems.map(({ serviceId }) => serviceId)
  const services = await getServices(serviceIds)

  const { createdStaffName, updatedStaffName } = await getStaffInfo(invoice)
  const bookingDetails = await getBookingDetails(invoice.invoiceItems)

  return res.send({
    ...invoice,
    createdStaffName,
    updatedStaffName,
    invoiceItems: invoice.invoiceItems.map(invoiceItem => {
      const { subtotalType } = services.find(({ id }) => id === invoiceItem.serviceId) ?? {}
      return { ...invoiceItem, subtotalType }
    }),
    bookingDetails,
    booking: booking
      ? booking
      : (await getBooking(Number(invoice.bookingId))) || {}
  })
}

function getBooking(bookingId: number) {
  return prisma.booking.findFirst({
    where: {
      id: bookingId
    }
  })
}

function getInvoice(id: number, bookingId: number) {
  return prisma.invoice.findFirst({
    include: {
      invoiceItems: true
    },
    where: {
      id,
      ...(bookingId && { bookingId })
    }
  })
}

async function getStaffInfo(invoice: Invoice) {
  const { createdStaffId, updatedStaffId } = invoice
  const staffIds: any[] = [createdStaffId, updatedStaffId].filter(Number)
  if ((!createdStaffId && !updatedStaffId) || !staffIds.length) {
    return {
      createdStaffName: '',
      updatedStaffName: ''
    }
  }
  const staffs = await getStaffs(staffIds)
  const { createdStaffName, updatedStaffName } = staffs.reduce(
    (result, staff) => {
      if (staff.id === createdStaffId) result.createdStaffName = staff.name
      if (staff.id === updatedStaffId) result.updatedStaffName = staff.name

      return result
    },
    {
      createdStaffName: '',
      updatedStaffName: ''
    }
  )

  return {
    createdStaffName,
    updatedStaffName: updatedStaffName || createdStaffName
  }
}

function getStaffs(staffIds: number[]) {
  return prisma.staff.findMany({
    where: {
      id: { in: staffIds }
    }
  })
}

function getServices(serviceIds: number[]) {
  return prisma.service.findMany({
    where: {
      id: { in: serviceIds }
    }
  })
}

function getBookingDetails(invoiceItems: InvoiceItem[]) {
  const bookingDetailIds = [
    ...new Set(
      invoiceItems.map((invoiceItem: InvoiceItem) =>
        Number(invoiceItem.bookingDetailId)
      )
    )
  ]

  return prisma.bookingDetail.findMany({
    where: {
      id: {
        in: bookingDetailIds.filter(Number)
      }
    },
    include: {
      room: {
        select: {
          name: true
        }
      }
    }
  })
}

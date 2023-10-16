import { z } from 'zod'
import { Request, Response } from 'express'
import { prisma } from '@root/database'
import { formatDateJp } from '@root/util'
import { ResponseSchemas } from '@azoom/api-definition-util'
import {
  BookingSchema,
  InvoiceSchema,
  InvoiceItemSchema
} from '@lib/abo'
import { bookingDetailStatuses } from '@constants/booking'

const InvoiceRequestSchema = InvoiceSchema.omit({
  createdStaffId: true,
  updatedStaffId: true,
  dueDate: true,
  isPastRevision: true,
  pastInvoiceId: true,
  createdDatetime: true,
  updatedDatetime: true
})
.partial()
.extend({
  bookingId: BookingSchema.shape.id,
  invoiceItemIds: z.array(InvoiceItemSchema.shape.id)
})

type InvoiceRequestType = z.infer<typeof InvoiceRequestSchema>

export const apiDefinition = {
  alias: 'createInvoice',
  description: 'Create invoice',
  parameters: [
    {
      name: 'invoice',
      type: 'Body',
      description: `invoice`,
      schema: InvoiceRequestSchema
    }
  ],
  response: ResponseSchemas[200].schema,
  errorStatuses: [400, 403]
}

export default async (req: Request, res: Response) => {
  const invoiceInfo = req.body

  const booking = await getBooking(invoiceInfo.bookingId)
  if (!booking) return res.sendStatus(404)
  const invoiceItems = await getInvoiceItems(invoiceInfo.invoiceItemIds, invoiceInfo.bookingId)
  if (invoiceItems.length !== invoiceInfo.invoiceItemIds.length) return res.sendStatus(400)
  const bookingDetailIds:any[] = [
    ...new Set(
      invoiceItems.map(invoiceItem => invoiceItem.bookingDetailId)
    )
  ]

  if (invoiceInfo.id && invoiceInfo.voucherNum && invoiceInfo.segmentNum) {
    const invoice = await getInvoice(invoiceInfo)
    if (!invoice) return res.sendStatus(400)
    await updateInvoiceItems(invoiceInfo.id)
    await updateInvoice(invoiceInfo)
    await updateBookingDetails(bookingDetailIds)

    return res.sendStatus(200)
  }

  await createInvoice(invoiceInfo)
  await updateBookingDetails(bookingDetailIds)

  return res.sendStatus(200)
}

function getBooking(bookingId: number) {
  return prisma.booking.findFirst({
    where: { id: Number(bookingId) }
  })
}

function getInvoice(invoiceIdInfo: InvoiceRequestType) {
  return prisma.invoice.findFirst({
    where: {
      id: invoiceIdInfo.id,
      voucherNum: invoiceIdInfo.voucherNum,
      segmentNum: invoiceIdInfo.segmentNum
    }
  })
}

function getInvoiceItems(invoiceItemIds: number[], bookingId: number) {
  return prisma.invoiceItem.findMany({
    where: {
      bookingDetail: {
        booking: { id: bookingId }
      },
      id: {
        in: invoiceItemIds
      }
    }
  })
}

async function updateInvoiceItems(invoiceId: number) {
  await prisma.invoiceItem.updateMany({
    data: { invoiceId: null },
    where: { invoiceId: invoiceId }
  })
}

function updateInvoice(invoiceInfo: InvoiceRequestType) {
  const { invoiceItemIds, ...invoice } = invoiceInfo
  return prisma.invoice.update({
    where: {
      id: invoiceInfo.id
    },
    data: {
      ...invoice,
      invoiceItems: invoiceItemIds && {
        connect: invoiceItemIds.map(invoiceItemIds => ({ id: invoiceItemIds }))
      }
    }
  })
}

function createInvoice(invoiceInfo: InvoiceRequestType) {
  const { invoiceItemIds, ...invoice } = invoiceInfo
  return prisma.invoice.create({
    data: {
      ...invoice,
      paymentDate: formatDateJp(`${new Date()}`),
      invoiceItems: {
        connect: invoiceItemIds.map(invoiceItemIds => ({ id: invoiceItemIds }))
      }
    }
  })
}

async function updateBookingDetails(bookingDetailIds: number[]) {
  return Promise.all(
    bookingDetailIds.map(async (bookingDetailId: number) => {
      const unlinkedInvoiceItem = await getUnlinkedInvoiceItem(bookingDetailId)
      if (!unlinkedInvoiceItem.length) {
        await updateBookingDetail(bookingDetailId)
      }
    })
  )
}

function getUnlinkedInvoiceItem(bookingDetailId: number) {
  return prisma.invoiceItem.findMany({ where: {
    bookingDetailId: bookingDetailId,
    invoiceId: null
  }})
}

function updateBookingDetail(bookingDetailId: number) {
  return prisma.bookingDetail.update({
    where: {
      id: bookingDetailId
    },
    data: {
      status: bookingDetailStatuses.completePayment
    }
  })
}

import { Request, Response } from 'express'
import { ResponseSchemas } from '@azoom/api-definition-util'
import { prisma } from '@root/database'
import { InvoiceSchema, InvoiceItem } from '@lib/abo'
import { bookingDetailStatuses } from '@constants/booking'

export const apiDefinition = {
  alias: 'deleteInvoice',
  description: 'Delete invoice',
  parameters: [
    {
      name: 'id',
      type: 'Path',
      description: `invoice Id`,
      schema: InvoiceSchema.shape.id
    }
  ],
  response: ResponseSchemas[200].schema,
  errorStatuses: [400, 403]
}

export default async (req: Request, res: Response) => {
  const { id } = req.params
  const invoice = await getInvoice(Number(id))
  if (!invoice) return res.sendStatus(404)

  if (!invoice.bookingId) {
    await deleteInvoiceItems(Number(id))
  }

  await deleteInvoice(Number(id))
  if (invoice.bookingId) {
    const bookingDetailIds:any[] = [
      ...new Set(
        invoice.invoiceItems.map(invoiceItem => invoiceItem.bookingDetailId)
      )
    ]
    await updateBookingDetails(bookingDetailIds)
  }

  return res.sendStatus(200)
}

function getInvoice(id: number) {
  return prisma.invoice.findFirst({
    where: { id },
    include: { invoiceItems: true }
  })
}

function deleteInvoiceItems(invoiceId: number) {
  return prisma.invoiceItem.deleteMany({
    where: { invoiceId }
  })
}

async function updateBookingDetails(bookingDetailIds: number[]) {
  return Promise.all(
    bookingDetailIds.map(async (bookingDetailId: number) => {
      const bookingDetail = await getBookingDetail(bookingDetailId)
      const linkedInvoiceItem = await getLinkedInvoiceItem(bookingDetailId)
      if (!linkedInvoiceItem.length) {
        await updateBookingDetail(bookingDetailId,
          bookingDetail?.cancelDatetime
            ? bookingDetailStatuses.canceled
            : bookingDetailStatuses.official)
      } else {
        await updateBookingDetail(bookingDetailId,
          bookingDetail?.cancelDatetime
            ? bookingDetailStatuses.canceled
            : bookingDetailStatuses.withholdPayment
        )
      }
    })
  )
}

function getBookingDetail(bookingDetailId: number) {
  return prisma.bookingDetail.findFirst({
    where: { id: bookingDetailId }
  })
}

function getLinkedInvoiceItem(bookingDetailId: number) {
  return prisma.invoiceItem.findMany({ where: {
    bookingDetailId: bookingDetailId,
    NOT: [{ invoiceId: null }]
  }})
}

function updateBookingDetail(bookingDetailId: number, status: number) {
  return prisma.bookingDetail.update({
    where: { id: bookingDetailId },
    data: { status }
  })
}

function deleteInvoice(id: number) {
  return prisma.invoice.delete({
    where: { id }
  })
}

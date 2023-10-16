import { z } from 'zod'
import { Request, Response } from 'express'
import { ResponseSchemas } from '@azoom/api-definition-util'
import { prisma } from '@root/database'
import { InvoiceItemSchema } from '@lib/abo'

const InvoiceItem = InvoiceItemSchema.omit({
  createdDatetime: true,
  updatedDatetime: true
}).extend({
  id: InvoiceItemSchema.shape.id.optional(),
  bookingDetailId: InvoiceItemSchema.shape.bookingDetailId.optional(),
  invoiceId: InvoiceItemSchema.shape.invoiceId.optional(),
  serviceId: InvoiceItemSchema.shape.serviceId
})

type InvoiceItemType = z.infer<typeof InvoiceItem>

export const apiDefinition = {
  alias: 'createInvoiceItem',
  description: 'Create invoice item',
  parameters: [
    {
      name: 'invoiceItems',
      type: 'Body',
      description: `invoiceItems`,
      schema: z.object({
        invoiceItems: InvoiceItem.array(),
        bookingDetailId: InvoiceItemSchema.shape.bookingDetailId
      })
    }
  ],
  response: ResponseSchemas[200].schema,
  errorStatuses: [400, 403]
}

export default async (req: Request, res: Response) => {
  const { invoiceItems, bookingDetailId } = req.body

  const bookingDetail = await getBookingDetail(bookingDetailId)
  if (!bookingDetail) return res.sendStatus(404)
  if (!invoiceItems.length) {
    await deleteInvoiceItem(invoiceItems, bookingDetailId)

    return res.sendStatus(200)
  }

  const bookingDetailIdInvoice = getBookingDetailId(invoiceItems)
  if (bookingDetailIdInvoice !== bookingDetailId)
    return res.status(400).send({
      errorMessage: '明細を保存しませんでした'
    })

  const isValid = await validateInvoiceItem(
    bookingDetailIdInvoice,
    invoiceItems
  )
  if (!isValid)
    return res.status(400).send({
      errorMessage: '明細を保存しませんでした'
    })

  const { updatedInvoiceItems, newInvoiceItems } =
    splitInvoiceItems(invoiceItems)

  await Promise.all(
    updatedInvoiceItems.map((updatedInvoiceItem: InvoiceItemType) =>
      updateInvoiceItem(updatedInvoiceItem)
    )
  )
  await deleteInvoiceItem(updatedInvoiceItems, bookingDetailId)
  await createInvoiceItems(newInvoiceItems)

  return res.sendStatus(200)
}

function getBookingDetailId(invoiceItems: InvoiceItemType[]) {
  const bookingDetailIds: any = [
    ...new Set(invoiceItems.map(invoiceItem => invoiceItem.bookingDetailId))
  ]

  if (bookingDetailIds.length > 1) return false
  const [bookingDetailId] = bookingDetailIds

  return bookingDetailId
}

async function validateInvoiceItem(
  bookingDetailId: number,
  invoiceItems: InvoiceItemType[]
) {
  const bookingDetail = await getBookingDetail(Number(bookingDetailId))
  const isValidService = await validateServices(invoiceItems)

  return bookingDetail && isValidService
}

function splitInvoiceItems(invoiceItems: InvoiceItemType[]) {
  return invoiceItems.reduce(
    (result: any, invoiceItem: InvoiceItemType) => {
      const { id } = invoiceItem
      if (id) {
        result.updatedInvoiceItems = [
          ...result.updatedInvoiceItems,
          invoiceItem
        ]
      } else {
        result.newInvoiceItems = [...result.newInvoiceItems, invoiceItem]
      }

      return result
    },
    {
      updatedInvoiceItems: [],
      newInvoiceItems: []
    }
  )
}

function getBookingDetail(id: number) {
  return prisma.bookingDetail.findFirst({
    where: { id }
  })
}

async function validateServices(invoiceItems: InvoiceItemType[]) {
  const serviceIds = [
    ...new Set(invoiceItems.map(invoiceItem => invoiceItem.serviceId))
  ]

  const services = await prisma.service.findMany({
    where: {
      id: {
        in: serviceIds
      }
    }
  })

  return serviceIds.length === services.length
}

function createInvoiceItems(invoiceItems: InvoiceItemType[]) {
  return prisma.invoiceItem.createMany({
    // @ts-ignore
    data: invoiceItems
  })
}

function updateInvoiceItem(invoiceItem: InvoiceItemType) {
  const { id, ...invoiceBody } = invoiceItem

  return prisma.invoiceItem.update({
    where: { id },
    // @ts-ignore
    data: invoiceBody
  })
}

function deleteInvoiceItem(invoiceItems: any[], bookingDetailId: number) {
  const invoiceItemIds = invoiceItems.map(invoiceItem => invoiceItem.id)
  return prisma.invoiceItem.deleteMany({
    where: {
      id: {
        notIn: invoiceItemIds
      },
      bookingDetailId
    }
  })
}

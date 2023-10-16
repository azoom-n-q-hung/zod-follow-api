import { z } from 'zod'
import omit from 'lodash/fp/omit'
import { format } from 'date-fns'
import { Request, Response } from 'express'
import { ResponseSchemas } from '@azoom/api-definition-util'
import { prisma } from '@root/database'
import { Invoice, InvoiceItemSchema, InvoiceSchema } from '@lib/abo'
import { invoiceStatuses } from '@constants/invoice'
import { formatDateJp } from '@root/util'

const InvoiceBodySchema = InvoiceSchema.pick({
  discountWithoutTaxAmount: true,
  cashPaymentAmount: true,
  creditPaymentAmount: true,
  cardPaymentAmount: true,
  updatedStaffId: true,
  totalAmount: true,
  proviso: true,
  recipientName: true,
  serviceAmount: true,
  serviceWithoutTaxAmount: true,
  totalTaxAmount: true,
  totalWithoutTaxAmount: true
}).extend({
  depositAmount: InvoiceSchema.shape.depositAmount.optional(),
  serviceAmount: InvoiceSchema.shape.serviceAmount.optional(),
  serviceWithoutTaxAmount:
    InvoiceSchema.shape.serviceWithoutTaxAmount.optional(),
  totalTaxAmount: InvoiceSchema.shape.totalTaxAmount.optional(),
  totalWithoutTaxAmount: InvoiceSchema.shape.totalWithoutTaxAmount.optional(),
  discountAmount: InvoiceSchema.shape.discountAmount.optional()
})

const InvoicePayloadSchema = InvoiceSchema.partial()
const InvoiceItemBodySchema = InvoiceItemSchema.omit({
  createdDatetime: true,
  updatedDatetime: true
}).extend({
  id: InvoiceItemSchema.shape.id.optional(),
  bookingDetailId: InvoiceItemSchema.shape.bookingDetailId.optional(),
  invoiceId: InvoiceItemSchema.shape.invoiceId.optional()
})

type InvoiceBody = z.infer<typeof InvoiceBodySchema>
type InvoicePayload = z.infer<typeof InvoicePayloadSchema>
type InvoiceItemBody = z.infer<typeof InvoiceItemBodySchema>

export const apiDefinition = {
  alias: 'editInvoice',
  description: 'Edit Invoice',
  parameters: [
    {
      name: 'id',
      type: 'Path',
      description: 'Invoice Id',
      schema: InvoiceSchema.shape.id
    },
    {
      name: 'invoice',
      type: 'Body',
      description: 'Invoice',
      schema: z.object({
        invoice: InvoiceBodySchema,
        invoiceItems: InvoiceItemBodySchema.array()
      })
    }
  ],
  response: ResponseSchemas[200].schema,
  errorStatuses: [400, 403]
}

export default async (req: Request, res: Response) => {
  const { id } = req.params
  const { invoice, invoiceItems } = req.body

  const existedInvoice = await getInvoice(Number(id))
  if (!existedInvoice) return res.sendStatus(404)
  const isValidBookingDetail = await validateBookingDetailIds(invoiceItems)
  if (!isValidBookingDetail) {
    return res.status(400).send({
      errorMessage: '明細を保存しませんでした'
    })
  }
  const didInvoiceItemsChanged = checkIfInvoiceItemsChanged(
    invoiceItems,
    existedInvoice.invoiceItems
  )
  const didInvoiceChanged = checkIfInvoiceChanged(
    invoice,
    existedInvoice
  )
  const shouldRenewInvoice = didInvoiceItemsChanged || didInvoiceChanged

  const today = format(new Date(), 'yyyy-MM-dd')
  const paymentDate =
    existedInvoice.paymentDate &&
    format(new Date(existedInvoice.paymentDate), 'yyyy-MM-dd')
  if (today !== paymentDate && shouldRenewInvoice) {
    await handlePastInvoice(invoice, existedInvoice, invoiceItems)
  } else {
    const { updatedInvoiceItems, newInvoiceItems } = splitInvoiceItems(
      Number(id),
      invoiceItems
    )
    await updateInvoice({ ...invoice, id })
    await Promise.all(updatedInvoiceItems.map(updateInvoiceItem))
    await deleteInvoiceItems(Number(id), updatedInvoiceItems)
    await createInvoiceItems(newInvoiceItems)
  }

  return res.sendStatus(200)
}

async function validateBookingDetailIds(invoiceItems: InvoiceItemBody[]) {
  const bookingDetailIds: any = [
    ...new Set(
      invoiceItems
        .map(invoiceItem => invoiceItem.bookingDetailId)
        .filter(Number)
    )
  ]

  if (!bookingDetailIds.length) return true

  const bookingDetails = await getBookingDetails(bookingDetailIds)

  return bookingDetails.length === bookingDetailIds.length
}

function checkIfInvoiceItemsChanged(
  newInvoiceItems: InvoiceItemBody[],
  oldInvoiceItems: InvoiceItemBody[]
) {
  if (newInvoiceItems.length !== oldInvoiceItems.length) return true

  const isContainNewInvoiceItem = newInvoiceItems.some(
    invoiceItem => !invoiceItem.id
  )
  if (isContainNewInvoiceItem) return true

  const isAllInvoiceItemOriginal = newInvoiceItems.every(newInvoiceItem => {
    const theSameOldInvoiceItem = oldInvoiceItems.find(
      ({ id }) => id === newInvoiceItem.id
    )
    if (!theSameOldInvoiceItem) return false

    return (
      Number(newInvoiceItem.count) === Number(theSameOldInvoiceItem.count) &&
      Number(newInvoiceItem.unitAmount) ===
        Number(theSameOldInvoiceItem.unitAmount) &&
      Number(newInvoiceItem.subtotalAmount) ===
        Number(theSameOldInvoiceItem.subtotalAmount) &&
      Number(newInvoiceItem.subtotalTaxAmount) ===
        Number(theSameOldInvoiceItem.subtotalTaxAmount) &&
      newInvoiceItem.name === theSameOldInvoiceItem.name
    )
  })

  if (!isAllInvoiceItemOriginal) return true

  return false
}

function checkIfInvoiceChanged(newInvoice: InvoiceBody, oldInvoice: InvoiceBody) {
  return Number(newInvoice.totalAmount) !== Number(oldInvoice.totalAmount) || 
    Number(newInvoice.cardPaymentAmount) !== Number(oldInvoice.cardPaymentAmount) || 
    Number(newInvoice.cashPaymentAmount) !== Number(oldInvoice.cashPaymentAmount) || 
    Number(newInvoice.creditPaymentAmount) !== Number(oldInvoice.creditPaymentAmount) || 
    Number(newInvoice.depositAmount) !== Number(oldInvoice.depositAmount) || 
    Number(newInvoice.discountAmount) !== Number(oldInvoice.discountAmount) || 
    Number(newInvoice.discountWithoutTaxAmount) !== Number(oldInvoice.discountWithoutTaxAmount) || 
    Number(newInvoice.serviceAmount) !== Number(oldInvoice.serviceAmount) || 
    Number(newInvoice.serviceWithoutTaxAmount) !== Number(oldInvoice.serviceWithoutTaxAmount) || 
    Number(newInvoice.totalTaxAmount) !== Number(oldInvoice.totalTaxAmount) || 
    Number(newInvoice.totalWithoutTaxAmount) !== Number(oldInvoice.totalWithoutTaxAmount)
}

function getBookingDetails(bookingDetailIds: number) {
  return prisma.bookingDetail.findMany({
    where: {
      id: {
        in: bookingDetailIds
      }
    }
  })
}

function getInvoice(id: number) {
  return prisma.invoice.findFirst({
    where: { id },
    include: {
      invoiceItems: true
    }
  })
}

async function handlePastInvoice(
  invoice: InvoiceBody,
  existedInvoice: Invoice,
  invoiceItems: InvoiceItemBody[]
) {
  await cancelInvoicePast(existedInvoice.id)

  const invoiceDropKey = [
    'updatedDatetime',
    'createdDatetime',
    'isPastRevision',
    'pastInvoiceId',
    'paymentDate',
    'invoiceItems',
    'id'
  ]
  const newInvoiceInfo = {
    ...omit(invoiceDropKey, existedInvoice),
    ...invoice,
    isPastRevision: true,
    pastInvoiceId: existedInvoice.id,
    paymentDate: formatDateJp(`${new Date()}`)
  }

  await createInvoice(newInvoiceInfo, invoiceItems)
}

function cancelInvoicePast(invoiceId: number) {
  const invoiceBody = {
    id: invoiceId,
    status: invoiceStatuses.canceled
  }

  return updateInvoice(invoiceBody)
}

function updateInvoice(invoice: InvoicePayload) {
  const { id, ...invoiceInfo } = invoice

  return prisma.invoice.update({
    where: { id },
    data: invoiceInfo
  })
}

function createInvoice(invoice: any, invoiceItems: InvoiceItemBody[]) {
  const invoiceItemInfo = invoiceItems.map(
    ({
      bookingDetailId,
      invoiceId,
      name,
      type,
      serviceId,
      unitAmount,
      taxAmount,
      count,
      subtotalWithoutTaxAmount,
      subtotalTaxAmount,
      subtotalAmount
    }) => {
      return {
        bookingDetailId,
        invoiceId,
        name,
        type,
        serviceId,
        unitAmount,
        taxAmount,
        count,
        subtotalWithoutTaxAmount,
        subtotalTaxAmount,
        subtotalAmount
      }
    }
  )

  return prisma.invoice.create({
    data: {
      ...invoice,
      invoiceItems: {
        createMany: {
          data: invoiceItemInfo,
          skipDuplicates: false
        }
      }
    }
  })
}

function splitInvoiceItems(invoiceId: number, invoiceItems: InvoiceItemBody[]) {
  return invoiceItems.reduce(
    (result: any, invoiceItem: InvoiceItemBody) => {
      const { id } = invoiceItem
      if (id) {
        result.updatedInvoiceItems = [
          ...result.updatedInvoiceItems,
          invoiceItem
        ]
      } else {
        result.newInvoiceItems = [
          ...result.newInvoiceItems,
          { ...invoiceItem, invoiceId }
        ]
      }

      return result
    },
    {
      updatedInvoiceItems: [],
      newInvoiceItems: []
    }
  )
}

function updateInvoiceItem(invoiceItem: InvoiceItemBody) {
  const { id, ...invoiceItemInfo } = invoiceItem
  return prisma.invoiceItem.update({
    where: { id },
    data: invoiceItemInfo
  })
}

function deleteInvoiceItems(
  invoiceId: number,
  invoiceItems: InvoiceItemBody[]
) {
  const invoiceItemIds = invoiceItems.map(({ id }) => Number(id))

  return prisma.invoiceItem.updateMany({
    where: {
      id: {
        notIn: invoiceItemIds
      },
      invoiceId
    },
    data: {
      invoiceId: null
    }
  })
}

function createInvoiceItems(invoiceItems: InvoiceItemBody[]) {
  return prisma.invoiceItem.createMany({
    data: invoiceItems
  })
}

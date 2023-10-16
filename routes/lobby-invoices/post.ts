import { z } from 'zod'
import { Request, Response } from 'express'
import { ResponseSchemas } from '@azoom/api-definition-util'
import { prisma } from '@root/database'
import { InvoiceSchema, InvoiceItemSchema } from '@lib/abo'
import { locationTypes } from '@constants/service'
import { formatDateJp } from '@root/util'

const partialDefaultLobbyInvoice = {
  segmentNum: 1,
  bookingId: null,
  status: 1,
  paymentDate: formatDateJp(`${new Date()}`)
}

const Invoice = InvoiceSchema.pick({
  totalTaxAmount: true,
  totalWithoutTaxAmount: true,
  totalAmount: true,
  createdStaffId: true
})

const InvoiceItem = InvoiceItemSchema.pick({
  name: true,
  serviceId: true,
  unitAmount: true,
  taxAmount: true,
  count: true,
  type: true,
  subtotalAmount: true,
  subtotalTaxAmount: true,
  subtotalWithoutTaxAmount: true
})
type InvoicePayload = z.infer<typeof Invoice>
type InvoiceItemPayload = z.infer<typeof InvoiceItem>

export const apiDefinition = {
  alias: 'createLobbyInvoice',
  description: 'Create lobby invoice',
  parameters: [
    {
      name: 'invoice',
      type: 'Body',
      description: `Invoice`,
      schema: Invoice.extend({
        invoiceItems: InvoiceItem.array()
      })
    }
  ],
  response: ResponseSchemas[200].schema,
  errorStatuses: [400, 403]
}

export default async (req: Request, res: Response) => {
  const { invoiceItems, ...invoiceInfo } = req.body
  const { createdStaffId } = invoiceInfo

  const staff = await getStaff(createdStaffId)
  if (!staff) return res.sendStatus(404)
  const isValid = await validateServices(invoiceItems)
  if (!isValid) return res.sendStatus(400)

  await createInvoice(invoiceInfo, invoiceItems)

  return res.sendStatus(200)
}

function getStaff(staffId: number) {
  return prisma.staff.findUnique({ where: { id: Number(staffId) } })
}

async function validateServices(invoiceItems: InvoiceItemPayload[]) {
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

  return (
    serviceIds.length === services.length &&
    services.every(service => service.locationType === locationTypes.lobby)
  )
}

function createInvoice(
  invoiceInfo: InvoicePayload,
  invoiceItems: InvoiceItemPayload[]
) {
  return prisma.invoice.create({
    data: {
      ...invoiceInfo,
      ...partialDefaultLobbyInvoice,
      cashPaymentAmount: invoiceInfo.totalAmount,
      invoiceItems: {
        createMany: {
          data: invoiceItems,
          skipDuplicates: false
        }
      }
    }
  })
}

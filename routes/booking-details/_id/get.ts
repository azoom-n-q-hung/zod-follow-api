import { z } from 'zod'
import { Request, Response } from 'express'
import { prisma } from '@root/database'
import { fixedServiceIds } from '@constants/service'
import { invoiceStatuses } from '@constants/invoice'
import {
  BookingDetailSchema,
  InvoiceItemSchema,
  RoomChargeSchema,
  ServiceSchema
} from '@lib/abo'

const BookingDetailResponse = z.object({
  bookingDetail: BookingDetailSchema,
  invoiceItems: InvoiceItemSchema.array(),
  bookingDetailServices: BookingDetailSchema.array(),
  servies: ServiceSchema.array(),
  room: RoomChargeSchema
})

type InvoiceItemType = z.infer<typeof InvoiceItemSchema>

export const apiDefinition = {
  alias: 'getBookingDetail',
  description: 'get Booking Detail',
  parameters: [
    {
      name: 'id',
      type: 'Path',
      description: 'id',
      schema: BookingDetailSchema.shape.id
    },
    {
      name: 'ignoreCanceledInvoice',
      type: 'Query',
      description: 'ignore canceledInvoice',
      schema: z.boolean().default(false)
    }
  ],
  response: BookingDetailResponse,
  errorStatuses: [400, 403, 404]
}

export default async (req: Request, res: Response) => {
  const bookingDetailId = Number(req.params.id)
  const bookingDetail: any = await getBookingDetail(bookingDetailId, req.query)

  if (!bookingDetail) return res.sendStatus(404)

  const { invoiceItems, bookingDetailServices, room, ...booking } =
    bookingDetail
  const services = await getServices(invoiceItems)

  return res.send({
    bookingDetail: booking,
    invoiceItems: formatInvoiceItems(invoiceItems),
    bookingDetailServices,
    services,
    room
  })
}

function getBookingDetail(id: number, query: any) {
  const { ignoreCanceledInvoice } = query

  return prisma.bookingDetail.findFirst({
    include: {
      room: true,
      bookingDetailServices: {
        include: { service: true }
      },
      invoiceItems: {
        where: {
          OR: ignoreCanceledInvoice
            ? [
                {
                  invoice: {
                    status: {
                      not: invoiceStatuses.canceled
                    }
                  }
                },
                {
                  invoice: null
                }
              ]
            : undefined
        }
      }
    },
    where: {
      id
    }
  })
}

function getServices(invoiceItems: InvoiceItemType[]) {
  const serviceIds = invoiceItems.map(invoiceItem => invoiceItem.serviceId)

  return prisma.service.findMany({
    where: {
      id: {
        in: serviceIds
      }
    },
    include: { serviceCharges: true }
  })
}

function formatInvoiceItems(invoiceItems: InvoiceItemType[]) {
  const serviceIds = Object.values(fixedServiceIds)
  
  return invoiceItems.sort(
    (invoice: InvoiceItemType, invoiceAfter: InvoiceItemType) => {
      if (invoice.invoiceId && !invoiceAfter.invoiceId) {
        return -1
      } else if (!invoice.invoiceId && invoiceAfter.invoiceId) {
        return 1
      } else if (
        serviceIds.includes(invoice.serviceId) &&
        !serviceIds.includes(invoiceAfter.serviceId)
      ) {
        return -1
      } else if (
        !serviceIds.includes(invoice.serviceId) &&
        serviceIds.includes(invoiceAfter.serviceId)
      ) {
        return 1
      } else {
        return 0
      }
    }
  )
}

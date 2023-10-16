import { Request, Response } from 'express'
import { z } from 'zod'
import { endOfDay, startOfDay } from 'date-fns'
import {
  generatePaginationApiDefinitionParameters,
  PaginationSchema,
  InvoiceSchema,
  BookingSchema,
  BookingDetailSchema,
  CustomerSchema
} from '@root/lib/abo'
import { prisma } from '@root/database'

export const apiDefinition = {
  aliases: 'getInvoices',
  description: 'Get invoices',
  parameters: [
    ...generatePaginationApiDefinitionParameters(),
    {
      name: 'id',
      type: 'Query',
      description: 'Invoice Id',
      schema: InvoiceSchema.shape.id.optional()
    },
    {
      name: 'bookingId',
      type: 'Query',
      description: 'Booking Id',
      schema: BookingSchema.shape.id.optional()
    },
    {
      name: 'customerName',
      type: 'Query',
      description: 'Customer Name',
      schema: CustomerSchema.shape.name.optional()
    },
    {
      name: 'startDatetime',
      type: 'Query',
      description: 'Start Datetime',
      schema: BookingDetailSchema.shape.createdDatetime.optional()
    },
    {
      name: 'endDatetime',
      type: 'Query',
      description: 'End Datetime',
      schema: BookingDetailSchema.shape.createdDatetime.optional()
    },
    {
      name: 'status',
      type: 'Query',
      description: 'Invoice Status',
      schema: InvoiceSchema.shape.status.optional()
    },
    {
      name: 'locationType',
      type: 'Query',
      description: 'Location Type',
      schema: z.string().optional()
    }
  ],
  response: InvoiceSchema.array(),
  errorStatuses: [400, 403]
}

const InvoiceSearchParameterSchema = z.object({
  id: InvoiceSchema.shape.id,
  bookingId: BookingSchema.shape.id,
  customerName: CustomerSchema.shape.name,
  startDatetime: BookingDetailSchema.shape.startDatetime,
  endDatetime: BookingDetailSchema.shape.endDatetime,
  status: InvoiceSchema.shape.status,
  locationType: z.string(),
  page: PaginationSchema.shape.page,
  limit: PaginationSchema.shape.limit
}).partial()
type InvoiceSearchParameter = z.infer<typeof InvoiceSearchParameterSchema>

const defaultLocationTypes = {
  lobby: 1,
  room: 2
}

export default async (req: Request, res: Response) => {
  const { total, invoices } = await getInvoices(req.query)

  res.set('X-Total-Count', `${total}`)
  return res.send(invoices)
}

async function getInvoices(query: InvoiceSearchParameter) {
  const {
    id,
    bookingId,
    customerName,
    startDatetime,
    endDatetime,
    status,
    locationType,
    page = 1,
    limit = 50
  } = query

  const matchedBookings =
    customerName || bookingId ? await getBookings(query) : []
  const bookingIds =
    customerName || bookingId ? matchedBookings.map(booking => booking.id) : []

  const bookingIdCondition =
    customerName || bookingId ? { in: bookingIds } : undefined
  const locationTypes = locationType
    ? locationType.split(',').map(Number)
    : [defaultLocationTypes.lobby, defaultLocationTypes.room]

  const condition = {
    id: id ? Number(id) : undefined,
    OR: [
      { bookingId: !customerName && !bookingId && locationTypes.includes(defaultLocationTypes.lobby) ? null : undefined },
      {
        AND: locationTypes.includes(defaultLocationTypes.room)
          ? [
            { NOT: [{ bookingId: null }] },
            { bookingId: bookingIdCondition }
          ]
          : undefined
      }
    ],
    status: Number.isInteger(status) ? status : undefined,
    createdDatetime: {
      gte: startDatetime ? startOfDay(new Date(startDatetime)) : undefined,
      lte: endDatetime ? endOfDay(new Date(endDatetime)) : undefined
    }
  }

  const offset = limit * (page - 1)
  const [total, invoices] = await prisma.$transaction([
    prisma.invoice.count({
      where: condition
    }),
    prisma.invoice.findMany({
      skip: offset,
      take: +limit,
      where: condition,
      orderBy: {
        id: 'desc'
      }
    })
  ])

  const bookings =
    customerName || bookingId
      ? matchedBookings
      : await getBookings({
          bookingIds: invoices
            .filter(invoice => !!invoice.bookingId)
            .map(invoice => Number(invoice.bookingId))
        })
  
  const formattedInvoices = invoices.map(invoice => {
    return {
      ...invoice,
      booking: bookings.find(booking => booking.id === invoice.bookingId)
    }
  })

  return { total, invoices: formattedInvoices }
}

async function getBookings(query: InvoiceSearchParameter & { bookingIds?: number[] }) {
  const { bookingId, customerName, bookingIds = [] } = query
  const mergedBookingIds = bookingId ? [...bookingIds, bookingId] : bookingIds

  return prisma.booking.findMany({
    where: {
      id: mergedBookingIds.length ? { in: mergedBookingIds } : undefined,
      OR: customerName
        ? [
          {
            customerName: { contains: customerName }
          },
          {
            customerRepName: { contains: customerName }
          },
          {
            customer: {
              is: {
                OR: [
                  {
                    name: { contains: customerName }
                  },
                  {
                    nameKana: { contains: customerName }
                  }
                ]
              }
            }
          }
          ]
        : undefined
    }
  })
}

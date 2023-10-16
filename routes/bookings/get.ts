import { z } from 'zod'
import { endOfDay, startOfDay, format } from 'date-fns'
import { Request, Response } from 'express'
import { prisma } from '@root/database'
import {
  generatePaginationApiDefinitionParameters,
  BookingSchema,
  PaginationSchema,
  BookingDetailSchema,
  StaffSchema,
  RoomSchema,
  CustomerSchema,
  InvoiceItemSchema
} from '@lib/abo'

const BookingQuerySchema = BookingSchema.pick({
  customerName: true
})
  .extend({
    bookingId: BookingSchema.shape.id,
    status: z.string().optional(),
    startDate: BookingDetailSchema.shape.startDatetime,
    endDate: BookingDetailSchema.shape.endDatetime,
    page: PaginationSchema.shape.page,
    limit: PaginationSchema.shape.limit
  })
  .partial()

type BookingType = z.infer<typeof BookingQuerySchema>
type InvoiceItemType = z.infer<typeof InvoiceItemSchema>

const BookingResponseType = BookingDetailSchema.pick({
  title: true,
  status: true,
  startDatetime: true,
  endDatetime: true,
  createdDatetime: true,
  updatedDatetime: true,
  cancelType: true,
  cancellationFeeDays: true,
  cancelRequesterName: true,
  cancelRequesterTel: true,
  scheduledReplyDate: true,
  cancelDatetime: true,
  cancelStaffId: true,
  cancelPrice: true,
  layoutType: true,
  guestCount: true,
  extraTableCount: true,
  extraChairCount: true,
  layoutLocation: true,
  note: true,
  memo: true,
  isCocktailStyle: true
}).extend({
  bookingDetailId: BookingDetailSchema.shape.id,
  bookingId: BookingSchema.shape.id,
  roomId: RoomSchema.shape.id,
  roomName: RoomSchema.shape.name,
  cancelStaffName: StaffSchema.shape.name,
  customerRepName: BookingSchema.shape.customerRepName,
  customerName: CustomerSchema.shape.name,
  customerNameKana: CustomerSchema.shape.nameKana,
  customerTel: BookingSchema.shape.customerTel,
  customerFax: BookingSchema.shape.customerFax
})

export const apiDefinition = {
  alias: 'getBooking',
  description: 'Get bookings',
  parameters: [
    ...generatePaginationApiDefinitionParameters(),
    {
      name: 'bookingId',
      type: 'Query',
      description: 'Booking Id',
      schema: BookingSchema.shape.id.optional()
    },
    {
      name: 'customerName',
      type: 'Query',
      description: 'Customer name',
      schema: CustomerSchema.shape.name.optional()
    },
    {
      name: 'status',
      type: 'Query',
      description: 'Booking detail status',
      schema: z.string().optional()
    },
    {
      name: 'startDate',
      type: 'Query',
      description: 'Booking detail start date',
      schema: BookingDetailSchema.shape.startDatetime.optional()
    },
    {
      name: 'endDate',
      type: 'Query',
      description: 'Booking detail end date',
      schema: BookingDetailSchema.shape.endDatetime.optional()
    }
  ],
  response: BookingResponseType.array(),
  errorStatuses: [400, 403]
}

export default async (req: Request, res: Response) => {
  const { bookings, total } = await getBookings(req.query)

  res.set('X-Total-Count', `${total}`)
  return res.send(bookings)
}

async function getBookings(params: BookingType) {
  const {
    bookingId,
    status,
    customerName,
    startDate,
    endDate,
    page = 1,
    limit = 10
  } = params
  const offset = limit * (page - 1)
  const queryCustomerName = {
    contains: customerName
  }
  const bookingconditions = {
    is: {
      id: bookingId ? +bookingId : undefined,
      OR: customerName
        ? [
            {
              customer: {
                is: {
                  OR: [
                    {
                      name: queryCustomerName
                    },
                    {
                      nameKana: queryCustomerName
                    }
                  ]
                }
              }
            },
            {
              customerRepName: queryCustomerName
            }
          ]
        : undefined
    }
  }

  const bookingDetailConditions = {
    status: {
      in: status ? status.toString().split(',').map(Number) : undefined
    },
    booking: customerName || bookingId ? bookingconditions : undefined,
    startDatetime: {
      gte: startDate ? startOfDay(new Date(startDate)) : undefined
    },
    endDatetime: {
      lte: endDate ? endOfDay(new Date(endDate)) : undefined
    }
  }

  const [bookingDetails, total] = await prisma.$transaction([
    fetchBookingDetails(bookingDetailConditions, offset, limit),
    getTotal(bookingDetailConditions)
  ])

  const bookings = bookingDetails.map((bookingDetailItem: any) => {
    const {
      id,
      title,
      staff,
      room,
      booking,
      startDatetime,
      endDatetime,
      roomId,
      createdDatetime,
      updatedDatetime,
      status,
      guestCount,
      extraTableCount,
      extraChairCount,
      layoutLocation,
      note,
      memo,
      layoutType,
      isCocktailStyle,
      cancelType,
      cancellationFeeDays,
      cancelRequesterName,
      cancelRequesterTel,
      cancelStaffId,
      scheduledReplyDate,
      cancelDatetime,
      cancelPrice,
      bookingDetailServices,
      invoiceItems
    } = bookingDetailItem
    const { name: roomName } = room
    const cancelStaffName = (cancelStaffId && staff.name) || null
    const { id: bookingId, customerRepName, customerTel, customerFax } = booking
    const { name: customerName, nameKana: customerNameKana } = booking.customer

    const invoices = [
      ...invoiceItems
        .filter((invoiceItem: InvoiceItemType) => !!invoiceItem.invoiceId)
        .map((invoiceItem: any) => invoiceItem.invoice)
    ]

    const today = format(new Date(), 'yyyy-MM-dd')
    const isPastInvoice = invoices.some(
      invoice => today !== format(invoice.paymentDate, 'yyyy-MM-dd')
    )

    return {
      title,
      bookingDetailId: id,
      bookingId,
      roomId,
      roomName,
      status,
      startDatetime,
      endDatetime,
      createdDatetime,
      updatedDatetime,
      customerRepName,
      customerName,
      customerNameKana,
      customerTel,
      customerFax,
      cancelType,
      cancellationFeeDays,
      cancelRequesterName,
      cancelRequesterTel,
      scheduledReplyDate,
      cancelDatetime,
      cancelStaffId,
      cancelStaffName,
      cancelPrice,
      guestCount,
      extraTableCount,
      extraChairCount,
      layoutLocation,
      note,
      memo,
      isCocktailStyle,
      layoutType,
      bookingDetailServices,
      hasInvoiceItem: !!invoiceItems.length,
      isPastInvoice,
      invoiceIds: invoices
        .filter(
          (invoice, index, self) =>
            index === self.findIndex(item => item.id === invoice.id)
        )
        .sort((invoice, invoiceAfter) => invoice.id - invoiceAfter.id)
        .map(invoice => invoice.id)
    }
  })

  return { bookings, total }
}

function fetchBookingDetails(
  bookingDetailConditions: any,
  offset: Number,
  limit: Number
) {
  return prisma.bookingDetail.findMany({
    include: {
      booking: {
        include: {
          customer: true
        }
      },
      staff: true,
      room: true,
      bookingDetailServices: {
        include: { service: true }
      },
      invoiceItems: {
        include: {
          invoice: true
        }
      }
    },
    where: bookingDetailConditions,
    skip: +offset,
    take: +limit,
    orderBy: [{ startDatetime: 'asc' }, { id: 'desc' }]
  })
}

function getTotal(condition: any) {
  return prisma.bookingDetail.count({
    where: condition
  })
}

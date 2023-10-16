import { z } from 'zod'
import { Request, Response } from 'express'
import { prisma } from '@root/database'
import {
  BookingDetailSchema,
  BookingSchema,
  StaffSchema,
  RoomSchema,
  CustomerSchema
} from '@lib/abo'

export const apiDefinition = {
  alias: 'getBookingDetails',
  description: 'Get detail of booking-id',
  parameters: [
    {
      name: 'id',
      type: 'Path',
      description: 'bookingId',
      schema: BookingSchema.shape.id
    },
    {
      name: 'includeBookingDetail',
      type: 'Query',
      description: 'includeBookingDetail',
      schema: z.boolean().optional()
    }
  ],
  response: BookingSchema.extend({
    bookingDetails: BookingDetailSchema.extend({ room: RoomSchema }).array(),
    staff: StaffSchema,
    customer: CustomerSchema
  }),
  errorStatuses: [400, 404]
}

type QueryType = {
  includeBookingDetail?: boolean
}

export default async (req: Request, res: Response) => {
  const { id } = req.params
  const booking = await getBooking(+id, req.query)
  if (!booking) return res.sendStatus(404)

  return res.send(booking)
}

function getBooking(bookingId: number, query: QueryType) {
  const { includeBookingDetail } = query
  return prisma.booking.findFirst({
    include: {
      bookingDetails: includeBookingDetail
        ? {
            include: {
              room: true
            }
          }
        : false,
      customer: true,
      createdStaff: true,
      updatedStaff: true
    },
    where: {
      id: bookingId
    }
  })
}

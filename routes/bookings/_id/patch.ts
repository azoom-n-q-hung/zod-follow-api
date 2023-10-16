import { z } from 'zod'
import { Request, Response } from 'express'
import { ResponseSchemas } from '@azoom/api-definition-util'
import { prisma } from '@root/database'
import { BookingSchema } from '@lib/abo'

const BookingBodySchema = BookingSchema.omit({
  id: true,
  createdStaffId: true,
  createdDatetime: true,
  updatedDatetime: true,
  customerId: true,
}).partial()

export const apiDefinition = {
  alias: 'editBooking',
  description: 'edit booking',
  parameters: [
    {
      name: 'id',
      type: 'Path',
      description: 'booking-id',
      schema: BookingSchema.shape.id
    },
    {
      name: 'booking',
      type: 'Body',
      description: 'booking data',
      schema: BookingBodySchema
    }
  ],
  response: ResponseSchemas[200].schema,
  errorStatuses: [400, 404]
}

type BookingType = z.infer<typeof BookingBodySchema>

export default async (req: Request, res: Response) => {
  const { id } = req.params
  const booking: BookingType = req.body  

  const isExistedBooking = await getBooking(+id)
  if (!isExistedBooking) return res.sendStatus(404)

  await updateBooking(+id, booking)

  return res.sendStatus(200)
}

function getBooking(bookingId: number) {
  return prisma.booking.findFirst({
    where: {
      id: bookingId
    }
  })
}

function updateBooking(bookingId: number, booking: BookingType) {
  return prisma.booking.update({
    where: {
      id: bookingId
    },
    data: booking
  })
}

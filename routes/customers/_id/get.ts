import z from 'zod'
import { isAfter } from 'date-fns'
import { Request, Response } from 'express'
import { prisma } from '@root/database'
import { CustomerSchema, BookingSchema, BookingDetailSchema } from '@lib/abo'

const Booking = BookingSchema.extend({
  bookingDetails: BookingDetailSchema.array()
}).array()
const Customer = CustomerSchema.extend({ bookings: Booking })
type CustomerType = z.infer<typeof Customer>

export const apiDefinition = {
  alias: 'getCustomer',
  description: 'Get customer',
  parameters: [
    {
      name: 'id',
      type: 'Path',
      description: 'Customer Id',
      schema: CustomerSchema.shape.id
    }
  ],
  response: Customer,
  errorStatuses: [400, 403, 404]
}

export default async (req: Request, res: Response) => {
  const { id } = req.params

  const customer = await prisma.customer.findFirst({
    where: { id: +id },
    include: {
      bookings: {
        include: {
          bookingDetails: {
            orderBy: {
              startDatetime: 'desc'
            },
            take: 1
          }
        }
      }
    }
  })
  if (!customer) return res.sendStatus(404)
  // @ts-ignore
  return res.send(formatCustomer(customer))
}

function formatCustomer(customer: CustomerType) {
  const recentUsedDate = customer.bookings.reduce((date: any, booking: any) => {
    const startDate = booking.bookingDetails[0]?.startDatetime
    if (!date) return startDate

    return isAfter(date, startDate) ? date : startDate
  }, null)

  return { ...customer, recentUsedDate }
}

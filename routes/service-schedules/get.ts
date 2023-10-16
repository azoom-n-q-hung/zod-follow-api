import { Request, Response } from 'express'
import { startOfDay, endOfDay } from 'date-fns'
import { prisma } from '@root/database.js'
import { locationTypes } from '@constants/service'
import { bookingDetailStatuses } from '@constants/booking'
import {
  BookingDetailSchema,
  BookingDetailServiceSchema,
  BookingSchema,
  RoomSchema,
  ServiceSchema,
  BookingScheduleSchema
} from '@lib/abo'

const ServiceScheduleSchema1 = BookingDetailServiceSchema.pick({
  serviceId: true
})
  .extend({
    serviceUsageCount: BookingDetailServiceSchema.shape.usageCount,
    servicePrice: BookingDetailServiceSchema.shape.price,
    bookingDetailServiceId: BookingDetailServiceSchema.shape.id,
    roomName: RoomSchema.shape.name
  })
  .merge(BookingDetailSchema)
  .merge(BookingSchema)

const ServiceScheduleSchema = ServiceSchema.extend({
  bookingDetails: ServiceScheduleSchema1
})

export const apiDefinition = {
  alias: 'getServiceSchedules',
  description: 'Get service schedules',
  parameters: [
    {
      name: 'date',
      type: 'Query',
      description: 'Date',
      schema: BookingScheduleSchema.shape.date
    }
  ],
  response: ServiceScheduleSchema.array(),
  errorStatuses: [400, 403]
}

export default async (req: Request, res: Response) => {
  const date = req.query.date as string

  const serviceSchedules = await getServiceSchedules(date)

  return res.send(serviceSchedules)
}

async function getServiceSchedules(date: string) {
  const dateTime = new Date(date)
  const bookingDetailHideStatues = [
    bookingDetailStatuses.canceled,
    bookingDetailStatuses.waitingCancel
  ]
  const bookingDetailConditions = {
    startDatetime: {
      gte: startOfDay(dateTime)
    },
    endDatetime: {
      lte: endOfDay(dateTime)
    },
    status: {
      notIn: bookingDetailHideStatues
    }
  }

  const serviceConditions = {
    locationType: locationTypes.meetingRoom,
    hasStockManagement: true,
    isEnabled: true
  }

  const services = await prisma.service.findMany({
    select: {
      id: true,
      name: true,
      type: true,
      itemType: true,
      bookingDetailServices: {
        select: {
          id: true,
          bookingDetailId: true,
          serviceId: true,
          price: true,
          usageCount: true,
          bookingDetail: {
            include: {
              booking: {
                include: {
                  customer: true
                }
              },
              room: true
            }
          }
        },
        where: {
          bookingDetail: {
            is: bookingDetailConditions
          }
        }
      }
    },
    where: serviceConditions
  })

  return formatServices(services)
}

function formatServices(services: any) {
  return services.map((service: any) => {
    const bookingDetailsFormatted = service.bookingDetailServices.map(
      (bookingDetailService: any) => {
        const { bookingDetail } = bookingDetailService
        const { booking, room } = bookingDetail

        delete bookingDetail.booking
        delete bookingDetail.room
        delete booking.id

        return {
          ...bookingDetail,
          roomName: room.name,
          serviceId: bookingDetailService.serviceId,
          serviceUsageCount: bookingDetailService.usageCount,
          servicePrice: +bookingDetailService.price,
          bookingDetailServiceId: bookingDetailService.id,
          ...booking,
        }
      }
    )
    delete service.bookingDetailServices

    return {
      ...service,
      bookingDetails: bookingDetailsFormatted
    }
  })
}

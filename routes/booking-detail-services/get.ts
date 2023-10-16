import { z } from 'zod'
import { Request, Response } from 'express'
import { startOfDay, endOfDay, addMinutes, subMinutes } from 'date-fns'
import { prisma } from '@root/database'
import { locationTypes, types, servicesCategories } from '@constants/service'
import { bookingDetailStatuses } from '@constants/booking'
import {
  generatePaginationApiDefinitionParameters,
  ServiceSchema,
  CustomerSchema,
  BookingDetailSchema,
  ServiceOptionalDefaultsWithRelations
} from '@lib/abo'
const bufferTime = 30

const ServiceAvailableSchema = ServiceSchema.omit({
  isEnabled: true,
  subtotalType: true,
  startDate: true,
  createdDatetime: true,
  updatedDatetime: true
})
  .extend({
    stockAvailable: ServiceSchema.shape.stockCount
  })
  .partial()

type ServiceAvailableType = z.infer<typeof ServiceAvailableSchema>

export const apiDefinition = {
  alias: 'getBookingDetailServices',
  description: 'Get available services for booking-detail',
  parameters: [
    ...generatePaginationApiDefinitionParameters(),
    {
      name: 'customerId',
      type: 'Query',
      description: 'customer ID',
      schema: CustomerSchema.shape.id
    },
    {
      name: 'startDatetime',
      type: 'Query',
      description: 'startDatetime of booking-detail',
      schema: BookingDetailSchema.shape.startDatetime
    },
    {
      name: 'endDatetime',
      type: 'Query',
      description: 'endDatetime of booking-detail',
      schema: BookingDetailSchema.shape.endDatetime
    },
    {
      name: 'serviceType',
      type: 'Query',
      description: 'service-type',
      schema: z.string().optional().nullable()
    },
    {
      name: 'itemType',
      type: 'Query',
      description: 'item-type',
      schema: z.string().optional().nullable()
    },
    {
      name: 'currentBookingDetailId',
      type: 'Query',
      description: 'current ID of booking-detail',
      schema: BookingDetailSchema.shape.id.nullable().optional()
    },
    {
      name: 'serviceIds',
      type: 'Query',
      description: 'serviceIds',
      schema: z.string().nullable().optional()
    },
  ],
  response: ServiceAvailableSchema,
  errorStatuses: [400]
}

export default async (req: Request, res: Response) => {
  const isValid = validateQueries(req.query)
  if (!isValid) return res.sendStatus(400)

  const services = await getServices(req.query)

  return res.send(services)
}

function validateQueries(query: any) {
  const {
    customerId,
    startDatetime,
    endDatetime,
    serviceType = null,
    itemType = null
  } = query

  if (
    !customerId ||
    !startDatetime ||
    !endDatetime ||
    (serviceType && !Object.values(types).includes(+serviceType))
  )
    return false

  return true
}

async function getServices(query: any): Promise<ServiceAvailableType[]> {
  const {
    customerId,
    startDatetime,
    endDatetime,
    serviceType,
    serviceIds,
    itemType,
    currentBookingDetailId
  } = query

  const currentDate = new Date(startDatetime)
  const bookingDetailConditions = {
    startDatetime: {
      gte: startOfDay(currentDate)
    },
    endDatetime: {
      lte: endOfDay(currentDate)
    },
    status: {
      in: [
        bookingDetailStatuses.official,
        bookingDetailStatuses.temporary,
        bookingDetailStatuses.checkIn
      ]
    }
  }

  let itemTypeCondition = undefined
  if (Number(itemType) === 0) {
    itemTypeCondition = null
  }
  if (Number(itemType) > 0) {
    itemTypeCondition = Number(itemType)
  }
  const serviceConditions = {
    isEnabled: true,
    locationType: locationTypes.meetingRoom,
    type: serviceType ? +serviceType : undefined,
    id: serviceIds ? { in: serviceIds.split(',').map(Number) } : undefined,
    itemType: itemTypeCondition
  }

  const services = await prisma.service.findMany({
    include: {
      bookingDetailServices: {
        select: {
          id: true,
          bookingDetailId: true,
          serviceId: true,
          usageCount: true,
          bookingDetail: {
            include: {
              booking: true
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

  return formatServices({
    services,
    customerId,
    startDatetime,
    endDatetime,
    currentBookingDetailId
  })
}

function formatServices({
  services,
  customerId,
  startDatetime,
  endDatetime,
  currentBookingDetailId
}: any): ServiceAvailableType[] {
  const startTime = new Date(startDatetime)
  const endTime = new Date(endDatetime)
  return services.map((service: ServiceOptionalDefaultsWithRelations) => {
    const {
      id,
      name,
      type,
      itemType,
      stockCount,
      unitPrice,
      locationType,
      hasStockManagement,
      bookingDetailServices
    } = service

    const usedServices = filterUsedServices({
      customerId,
      startTime,
      endTime,
      bookingDetailServices,
      currentBookingDetailId
    })

    const usedServiceCount = usedServices.reduce(
      (total: number, service: any) => total + service.usageCount,
      0
    )
    const stockAvailable =
      hasStockManagement && stockCount && stockCount > 0
        ? stockCount - usedServiceCount
        : stockCount

    return {
      id,
      name,
      type,
      itemType,
      stockCount,
      unitPrice: Number(unitPrice),
      locationType,
      stockAvailable: stockAvailable && stockAvailable > 0 ? stockAvailable : 0,
      hasStockManagement
    }
  })
}

function filterUsedServices({
  customerId,
  startTime,
  endTime,
  bookingDetailServices,
  currentBookingDetailId
}: any): ServiceAvailableType[] {
  return bookingDetailServices.filter(({ bookingDetail }: any) => {
    const bookingCustomerId = bookingDetail.booking.customerId
    const isMatchCustomer = bookingCustomerId === +customerId

    if (
      currentBookingDetailId &&
      bookingDetail.id === Number(currentBookingDetailId)
    )
      return false

    const bookingStartTime = isMatchCustomer
      ? new Date(bookingDetail.startDatetime)
      : subMinutes(new Date(bookingDetail.startDatetime), bufferTime)
    const bookingEndTime = isMatchCustomer
      ? new Date(bookingDetail.endDatetime)
      : addMinutes(new Date(bookingDetail.endDatetime), bufferTime)

    return (
      (startTime >= bookingStartTime && startTime < bookingEndTime) ||
      (endTime > bookingStartTime && endTime <= bookingEndTime) ||
      (startTime <= bookingStartTime && endTime >= bookingEndTime)
    )
  })
}

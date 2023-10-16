import { Request, Response } from 'express'
import { z } from 'zod'
import { format, subDays } from 'date-fns'
import { ResponseSchemas } from '@azoom/api-definition-util'
import { prisma } from '@root/database'
import {
  types,
  subtotalTypes,
  locationTypes,
  servicesCategories
} from '@constants/service'
import { ServiceSchema } from '@lib/abo'

const Service = ServiceSchema.omit({
  id: true,
  startDate: true,
  createdDatetime: true,
  updatedDatetime: true
})
type ServiceType = z.infer<typeof Service>

export const apiDefinition = {
  alias: 'updateService',
  description: 'Update service',
  parameters: [
    {
      name: 'id',
      type: 'Path',
      description: 'Service Id',
      schema: ServiceSchema.shape.id
    },
    {
      name: 'service',
      type: 'Body',
      description: `Service`,
      schema: Service
    }
  ],
  response: ResponseSchemas[200].schema,
  errorStatuses: [400, 403, 404]
}

export default async (req: Request, res: Response) => {
  const { id } = req.params
  if (!validateService(req.body)) return res.sendStatus(400)
  const currentService = await getService(+id)
  if (!currentService) return res.sendStatus(404)

  const { hasStockManagement, stockCount, unitPrice } = req.body
  const startDate = currentService.startDate ? format(new Date(currentService.startDate), 'yyyy-MM-dd') : ''
  const currentDate = format(new Date(), 'yyyy-MM-dd')
  const isChangeUnitPrice = unitPrice >= 0
    && currentService.unitPrice != unitPrice
    && !!startDate
    && startDate < currentDate

  if (isChangeUnitPrice) {
    const newServiceCharge = {
      serviceId: currentService.id,
      unitPrice: currentService.unitPrice,
      startDate: currentService.startDate || new Date(),
      endDate: subDays(new Date(), 1)
    }

    await prisma.serviceCharge.create({ data: newServiceCharge })
  }

  const service = {
    ...req.body,
    startDate: isChangeUnitPrice ? new Date() : currentService.startDate,
    hasStockManagement: !!hasStockManagement,
    stockCount: !!hasStockManagement && stockCount >= 0 ? stockCount : null
  }
  await updateService(+id, service)

  return res.sendStatus(200)
}

function validateService(service: ServiceType) {
  const { type, subtotalType, locationType, itemType } = service

  if (
    !Object.values(types).includes(type) ||
    !Object.values(subtotalTypes).includes(subtotalType) ||
    !Object.values(locationTypes).includes(locationType) ||
    (itemType && !Object.values(servicesCategories).includes(itemType))
  ) {
    return false
  }

  return true
}

function getService(id: number) {
  return prisma.service.findFirst({
    where: { id }
  })
}

function updateService(id: number, service: ServiceType) {
  return prisma.service.update({
    where: { id },
    data: service
  })
}

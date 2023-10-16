import { z } from 'zod'
import { Request, Response } from 'express'
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
  isEnabled: true,
  startDate: true,
  createdDatetime: true,
  updatedDatetime: true
})

type ServiceType = z.infer<typeof Service>

export const apiDefinition = {
  alias: 'createService',
  description: 'Create service',
  parameters: [
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
  if (!isValidService(req.body)) return res.sendStatus(400)

  const { hasStockManagement, stockCount } = req.body
  const service = {
    ...req.body,
    startDate: new Date(),
    hasStockManagement: !!hasStockManagement,
    stockCount: !!hasStockManagement && stockCount ? stockCount : null
  }
  await createService(service)

  return res.sendStatus(200)
}

function isValidService(service: ServiceType) {
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

function createService(service: ServiceType) {
  return prisma.service.create({
    data: service
  })
}

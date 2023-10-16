import { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '@root/database'
import {
  generatePaginationApiDefinitionParameters,
  PaginationSchema,
  ServiceSchema
} from '@lib/abo'

export const apiDefinition = {
  alias: 'getServices',
  description: 'Get services',
  parameters: [
    ...generatePaginationApiDefinitionParameters(),
    {
      name: 'id',
      type: 'Query',
      description: 'Service Id',
      schema: ServiceSchema.shape.id.optional()
    },
    {
      name: 'name',
      type: 'Query',
      description: 'Service name',
      schema: ServiceSchema.shape.name.optional()
    },
    {
      name: 'type',
      type: 'Query',
      description: 'Service type',
      schema: ServiceSchema.shape.type.optional()
    },
    {
      name: 'locationTYpe',
      type: 'Query',
      description: 'Service location type',
      schema: z.string().optional()
    }
  ],
  response: ServiceSchema.array(),
  errorStatuses: [400, 403]
}

const ServiceQuerySchema = ServiceSchema.pick({
  id: true,
  name: true,
  type: true,
  locationType: true
})
  .extend({
    page: PaginationSchema.shape.page,
    limit: PaginationSchema.shape.limit
  })
  .partial()

export default async (req: Request, res: Response) => {
  const { total, services } = await getServices(req.query)

  res.set('X-Total-Count', `${total}`)
  return res.send(services)
}

async function getServices(query: any) {
  const {
    id,
    name,
    type,
    page = 1,
    limit = 50,
    locationType
  } = query
  const offset = limit * (page - 1)
  const condition = {
    id: id ? Number(id) : undefined,
    name: { contains: name },
    type: type ? Number(type) : undefined,
    locationType: locationType
      ? { in: locationType.split(',').map(Number) }
      : undefined
  }

  const [total, services] = await prisma.$transaction([
    prisma.service.count({
      where: condition
    }),
    prisma.service.findMany({
      skip: offset,
      take: +limit,
      where: condition,
      orderBy: {
        id: 'desc'
      }
    })
  ])

  return { total, services }
}

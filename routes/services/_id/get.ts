import { Request, Response } from 'express'
import { prisma } from '@root/database'
import { ServiceSchema } from '@lib/abo'

export const apiDefinition = {
  alias: 'getService',
  description: 'Get service',
  parameters: [
    {
      name: 'id',
      type: 'Path',
      description: 'Service Id',
      schema: ServiceSchema.shape.id
    }
  ],
  response: ServiceSchema,
  errorStatuses: [400, 403, 404]
}

export default async (req: Request, res: Response) => {
  const { id } = req.params
  if (!id) return res.sendStatus(400)

  const service = await prisma.service.findFirst({
    where: { id: +id },
    include: { serviceCharges: true }
  })
  if (!service) return res.sendStatus(404)

  return res.send(service)
}

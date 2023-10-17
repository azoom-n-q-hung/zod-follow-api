import { Request, Response } from 'express'
import { ResponseSchemas } from '@azoom/api-definition-util'
import { prisma } from '@root/database'
import { CustomerSchema } from '@lib/zod-follow'

export const apiDefinition = {
  alias: 'createCustomer',
  description: 'Create customer',
  parameters: [
    {
      name: 'customer',
      type: 'Body',
      description: 'Customer',
      schema: CustomerSchema.omit({
        id: true,
        isEnabled: true,
        createdDatetime: true,
        updatedDatetime: true
      })
    }
  ],
  response: ResponseSchemas[200].schema,
  errorStatuses: [400, 403, 404]
}

export default async (req: Request, res: Response) => {
  const customer = req.body

  await prisma.customer.create({
    data: customer
  })

  return res.sendStatus(200)
}

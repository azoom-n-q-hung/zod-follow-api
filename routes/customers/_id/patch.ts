import z from 'zod'
import { Request, Response } from 'express'
import { ResponseSchemas } from '@azoom/api-definition-util'
import { prisma } from '@root/database'
import { CustomerSchema } from '@lib/abo'

const Customer = CustomerSchema.omit({
  id: true,
  isEnabled: true,
  createdDatetime: true,
  updatedDatetime: true
})

export const apiDefinition = {
  alias: 'updateCustomer',
  description: 'Update customer',
  parameters: [
    {
      name: 'id',
      type: 'Path',
      description: 'Customer Id',
      schema: CustomerSchema.shape.id
    },
    {
      name: 'customer',
      type: 'Body',
      description: 'Customer',
      schema: Customer
    }
  ],
  response: ResponseSchemas[200].schema,
  errorStatuses: [400, 403, 404]
}

export default async (req: Request, res: Response) => {
  const customerId = +req.params.id
  const customer = await getCustomer(customerId)
  if (!customer) return res.sendStatus(404)
  await updateCustomer(customerId, req.body)

  return res.sendStatus(200)
}

function getCustomer(customerId: number) {
  return prisma.customer.findFirst({
    where: {
      id: customerId
    }
  })
}

function updateCustomer(customerId: number, customer: z.infer<typeof Customer>) {
  return prisma.customer.update({
    where: { id: customerId },
    data: customer
  })
}

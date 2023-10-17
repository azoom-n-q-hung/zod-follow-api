import { Request, Response } from 'express'
import { ResponseSchemas } from '@azoom/api-definition-util'
import { prisma } from '@root/database'
import { ProductSchema } from '@lib/zod-follow'

export const apiDefinition = {
  alias: 'createProduct',
  description: 'Create product',
  parameters: [
    {
      name: 'product',
      type: 'Body',
      description: 'Product',
      schema: ProductSchema.omit({
        id: true,
        createdDatetime: true,
        updatedDatetime: true
      })
    }
  ],
  response: ResponseSchemas[200].schema,
  errorStatuses: [400, 403, 404]
}

export default async (req: Request, res: Response) => {
  const product = req.body

  await prisma.product.create({
    data: product
  })

  return res.sendStatus(200)
}

import { Request, Response } from 'express'
import { prisma } from '@root/database'
import { StaffSchema, SortSchema } from '@lib/abo'

export const apiDefinition = {
  alias: 'getStaffs',
  description: 'Get staffs',
  parameters: [
    {
      name: 'orderBy',
      type: 'Query',
      description: 'Order by',
      schema: SortSchema.shape.orderBy.optional()
    }
  ],
  response: StaffSchema.array(),
  errorStatuses: [403]
}

export default async (req: Request, res: Response) => {
  const { orderBy = 1 } = req.query
  const staffs = await prisma.staff.findMany({
    orderBy: { id: +orderBy === 4 ? 'asc' : 'desc' }
  })

  return res.send(staffs)
}

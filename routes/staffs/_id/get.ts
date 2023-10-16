import { Request, Response } from 'express'
import { prisma } from '@root/database'
import { StaffSchema } from '@lib/abo'

export const apiDefinition = {
  alias: 'getStaff',
  description: 'Get staff',
  parameters: [
    {
      name: 'id',
      type: 'Path',
      description: 'Staff Id',
      schema: StaffSchema.shape.id
    }
  ],
  response: StaffSchema,
  errorStatuses: [400, 403, 404]
}

export default async (req: Request, res: Response) => {
  const { id } = req.params
  const staff = await prisma.staff.findFirst({
    where: { id: +id }
  })

  if (!staff) return res.sendStatus(404)

  return res.send(staff)
}

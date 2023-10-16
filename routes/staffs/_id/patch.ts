import { Request, Response } from 'express'
import { ResponseSchemas } from '@azoom/api-definition-util'
import { prisma } from '@root/database'
import { StaffSchema } from '@lib/abo'

export const apiDefinition = {
  alias: 'updateStaff',
  description: 'Update staff',
  parameters: [
    {
      name: 'id',
      type: 'Path',
      description: 'Staff Id',
      schema: StaffSchema.shape.id
    },
    {
      name: 'staff',
      type: 'Body',
      description: `Staff`,
      schema: StaffSchema.omit({
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
  const { id } = req.params
  const staffInfo = req.body

  const staff = await prisma.staff.findFirst({ where: { id: +id } })
  if (!staff) return res.sendStatus(404)

  await prisma.staff.update({
    data: staffInfo,
    where: { id: +id }
  })

  return res.sendStatus(200)
}

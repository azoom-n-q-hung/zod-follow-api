import { Request, Response } from 'express'
import { ResponseSchemas } from '@azoom/api-definition-util'
import { prisma } from '@root/database'
import { StaffSchema } from '@lib/abo'

export const apiDefinition = {
  alias: 'createStaff',
  description: 'Create staff',
  parameters: [
    {
      name: 'staff',
      type: 'Body',
      description: `Staff`,
      schema: StaffSchema.omit({
        id: true,
        isEnabled: true,
        createdDatetime: true,
        updatedDatetime: true
      })
    }
  ],
  response: ResponseSchemas[200].schema,
  errorStatuses: [400, 403]
}

export default async (req: Request, res: Response) => {
  const staffInfo = req.body

  await prisma.staff.create({ data: staffInfo })

  return res.sendStatus(200)
}

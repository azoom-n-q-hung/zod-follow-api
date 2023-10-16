import z from 'zod'
import { Request, Response } from 'express'
import { ResponseSchemas } from '@azoom/api-definition-util'
import { prisma } from '@root/database'
import { HolidaySchema } from '@lib/abo'

export const apiDefinition = {
  alias: 'deleteHolidays',
  description: 'Delete holidays',
  parameters: [
    {
      name: 'ids',
      type: 'Body',
      description: 'Holiday Ids',
      schema: z.object({ ids: HolidaySchema.shape.id.array() })
    }
  ],
  response: ResponseSchemas[200].schema,
  errorStatuses: [400, 403]
}

export default async (req: Request, res: Response) => {
  const { ids } = req.body

  if (!(await checkExistedHoliday(ids))) return res.sendStatus(400)
  await deleteHolidays(ids)

  return res.sendStatus(200)
}

async function checkExistedHoliday(holidayIds: number[]) {
  const holidays = await prisma.holiday.findMany({
    where: {
      id: {
        in: holidayIds
      }
    }
  })

  return holidays.length === holidayIds.length
}

function deleteHolidays(holidayIds: number[]) {
  return prisma.holiday.deleteMany({
    where: {
      id: {
        in: holidayIds
      }
    }
  })
}

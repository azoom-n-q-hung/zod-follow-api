import { z } from 'zod'
import { Request, Response } from 'express'
import { prisma } from '@root/database'
import { HolidaySchema } from '@lib/abo'

export const apiDefinition = {
  alias: 'checkHolidays',
  description: 'Check holidays',
  parameters: [
    {
      name: 'date',
      type: 'Query',
      description: 'date',
      schema: z.string()
    }
  ],
  response: z.object({
    isHoliday: z.boolean()
  }),
  errorStatuses: [400]
}

export default async (req: Request, res: Response) => {
  const date = req.query.date as string
  if (!date) return res.sendStatus(400)

  const isHoliday = await getIsHoliday(date)

  return res.send(isHoliday)
}

async function getIsHoliday(date: string) {
  const holiday = await prisma.holiday.findFirst({
    where: {
      date: { equals: new Date(date) }
    }
  })

  return !!holiday
}

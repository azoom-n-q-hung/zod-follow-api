import { Request, Response } from 'express'
import { format } from 'date-fns'
import { prisma } from '@root/database'
import { HolidaySchema } from '@lib/abo'

export const apiDefinition = {
  alias: 'getHolidays',
  description: 'Get holidays',
  response: HolidaySchema.array(),
  errorStatuses: [403]
}

export default async (req: Request, res: Response) => {
  const holidays = await getHolidays()

  return res.send(holidays)
}

async function getHolidays() {
  const holidays = await prisma.holiday.findMany({
    where: {
      date: { gte: new Date() }
    },
    orderBy: {
      date: 'asc'
    }
  })

  return holidays.map(holiday => ({
    ...holiday,
    date: format(holiday.date, 'yyyy-MM-dd')
  }))
}

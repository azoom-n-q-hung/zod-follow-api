import z from 'zod'
import { format as formatDate } from 'date-fns'
import { Request, Response } from 'express'
import { ResponseSchemas } from '@azoom/api-definition-util'
import { prisma } from '@root/database'
import { HolidaySchema } from '@lib/abo'

const Holiday = HolidaySchema.omit({
  id: true,
  createdDatetime: true,
  updatedDatetime: true
}).array()
type HolidayType = z.infer<typeof Holiday>

export const apiDefinition = {
  alias: 'createHoliday',
  description: 'Create holiday',
  parameters: [
    {
      name: 'holiday',
      type: 'Body',
      description: 'Holiday',
      schema: z.object({ holidays: Holiday })
    }
  ],
  response: ResponseSchemas[200].schema,
  errorStatuses: [400, 403]
}

export default async (req: Request, res: Response) => {
  const { holidays } = req.body

  if (!holidays.length) return res.sendStatus(400)
  const existHoliday = await checkExistedHoliday(holidays)
  if (existHoliday) {
    const formattedExistHoliday = formatDate(
      existHoliday.date,
      'yyyy年MM月dd日'
    )
    return res.status(400).send({
      errorMessage: `${formattedExistHoliday}は、既に登録されていましたので、再度ご確認してください。`
    })
  }

  await createHolidays(holidays)

  return res.sendStatus(200)
}

async function checkExistedHoliday(holidays: HolidayType) {
  const dates = holidays.map(({ date }) => new Date(date))
  const holiday = await prisma.holiday.findFirst({
    where: {
      date: {
        in: dates
      }
    }
  })

  return holiday
}

function createHolidays(holidays: HolidayType) {
  const createdHolidays = holidays.map(({ date }) => ({ date: new Date(date) }))

  return prisma.holiday.createMany({
    data: createdHolidays
  })
}

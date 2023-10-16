import { z } from 'zod'
import { Request, Response } from 'express'
import { format } from 'date-fns'
import { ResponseSchemas } from '@azoom/api-definition-util'
import { prisma } from '@root/database'
import { bookingDetailStatuses } from '@constants/booking'
import { BookingDetailSchema } from '@lib/abo'

const ExtendBookingDetailSchema = BookingDetailSchema.pick({
  roomId: true,
  startDatetime: true,
  endDatetime: true,
  status: true
}).extend({
  id: z.number().optional(),
  title: z.string().nullable().optional(),
  scheduledReplyDate: z.string().optional(),
  bookingId: z.number().optional(),
  memo: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  cancelType: z.number().nullable().optional(),
  guestCount: z.number().nullable().optional(),
  extraChairCount: z.number().nullable().optional(),
  extraTableCount: z.number().nullable().optional(),
  layoutType: z.number().nullable().optional(),
  layoutLocation: z.string().nullable().optional(),
  isCocktailStyle: z.boolean().nullable().optional(),
  cancellationFeeDays: z.number().nullable().optional()
})
type BookingDetailType = z.infer<typeof ExtendBookingDetailSchema>

export const apiDefinition = {
  alias: 'validateBookingDetail',
  description: 'cancel booking-detail',
  parameters: [
    {
      name: 'booking-detail',
      type: 'Body',
      description: 'booking-detail',
      schema: ExtendBookingDetailSchema
    }
  ],
  response: ResponseSchemas[200].schema,
  errorStatuses: [400]
}

export default async (req: Request, res: Response) => {
  const bookingDetail = req.body

  const existedRoom = await checkExistedRoom(bookingDetail)
  if (!existedRoom) return res.sendStatus(400)

  const existedRoomCharge = await checkExistedRoomCharge(bookingDetail)
  if (!existedRoomCharge) {
    return res.status(400).send({
      errorMessage: '指定した会議室が、各種料金をまだ設定されません。'
    })
  }

  const existedHoliday = await checkExistedHoliday(bookingDetail)
  if (existedHoliday) {
    return res.status(400).send({ errorMessage: '指定した日が休業日である。' })
  }
  const existedBooking = await checkExistedBooking(bookingDetail)
  if (existedBooking) {
    return res.status(400).send({
      errorMessage: '予約登録ができませんでした。設定条件などご確認ください。'
    })
  }

  return res.sendStatus(200)
}

async function checkExistedRoom(bookingDetail: BookingDetailType) {
  const rooms = await prisma.room.findFirst({
    where: {
      id: bookingDetail.roomId
    }
  })

  return !!rooms
}

async function checkExistedRoomCharge(bookingDetail: BookingDetailType) {
  const today = new Date(format(new Date(), 'yyyy-MM-dd'))
  const roomCharge = await prisma.roomCharge.findFirst({
    where: {
      roomId: bookingDetail.roomId,
      startDate: {
        lte: today
      },
      OR: [{ endDate: { gte: today } }, { endDate: null }]
    },
    orderBy: {
      startDate: 'desc'
    }
  })

  return !!roomCharge
}

async function checkExistedHoliday(bookingDetail: BookingDetailType) {
  const startDate = new Date(
    format(new Date(bookingDetail.startDatetime), 'yyyy-MM-dd')
  )
  const endDate = new Date(
    format(new Date(bookingDetail.endDatetime), 'yyyy-MM-dd')
  )
  const holiday = await prisma.holiday.findFirst({
    where: {
      date: {
        gte: startDate,
        lte: endDate
      }
    }
  })

  return !!holiday
}

async function checkExistedBooking({
  id: bookingDetailId,
  roomId,
  startDatetime,
  endDatetime,
  status
}: any) {
  if (status === bookingDetailStatuses.waitingCancel) return false

  const targetRoomIds = getTargetedRoomIds(roomId)

  const booking = await prisma.bookingDetail.findFirst({
    where: {
      roomId: {
        in: targetRoomIds
      },
      cancelDatetime: null,
      NOT: [
        { id: bookingDetailId ? bookingDetailId : undefined },
        {
          status: {
            in: [
              bookingDetailStatuses.waitingCancel,
              bookingDetailStatuses.canceled
            ]
          }
        }
      ],
      OR: [
        {
          startDatetime: {
            gt: new Date(startDatetime),
            lt: new Date(endDatetime)
          }
        },
        {
          endDatetime: {
            gt: new Date(startDatetime),
            lt: new Date(endDatetime)
          }
        },
        {
          AND: [
            {
              startDatetime: { lte: new Date(startDatetime) }
            },
            {
              endDatetime: { gte: new Date(endDatetime) }
            }
          ]
        }
      ]
    }
  })

  return !!booking
}

function getTargetedRoomIds(roomId: number) {
  const roomSetId = Number(process.env.ROOM_SET_ID)
  const roomInSetIds = process.env
    .ROOM_IN_SET_IDS!.split(',')
    .map(roomId => Number(roomId))
  const isBelongToRoomSet = [roomSetId, ...roomInSetIds].includes(roomId)

  if (!isBelongToRoomSet) return [Number(roomId)]
  if (Number(roomId) === roomSetId) return [roomSetId, ...roomInSetIds]
  return [roomId, roomSetId]
}

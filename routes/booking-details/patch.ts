import { z } from 'zod'
import { Request, Response } from 'express'
// @ts-ignore
import { execute } from '@azoom/node-util'
import { ResponseSchemas } from '@azoom/api-definition-util'
import { prisma } from '@root/database'
import { BookingDetailSchema } from '@lib/abo'
import { bookingDetailStatuses } from '@constants/booking'
import handleCancelBookingDetail from '@routes/booking-details/_id/cancel/post'
import { getTargetedRoomIds } from '@helpers/booking'

const BodySchema = BookingDetailSchema.pick({
  cancelRequesterName: true,
  cancelRequesterTel: true,
  cancelStaffId: true,
  scheduledReplyDate: true
})
  .partial()
  .extend({
    status: BookingDetailSchema.shape.status,
    bookingDetailIds: BookingDetailSchema.shape.id.array()
  })

const OmittedBookingDetailSchema = BodySchema.omit({
  bookingDetailIds: true
})

export const apiDefinition = {
  alias: 'changeBookingDetailStatus',
  description: 'change booking detail status',
  parameters: [
    {
      name: 'bookingDetail',
      type: 'Body',
      description: 'booking detail data',
      schema: BodySchema
    }
  ],
  response: ResponseSchemas[200].schema,
  errorStatuses: [400, 404]
}

type BookingDetailBodyType = z.infer<typeof OmittedBookingDetailSchema>
type BookingDetailType = z.infer<typeof BookingDetailSchema>

export default async (req: Request, res: Response) => {
  const { bookingDetailIds, ...bookingDetail } = req.body
  const bookingDetails = await getBookingDetails(bookingDetailIds)
  if (bookingDetails.length !== bookingDetailIds.length)
    return res.sendStatus(404)

  if (bookingDetail.status === bookingDetailStatuses.canceled) {
    await Promise.all(
      bookingDetailIds.map((bookingDetailId: number) =>
        cancelBookingDetail(+bookingDetailId, bookingDetail)
      )
    )
    return res.sendStatus(200)
  }
  const waitingCancelBookingDetails = bookingDetails.filter(
    bookingDetail =>
      bookingDetail.status === bookingDetailStatuses.waitingCancel
  ) as BookingDetailType[]

  if (
    bookingDetail.status !== bookingDetailStatuses.waitingCancel &&
    waitingCancelBookingDetails.length &&
    (await isExistedBookingDetails(waitingCancelBookingDetails))
  ) {
    return res.status(400).send({
      errorMessage: '予約更新ができませんでした。設定条件などご確認ください。'
    })
  }
  await updateBookingDetails(bookingDetailIds, bookingDetail)
  return res.sendStatus(200)
}

function getBookingDetails(bookingDetailIds: number[]) {
  return prisma.bookingDetail.findMany({
    where: {
      id: {
        in: bookingDetailIds.map(Number)
      }
    }
  })
}

async function isExistedBookingDetails(bookingDetails: BookingDetailType[]) {
  const existedBookingDetail = await Promise.all(
    bookingDetails.map(checkExistedBookingDetail)
  )
  return existedBookingDetail.some(bookingDetail => !!bookingDetail)
}

function checkExistedBookingDetail({
  id: bookingDetailId,
  roomId,
  startDatetime,
  endDatetime
}: BookingDetailType) {
  const targetRoomIds = getTargetedRoomIds(roomId)
  return prisma.bookingDetail.findFirst({
    where: {
      roomId: {
        in: targetRoomIds
      },
      cancelDatetime: null,
      NOT: [
        { id: bookingDetailId },
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
}

function updateBookingDetails(
  bookingDetailIds: number[],
  { status, scheduledReplyDate }: BookingDetailBodyType
) {
  return prisma.bookingDetail.updateMany({
    where: {
      id: {
        in: bookingDetailIds
      }
    },
    data: {
      status,
      scheduledReplyDate:
        status === bookingDetailStatuses.temporary
          ? scheduledReplyDate
          : undefined
    }
  })
}

function cancelBookingDetail(
  bookingDetailId: number,
  bookingDetail: BookingDetailBodyType
) {
  return execute(handleCancelBookingDetail, {
    params: {
      id: bookingDetailId
    },
    body: bookingDetail
  })
}

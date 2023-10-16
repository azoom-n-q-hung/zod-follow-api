import { z } from 'zod'
import { Request, Response } from 'express'
import pick from 'lodash/fp/pick'
import omit from 'lodash/fp/omit'
// @ts-ignore
import { execute } from '@azoom/node-util'
import { ResponseSchemas } from '@azoom/api-definition-util'
import { BookingDetailSchema } from '@lib/abo'
import { prisma } from '@root/database'
import { bookingDetailStatuses } from '@constants/booking'
import handleCancelBookingDetail from '@routes/booking-details/_id/cancel/post'
import { getTargetedRoomIds } from '@helpers/booking'

const BookingDetailBodySchema = BookingDetailSchema.omit({
  startDatetime: true,
  endDatetime: true
}).partial()

export const apiDefinition = {
  alias: 'editBookingDetail',
  description: 'edit booking detail',
  parameters: [
    {
      name: 'id',
      type: 'Path',
      description: 'booking-detail-id',
      schema: BookingDetailSchema.shape.id
    },
    {
      name: 'bookingDetail',
      type: 'Body',
      description: 'booking detail data',
      schema: BookingDetailBodySchema
    }
  ],
  response: ResponseSchemas[200].schema,
  errorStatuses: [400, 404]
}

type StatusKeys = keyof typeof bookingDetailStatuses
type StatusValues = (typeof bookingDetailStatuses)[StatusKeys]
type BookingDetailBodyType = z.infer<typeof BookingDetailBodySchema>
type BookingDetailType = z.infer<typeof BookingDetailSchema>

export default async (req: Request, res: Response) => {
  const bookingDetailId = Number(req.params.id)
  const bookingDetail: BookingDetailBodyType = req.body

  const existedBookingDetail = await getBookingDetail(bookingDetailId) as BookingDetailType
  if (!existedBookingDetail) return res.sendStatus(404)

  if (!bookingDetail.status) {
    await updateBookingDetail(bookingDetailId, bookingDetail)
    return res.sendStatus(200)
  }

  const isValid = validateStatus(
    bookingDetail.status,
    existedBookingDetail.status
  )
  if (!isValid) return res.sendStatus(400)

  if (
    bookingDetail.status === bookingDetailStatuses.canceled &&
    existedBookingDetail.status !== bookingDetailStatuses.canceled
  ) {
    const cancelInfoFields = [
      'cancelRequesterName',
      'cancelRequesterTel',
      'cancelStaffId',
      'cancelDatetime',
      'status'
    ]
    await cancelBookingDetail(
      bookingDetailId,
      pick(cancelInfoFields, bookingDetail)
    )
    await updateBookingDetail(
      bookingDetailId,
      omit(cancelInfoFields, bookingDetail)
    )
    return res.sendStatus(200)
  }
  if(
    bookingDetail.status !== bookingDetailStatuses.waitingCancel &&
    existedBookingDetail.status === bookingDetailStatuses.waitingCancel &&
    (await isExistedBookingDetail(existedBookingDetail))
  ) {
    return res.status(400).send({
      errorMessage: '予約更新ができませんでした。設定条件などご確認ください。'
    })
  }

  await updateBookingDetail(bookingDetailId, bookingDetail)
  return res.sendStatus(200)
}

function getBookingDetail(bookingDetailId: number) {
  return prisma.bookingDetail.findFirst({
    where: {
      id: bookingDetailId
    }
  })
}

function validateStatus(status: number, existedStatus: number) {
  const acceptedBookingStatuses: Record<number, StatusValues[]> = {
    [bookingDetailStatuses.canceled]: [
      bookingDetailStatuses.completePayment,
      bookingDetailStatuses.withholdPayment,
      bookingDetailStatuses.canceled
    ],
    [bookingDetailStatuses.completePayment]: [
      bookingDetailStatuses.completePayment,
      bookingDetailStatuses.withholdPayment
    ],
    [bookingDetailStatuses.withholdPayment]: [
      bookingDetailStatuses.completePayment,
      bookingDetailStatuses.withholdPayment
    ]
  }

  const acceptedStatuses = acceptedBookingStatuses[existedStatus]
  if (acceptedStatuses && !acceptedStatuses.includes(status as StatusValues))
    return false
  

  return true
}

function isExistedBookingDetail({
  id: bookingDetailId,
  roomId,
  startDatetime,
  endDatetime
}: BookingDetailType) {
  const targetRoomIds = getTargetedRoomIds(Number(roomId))
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

function updateBookingDetail(
  bookingDetailId: number,
  bookingDetail: BookingDetailBodyType
) {
  return prisma.bookingDetail.update({
    where: {
      id: bookingDetailId
    },
    data: bookingDetail
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

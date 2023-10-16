import { Request, Response } from 'express'
import { startOfDay, endOfDay } from 'date-fns'
import { prisma } from '@root/database.js'
import { bookingDetailStatuses } from '@constants/booking'
import { roomSetId, roomInSetIds } from '@constants/room'
import {
  BookingDetailSchema,
  CustomerSchema,
  RoomSchema,
  BookingSchema,
  BookingScheduleSchema
} from '@lib/abo'

const blockedBookingDetailId = -1

const BookingType = BookingSchema.extend({
  customer: CustomerSchema
})

const RoomScheduleSchema = RoomSchema.extend({
  bookingDetails: BookingType.merge(BookingDetailSchema)
})

export const apiDefinition = {
  alias: 'getRoomSchedule',
  description: 'Get room schedules',
  parameters: [
    {
      name: 'date',
      type: 'Query',
      description: 'Date',
      schema: BookingScheduleSchema.shape.date
    },
    {
      name: 'includeRoomsetBookings',
      type: 'Query',
      description: 'include Roomset',
      schema: BookingScheduleSchema.shape.includeRoomsetBookings.optional()
    }
  ],
  response: RoomScheduleSchema,
  errorStatuses: [400, 403]
}

export default async (req: Request, res: Response) => {
  const date = req.query.date as string
  const isRoomSet = req.query.includeRoomsetBookings === 'true'

  const roomSchedules = await getRoomSchedules(date, isRoomSet)

  return res.send(roomSchedules)
}

async function getRoomSchedules(date: string, isRoomSet: boolean) {
  const dateTime = new Date(date)
  const bookingDetailHideStatuses = [
    bookingDetailStatuses.canceled,
    bookingDetailStatuses.waitingCancel
  ]
  const bookingDetailsConditions = {
    startDatetime: {
      gte: startOfDay(dateTime)
    },
    endDatetime: {
      lte: endOfDay(dateTime)
    },
    status: {
      notIn: bookingDetailHideStatuses
    },
    cancelDatetime: null
  }

  const rooms = await prisma.room.findMany({
    include: {
      bookingDetails: {
        include: {
          booking: {
            include: {
              customer: true
            }
          }
        },
        where: bookingDetailsConditions
      }
    },
    where: {
      isEnabled: true
    }
  })

  return formatRooms(isRoomSet, rooms)
}

function formatRooms(isRoomSet: boolean, rooms: any) {
  const roomsFomatted = rooms.map((room: any) => {
    const bookingDetailsFormatted = room.bookingDetails.map(
      (bookingDetail: any) => {
        const { booking } = bookingDetail
        delete bookingDetail.booking
        delete booking.id

        return {
          ...booking,
          ...bookingDetail
        }
      }
    )

    return {
      ...room,
      bookingDetails: bookingDetailsFormatted
    }
  })

  if (!isRoomSet) return roomsFomatted

  return checkBeLongToRoomSet(roomsFomatted)
}

function checkBeLongToRoomSet(roomsFomatted: any) {
  let roomSchedules = roomsFomatted

  const roomSetHasBookingDetail = roomsFomatted.find(
    (room: any) => room.id === roomSetId
  )

  if (roomSetHasBookingDetail) {
    const bookingDetailsInRoomSet = roomSetHasBookingDetail.bookingDetails.map(
      (bookingDetail: any) => ({
        ...bookingDetail,
        status: bookingDetailStatuses.blocked,
        id: blockedBookingDetailId
      })
    )

    roomSchedules = roomSchedules.map((room: any) => {
      return {
        ...room,
        ...(roomInSetIds.includes(room.id) && {
          bookingDetails: [...room.bookingDetails, ...bookingDetailsInRoomSet]
        })
      }
    })
  }

  const bookingDetailsForRoomSet = roomInSetIds.reduce(
    (bookingDetails: any, roomId: number) => {
      const roomInSetHasBookingDetail = roomsFomatted.find(
        (room: any) => room.id === roomId && room.bookingDetails.length
      )
      if (roomInSetHasBookingDetail) {
        return [
          ...bookingDetails,
          ...roomInSetHasBookingDetail.bookingDetails.map(
            (bookingDetail: any) => ({
              ...bookingDetail,
              status: bookingDetailStatuses.blocked,
              id: blockedBookingDetailId
            })
          )
        ]
      }

      return bookingDetails
    },
    []
  )

  return roomSchedules.map((room: any) => {
    if (room.id === roomSetId) {
      const bookingDetails = [
        ...room.bookingDetails,
        ...mergeDateTimeRanges(bookingDetailsForRoomSet)
      ]

      return { ...room, bookingDetails }
    }

    return room
  })
}

function mergeDateTimeRanges(ranges: any) {
  if (!ranges || ranges.length === 0) {
    return []
  }

  ranges.sort(
    (bookingDetail: any, bookingDetailprev: any) =>
      bookingDetail.startDatetime.getTime() -
      bookingDetailprev.startDatetime.getTime()
  )

  return ranges.reduce(
    (mergedRanges: any, currentRange: any) => {
      const lastMergedRange = mergedRanges[mergedRanges.length - 1]

      if (currentRange.startDatetime <= lastMergedRange.endDatetime) {
        lastMergedRange.endDatetime = new Date(
          Math.max(
            lastMergedRange.endDatetime.getTime(),
            currentRange.endDatetime.getTime()
          )
        )
      } else {
        mergedRanges = [...mergedRanges, currentRange]
      }

      return mergedRanges
    },
    [ranges[0]]
  )
}

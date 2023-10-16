import fs from 'fs'
import { Request, Response } from 'express'
import { endOfDay, format, startOfDay } from 'date-fns'
import { prisma } from '@root/database'
import { encodeFileName } from '@root/util'
import generatePdf from '@helpers/generate-pdf'
import { z } from 'zod'
import { layoutTypes, bookingDetailStatuses } from '@constants/booking'
import { validDateField } from '@lib/abo/schema'
import {
  BookingDetailSchema,
  BookingDetailServiceSchema,
  BookingSchema,
  RoomSchema,
  ServiceSchema
} from '@lib/abo/schemas'

const Room = RoomSchema.pick({
  name: true
})
const Service = ServiceSchema.pick({
  name: true
})
const Booking = BookingSchema.pick({
  id: true,
  customerName: true
})
const BookingDetailServices = BookingDetailServiceSchema.extend({
  service: Service
})

const BookingDetail = BookingDetailSchema.pick({
  id: true,
  layoutType: true,
  startDatetime: true,
  endDatetime: true
}).extend({
  booking: Booking,
  bookingDetailServices: BookingDetailServices.array(),
  room: Room
})
type BookingDetailType = z.infer<typeof BookingDetail>

export const apiDefinition = {
  alias: 'report daily business',
  description: 'report daily business',
  parameters: [
    {
      name: 'bookingDate',
      type: 'Query',
      description: 'booking date',
      schema: validDateField({
        required_error: '未入力です',
        invalid_type_error: '未入力です',
        invalid_date: '未入力です'
      })
    }
  ],
  response: z.any(),
  errorStatuses: [400, 403, 404]
}

export default async (req: Request, res: Response) => {
  const { bookingDate } = req.query
  if (!bookingDate) return res.sendStatus(400)

  const bookingDetails = await getBookingDetails(bookingDate as string)
  if (bookingDetails.length <= 0) {
    return res.status(404).send({
      errorMessage: '該当する情報が見つかりません'
    })
  }
  const formattedDataForExport = formatBookingDetails(
    bookingDetails as BookingDetailType[],
    bookingDate as string
  )

  const docGalleryReportDailyBusinessTemplateName =
    'abo_reports-daily-business_1.0.3'
  const fileName = `業務連絡書_${format(new Date(), 'yyyyMMdd')}`
  const { filePath, downloadFileName } = await generatePdf(
    docGalleryReportDailyBusinessTemplateName,
    formattedDataForExport,
    fileName
  )
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('X-File-Name', encodeFileName(downloadFileName))

  return res.send(fs.readFileSync(filePath))
}

function getBookingDetails(bookingDate: string) {
  const formatBookingDate = new Date(bookingDate)
  return prisma.bookingDetail.findMany({
    where: {
      startDatetime: {
        gte: startOfDay(formatBookingDate)
      },
      endDatetime: {
        lte: endOfDay(formatBookingDate)
      },
      status: bookingDetailStatuses.official
    },
    include: {
      booking: true,
      bookingDetailServices: {
        include: { service: true }
      },
      room: true
    },
    orderBy: [{ roomId: 'asc' }, { startDatetime: 'asc' }],
  })
}

function formatBookingDetails(
  bookingDetails: BookingDetailType[],
  bookingDate: string
) {
  const formattedBookingDetails = bookingDetails.map(
    ({
      id,
      layoutType,
      startDatetime,
      endDatetime,
      room,
      booking,
      bookingDetailServices,
      ...rest
    }) => {
      const layoutName =
        Object.values(layoutTypes).find(layout => layout.value === layoutType)
          ?.label ?? ''

      const bookingDetail = {
        id,
        bookingId: booking.id,
        roomName: room.name,
        customerName: booking.customerName,
        startTime: format(startDatetime, 'HH:mm'),
        endTime: format(endDatetime, 'HH:mm'),
        layoutName,
        usedServices: formatUsedServices(bookingDetailServices),
        ...rest
      }
      return bookingDetail
    }
  )

  return {
    bookingDate: format(new Date(bookingDate), 'yyyy/MM/dd'),
    currentDate: format(new Date(), 'yyyy/MM/dd HH:mm'),
    bookingDetails: formattedBookingDetails
  }
}

function formatUsedServices(services: z.infer<typeof BookingDetailServices>[]) {
  return services.map(({ id, usageCount, service: { name } }) => ({
    id,
    name,
    count: usageCount
  }))
}

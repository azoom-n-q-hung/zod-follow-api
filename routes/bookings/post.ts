import { z } from 'zod'
import { Request, Response } from 'express'
import { format } from 'date-fns'
import omit from 'lodash/fp/omit'
// @ts-ignore
import { execute } from '@azoom/node-util'
import { ResponseSchemas } from '@azoom/api-definition-util'
import { prisma } from '@root/database'
import { bookingDetailStatuses } from '@constants/booking'
import { fixedServiceIds } from '@constants/service'
import { getRoomPriceInfo, RoomPriceResponse, getTargetedRoomIds } from '@helpers/booking'
import getBookingDetailServices from '@routes/booking-detail-services/get'
import {
  BookingDetailSchema,
  BookingSchema,
  RoomChargeSchema,
  ServiceSchema,
  InvoiceItemSchema
} from '@lib/abo'
const defaultTaxRate = 10

const ExtendedBookingDetailSchema = BookingDetailSchema.pick({
  roomId: true,
  startDatetime: true,
  endDatetime: true,
  status: true,
  guestCount: true,
  extraChairCount: true,
  extraTableCount: true,
  cancellationFeeDays: true
}).extend({
  id: z.number().optional(),
  title: z.string().nullable().optional(),
  scheduledReplyDate: z.string().nullable().optional(),
  bookingId: z.number().optional(),
  memo: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  cancelType: z.number(),
  layoutType: z.number().nullable().optional(),
  layoutLocation: z.string().nullable().optional(),
  isCocktailStyle: z.boolean().nullable().optional()
})

const BookingDetailServicePayloadSchema = z.object({
  serviceId: ServiceSchema.shape.id,
  usageCount: z.number(),
  price: ServiceSchema.shape.unitPrice
})

const ExtendedBookingSchema = BookingSchema.omit({
  createdDatetime: true,
  updatedDatetime: true,
  note: true
}).extend({
  id: z.number().optional(),
  bookingDetails: ExtendedBookingDetailSchema.array(),
  services: BookingDetailServicePayloadSchema.array()
})

type BookingDetailType = z.infer<typeof BookingDetailSchema>
type BookingDetailBodyType = z.infer<typeof ExtendedBookingDetailSchema>
type BookingType = z.infer<typeof ExtendedBookingSchema>
type RoomChargeType = z.infer<typeof RoomChargeSchema>
type ServiceType = z.infer<typeof ServiceSchema>
type InvoiceItemType = z.infer<typeof InvoiceItemSchema>
type BookingDetailServicePayloadType = z.infer<
  typeof BookingDetailServicePayloadSchema
>

export const apiDefinition = {
  alias: 'booking',
  description: 'booking',
  parameters: [
    {
      name: 'bookingDetails',
      type: 'Body',
      description: 'booking-detail',
      schema: ExtendedBookingSchema
    }
  ],
  response: ResponseSchemas[200].schema,
  errorStatuses: [400]
}

export default async (req: Request, res: Response) => {
  const booking: BookingType = req.body

  const modifiableBookingDetails = booking.bookingDetails.filter(
    (bookingDetail, index) => index === 0 || !bookingDetail.id
  )
  const validationResults = await Promise.all([
    getCustomer(booking.customerId),
    getStaff(booking.createdStaffId),
    getStaff(booking.updatedStaffId),
    checkExistedRoom(modifiableBookingDetails)
  ])

  if (!validationResults.every(Boolean)) return res.sendStatus(400)

  const roomCharges = await getRelatedRoomCharges(modifiableBookingDetails)
  if (roomCharges.length !== modifiableBookingDetails.length) {
    return res.status(400).send({
      errorMessage: '指定した会議室が、各種料金をまだ設定されません。'
    })
  }

  const existedHoliday = await checkExistedHoliday(modifiableBookingDetails)
  if (existedHoliday.length) {
    return res.status(400).send({ errorMessage: '指定した日が休業日である。' })
  }
  const isExistedBooking = await checkExistedBookings(modifiableBookingDetails)
  if (isExistedBooking) {
    return res.status(400).send({
      errorMessage: booking.id
        ? '予約更新ができませんでした。設定条件などご確認ください。'
        : '予約登録ができませんでした。設定条件などご確認ください。'
    })
  }

  const isValidBookingDetailServices = await checkValidBookingDetailServices(
    booking
  )
  if (!isValidBookingDetailServices) {
    return res.status(400).send({
      errorMessage:
        '指定の日時で使用できない備品が登録されているため、予約の更新ができません。'
    })
  }

  const fixedServices = await getFixedServices()
  if (booking.id && booking.bookingDetails[0] && booking.bookingDetails[0].id) {
    const { newBookingDetails, mainBookingDetail } = prepareBookingDetails(
      booking.id,
      modifiableBookingDetails,
      roomCharges,
      fixedServices
    )
    let prismaPromises = [
      updateBooking(booking),
      deleteInvoiceItems(Number(mainBookingDetail.id)),
      updateBookingDetail(mainBookingDetail, mainBookingDetail.invoiceItems),
      deleteBookingDetailServices(booking),
      createBookingDetailServices(booking, booking.bookingDetails[0].id)
    ]

    if (newBookingDetails.length) {
      prismaPromises = [
        ...prismaPromises,
        ...newBookingDetails.map(createBookingDetail)
      ]
    }

    await prisma.$transaction(prismaPromises)
    return res.sendStatus(200)
  }
  const newBooking = await createBooking(booking)
  const { newBookingDetails } = prepareBookingDetails(
    newBooking.id,
    modifiableBookingDetails,
    roomCharges,
    fixedServices
  )

  const [mainBookingDetail] = await Promise.all(
    newBookingDetails.map(createBookingDetail)
  )
  await createBookingDetailServices(booking, mainBookingDetail.id)

  return res.sendStatus(200)
}

function getCustomer(customerId: number) {
  return prisma.customer.findFirst({ where: { id: customerId } })
}

function getStaff(staffId: number) {
  return prisma.staff.findFirst({ where: { id: staffId } })
}

function getBookingDetail(bookingDetailId: number) {
  return prisma.bookingDetail.findFirst({ where: { id: bookingDetailId } })
}

async function checkExistedRoom(bookingDetails: BookingDetailBodyType[]) {
  const roomIds = [
    ...new Set(bookingDetails.map(bookingDetail => bookingDetail.roomId))
  ]
  const rooms = await prisma.room.findMany({
    where: {
      id: {
        in: roomIds
      }
    }
  })

  return rooms.length === roomIds.length
}

async function getRelatedRoomCharges(bookingDetails: BookingDetailBodyType[]) {
  const oldMainBookingDetail = bookingDetails[0]?.id
    ? ((await getBookingDetail(bookingDetails[0].id)) as BookingDetailType)
    : undefined

  const roomChargePromises = bookingDetails.reduce(
    (roomChargePromises: Promise<any>[], bookingDetail) => {
      const targetedDate = bookingDetail.id
        ? new Date(format(oldMainBookingDetail!.createdDatetime, 'yyyy-MM-dd'))
        : new Date(format(new Date(), 'yyyy-MM-dd'))

      const roomChargePromise = prisma.roomCharge.findFirst({
        where: {
          roomId: bookingDetail.roomId,
          startDate: {
            lte: targetedDate
          },
          OR: [{ endDate: { gte: targetedDate } }, { endDate: null }]
        },
        orderBy: {
          startDate: 'desc'
        }
      })

      return [...roomChargePromises, roomChargePromise]
    },
    []
  )
  const roomCharges = await Promise.all(roomChargePromises)
  return roomCharges.filter(roomCharge => !!roomCharge)
}

async function checkExistedHoliday(bookingDetails: BookingDetailBodyType[]) {
  const holidayPromises = bookingDetails.reduce(
    (holidayPromises: Promise<any>[], bookingDetail: any) => {
      const startDate = new Date(
        format(new Date(bookingDetail.startDatetime), 'yyyy-MM-dd')
      )
      const endDate = new Date(
        format(new Date(bookingDetail.endDatetime), 'yyyy-MM-dd')
      )
      const holidayPromise = prisma.holiday.findFirst({
        where: {
          date: {
            gte: startDate,
            lte: endDate
          }
        }
      })

      return [...holidayPromises, holidayPromise]
    },
    []
  )
  const holidays = await Promise.all(holidayPromises)

  return holidays.filter(holiday => !!holiday)
}

async function checkExistedBookings(bookingDetails: BookingDetailBodyType[]) {
  const checkedBookingDetails = await Promise.all(
    bookingDetails
      .filter(
        (bookingDetail, index) =>
          (
            [
              bookingDetailStatuses.official,
              bookingDetailStatuses.temporary
            ] as number[]
          ).includes(bookingDetail.status) || index === 0
      )
      .map(checkExistedBooking)
  )
  return checkedBookingDetails.some(isValid => !!isValid)
}

async function checkExistedBooking({
  id: bookingDetailId,
  roomId,
  startDatetime,
  endDatetime,
  status
}: BookingDetailBodyType) {
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

async function checkValidBookingDetailServices(booking: BookingType) {
  const bookingDetailServices = booking.services
  if (!bookingDetailServices.length) return true

  const mainBookingDetail = booking.bookingDetails[0]
  const { customerId } = booking
  const { startDatetime, endDatetime } = mainBookingDetail
  const availableBookingDetailServices = await execute(
    getBookingDetailServices,
    {
      query: {
        customerId,
        startDatetime,
        endDatetime,
        currentBookingDetailId: mainBookingDetail.id,
        serviceIds: bookingDetailServices
          .map(service => service.serviceId)
          .join(',')
      }
    }
  )

  return bookingDetailServices.every(bookingDetailService => {
    const remainingCount = availableBookingDetailServices.find(
      (service: { id: number }) => service.id === bookingDetailService.serviceId
    )?.stockAvailable

    return remainingCount && bookingDetailService.usageCount <= remainingCount
  })
}

function updateBooking(booking: BookingType) {
  return prisma.booking.update({
    where: {
      id: booking.id
    },
    data: {
      ...omit(['bookingDetails', 'services', 'id', 'createdStaffId'], booking)
    }
  })
}

function prepareBookingDetails(
  bookingId: number,
  bookingDetails: BookingDetailBodyType[],
  roomCharges: RoomChargeType[],
  fixedServices: ServiceType[]
) {
  const formattedBookingDetails = bookingDetails.map((bookingDetail, bookingDetailIndex) => {
    const matchedRoomChange =
      bookingDetailIndex === 0
        ? roomCharges[0]
        : roomCharges.find(
            (roomCharge, roomChargeIndex) =>
              roomCharge.roomId === bookingDetail.roomId && roomChargeIndex > 0
          )
    const shouldRecalculateRoomPrice = !bookingDetail.id || bookingDetailIndex === 0
    const newBookingDetail = {
      ...bookingDetail,
      basicAmount: shouldRecalculateRoomPrice
        ? matchedRoomChange!.basicPrice
        : undefined,
      extensionAmount: shouldRecalculateRoomPrice
        ? matchedRoomChange!.extensionPrice
        : undefined,
      allDayAmount: shouldRecalculateRoomPrice
        ? matchedRoomChange!.allDayPrice
        : undefined,
      subtotalType: shouldRecalculateRoomPrice
        ? matchedRoomChange!.subtotalType
        : undefined,
      taxRate: shouldRecalculateRoomPrice ? defaultTaxRate : undefined,
      bookingId
    }

    if (bookingDetail.id && bookingDetailIndex !== 0) {
      return { ...newBookingDetail, invoiceItems: undefined }
    }

    const incurredService = fixedServices.find(
      service => service.id === fixedServiceIds.incurredFee
    )

    const roomPriceInfo = getRoomPriceInfo({
      ...formatBookingDetail(newBookingDetail),
      incurredAmount: Number(incurredService?.unitPrice)
    })

    const roomInvoiceItems = generateInvoiceItems(roomPriceInfo, fixedServices)

    return {
      ...newBookingDetail,
      invoiceItems: roomInvoiceItems
    }
  })

  const newBookingDetails = formattedBookingDetails.filter(({ id }) => !id)
  return {
    newBookingDetails,
    mainBookingDetail: formattedBookingDetails[0]
  }
}

function createBookingDetail(bookingDetail: any) {
  return prisma.bookingDetail.create({
    data: {
      ...formatBookingDetail(bookingDetail),
      invoiceItems: {
        create: bookingDetail.invoiceItems
      }
    }
  })
}

function deleteBookingDetailServices(booking: BookingType) {
  return prisma.bookingDetailService.deleteMany({
    where: { bookingDetailId: booking.bookingDetails![0].id }
  })
}

function updateBookingDetail(
  bookingDetail: BookingDetailBodyType,
  invoiceItems?: Omit<InvoiceItemType, 'id'>[]
) {
  return prisma.bookingDetail.update({
    where: {
      id: bookingDetail.id
    },
    data: {
      ...formatBookingDetail(bookingDetail),
      invoiceItems: invoiceItems?.length ? { create: invoiceItems } : undefined
    }
  })
}

function createBooking(booking: BookingType) {
  return prisma.booking.create({
    data: {
      ...omit(['bookingDetails', 'services', 'updatedStaffId'], booking),
      updatedStaffId: booking.createdStaffId
    }
  })
}

function createBookingDetailServices(
  booking: BookingType,
  bookingDetailId: number
) {
  const bookingDetailServices = booking.services.map(
    (service: BookingDetailServicePayloadType) => {
      return {
        ...service,
        bookingDetailId,
        price: +service.price * service.usageCount
      }
    }
  )
  return prisma.bookingDetailService.createMany({
    data: bookingDetailServices
  })
}

function formatBookingDetail(bookingDetail: BookingDetailBodyType) {
  return {
    ...omit(['id', 'invoiceItems'], bookingDetail),
    startDatetime: new Date(bookingDetail.startDatetime),
    endDatetime: new Date(bookingDetail.endDatetime),
    scheduledReplyDate: bookingDetail.scheduledReplyDate
      ? new Date(bookingDetail.scheduledReplyDate)
      : null
  } as BookingDetailType
}

function generateInvoiceItems(
  priceInfo: RoomPriceResponse,
  services: ServiceType[],
  bookingDetailId?: number
) {
  return Object.values(priceInfo).reduce((invoices: any[], price) => {
    const { serviceId, subtotal, tax, count, unit } = price
    if (!subtotal || !serviceId) return invoices

    const matchedService = services.find(
      (service: ServiceType) => service.id === serviceId
    )
    return [
      ...invoices,
      {
        bookingDetailId,
        name: matchedService!.name,
        type: matchedService!.type,
        unitAmount: unit,
        subtotalAmount: subtotal,
        taxAmount: tax,
        subtotalTaxAmount: tax * count,
        subtotalWithoutTaxAmount: unit * count,
        count,
        serviceId
      }
    ]
  }, [])
}

function deleteInvoiceItems(bookingDetailId: number) {
  return prisma.invoiceItem.deleteMany({
    where: {
      bookingDetailId,
      invoiceId: null,
      serviceId: {
        in: [
          fixedServiceIds.allDayFee,
          fixedServiceIds.basicFee,
          fixedServiceIds.extensionFee,
          fixedServiceIds.incurredFee
        ]
      }
    }
  })
}

function getFixedServices() {
  return prisma.service.findMany({
    where: {
      id: {
        in: Object.values(fixedServiceIds)
      }
    }
  })
}

import { z } from 'zod'
import { Request, Response } from 'express'
import { startOfDay, differenceInDays } from 'date-fns'
import { ResponseSchemas } from '@azoom/api-definition-util'
import { prisma } from '@root/database'
import { BookingDetailSchema, InvoiceItemSchema } from '@lib/abo'
import {
  cancelTypes,
  cancelDayLimit,
  cancelDayPolicies
} from '@constants/booking-detail'
import { fixedServiceIds } from '@constants/service'
import { bookingDetailStatuses } from '@constants/booking'
import { getRoomPriceInfo } from '@helpers/booking'

const CancelInfoSchema = BookingDetailSchema.pick({
  cancelStaffId: true,
  cancelRequesterName: true,
  cancelRequesterTel: true
})
.extend({
  cancelDatetime: z.date().or(z.string()).optional()
})
.refine(
  d => {
    return (
      d.cancelRequesterName !== null &&
      d.cancelRequesterTel !== null &&
      d.cancelStaffId !== null
    )
  },
  {
    message: '正しく入力されていない項目があります'
  }
)

const OmittedInvoiceItemSchema = InvoiceItemSchema.omit({
  id: true,
  invoiceId: true,
  createdDatetime: true,
  updatedDatetime: true
})

type BookingDetailType = z.infer<typeof BookingDetailSchema>
type InvoiceItemType = z.infer<typeof OmittedInvoiceItemSchema>
type CancelDayLimitKey = keyof typeof cancelDayLimit
type BookingDetailCancelBody = {
  cancelStaffId?: number | null
  cancelRequesterName?: string
  cancelRequesterTel?: string
  cancelDatetime?: string | Date
  cancelPrice?: number
  totalServiceWithoutTaxAmount?: number
}

export const apiDefinition = {
  alias: 'cancelBookingDetail',
  description: 'cancel booking-detail',
  parameters: [
    {
      name: 'id',
      type: 'Path',
      description: 'id',
      schema: BookingDetailSchema.shape.id
    },
    {
      name: 'cancelInfo',
      type: 'Body',
      description: 'cancel information',
      schema: CancelInfoSchema
    }
  ],
  response: ResponseSchemas[200].schema,
  errorStatuses: [400, 403, 404]
}

export default async (req: Request, res: Response) => {
  const { id } = req.params
  const cancelInfo: BookingDetailCancelBody = req.body

  const bookingDetail = await prisma.bookingDetail.findFirst({
    where: { id: +id }
  })
  if (!bookingDetail) return res.sendStatus(404)

  const cancelDatetime = cancelInfo?.cancelDatetime
    ? startOfDay(new Date(cancelInfo.cancelDatetime))
    : startOfDay(new Date())

  if (bookingDetail.startDatetime < cancelDatetime) return res.sendStatus(400)

  const cancelPrice = await calculateBookingDetailCancelFee(
    // @ts-ignore
    bookingDetail,
    cancelDatetime
  )
  if (cancelPrice === 0) {
    await updateBookingDetail(Number(id), {
      ...cancelInfo,
      cancelPrice,
      cancelDatetime,
      totalServiceWithoutTaxAmount: Number(bookingDetail.totalServiceWithoutTaxAmount)
    })
    return res.sendStatus(200)
  }

  const cancellationService = await getCancellationService()
  const invoiceItem = {
    bookingDetailId: +id,
    name: cancellationService!.name,
    type: cancellationService!.type,
    unitAmount: cancelPrice,
    taxAmount: 0,
    count: 1,
    subtotalTaxAmount: 0,
    subtotalWithoutTaxAmount: cancelPrice,
    subtotalAmount: cancelPrice,
    serviceId: fixedServiceIds.cancelFee
  }
  await prisma.$transaction([
    updateBookingDetail(Number(id), {
      ...cancelInfo,
      cancelPrice,
      cancelDatetime,
      totalServiceWithoutTaxAmount: 0
    }),
    deleteInvoiceItems(Number(id)),
    createInvoiceItem(invoiceItem)
  ])
  return res.sendStatus(200)
}

async function calculateBookingDetailCancelFee(
  bookingDetail: BookingDetailType,
  cancelDate: Date
) {
  const { cancelType, startDatetime, status } = bookingDetail
  const notFeeCancellationStatuses = [
    bookingDetailStatuses.temporary,
    bookingDetailStatuses.waitingCancel
  ] as number[]

  if (!cancelType || notFeeCancellationStatuses.includes(status)) return 0

  const startDate = startOfDay(startDatetime)

  const diffDays = differenceInDays(startDate, cancelDate)
  if (!isExceedDayLimit(diffDays, bookingDetail)) return 0

  const incurredService = await getIncurredService()
  const roomPrice = await getRoomPriceInfo({
    ...bookingDetail,
    incurredAmount: Number(incurredService?.unitPrice)
  })

  const cancelRate =
    cancelType === cancelTypes.student
      ? cancelDayPolicies.student
      : diffDays <= 0
      ? cancelDayPolicies.outOfDate
      : cancelDayPolicies.inDueDate

  const cancelPrice =
    ((roomPrice.allDayPrice.subtotal +
      roomPrice.basicPrice.subtotal +
      roomPrice.extensionPrice.subtotal) *
      cancelRate) /
    100

  return Math.floor(cancelPrice)
}

function isExceedDayLimit(diffDays: number, bookingDetail: BookingDetailType) {
  const { cancelType, cancellationFeeDays } = bookingDetail
  const cancelDayLimitKeys = Object.keys(cancelDayLimit) as CancelDayLimitKey[]
  const dayLimit = cancelDayLimitKeys.reduce(
    (dayLimit, key) => {
      return {
        ...dayLimit,
        [cancelTypes[key]]: cancelDayLimit[key]
      }
    },
    {
      [cancelTypes.others]: cancellationFeeDays
    }
  ) as { [key: number]: number }

  return dayLimit[cancelType!] >= diffDays
}

function updateBookingDetail(
  bookingDetailId: number,
  cancelInfo: BookingDetailCancelBody
) {
  const {
    cancelRequesterName,
    cancelRequesterTel,
    cancelStaffId,
    cancelPrice,
    cancelDatetime,
    totalServiceWithoutTaxAmount
  } = cancelInfo

  return prisma.bookingDetail.update({
    where: {
      id: bookingDetailId
    },
    data: {
      cancelDatetime,
      status: bookingDetailStatuses.canceled,
      cancelRequesterName: cancelRequesterName || undefined,
      cancelRequesterTel: cancelRequesterTel || undefined,
      cancelStaffId: cancelStaffId || undefined,
      cancelPrice: cancelPrice || 0,
      totalServiceWithoutTaxAmount: totalServiceWithoutTaxAmount
    }
  })
}

function getCancellationService() {
  return prisma.service.findFirst({
    where: {
      id: fixedServiceIds.cancelFee
    }
  })
}

function deleteInvoiceItems(bookingDetailId: number) {
  return prisma.invoiceItem.deleteMany({
    where: {
      bookingDetailId: bookingDetailId,
      invoiceId: null
    },
  })
}

function createInvoiceItem(invoiceItem: InvoiceItemType) {
  return prisma.invoiceItem.create({
     // @ts-ignore
    data: invoiceItem
  })
}

function getIncurredService() {
  return prisma.service.findFirst({
    where: {
      id: fixedServiceIds.incurredFee
    }
  })
}

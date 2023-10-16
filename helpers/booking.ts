import { z } from 'zod'
import { format as formatDateTime, differenceInMinutes } from 'date-fns'
import { BookingDetailSchema } from '@lib/abo'
import { fixedServiceIds } from '@constants/service'
import { businessHour } from '@constants/booking-detail'

const RelatedBookingDetailPriceSchema = BookingDetailSchema.pick({
  startDatetime: true,
  endDatetime: true,
  basicAmount: true,
  extensionAmount: true,
  allDayAmount: true,
  taxRate: true
}).extend({
  incurredAmount: z.number()
})

type BookingDetailType = z.infer<typeof RelatedBookingDetailPriceSchema>

type PriceType = {
  subtotal: number
  subtotalWithoutTax: number
  tax: number
  unit: number
  count: number
  serviceId: number
}

export type RoomPriceResponse = {
  basicPrice: PriceType
  extensionPrice: PriceType
  allDayPrice: PriceType
  incurredPrice: PriceType
}

const maxBasicUsageHour = 2
const minFullDayUsageHour = 10

export function getRoomPriceInfo (bookingDetail: BookingDetailType) {
  const { startDatetime, endDatetime } = bookingDetail
  const usageRoomTime = differenceInMinutes(endDatetime, startDatetime) / 60
  const isAllDayBooking = checkAllDayBooking(startDatetime, endDatetime, usageRoomTime)
  const options = { usageRoomTime, isAllDayBooking }

  const basicPrice = calculateRoomBasicPrice(bookingDetail, options)
  const extensionPrice = calculateRoomExtensionPrice(bookingDetail, options, basicPrice.count)
  const allDayPrice = calculateRoomAllDayPrice(bookingDetail, options)
  const incurredPrice = calculateRoomIncurredPrice(bookingDetail)

  return {
    basicPrice,
    extensionPrice,
    allDayPrice,
    incurredPrice
  }
}

function calculateRoomBasicPrice(
  bookingDetail: BookingDetailType,
  options: any
): PriceType {
  const unitPrice = Number(bookingDetail.basicAmount)
  const taxRate = Number(bookingDetail.taxRate)
  const count = !options.isAllDayBooking ? Math.min(maxBasicUsageHour, options.usageRoomTime) : 0

  return formatPriceWithTax(unitPrice, count, taxRate, fixedServiceIds.basicFee)
}

function calculateRoomExtensionPrice(
  bookingDetail: BookingDetailType,
  options: any,
  basicCount: number,
): PriceType {
  const unitPrice = Number(bookingDetail.extensionAmount)
  const taxRate = Number(bookingDetail.taxRate)

  const day = formatDateTime(bookingDetail.startDatetime, 'yyyy-MM-dd')
  const startBusinessTime = new Date(`${day} ${businessHour.start}`)
  const endBusinessTime = new Date(`${day} ${businessHour.end}`)
  let count = 0
  if (options.isAllDayBooking) {
    if (bookingDetail.startDatetime <= startBusinessTime) {
      count += differenceInMinutes(startBusinessTime, bookingDetail.startDatetime) / 60
    }
    if (bookingDetail.endDatetime >= endBusinessTime) {
      count += differenceInMinutes(bookingDetail.endDatetime, endBusinessTime) / 60
    }
  } else {
    count += options.usageRoomTime - basicCount
  }

  return formatPriceWithTax(
    unitPrice,
    count,
    taxRate,
    fixedServiceIds.extensionFee
  )
}

function calculateRoomAllDayPrice(
  bookingDetail: BookingDetailType,
  options: any
): PriceType {
  const unitPrice = Number(bookingDetail.allDayAmount)
  const taxRate = Number(bookingDetail.taxRate)
  const count = options.isAllDayBooking ? 1 : 0

  return formatPriceWithTax(
    unitPrice,
    count,
    taxRate,
    fixedServiceIds.allDayFee
  )
}

function calculateRoomIncurredPrice(
  bookingDetail: BookingDetailType
): PriceType {
  const unitPrice = Number(bookingDetail.incurredAmount)
  const taxRate = Number(bookingDetail.taxRate)

  const bookingDate = formatDateTime(bookingDetail.startDatetime, 'yyyy-MM-dd')
  const startBusinessTime = new Date(`${bookingDate} ${businessHour.start}`)
  const count = bookingDetail.startDatetime < startBusinessTime ? 1 : 0

  return formatPriceWithTax(
    unitPrice,
    count,
    taxRate,
    fixedServiceIds.incurredFee
  )
}

function checkAllDayBooking(startTime: Date, endTime: Date, usageRoomTime: any) {
  const day = formatDateTime(startTime, 'yyyy-MM-dd')
  const startBusinessTime = new Date(`${day} ${businessHour.start}`)
  const endBusinessTime = new Date(`${day} ${businessHour.end}`)
  if (
    startBusinessTime <= startTime &&
    endTime <= endBusinessTime &&
    usageRoomTime >= minFullDayUsageHour
  ) return true

  if (
    startTime <= startBusinessTime &&
    (differenceInMinutes(endTime, startBusinessTime) / 60) >= minFullDayUsageHour
  ) return true

  if (
    endTime >= endBusinessTime &&
    (differenceInMinutes(endBusinessTime, startTime) / 60) >= minFullDayUsageHour
  ) return true

  return false
}

function formatPriceWithTax(
  unit: number,
  count: number,
  taxRate: number | null,
  serviceId: number
) {
  const tax = Math.floor((unit * Number(taxRate)) / 100)
  const subtotalWithoutTax = unit * count
  const totalTax = tax * count

  return {
    unit,
    count,
    serviceId,
    subtotalWithoutTax,
    tax,
    subtotal: Math.floor(subtotalWithoutTax + totalTax)
  }
}

export function getTargetedRoomIds(roomId: number) {
  const roomSetId = Number(process.env.ROOM_SET_ID)
  const roomInSetIds = process.env
    .ROOM_IN_SET_IDS!.split(',')
    .map(roomId => Number(roomId))
  const isBelongToRoomSet = [roomSetId, ...roomInSetIds].includes(roomId)

  if (!isBelongToRoomSet) return [Number(roomId)]
  if (Number(roomId) === roomSetId) return [roomSetId, ...roomInSetIds]
  return [roomId, roomSetId]
}

export function sortBookingDetail(
  previousBookingDetail: { startDatetime: Date; roomId: number },
  nextBookingDetail: { startDatetime: Date; roomId: number }
) {
  const previousDate = new Date(previousBookingDetail.startDatetime).setHours(0, 0, 0, 0)
  const nextDate = new Date(nextBookingDetail.startDatetime).setHours(0, 0, 0, 0)
  if (previousDate < nextDate) return -1
  if (previousDate > nextDate) return 1

  if (previousBookingDetail.roomId < nextBookingDetail.roomId) return -1
  if (previousBookingDetail.roomId > nextBookingDetail.roomId) return 1

  const previousTime = new Date(previousBookingDetail.startDatetime).getTime()
  const nextTime = new Date(nextBookingDetail.startDatetime).getTime()
  return previousTime - nextTime
}

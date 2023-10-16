import { z } from 'zod'
import {
  format,
  startOfDay,
  endOfDay,
  startOfYear,
  endOfYear,
  subYears
} from 'date-fns'
import { Request, Response } from 'express'
import { prisma } from '@root/database'
import { encodeFileName } from '@root/util'
import { createExcelFile } from '@helpers/excel'
import { excelTitles } from '@constants/customer'
import { invoiceStatuses } from '@constants/invoice'
import { bookingDetailStatuses } from '@constants/booking'
import { BookingSchema,
  CustomerSchema,
  BookingDetailSchema,
  validIntegerNumber
} from '@lib/abo'

const CustomerSearchParameter = z.object({
  fromId: CustomerSchema.shape.id.nullable(),
  toId: CustomerSchema.shape.id.nullable(),
  customerName: CustomerSchema.shape.name.nullable(),
  contactName: CustomerSchema.shape.contactName1.nullable(),
  customerTel: CustomerSchema.shape.tel.nullable(),
  fromBookingDate: BookingDetailSchema.shape.startDatetime.nullable(),
  toBookingDate: BookingDetailSchema.shape.startDatetime.nullable(),
  fromTotalNumberBooking: validIntegerNumber({ message: '自然数でご入力ください' }).nullable(),
  toTotalNumberBooking: validIntegerNumber({ message: '自然数でご入力ください' }).nullable(),
  fromTotalNumberYearsBooking: validIntegerNumber({ message: '自然数でご入力ください' }).nullable(),
  toTotalNumberYearsBooking: validIntegerNumber({ message: '自然数でご入力ください' }).nullable(),
  fromTotalAmount: validIntegerNumber({ message: '自然数でご入力ください' }).nullable(),
  toTotalAmount: validIntegerNumber({ message: '自然数でご入力ください' }).nullable(),
  fromTotalAmountCurrentYear: validIntegerNumber({ message: '自然数でご入力ください' }).nullable(),
  toTotalAmountCurrentYear: validIntegerNumber({ message: '自然数でご入力ください' }).nullable(),
  fromCreated: BookingDetailSchema.shape.createdDatetime.nullable(),
  toCreated: BookingDetailSchema.shape.createdDatetime.nullable(),
  fromUpdated: BookingDetailSchema.shape.updatedDatetime.nullable(),
  toUpdated: BookingDetailSchema.shape.updatedDatetime.nullable()
}).partial()
const Booking = BookingSchema.extend({ bookingDetails: BookingDetailSchema.omit({
  totalServiceWithoutTaxAmount: true
}).array() })
const Customer = CustomerSchema.extend({ bookings: Booking.array() })

type CustomerSearchParameterType = z.infer<typeof CustomerSearchParameter>
type BookingType = z.infer<typeof Booking>
type CustomerType = z.infer<typeof Customer>

export const apiDefinition = {
  alias: 'Export Customers',
  description: 'Export customers',
  parameters: [
    {
      name: 'customer',
      type: 'Body',
      description: 'Customer',
      schema: CustomerSearchParameter
    }
  ],
  response: z.any(),
  errorStatuses: [400, 403, 404]
}

export default async (req: Request, res: Response) => {
  if (!validateRequest(req.body)) return res.sendStatus(400)

  const sheetName = '顧客一覧表'
  const customers = await getCustomers(req.body)
  const filteredCustomers = filterCustomers(req.body, customers)
  if (!filteredCustomers.length) {
    return res.status(404).send({
      errorMessage:
        '指定抽出条件に当てはまるデータがありませんので、顧客一覧表を出力しませんでした。'
    })
  }

  const rowsData = generateExcelData(filteredCustomers)
  const excelFile = await createExcelFile(rowsData, sheetName, excelTitles)

  res.setHeader('X-File-Name', encodeFileName(`顧客一覧表_${format(new Date(), 'yyyyMMdd')}.xlsx`))
  res.writeHead(200, {
    'Content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment;filename=customers.xlsx`
  })
  excelFile.xlsx.write(res)
}

function validateRequest(searchParams: CustomerSearchParameterType) {
  const {
    fromId,
    toId,
    fromBookingDate,
    toBookingDate,
    fromTotalNumberBooking,
    toTotalNumberBooking,
    fromTotalNumberYearsBooking,
    toTotalNumberYearsBooking,
    fromTotalAmount,
    toTotalAmount,
    fromTotalAmountCurrentYear,
    toTotalAmountCurrentYear,
    fromCreated,
    toCreated,
    fromUpdated,
    toUpdated
  } = searchParams

  if (
    compareParam(Number(fromId), Number(toId)) ||
    compareParam(Number(fromTotalNumberBooking), Number(toTotalNumberBooking)) ||
    compareParam(Number(fromTotalNumberYearsBooking), Number(toTotalNumberYearsBooking)) ||
    compareParam(Number(fromTotalAmount), Number(toTotalAmount)) ||
    compareParam(Number(fromTotalAmountCurrentYear), Number(toTotalAmountCurrentYear)) ||
    compareParam(fromCreated, toCreated) ||
    compareParam(fromUpdated, toUpdated) ||
    compareParam(fromBookingDate, toBookingDate)
  ) {
    return false
  }

  return true
}

async function getCustomers(searchParams: CustomerSearchParameterType) {
  const {
    fromId,
    toId,
    customerName,
    contactName,
    customerTel,
    fromBookingDate,
    toBookingDate,
    fromCreated,
    toCreated,
    fromUpdated,
    toUpdated
  } = searchParams

  const contactNameCondition = contactName
    ? { contains: contactName }
    : undefined
  const customerNameCondition = customerName
    ? { contains: customerName }
    : undefined
  const customerTelCondition = customerTel
    ? { contains: customerTel }
    : undefined
  const condition = {
    AND: [
      {
        id: {
          gte: fromId ? +fromId : undefined,
          lte: toId ? +toId : undefined
        }
      },
      {
        OR: [
          { name: customerNameCondition },
          { nameKana: customerNameCondition }
        ]
      },
      {
        OR: [
          { contactName1: contactNameCondition },
          { contactName2: contactNameCondition },
          { contactName3: contactNameCondition }
        ]
      },
      {
        OR: [
          { tel: customerTelCondition },
          { contactTel1: customerTelCondition },
          { contactTel2: customerTelCondition },
          { contactTel3: customerTelCondition }
        ]
      },
      {
        createdDatetime: {
          gte: fromCreated
            ? startOfDay(new Date(fromCreated))
            : undefined,
          lte: toCreated
            ? endOfDay(new Date(toCreated))
            : undefined
        }
      },
      {
        updatedDatetime: {
          gte: fromUpdated
            ? startOfDay(new Date(fromUpdated))
            : undefined,
          lte: toUpdated
            ? endOfDay(new Date(toUpdated))
            : undefined
        }
      },
      {
        bookings:
          fromBookingDate || toBookingDate
            ? {
                some: {
                  bookingDetails: {
                    some: {
                      startDatetime: {
                        gte: fromBookingDate
                          ? startOfDay(new Date(fromBookingDate))
                          : undefined,
                        lte: toBookingDate
                          ? endOfDay(new Date(toBookingDate))
                          : undefined
                      }
                    }
                  }
                }
              }
            : undefined
      }
    ]
  }
  const customers = await prisma.customer.findMany({
    where: condition,
    include: {
      bookings: {
        include: {
          bookingDetails: true
        }
      }
    }
  })

  return Promise.all(
    customers.map(
      async (customer) => ({
        ...customer,
        createdDatetime: format(customer.createdDatetime, 'yyyy-MM-dd'),
        updatedDatetime: format(customer.updatedDatetime, 'yyyy-MM-dd'),
        ...(await getTotalBooking(customer))
      })
    )
  )
}

async function getTotalBooking(customer: CustomerType) {
  const bookingIds = customer.bookings.map((booking: BookingType) => booking.id)

  const [
    { _count: totalNumberYearsBooking },
    { _count: totalNumberBooking, _max: latestUsedDate },
    { _sum: totalAmountLastYear },
    { _sum: totalAmountCurrentYear },
    { _sum: totalAmount }
  ] = await prisma.$transaction([
    prisma.bookingDetail.aggregate({
      where: {
        bookingId: { in: bookingIds },
        status: bookingDetailStatuses.completePayment,
        startDatetime: {
          gte: startOfYear(new Date()),
          lte: endOfYear(new Date())
        }
      },
      _count: true
    }),
    prisma.bookingDetail.aggregate({
      where: {
        bookingId: { in: bookingIds },
        status: bookingDetailStatuses.completePayment
      },
      _count: true,
      _max: { endDatetime: true }
    }),
    prisma.invoice.aggregate({
      where: {
        bookingId: { in: bookingIds },
        status: invoiceStatuses.completed,
        invoiceItems: {
          some: {
            bookingDetail: {
              status: bookingDetailStatuses.completePayment,
              startDatetime: {
                gte: startOfYear(subYears(new Date(), 1)),
                lte: endOfYear(subYears(new Date(), 1))
              }
            }
          }
        }
      },
      _sum: { totalAmount: true }
    }),
    prisma.invoice.aggregate({
      where: {
        bookingId: { in: bookingIds },
        status: invoiceStatuses.completed,
        invoiceItems: {
          some: {
            bookingDetail: {
              status: bookingDetailStatuses.completePayment,
              startDatetime: {
                gte: startOfYear(new Date()),
                lte: endOfYear(new Date())
              }
            }
          }
        }
      },
      _sum: { totalAmount: true }
    }),
    prisma.invoice.aggregate({
      where: {
        bookingId: { in: bookingIds },
        status: invoiceStatuses.completed,
        invoiceItems: {
          some: {
            bookingDetail: {
              status: bookingDetailStatuses.completePayment
            }
          }
        }
      },
      _sum: { totalAmount: true }
    })
  ])

  return {
    totalNumberBooking: totalNumberBooking || 0,
    totalNumberYearsBooking: totalNumberYearsBooking || 0,
    totalAmount: Number(totalAmount.totalAmount) || 0,
    totalAmountCurrentYear: Number(totalAmountCurrentYear.totalAmount) || 0,
    totalAmountLastYear: Number(totalAmountLastYear.totalAmount) || 0,
    latestUsedDate: latestUsedDate.endDatetime
      ? format(latestUsedDate.endDatetime, 'yyyy-MM-dd')
      : ''
  }
}

function filterCustomers(searchParams: CustomerSearchParameterType, customers: any) {
  return customers.reduce((filteredCustomers: any, customer: any) => {
    let conditions:any[] = []
    if (searchParams.fromTotalNumberBooking) {
      conditions = [
        ...conditions,
        customer.totalNumberBooking >= searchParams.fromTotalNumberBooking
      ]
    }
    if (searchParams.toTotalNumberBooking) {
      conditions = [
        ...conditions,
        customer.totalNumberBooking <= searchParams.toTotalNumberBooking
      ]
    }
    if (searchParams.fromTotalNumberYearsBooking) {
      conditions = [
        ...conditions,
        customer.totalNumberYearsBooking >=
          searchParams.fromTotalNumberYearsBooking
      ]
    }
    if (searchParams.toTotalNumberYearsBooking) {
      conditions = [
        ...conditions,
        customer.totalNumberYearsBooking <=
          searchParams.toTotalNumberYearsBooking
      ]
    }
    if (searchParams.fromTotalAmount) {
      conditions = [
        ...conditions,
        customer.totalAmount >= searchParams.fromTotalAmount
      ]
    }
    if (searchParams.toTotalAmount) {
      conditions = [
        ...conditions,
        customer.totalAmount <= searchParams.toTotalAmount
      ]
    }
    if (searchParams.fromTotalAmountCurrentYear) {
      conditions = [
        ...conditions,
        customer.totalAmountCurrentYear >=
          searchParams.fromTotalAmountCurrentYear
      ]
    }
    if (searchParams.toTotalAmountCurrentYear) {
      conditions = [
        ...conditions,
        customer.totalAmountCurrentYear <= searchParams.toTotalAmountCurrentYear
      ]
    }
    if (conditions.every(condition => !!condition)) {
      return [...filteredCustomers, customer]
    }
    return filteredCustomers
  }, [])
}

function generateExcelData(customers: any) {
  return customers.map((customer:any) => {
    return excelTitles.reduce((columns: Object[], column) => {
      const address = [customer.address, customer.subAddress]
      return [...columns, column.key == 'address' ? address.join(' ').trim() : customer[column.key]]
    }, [])
  })
}

function compareParam(
  gte: number | Date | undefined | null,
  lte: number | Date | undefined | null
) {
  return gte && lte && gte > lte
}

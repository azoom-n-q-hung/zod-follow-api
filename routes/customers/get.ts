import { z } from 'zod'
import { Request, Response } from 'express'
import camelcaseKeys from 'camelcase-keys'
import { prisma } from '@root/database'
import { Prisma } from '@prisma/client'
import { sortTypes } from '@constants/customer'
import { convertKanaToOthersCharacter } from '@root/helpers/string'
import {
  generatePaginationApiDefinitionParameters,
  CustomerSchema,
  PaginationSchema,
  SortSchema
} from '@lib/zod-follow'
const CustomerQuerySchema = CustomerSchema.pick({
  id: true,
  tel: true
})
  .extend({
    matchableId: z.string().optional(),
    customerName: CustomerSchema.shape.name,
    contactName: CustomerSchema.shape.contactName1,
    orderBy: SortSchema.shape.orderBy,
    page: PaginationSchema.shape.page,
    limit: PaginationSchema.shape.limit
  })
  .partial()
type CustomerType = z.infer<typeof CustomerQuerySchema>

export const apiDefinition = {
  alias: 'getCustomers',
  description: 'Get customers',
  parameters: [
    ...generatePaginationApiDefinitionParameters(),
    {
      name: 'id',
      type: 'Query',
      description: 'Customer Id',
      schema: CustomerSchema.shape.id.optional()
    },
    {
      name: 'matchableId',
      type: 'Query',
      description: 'Like Customer Id',
      schema: z.string().optional()
    },
    {
      name: 'customerName',
      type: 'Query',
      description: 'Customer name',
      schema: CustomerSchema.shape.name.optional()
    },
    {
      name: 'tel',
      type: 'Query',
      description: 'Customer tel',
      schema: z.string().optional()
    },
    {
      name: 'contactName',
      type: 'Query',
      description: 'Customer contact name',
      schema: CustomerSchema.shape.contactName1.optional()
    },
    {
      name: 'orderBy',
      type: 'Query',
      description: 'Order by',
      schema: SortSchema.shape.orderBy.optional()
    }
  ],
  response: CustomerSchema,
  errorStatuses: [400, 403]
}

export default async (req: Request, res: Response) => {
  const rawQuery = prepareRawQuery(req.query)
  const [customers, total]: [any, number] = await Promise.all([
    fetchCustomers(rawQuery, req.query),
    getTotal(rawQuery)
  ])

  res.set('X-Total-Count', `${total}`)
  return res.send(camelcaseKeys(customers, { deep: true }))
}

function prepareRawQuery(customerInfo: CustomerType) {
  const { kataKanaCharacters, hiraganaCharacters, halfWidthKatakana } =
    convertKanaToOthersCharacter(String(customerInfo.customerName))
  const removedDashTel = customerInfo.tel
    ? customerInfo.tel.replaceAll(/[^0-9]/g, '')
    : ''

  let rawQuery = Prisma.sql`SELECT customer.*
    ${
      customerInfo.orderBy === sortTypes.numberOfBookings
        ? Prisma.sql`, COUNT(*) as totalBookingDetails`
        : customerInfo.orderBy === sortTypes.totalAmountOfInvoices
        ? Prisma.sql`, SUM(invoice.total_amount) as totalAmount`
        : Prisma.empty
    } 
    FROM customer
    ${
      customerInfo.orderBy === sortTypes.numberOfBookings
        ? Prisma.sql`
          LEFT JOIN booking ON booking.customer_id = customer.id
          LEFT JOIN booking_detail ON booking.id = booking_detail.booking_id
        `
        : customerInfo.orderBy === sortTypes.totalAmountOfInvoices
        ? Prisma.sql`
            LEFT JOIN booking ON booking.customer_id = customer.id
            LEFT JOIN invoice ON booking.id = invoice.booking_id
          `
        : Prisma.empty
    }
    WHERE customer.is_enabled = true
    ${
      customerInfo.id
        ? Prisma.sql`AND customer.id = ${+customerInfo.id}`
        : customerInfo.matchableId
        ? Prisma.sql`AND customer.id LIKE ${`%${+customerInfo.matchableId}%`}`
        : Prisma.empty
    }
    ${
      customerInfo.customerName
        ? Prisma.sql`
        AND (
          customer.name LIKE ${`%${hiraganaCharacters}%`}
          OR
          customer.name LIKE ${`%${kataKanaCharacters}%`}
          OR
          customer.name LIKE ${`%${halfWidthKatakana}%`}
          OR
          customer.name_kana LIKE ${`%${hiraganaCharacters}%`}
          OR
          customer.name_kana LIKE ${`%${kataKanaCharacters}%`}
          OR
          customer.name_kana LIKE ${`%${halfWidthKatakana}%`}
        )`
        : Prisma.empty
    }
    ${
      customerInfo.contactName
        ? Prisma.sql`
        AND (
          customer.contact_name_1 LIKE ${`%${customerInfo.contactName}%`}
          OR customer.contact_name_2 LIKE ${`%${customerInfo.contactName}%`}
          OR customer.contact_name_3 LIKE ${`%${customerInfo.contactName}%`}
        )`
        : Prisma.empty
    }
    ${
      customerInfo.tel
        ? Prisma.sql`
        AND (
          REGEXP_REPLACE(tel, '[^0-9]', '') LIKE ${`%${removedDashTel}%`}
          OR REGEXP_REPLACE(contact_tel_1, '[^0-9]', '') LIKE ${`%${removedDashTel}%`}
          OR REGEXP_REPLACE(contact_tel_2, '[^0-9]', '') LIKE ${`%${removedDashTel}%`}
          OR REGEXP_REPLACE(contact_tel_3, '[^0-9]', '') LIKE ${`%${removedDashTel}%`}
        )`
        : Prisma.empty
    }
    ${
      customerInfo.orderBy === sortTypes.numberOfBookings ||
      customerInfo.orderBy === sortTypes.totalAmountOfInvoices
        ? Prisma.sql`GROUP BY customer.id`
        : Prisma.empty
    }
  `

  return rawQuery
}

async function getTotal(rawQuery: any) {
  const totalCustomer: any[] =
    await prisma.$queryRaw`SELECT COUNT(*) as total FROM (${rawQuery}) as total`

  return totalCustomer[0].total
}

function fetchCustomers(rawQuery: any, customerInfo: CustomerType) {
  const { page = 1, limit, orderBy = sortTypes.id } = customerInfo
  const offset = limit ? limit * (page - 1) : undefined
  const paginationQuery =
    limit && page
      ? Prisma.sql`
        LIMIT ${limit}
        OFFSET ${offset}
      `
      : Prisma.empty

  return prisma.$queryRaw`
    ${rawQuery}
    ORDER BY
    ${
      orderBy === sortTypes.id
        ? Prisma.sql`id desc`
        : orderBy === sortTypes.numberOfBookings
        ? Prisma.sql`totalBookingDetails desc`
        : orderBy === sortTypes.totalAmountOfInvoices
        ? Prisma.sql`totalAmount desc`
        : orderBy === sortTypes.limitless
        ? Prisma.sql`id asc`
        : Prisma.empty
    }
    ${paginationQuery}
  `
}

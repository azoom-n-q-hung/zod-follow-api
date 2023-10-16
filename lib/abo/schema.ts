import { z } from 'zod'
import { ZodiosEndpointParameter } from '@zodios/core'
// @ts-ignore
import { DecimalJSLikeSchema } from './schemas'

export function generateDecimalGenerator({ message, emptyMessage = '未入力です' }: { message?: string, emptyMessage?: string } = {}) {
  return z.union([z.number({ invalid_type_error: message }), z.string().min(1, { message: emptyMessage }), DecimalJSLikeSchema]).refine(v => {
    if (!v && v != 0) return false
    return (
      (typeof v === 'object' && 'd' in v && 'e' in v && 's' in v) ||
      (typeof v === 'string' && /^\d{0,1}\d*\.{0,1}\d+$/.test(v)) ||
      (typeof v === 'number' && /^\d{0,1}\d*\.{0,1}\d+$/.test(`${v}`))
    )
  }, { message })
}

export const PaginationSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).default(50),
})

export const SortSchema = z.object({
  orderBy: z.number()
})

export const UserSchema = z.object({
  username: z.string(),
  password: z.string(),
  name: z.string()
})

export function generatePaginationApiDefinitionParameters (): ZodiosEndpointParameter[] {
  return [
    {
      name: 'page',
      type: 'Query',
      description: 'Page number',
      schema: PaginationSchema.shape.page.optional()
    },
    {
      name: 'limit',
      type: 'Query',
      description: 'Page size',
      schema: PaginationSchema.shape.limit.optional()
    }
  ]
}

export const BookingScheduleSchema = z.object({
  date: z.string({ required_error: '未入力です' }),
  includeRoomsetBookings: z.string()
})

export const RoomChargeCustomizeSchema = z.object({
  endDate: z
    .string({ invalid_type_error: '料金の変更を予約しませんでした' })
    .nullable()
})

export function validIntegerNumber({
  message,
  min = 0,
  minMessage
}: { message?: string; min?: number; minMessage?: string } = {}) {
  return z
    .number({ invalid_type_error: message })
    .min(min, { message: minMessage || message })
    .refine(
      v => {
        if (!`${v}`) return false
        return /^[0-9]+$/.test(`${v}`)
      },
      { message }
    )
}

export function validDateField(messages: { [key: string]: string }) {
  return z.coerce.date({
    errorMap(issue: any, context) {
      if (messages[issue.code]) {
        return { message: messages[issue.code] }
      }
      return { message: context.defaultError }
    }
  })
}

export function validYearRules() {
  return z
    .union([
      z.string().nonempty('未入力です'),
      z.number({ invalid_type_error: '数字のみで入力してください' })
    ])
    .refine(
      (value: number | string) => {
        if (!`${value}`) {
          return false
        }
        return /^\d{4}$/.test(`${value}`)
      },
      { message: '4桁で入力してください' }
    )
}

export function validMonthRules() {
  return z
    .number({
      required_error: '未入力です',
      invalid_type_error: '数字のみで入力してください'
    })
    .min(1)
    .max(12)
}

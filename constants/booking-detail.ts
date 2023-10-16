export const cancelTypes = {
  normal: 1,
  student: 2,
  others: 3
} as const

export const cancelDayLimit = {
  normal: 14,
  student: 30
} as const

export const cancelDayPolicies = {
  student: 100,
  inDueDate: 50,
  outOfDate: 100
} as const

export const businessHour = { start: '09:00', end: '21:00' } as const

export const workingHour = { start: '07:00', end: '23:00' } as const

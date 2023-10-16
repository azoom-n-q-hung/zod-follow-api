import { format, getDay } from 'date-fns'
export function getWeekJp(day: number) {
  const weekJp = ['日', '月', '火', '水', '木', '金', '土']

  return weekJp[day]
}

export function getDayJp(currentDate: Date) {
  const date = new Date(currentDate)
  const dayOfWeek = getDay(date)
  const dayOfWeekInJP = getWeekJp(dayOfWeek)
  return format(date, 'yyyy年MM月dd日') + `(${dayOfWeekInJP})`
}

export function getDayWithoutYearJp(currentDate: Date) {
  const date = new Date(currentDate)
  const dayOfWeek = getDay(date)
  const dayOfWeekInJP = getWeekJp(dayOfWeek)
  return format(date, 'M月d日') + `(${dayOfWeekInJP})`
}

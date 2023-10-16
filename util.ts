export function isKanaCharacters(string: string): boolean {
  return /^([ァ-ンｧ-ﾝﾞﾟー])+$/.test(string)
}

export function isTel(string: string): boolean {
  return /^\(?([0-9]{2,3})\)?[- ]?([0-9]{4})[- ]?([0-9]{4,5})$/.test(string)
}

export function isPostalCode(string: string): boolean {
  return /^[0-9]{3}-?[0-9]{4}$/.test(string)
}

export function isEmail(string: string): boolean {
  return /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(string)
}

export function isNumber(string: string): boolean {
  return /^\d+$/.test(string)
}

export function isNumeric(string: string): boolean {
  return /^\d{0,1}\d*\.{0,1}\d+$/.test(string)
}

export function isDashNumber(string: string): boolean {
  return !string || /^[\d-]+$/.test(string)
}

export function encodeFileName(fileName: string) {
  return encodeURI(fileName)
}

export function formatDateJp(dateTime: string) {
  const offset = 9 * 60

  return new Date(new Date(dateTime).getTime() + offset * 60 * 1000)
}

export function isValidYear(year: string) {
  return /^\d{4}$/.test(year)
}

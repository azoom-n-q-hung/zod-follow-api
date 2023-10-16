export const types = {
  basicFee: 1,
  overtimeFee: 2,
  food: 3,
  boxLunch: 4,
  drinks: 5,
  cancelFee: 6,
  deliveryFee: 7,
  copyFee: 8,
  bringingFee: 9,
  prepaidFee: 10,
  deviceFee: 11,
  device: 12
}

export const subtotalTypes = {
  serviceFee: 1,
  consumptionTax: 2,
  nonTaxable: 3
}

export const locationTypes = {
  lobby: 1,
  meetingRoom: 2
}

export const fixedServiceIds = {
  basicFee: Number(process.env.BASIC_FEE_SERVICE_ID),
  extensionFee: Number(process.env.EXTENSION_FEE_SERVICE_ID),
  allDayFee: Number(process.env.ALL_DAY_FEE_SERVICE_ID),
  incurredFee: Number(process.env.INCURRED_FEE_SERVICE_ID),
  cancelFee: Number(process.env.CANCELLATION_FEE_SERVICE_ID)
} as const

export const servicesCategories = {
  micro: 1,
  screen: 2,
  projectorStand: 3,
  whiteBoard: 4,
  partition: 5,
  LCDProjector: 6,
  DVD30: 7,
  video30: 8,
  OHP: 9,
  PC: 10,
  LCDProjectorLCDVideo: 11,
  LCDProjectorDVDPlayer: 12,
  casette: 13,
  LCDVideo: 14,
  LCDPlayer: 15,
  informationBoard: 16,
  laserPointer: 17,
  DVDPlayer: 18,
  VCR: 19,
  televisionMonitor30: 20,
  amplifier: 21,
  slide: 22,
  visualAid: 23,
  awardTray: 24,
  businessCardTray: 25,
  highChair: 26,
  roundTable: 27
}
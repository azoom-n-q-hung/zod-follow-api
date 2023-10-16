export const roomSetId = Number(process.env.ROOM_SET_ID)

const ROOM_IN_SET_IDS = process.env.ROOM_IN_SET_IDS || ''
export const roomInSetIds = ROOM_IN_SET_IDS.split(',').map((id: string) =>
  Number(id)
)

import { Request, Response } from 'express'
import { z } from 'zod'
import { format, isEqual } from 'date-fns'
import { prisma } from '@root/database'
import { RoomSchema, RoomChargeSchema } from '@lib/abo'

const Room = RoomSchema.extend({ roomCharges: RoomChargeSchema.array() }).array()
type RoomType = z.infer<typeof Room>

export const apiDefinition = {
  alias: 'getRooms',
  description: 'Get rooms',
  response: Room,
  errorStatuses: [403]
}

export default async (req: Request, res: Response) => {
  const rooms = await getRoom()

  return res.send(formatRooms(rooms))
}

function getRoom() {
  const today = new Date(format(new Date(), 'yyyy-MM-dd'))

  return prisma.room.findMany({
    where: { isEnabled: true },
    orderBy: { id: 'desc' },
    include: {
      roomCharges: {
        where: {
          AND: [
            { startDate: { lte: today } },
            {
              OR: [{ endDate: { equals: null } }, { endDate: { gte: today } }]
            }
          ]
        },
        orderBy: { startDate: 'asc' }
      }
    }
  })
}

function formatRooms(rooms: RoomType) {
  return rooms.map(({ roomCharges, ...room }) => {
    return { ...room, roomCharge: findRoomCharge(roomCharges) }
  })
}

function findRoomCharge(roomCharges: any) {
  const today = new Date(format(new Date(), 'yyyy-MM-dd'))
  const [roomCharge, nextRoomCharge] = roomCharges
  const isSameDate =
    isEqual(roomCharge?.endDate, today) &&
    isEqual(today, nextRoomCharge?.startDate)

  return isSameDate ? nextRoomCharge : roomCharge ?? {}
}

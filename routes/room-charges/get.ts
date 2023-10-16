import { Request, Response } from 'express'
import { prisma } from '@root/database'
import { RoomChargeSchema } from '@lib/abo'

export const apiDefinition = {
  alias: 'getRoomCharges',
  description: 'Get room charges',
  parameters: [
    {
      name: 'roomId',
      type: 'Query',
      description: 'Room Id',
      schema: RoomChargeSchema.shape.id
    }
  ],
  response: RoomChargeSchema.array(),
  errorStatuses: [403]
}

export default async (req: Request, res: Response) => {
  const { roomId } = req.query

  const room = await prisma.room.findFirst({ where: { id: Number(roomId) } })
  if (!room) return res.sendStatus(404)

  const roomCharges = await prisma.roomCharge.findMany({
    where: {
      room: { id: Number(roomId) }
    },
    orderBy: { startDate: 'asc' }
  })

  return res.send(roomCharges)
}

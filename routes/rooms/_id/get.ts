import { format } from 'date-fns'
import { Request, Response } from 'express'
import { prisma } from '@root/database'
import { RoomSchema, RoomChargeSchema } from '@lib/abo'

export const apiDefinition = {
  alias: 'getRoom',
  description: 'Get room',
  parameters: [
    {
      name: 'id',
      type: 'Path',
      description: 'Room Id',
      schema: RoomSchema.shape.id
    }
  ],
  response: RoomSchema.extend({ roomCharges: RoomChargeSchema.array() }).array(),
  errorStatuses: [400, 403, 404]
}

export default async (req: Request, res: Response) => {
  const  { id } = req.params

  const today = new Date(format(new Date(), 'yyyy-MM-dd'))
  const room = await prisma.room.findFirst({
    where: { id: +id, isEnabled: true },
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
  if (!room) return res.sendStatus(404)

  return res.send(room)
}

import { Request, Response } from 'express'
import omit from 'lodash/fp/omit'
import { z } from 'zod'
import { ResponseSchemas } from '@azoom/api-definition-util'
import { prisma } from '@root/database'
import { RoomSchema, RoomChargeSchema } from '@lib/abo'

const Room = RoomSchema.omit({
  id: true,
  isEnabled: true,
  createdDatetime: true,
  updatedDatetime: true
}).extend({
  roomCharge: RoomChargeSchema.omit({
    id: true,
    roomId: true,
    startDate: true,
    endDate: true,
    createdDatetime: true,
    updatedDatetime: true
  })
})

export const apiDefinition = {
  alias: 'createRoom',
  description: 'Create room',
  parameters: [
    {
      name: 'room',
      type: 'Body',
      description: `Room`,
      schema: Room
    }
  ],
  response: ResponseSchemas[200].schema,
  errorStatuses: [400, 403]
}

export default async (req: Request, res: Response) => {
  const room = req.body

  const existedRoom = await getRoom(room.name)
  if (existedRoom && existedRoom.isEnabled) return res.sendStatus(400)
  await createRoom(room)

  return res.sendStatus(200)
}

function getRoom(name: string) {
  return prisma.room.findFirst({ where: { name } })
}

function createRoom(room: z.infer<typeof Room>) {
  return prisma.room.create({
    data: {
      ...omit(['roomCharge'], room),
      roomCharges: {
        create: {
          ...room.roomCharge,
          startDate: new Date()
        }
      }
    },
    include: {
      roomCharges: true
    }
  })
}

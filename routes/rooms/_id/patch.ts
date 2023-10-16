import { z } from 'zod'
import { Request, Response } from 'express'
import { format, isBefore, isAfter } from 'date-fns'
import { ResponseSchemas } from '@azoom/api-definition-util'
import { prisma } from '@root/database'
import {
  RoomSchema,
  RoomChargeSchema,
  RoomChargeCustomizeSchema
} from '@lib/abo'

const Room = RoomSchema.omit({
  id: true,
  isEnabled: true,
  createdDatetime: true,
  updatedDatetime: true
})

export const apiDefinition = {
  alias: 'updateRoom',
  description: 'Update room',
  parameters: [
    {
      name: 'id',
      type: 'Path',
      description: 'Room Id',
      schema: RoomSchema.shape.id
    },
    {
      name: 'room',
      type: 'Body',
      description: `Room`,
      schema: Room.extend({
        roomCharge: z.object({
          id: RoomChargeSchema.shape.id,
          startDate: RoomChargeSchema.shape.startDate,
          endDate: RoomChargeCustomizeSchema.shape.endDate
        })
      })
    }
  ],
  response: ResponseSchemas[200].schema,
  errorStatuses: [400, 403, 404]
}

export default async (req: Request, res: Response) => {
  const id = Number(req.params.id)
  const { roomCharge, ...room } = req.body

  const existedRoom = await getRoom(id, roomCharge.id)
  if (!existedRoom) return res.sendStatus(404)
  if (!(await validateRoom(id, room.name, roomCharge))) return res.sendStatus(400)

  if (roomCharge.id) {
    await updateRoomCharge(+roomCharge.id, roomCharge.endDate)
  }
  await updateRoom(id, room)

  return res.sendStatus(200)
}

function getRoom(id: number, roomChargeId: number) {
  return prisma.room.findFirst({
    where: {
      id,
      roomCharges: {
        some: {
          id: roomChargeId
        }
      }
    },
    include: {
      roomCharges: true
    }
  })
}

async function validateRoom(
  roomId: number,
  roomName: string,
  roomCharge: z.infer<typeof RoomChargeSchema>
) {
  const { startDate, endDate, id } = roomCharge
  if (
    (roomName && !!(await getExistedRoomName(roomId, roomName))) ||
    (endDate && isAfter(new Date(startDate), new Date(endDate))) ||
    (endDate && isBefore(
      new Date(endDate),
      new Date(format(new Date(), 'yyyy-MM-dd'))
    )) ||
    (id && !!(await getRoomCharge(roomId, roomCharge)))
  ) {
    return false
  }
  return true
}

function getExistedRoomName(id: number, name: string) {
  return prisma.room.findFirst({
    where: {
      id: { not: id },
      name
    }
  })
}

function getRoomCharge(roomId: number, roomCharge: z.infer<typeof RoomChargeSchema>) {
  const { startDate, endDate, id } = roomCharge
  if (!endDate) {
    return prisma.roomCharge.findFirst({
      where: {
        roomId,
        startDate: { gt: new Date(startDate) }
      }
    })
  }

  return prisma.roomCharge.findFirst({
    where: {
      AND: [
        { roomId },
        { NOT: { id: +id } },
        { startDate: { lte: new Date(endDate) } },
        {
          OR: [{ endDate: { gte: new Date(endDate) } }, { endDate: null }]
        }
      ]
    }
  })
}

function updateRoomCharge(id: number, endDate: Date) {
  return prisma.roomCharge.update({
    where: { id },
    data: { endDate: endDate ? new Date(endDate) : null }
  })
}

function updateRoom(id: number, room: z.infer<typeof Room>) {
  return prisma.room.update({
    where: { id },
    data: room
  })
}

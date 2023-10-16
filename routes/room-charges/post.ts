import z from 'zod'
import { format, subDays } from 'date-fns'
import { Request, Response } from 'express'
import { ResponseSchemas } from '@azoom/api-definition-util'
import { prisma } from '@root/database'
import { RoomChargeSchema } from '@lib/abo'

const RoomCharge = RoomChargeSchema.omit({
  id: true,
  endDate: true,
  createdDatetime: true,
  updatedDatetime: true
})

type RoomChargeType = z.infer<typeof RoomCharge>

export const apiDefinition = {
  alias: 'createRoomCharge',
  description: 'Create room charge',
  parameters: [
    {
      name: 'roomCharge',
      type: 'Body',
      description: 'Room Charge',
      schema: RoomCharge
    }
  ],
  response: ResponseSchemas[200].schema,
  errorStatuses: [400, 403]
}

export default async (req: Request, res: Response) => {
  const { startDate, roomId } = req.body

  const room = await prisma.room.findFirst({ where: { id: +roomId } })
  if (!room) return res.sendStatus(404)
  if (!!(await getExitedRoomCharge(startDate, +roomId))) return res.status(400).send({
    errorMessage: '料金の変更を予約しませんでした'
  })

  await createRoomCharge(+roomId, req.body)

  const roomCharge = await getRoomCharge(+roomId, req.body)
  if (roomCharge) {
    await updateRoomChargeStartDate(roomCharge.id, req.body.startDate)
  }

  return res.sendStatus(200)
}

function getExitedRoomCharge(startTime: string, roomId: number) {
  const today = new Date(format(new Date(), 'yyyy-MM-dd'))
  const startDate = new Date(startTime)

  if (today > startDate) return true

  return prisma.roomCharge.findFirst({
    where: {
      AND: [
        { roomId: +roomId },
        {
          OR: [
            { startDate: startDate },
            {
              endDate: startDate,
              NOT: [{ endDate: today }]
            },
            {
              AND: [
                { startDate: { lt: startDate } },
                { endDate: { gt: startDate } }
              ]
            }
          ]
        }
      ]
    }
  })
}

function getRoomCharge(roomId: number, params: RoomChargeType) {
  return prisma.roomCharge.findFirst({
    where: {
      roomId: +roomId,
      endDate: null,
      startDate: { lt: new Date(params.startDate) }
    },
    orderBy: { startDate: 'desc' }
  })
}

async function updateRoomChargeStartDate(roomChargeId: number, startDate: Date) {
  return prisma.roomCharge.update({
    data: { endDate: subDays(new Date(startDate), 1) },
    where: { id: roomChargeId }
  })
}

function createRoomCharge(roomId: number, params: RoomChargeType) {
  return prisma.roomCharge.create({
    data: {
      roomId: +roomId,
      basicPrice: params.basicPrice,
      extensionPrice: params.extensionPrice,
      allDayPrice: params.allDayPrice,
      subtotalType: params.subtotalType,
      startDate: new Date(params.startDate)
    }
  })
}

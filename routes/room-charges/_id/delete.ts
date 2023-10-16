import { Request, Response } from 'express'
import { ResponseSchemas } from '@azoom/api-definition-util'
import { prisma } from '@root/database'
import { RoomChargeSchema } from '@lib/abo'

export const apiDefinition = {
  alias: 'deleteRoomCharge',
  description: 'Delete room charge',
  parameters: [
    {
      name: 'id',
      type: 'Path',
      description: 'id',
      schema: RoomChargeSchema.shape.id
    }
  ],
  response: ResponseSchemas[200].schema,
  errorStatuses: [400, 403, 404]
}

export default async (req: Request, res: Response) => {
  const { id } = req.params

  const roomCharge = await prisma.roomCharge.findFirst({ where: { id: +id } })
  if (!roomCharge) return res.sendStatus(404)
  await prisma.roomCharge.delete({ where: { id: +id } })

  return res.sendStatus(200)
}

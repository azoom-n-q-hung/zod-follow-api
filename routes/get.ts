import { Request, Response } from 'express'
import { z } from 'zod'

export const apiDefinition = {
  alias: 'defaultGet',
  description: 'Default Get endpoint',
  response: z.object({
    message: z.string()
  })
}

export default async (req: Request, res: Response) => {
  return res.send({ message: "Everything's ok" })
}

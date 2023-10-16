import { Request, Response } from 'express'
import { getAuth } from 'firebase-admin/auth'
import { ResponseSchemas } from '@azoom/api-definition-util'
import { defaultCookiesOption } from '@constants/app'

export const apiDefinition = {
  alias: 'logout',
  description: 'Logout',
  response: ResponseSchemas[200].schema,
  errorStatuses: [403]
}

export default async (req: Request, res: Response) => {
  const sessionCookie = req.cookies.__session || ''
  res.clearCookie('__session', defaultCookiesOption)
  res.cookie('__shouldVerify', false, { ...defaultCookiesOption, httpOnly: false })
  try {
    const { sub } = await getAuth().verifySessionCookie(sessionCookie, true)
    await getAuth().revokeRefreshTokens(sub)

    return res.sendStatus(200)
  } catch (error) {
    return res.sendStatus(200)
  }
}

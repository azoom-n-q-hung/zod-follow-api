import { Request, Response } from 'express'
import { getAuth } from 'firebase-admin/auth'
import { aboAdminName } from '@constants/app'
import { UserSchema } from '@lib/abo'

export const apiDefinition = {
  alias: 'me',
  description: 'Me',
  response: UserSchema.omit({ password: true }),
  errorStatuses: [403]
}

export default async (req: Request, res: Response) => {
  const sessionCookie = req.cookies.__session || ''
  try {
    const decodedClaims = await (getAuth().verifySessionCookie(sessionCookie) as any)
    const usernameLength = decodedClaims.email.indexOf(process.env.FIREBASE_EMAIL_POSTFIX)
    const userCredential = {
      username: decodedClaims.email.substring(0, usernameLength),
      name: aboAdminName
    }

    return res.send(userCredential)
  } catch (error) {
    return res.sendStatus(401)
  }
}

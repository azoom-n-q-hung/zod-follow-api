import z from 'zod'
import { Request, Response } from 'express'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import {
  getAuth as getClientAuth,
  signInWithEmailAndPassword
} from 'firebase/auth'
import { aboAdminName, defaultCookiesOption } from '@constants/app'
import { UserSchema } from '@lib/abo'

const User = UserSchema.omit({ name: true })
type UserType = z.infer<typeof User>
export const apiDefinition = {
  alias: 'login',
  description: 'Login',
  parameters: [
    {
      name: 'user',
      type: 'Body',
      description: 'User',
      schema: User
    }
  ],
  response: UserSchema.omit({ password: true }),
  errorStatuses: [400, 403]
}

export default async (req: Request, res: Response) => {
  const { username = '', password = '' } = req.body
  const auth = getClientAuth()
  const userCredential = await signIn({ username, password }, auth)

  const { user, isAuthenticatied }:any = userCredential
  if (!isAuthenticatied) return res.sendStatus(400)

  const idToken = await user.getIdToken()
  const expiresIn = 14 * 24 * 60 * 60 * 1000 // maximum 2 weeks
  const sessionCookie = await getAdminAuth().createSessionCookie(idToken, {
    expiresIn
  })

  res.cookie('__session', sessionCookie, defaultCookiesOption)
  res.cookie('__shouldVerify', true, { ...defaultCookiesOption, httpOnly: false })
  return res.end(JSON.stringify({ username, name: aboAdminName }))
}

function signIn({ username, password }: UserType, auth: any) {
  return signInWithEmailAndPassword(
    auth,
    `${username}${process.env.FIREBASE_EMAIL_POSTFIX}`,
    password
  )
    .then(userCredential => ({ ...userCredential, isAuthenticatied: true }))
    .catch(() => ({ isAuthenticatied: false }))
}

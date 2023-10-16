import express from 'express'
import { Request, Response, NextFunction } from 'express'
import { getAuth } from 'firebase-admin/auth'
import { defaultCookiesOption } from '@root/constants/app'

const whitelistUrls = ['/login', '/logout']
const router = express.Router()

export const firebaseAuthMiddleware = router.use(async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (whitelistUrls.includes(req.path)) {
    return next()
  }

  const sessionCookie = req.cookies.__session || ''
  try {
    await getAuth().verifySessionCookie(sessionCookie, true)
    return next()
  } catch (error) {
    res.cookie('__shouldVerify', false, { ...defaultCookiesOption, httpOnly: false })
    res.clearCookie('__session', defaultCookiesOption)
    return res.sendStatus(401)
  }
})

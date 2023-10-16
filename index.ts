import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import statuses from 'statuses'
import cookie from 'cookie-parser'
import { serve, setup } from 'swagger-ui-express'
import dotenv from 'dotenv';
import { zodiosApp, zodiosRouter } from '@zodios/express'
import { openApiBuilder } from '@zodios/openapi'
import nnnRouter from '@azoom/nnn-router'
import { generateApis } from '@azoom/api-definition-util'
import { initializeApp as initializeFirebaseAdmin } from 'firebase-admin/app'
import { initializeApp as initializeFirebaseClient } from 'firebase/app'
import { firebaseAuthMiddleware } from '@root/middleware/firebase'

dotenv.config();

// Customize express response
express.response.sendStatus = function (statusCode: number) {
  const body = { message: statuses(statusCode) || String(statusCode) }
  this.statusCode = statusCode
  this.type('json')
  this.send(body)
  return this
}

initializeFirebaseAdmin({
  projectId: process.env.FIREBASE_PROJECT_ID
})

initializeFirebaseClient({
  apiKey: process.env.FIREBASE_APIKEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
})

const apis = await generateApis({ routeFolder: 'dist/routes' })
const expressApp = express()
const app = zodiosApp(apis, { express: expressApp, transform: true })

app.use(
  cors({
    origin: true,
    credentials: true,
    exposedHeaders: ['X-Total-Count', 'X-File-Name']
  }),
  express.urlencoded({ extended: true, limit: '50mb' }),
  express.json({ limit: '10mb' }),
  express.text(),
  cookie()
)

app.use(firebaseAuthMiddleware)

app.use(
  nnnRouter({
    routeDir: '/dist/routes',
    baseRouter: zodiosRouter(apis, { transform: true })
  })
)
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(error)
  return res.sendStatus(500)
})

const document = openApiBuilder({
  version: process.env.npm_package_version || '',
  title: 'Abo API',
  description: 'Abo API'
})
  .addServer({ url: process.env.API_URL || '' })
  .addPublicApi(apis)
  .build()
app.use(`/docs/oas.json`, (_, res) => res.json(document))
app.use('/docs', serve)
app.use('/docs', setup(undefined, { swaggerUrl: '/docs/oas.json' }))

const port = process.env.PORT || 5000
app.listen(port, () => {
  console.log(`Listening on port ${port}`)
})

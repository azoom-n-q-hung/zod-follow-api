// @ts-ignores
import { createEndpoint } from '@azoom/node-util'
import got from 'got'

const docGalleryAPI =
  process.env.NODE_ENV === 'development'
    ? got.extend({ prefixUrl: process.env.DOC_GALLERY_API })
    : createEndpoint({ prefixUrl: process.env.DOC_GALLERY_API })

export { docGalleryAPI }

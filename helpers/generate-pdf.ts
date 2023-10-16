import os from 'os'
import fs from 'fs'
import { format } from 'date-fns'
import { docGalleryAPI } from '@endpoints/doc-gallery-api'

const generatePdf = async (
  template: string,
  fileContent: any,
  fileName = ''
) => {
  const downloadFileName = !fileName
    ? `${template}_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`
    : `${fileName}.pdf`
  const filePath = `${os.tmpdir()}/${downloadFileName}`

  const buffer = await docGalleryAPI
    .post(`pdf/${template}.pdf`, {
      json: {
        params: fileContent
      }
    })
    .buffer()
  await fs.promises.writeFile(filePath, buffer)
  setTimeout(async function () {
    await fs.promises.unlink(filePath)
  }, 5000)

  return { filePath, downloadFileName }
}

export default generatePdf

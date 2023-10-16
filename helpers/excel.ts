import excel from 'exceljs'
import { rowRevenueUsedBackground } from '@constants/excel' 

export async function createExcelFile(
  rowsData: any[],
  sheetName: string,
  excelTitles: any[]
) {
  const workbook = new excel.Workbook()
  const sheet = workbook.addWorksheet(sheetName)
  sheet.addRow(excelTitles.map(({ title }: { title: string }) => title))
  sheet.addRows(rowsData)
  formatWorksheet(sheet, excelTitles)
  return workbook
}

export async function createRevenueExcelFile(sheetName: string, colsData: Object[]) {
  const workbook = new excel.Workbook()
  const sheet = workbook.addWorksheet(sheetName)

  colsData.forEach((col: Object, key: number) => {
    sheet.getColumn(key + 1).values = Object.values(col)
  })
  formatWorksheet(sheet, colsData, true)

  return workbook
}

export async function createRevenueBetweenMonthlyExcelFile(
  rowsData: any[],
  sheetName: string,
  excelTitles: any[]
) {
  const workbook = new excel.Workbook()
  const sheet = workbook.addWorksheet(sheetName)
  sheet.addRow(excelTitles.map(({ title }: { title: string }) => title))
  sheet.addRows(rowsData)
  formatWorksheet(sheet, excelTitles, true)

  return workbook
}

function formatWorksheet(sheet: any, options: any[], isRevenue = false) {
  options.forEach((styles: any, index: number) => {
    const { width, background } = styles
    const column = sheet.getColumn(++index)
    column.width = width ? width : 16
    if (isRevenue && index == options.length) return

    column.eachCell({ includeEmpty: true }, (cell: any) => {
      cell.alignment = {
        vertical: 'bottom'
      }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: background }
      }
      cell.numFmt = '#,##0'
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
        bottom: { style: 'thin' }
      }
    })
  })
  if (isRevenue) {
    rowRevenueUsedBackground.map((row) => {
      sheet.getRow(row).eachCell({}, (cell: any) => {
        cell.fill = {
          ...cell.fill,
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'ffcc99' }
        }
      })
    })
  }

  sheet.getRow(1).eachCell({}, (cell: any) => {
    cell.alignment = {
      ...cell.alignment,
      horizontal: 'left'
    }
    cell.font = {
      ...cell.font,
      bold: true
    }
    cell.fill = {
      ...cell.fill,
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: isRevenue ? '33cccc' : 'ffbfbf' }
    }
  })
}

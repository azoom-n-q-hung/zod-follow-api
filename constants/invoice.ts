type ProvisoValue = {
  value: number
  label: string | ((taxAmout: number | string) => string)
}

export const provisos = {
  default: { value: 0, label: '' },
  roomFee: { value: 1, label: '会議室使用料' },
  locationFee: { value: 2, label: '会場使用料' },
  deviceFee: { value: 3, label: '機器使用料' },
  drinkFee: { value: 4, label: '飲み物代' },
  foodFee: { value: 5, label: '飲食代' },
  copyFee: { value: 6, label: 'コピー代' },
  faxFee: { value: 7, label: 'ＦＡＸ代' },
  cancelFee: { value: 8, label: 'キャンセル料' },
  taxFee: {
    value: 9,
    label(taxAmount: number | string): string {
      return `内消費税￥${taxAmount ?? '_'} 含む`
    }
  },
  labelOf(value: number, taxAmount?: number | string): string {
    const obj = Object.values(provisos).find(proviso => {
      return typeof proviso === 'object' && proviso.value === value
    }) as undefined | ProvisoValue

    if (!obj) return this.default.label
    return typeof obj.label === 'function' ? obj.label(taxAmount!) : obj.label
  }
}

export const invoiceStatuses = {
  canceled: 0,
  completed: 1 
}

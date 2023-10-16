import { prisma } from '@root/database'
import { subtotalTypes } from '@constants/service'
import _ from 'lodash/fp'

export async function calculateAmountsByInvoiceItemIds(invoiceItemIds: number[], taxRate: number) {
  const invoiceItems = await prisma.invoiceItem.findMany({
    select: {
      subtotalWithoutTaxAmount: true,
      serviceId: true
    },
    where : {
      id: {
        in: invoiceItemIds
      }
    }
  })
  const invoiceItemsAttachedService = await Promise.all(
    invoiceItems.map(item => attachServiceToInvoiceItem(item))
  )
  const bookingDetailsWithDiscountAmount = _.uniqBy('bookingDetailId',
    (await Promise.all(invoiceItemIds.map(id => extractBookingDetailByInvoiceItemId(id))))
      .filter(item => item?.bookingDetail?.discountAmount)
  )

  const serviceFee = calculateServiceFee(invoiceItemsAttachedService, taxRate)
  const discountWithoutTaxAmount = bookingDetailsWithDiscountAmount.reduce((acc, item) => {
    return acc - Number(item?.bookingDetail?.discountAmount)
  }, 0)
  
  const invoiceItemWihoutTaxAmount = invoiceItemsAttachedService.reduce((acc, invoiceItem) => {
    return acc + Number(invoiceItem.subtotalWithoutTaxAmount)
  }, serviceFee)
  const subtotalWithoutTaxAmount = invoiceItemWihoutTaxAmount + discountWithoutTaxAmount

  const invoiceItemTaxableAmount = invoiceItemsAttachedService.reduce((acc, invoiceItem) => {
    return invoiceItem.subtotalType !== subtotalTypes.nonTaxable
      ? acc + Number(invoiceItem.subtotalWithoutTaxAmount)
      : acc
  }, serviceFee)
  const taxableAmount = invoiceItemTaxableAmount + discountWithoutTaxAmount
  const taxAmount = calculateTaxAmount(taxableAmount, taxRate)
  const subTotal = subtotalWithoutTaxAmount + taxAmount

  return {
    serviceFee,
    discountWithoutTaxAmount,
    subtotalWithoutTaxAmount,
    taxableAmount,
    taxAmount,
    subTotal
  }
}

async function attachServiceToInvoiceItem(item: any) {
  const service = await prisma.service.findFirst({
    select: {
      subtotalType: true
    },
    where: {
      id: item.serviceId
    }
  })
  return {
    ...item,
    subtotalType: service?.subtotalType
  }
}

async function extractBookingDetailByInvoiceItemId(invoiceItemId: number) {
  return await prisma.invoiceItem.findFirst({
    select: {
      id: true,
      bookingDetailId: true,
      bookingDetail: {
        select: {
          discountAmount: true
        }
      }
    },
    where: {
      id: invoiceItemId
    }
  })
}

function calculateServiceFee(invoiceItems: any[], taxRate: number) {
  const serviceFee = invoiceItems.reduce((acc, invoiceItem) => {
    return invoiceItem.subtotalType === subtotalTypes.serviceFee
      ? acc + Number(invoiceItem.subtotalWithoutTaxAmount)
      : acc
  }, 0)
  return Math.floor(serviceFee / 100 * taxRate)
}

export function calculateTaxAmount(amount: number, taxRate: number) {
  return Math.floor(amount / 100 * taxRate)
}
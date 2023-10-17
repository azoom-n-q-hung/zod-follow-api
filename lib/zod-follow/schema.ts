import { z } from 'zod'

export function aCustomValidateFuntion() {
  return z.number().min(1).max(99)
}

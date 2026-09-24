import { submitOrder } from '../utils/orders'

export default defineEventHandler(async (event) => {
  const order = await submitOrder(await readBody(event))
  setResponseStatus(event, 201)
  return order
})

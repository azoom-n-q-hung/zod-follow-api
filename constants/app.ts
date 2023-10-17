export const defaultCookiesOption = {
  maxAge: 14 * 24 * 60 * 60 * 1000, // maximum 2 weeks,
  httpOnly: true,
  secure: true,
  domain: process.env.DOMAIN_POSTFIX
}

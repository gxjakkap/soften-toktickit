/** Angular commit convention (via @commitlint/config-conventional), restricted
 * to a single-line message: no body, no footer. */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'body-empty': [2, 'always'],
    'footer-empty': [2, 'always'],
  },
}

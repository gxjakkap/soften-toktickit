/** Angular commit convention (via @commitlint/config-conventional), restricted
 * to a single-line message: no body, no footer.
 *
 * body-empty/footer-empty already block the standard "Co-authored-by:" /
 * "Signed-off-by:" trailer mechanism, since a trailer is itself a footer.
 * The local no-attribution rule closes the remaining gap: the same text
 * typed inline into the header instead of as a real trailer. */
const ATTRIBUTION_PATTERN =
  /(co-authored-by|signed-off-by|generated[- ]with|generated[- ]by|\bclaude\b|\banthropic\b)/i

module.exports = {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'no-attribution': (parsed) => {
          const hit = ATTRIBUTION_PATTERN.test(parsed.header || '')
          return [
            !hit,
            'commit message must not credit an AI tool (no Co-authored-by/Signed-off-by/Generated-with/Claude/Anthropic)',
          ]
        },
      },
    },
  ],
  rules: {
    'body-empty': [2, 'always'],
    'footer-empty': [2, 'always'],
    'no-attribution': [2, 'always'],
  },
}

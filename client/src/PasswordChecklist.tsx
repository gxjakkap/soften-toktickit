import { PASSWORD_RULES } from './lib/password-rules'

// ui-spec.md §3/§7 (BR-10): live rule checklist shared by Change Password
// and the Administrator's Create/Edit User password fields.
function PasswordChecklist({ value }: { value: string }) {
  return (
    <ul className="zg-rule-list" aria-label="Password rules">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(value)
        return (
          <li key={rule.label} className={ok ? 'is-met' : undefined}>
            <i className={`bi ${ok ? 'bi-check-circle-fill' : 'bi-circle'}`} aria-hidden="true" />
            {rule.label}
            <span className="zg-visually-hidden">{ok ? ' (met)' : ' (not met)'}</span>
          </li>
        )
      })}
    </ul>
  )
}

export default PasswordChecklist

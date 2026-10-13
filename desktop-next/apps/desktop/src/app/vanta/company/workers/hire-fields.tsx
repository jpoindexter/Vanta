import type { CompanyResponse, ProviderOption } from '@/api/vanta-company-schemas'

import { Field } from '../ui/field'

import type { HireFormValues } from './hire-form'

interface HireFieldsProps {
  busy: boolean
  company: CompanyResponse | null
  onChange: (key: keyof HireFormValues, value: string) => void
  providers: ProviderOption[] | null
  values: HireFormValues
}

function RuntimeField({
  onChange,
  providers,
  value
}: {
  onChange: (id: string) => void
  providers: ProviderOption[] | null
  value: string
}) {
  if (!providers || providers.length === 0) {
    return (
      <Field hint="Providers did not load. Type a provider id such as openai." label="Runtime">
        <input className="vc-input" onChange={event => onChange(event.target.value)} value={value} />
      </Field>
    )
  }

  const model = providers.find(provider => provider.id === value)?.defaultModel

  return (
    <Field hint={model ? `Runs on ${model}, the provider's default model.` : undefined} label="Runtime">
      <select className="vc-input" onChange={event => onChange(event.target.value)} value={value}>
        {providers.map(provider => (
          <option key={provider.id} value={provider.id}>
            Vanta native · {provider.label}
          </option>
        ))}
      </select>
    </Field>
  )
}

interface PickProps {
  busy: boolean
  empty: string
  label: string
  onChange: (value: string) => void
  options: Array<{ id: string; name: string }>
  value: string
}

function Pick({ busy, empty, label, onChange, options, value }: PickProps) {
  return (
    <Field label={label}>
      <select className="vc-input" disabled={busy} onChange={event => onChange(event.target.value)} value={value}>
        <option value="">{empty}</option>
        {options.map(option => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </Field>
  )
}

/** The form body of the hire dialog: role, title, runtime (with the model it will use), manager, department, budget. */
export function HireFields({ busy, company, onChange, providers, values }: HireFieldsProps) {
  const set = (key: keyof HireFormValues) => (value: string) => onChange(key, value)

  return (
    <>
      <Field label="Role">
        <input
          className="vc-input"
          data-autofocus=""
          disabled={busy}
          onChange={event => set('role')(event.target.value)}
          placeholder="Engineer"
          required
          value={values.role}
        />
      </Field>
      <Field label="Title (optional)">
        <input
          className="vc-input"
          disabled={busy}
          onChange={event => set('title')(event.target.value)}
          value={values.title}
        />
      </Field>
      <RuntimeField onChange={set('adapter')} providers={providers} value={values.adapter} />
      <Pick
        busy={busy}
        empty="Nobody (top of the org)"
        label="Reports to"
        onChange={set('managerId')}
        options={company?.workers ?? []}
        value={values.managerId}
      />
      {company && company.departments.length > 0 && (
        <Pick
          busy={busy}
          empty="None"
          label="Department"
          onChange={set('departmentId')}
          options={company.departments}
          value={values.departmentId}
        />
      )}
      <Field hint="Leave empty for no spending cap." label="Budget (US dollars)">
        <input
          className="vc-input"
          disabled={busy}
          inputMode="decimal"
          onChange={event => set('budget')(event.target.value)}
          value={values.budget}
        />
      </Field>
    </>
  )
}

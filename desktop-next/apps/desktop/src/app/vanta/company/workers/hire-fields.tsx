import type { CompanyResponse, ProviderOption, RuntimeOption } from '@/api/vanta-company-schemas'

import { NATIVE_RUNTIME } from '../format'
import { Field } from '../ui/field'
import { VcSelect } from '../ui/vc-select'

import type { HireFormValues } from './hire-form'
import { RuntimePicker } from './runtime-picker'

interface HireFieldsProps {
  busy: boolean
  company: CompanyResponse | null
  onChange: (key: keyof HireFormValues, value: string) => void
  providers: ProviderOption[] | null
  runtimes: RuntimeOption[] | null
  values: HireFormValues
}

function ProviderField({
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
      <Field hint="Providers did not load. Type a provider id such as openai." label="Provider">
        <input className="vc-input" onChange={event => onChange(event.target.value)} value={value} />
      </Field>
    )
  }

  const model = providers.find(provider => provider.id === value)?.defaultModel

  return (
    <Field hint={model ? `Runs on ${model}, the provider's default model.` : undefined} label="Provider">
      <VcSelect
        onChange={onChange}
        options={providers.map(provider => ({ label: provider.label, value: provider.id }))}
        value={value}
      />
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
      <VcSelect
        disabled={busy}
        emptyLabel={empty}
        onChange={onChange}
        options={options.map(option => ({ label: option.name, value: option.id }))}
        value={value}
      />
    </Field>
  )
}

/** Who the worker reports to and which department it joins. */
function PlaceFields({
  busy,
  company,
  set,
  values
}: Omit<HireFieldsProps, 'onChange' | 'providers' | 'runtimes'> & {
  set: (key: keyof HireFormValues) => (value: string) => void
}) {
  return (
    <>
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
    </>
  )
}

/** The form body of the hire dialog: role, title, runtime (with the model it will use), manager, department, budget. */
export function HireFields({ busy, company, onChange, providers, runtimes, values }: HireFieldsProps) {
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
      <RuntimePicker busy={busy} onChange={set('runtimeId')} runtimes={runtimes} selected={values.runtimeId} />
      {values.runtimeId === NATIVE_RUNTIME && (
        <ProviderField onChange={set('adapter')} providers={providers} value={values.adapter} />
      )}
      <PlaceFields busy={busy} company={company} set={set} values={values} />
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

import { useI18n } from '@/i18n'

/** Stands in for an embedded hub page while no Vanta hub origin is configured. */
export function HubNotConfigured() {
  const { t } = useI18n()

  return (
    <p className="px-3 py-2 text-[0.8125rem] leading-5 text-(--ui-text-tertiary)" data-slot="hub-not-configured">
      {t.skills.hub.notConfigured}
    </p>
  )
}

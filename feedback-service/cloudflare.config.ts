import { bindings, defineConfig } from 'cf/config'

export default defineConfig({
  accountId: '1ab142627b6fa8e6c36dae2ed2f8ed4f',
  worker: {
    name: 'vanta-feedback',
    entrypoint: './receiver.ts',
    compatibilityDate: '2026-11-17',
    workersDev: true,
    placement: { mode: 'smart' },
    observability: {
      enabled: true, redactQueryString: true,
      logs: { enabled: true, headSamplingRate: 0.1 },
      traces: { enabled: true, headSamplingRate: 0.01 }
    },
    env: {
      DB: bindings.d1({ name: 'vanta-feedback', id: '20dec59b-3c56-4766-8fb9-8dce6380d229' }),
      REPORT_LIMITER: bindings.rateLimit({ namespace: '2002', simple: { limit: 5, period: 60 } }),
      EMAIL: bindings.sendEmail({ destinationAddress: 'jason@theft.studio' }),
      FEEDBACK_FROM: bindings.text('feedback@reports.theft.studio')
    }
  }
})

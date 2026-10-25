import { describe, expect, it } from 'vitest'

import { TRANSLATIONS } from './catalog'

const labels = {
  en: ['Chats', 'Schedules'], fr: ['Discussions', 'Programmations'],
  de: ['Chats', 'Zeitpläne'], es: ['Chats', 'Programaciones'],
  ja: ['チャット', 'スケジュール'], zh: ['聊天', '日程'],
  'zh-hant': ['聊天', '排程'], ar: ['المحادثات', 'الجداول'], ru: ['Чаты', 'Расписания']
} as const

describe('everyday sidebar copy', () => {
  for (const [locale, [chats, schedules]] of Object.entries(labels)) {
    it(`${locale} names chats consistently in the pane and search`, () => {
      const copy = TRANSLATIONS[locale as keyof typeof labels].sidebar

      expect(copy.sessions).toBe(chats)
      expect(copy.cronJobs).toBe(schedules)
      expect(copy.searchAria).toBeTruthy()
      expect(copy.searchPlaceholder).toBe(`${copy.searchAria}…`)
      expect(copy.noSessions).toBeTruthy()
    })
  }
})

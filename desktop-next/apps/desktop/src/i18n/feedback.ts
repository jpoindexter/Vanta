import { enSupportFeedback, localizedSupportFeedback } from './feedback-support';

export const enFeedback = {
  ...enSupportFeedback,
  title: "Send feedback",
  notice:
    "Send privately to Jason at jason@theft.studio. Only the report below is shared. Chats, files, screenshots and logs are not collected. Don’t include passwords or secrets. Your draft stays on this device until you send it.",
  bug: "Something broke",
  idea: "An idea",
  summary: "In one line",
  detailsBug: "What happened",
  detailsIdea: "What would help",
  steps: "Steps or context (optional)",
  facts: "Include app version and platform only",
  factsUnavailable:
    "Build facts are unavailable; you can still send your report.",
  preview: "Review the exact report",
  send: "Send privately",
  retry: "Retry report",
  copy: "Copy report",
  storageError:
    "Couldn’t save a local retry copy. No new send was started. Copy your report before closing.",
  deliveryError:
    "Delivery is not confirmed. Your report is kept and locked for a same-ID retry, so it won’t notify twice.",
  prepareError: "Add a short title and description before sending.",
  received: "Report received. Reference:",
  notificationSent:
    "The email service accepted the notification; inbox arrival is not confirmed.",
  notificationUncertain:
    "Your report is stored privately. The email notification is not confirmed; there is no need to send again.",
  sending: "Sending…",
};
export type FeedbackCopy = typeof enFeedback;

export const localizedFeedback: Record<
  "fr" | "de" | "es" | "ja" | "zh" | "zh-hant" | "ar" | "ru",
  FeedbackCopy
> = {
  fr: {
    ...localizedSupportFeedback.fr,
    title: "Envoyer un avis",
    notice:
      "Envoyez ce rapport en privé à Jason : jason@theft.studio. Seul le rapport ci-dessous est partagé. Aucun chat, fichier, capture ou journal n’est collecté. N’incluez aucun secret. Le brouillon reste sur cet appareil avant l’envoi.",
    bug: "Un problème",
    idea: "Une idée",
    summary: "En une ligne",
    detailsBug: "Que s’est-il passé ?",
    detailsIdea: "Qu’est-ce qui vous aiderait ?",
    steps: "Étapes ou contexte (facultatif)",
    facts: "Inclure uniquement la version et la plateforme",
    factsUnavailable: "Version indisponible ; vous pouvez envoyer le rapport.",
    preview: "Vérifier le rapport exact",
    send: "Envoyer en privé",
    retry: "Réessayer le rapport",
    copy: "Copier le rapport",
    storageError:
      "Impossible de conserver une copie locale. Aucun nouvel envoi n’a démarré. Copiez le rapport avant de fermer.",
    deliveryError:
      "Livraison non confirmée. Le rapport est conservé et verrouillé pour réessayer avec le même identifiant, sans double notification.",
    prepareError: "Ajoutez un titre et une description.",
    received: "Rapport reçu. Référence :",
    notificationSent:
      "Le service a accepté la notification ; sa réception dans la boîte mail n’est pas confirmée.",
    notificationUncertain:
      "Rapport conservé en privé. Notification non confirmée ; inutile de renvoyer.",
    sending: "Envoi…",
  },
  de: {
    ...localizedSupportFeedback.de,
    title: "Feedback senden",
    notice:
      "Privat an Jason unter jason@theft.studio senden. Nur der folgende Bericht wird geteilt. Chats, Dateien, Screenshots und Protokolle werden nicht erfasst. Keine Passwörter oder Geheimnisse einfügen. Der Entwurf bleibt bis zum Senden auf diesem Gerät.",
    bug: "Ein Problem",
    idea: "Eine Idee",
    summary: "In einer Zeile",
    detailsBug: "Was ist passiert?",
    detailsIdea: "Was würde helfen?",
    steps: "Schritte oder Kontext (optional)",
    facts: "Nur App-Version und Plattform einschließen",
    factsUnavailable:
      "Build-Daten fehlen; der Bericht kann trotzdem gesendet werden.",
    preview: "Genauen Bericht prüfen",
    send: "Privat senden",
    retry: "Bericht erneut versuchen",
    copy: "Bericht kopieren",
    storageError:
      "Lokale Kopie konnte nicht gespeichert werden. Kein neuer Versand gestartet. Bericht vor dem Schließen kopieren.",
    deliveryError:
      "Zustellung nicht bestätigt. Bericht bleibt für einen Versuch mit derselben ID gesperrt; keine doppelte Benachrichtigung.",
    prepareError: "Kurzen Titel und Beschreibung ergänzen.",
    received: "Bericht erhalten. Referenz:",
    notificationSent:
      "Der Maildienst hat die Nachricht angenommen; Eingang im Postfach nicht bestätigt.",
    notificationUncertain:
      "Bericht privat gespeichert. Mailbenachrichtigung nicht bestätigt; nicht erneut senden.",
    sending: "Wird gesendet…",
  },
  es: {
    ...localizedSupportFeedback.es,
    title: "Enviar comentarios",
    notice:
      "Envío privado a Jason en jason@theft.studio. Solo se comparte el informe de abajo. No se recopilan chats, archivos, capturas ni registros. No incluyas contraseñas ni secretos. El borrador permanece en este dispositivo hasta enviarlo.",
    bug: "Algo falló",
    idea: "Una idea",
    summary: "En una línea",
    detailsBug: "Qué ocurrió",
    detailsIdea: "Qué te ayudaría",
    steps: "Pasos o contexto (opcional)",
    facts: "Incluir solo la versión y la plataforma",
    factsUnavailable:
      "Los datos de versión no están disponibles; puedes enviar el informe.",
    preview: "Revisar el informe exacto",
    send: "Enviar en privado",
    retry: "Reintentar informe",
    copy: "Copiar informe",
    storageError:
      "No se pudo guardar una copia local. No se inició un nuevo envío. Copia el informe antes de cerrar.",
    deliveryError:
      "Entrega no confirmada. El informe queda guardado y bloqueado para reintentar con el mismo ID, sin notificar dos veces.",
    prepareError: "Añade un título corto y una descripción.",
    received: "Informe recibido. Referencia:",
    notificationSent:
      "El servicio aceptó la notificación; no se ha confirmado su llegada al buzón.",
    notificationUncertain:
      "Informe guardado en privado. Notificación no confirmada; no hace falta reenviarlo.",
    sending: "Enviando…",
  },
  ja: {
    ...localizedSupportFeedback.ja,
    title: "フィードバックを送信",
    notice:
      "Jason（jason@theft.studio）に非公開で送信します。共有されるのは下のレポートだけです。チャット、ファイル、画像、ログは収集しません。パスワードや秘密情報を含めないでください。送信まで下書きはこの端末に残ります。",
    bug: "不具合",
    idea: "アイデア",
    summary: "一行で説明",
    detailsBug: "何が起きましたか",
    detailsIdea: "何があると役立ちますか",
    steps: "手順や背景（任意）",
    facts: "アプリのバージョンとOSのみ含める",
    factsUnavailable: "ビルド情報は取得できませんが、レポートは送信できます。",
    preview: "送信する内容を確認",
    send: "非公開で送信",
    retry: "同じレポートを再試行",
    copy: "レポートをコピー",
    storageError:
      "再試行用のコピーを保存できません。新しい送信は開始していません。閉じる前にコピーしてください。",
    deliveryError:
      "配信を確認できません。レポートは保持・固定され、同じIDで再試行します。通知は重複しません。",
    prepareError: "短い件名と説明を入力してください。",
    received: "レポートを受信しました。参照ID:",
    notificationSent:
      "メールサービスが通知を受け付けました。受信箱への到着は未確認です。",
    notificationUncertain:
      "レポートは非公開で保存されました。メール通知は未確認ですが、再送は不要です。",
    sending: "送信中…",
  },
  zh: {
    ...localizedSupportFeedback.zh,
    title: "发送反馈",
    notice:
      "私密发送至 Jason：jason@theft.studio。仅分享下方报告，不收集聊天、文件、截图或日志。请勿填写密码或秘密信息。发送前草稿保留在此设备上。",
    bug: "遇到问题",
    idea: "一个建议",
    summary: "一句话概述",
    detailsBug: "发生了什么",
    detailsIdea: "什么能帮助你",
    steps: "步骤或背景（可选）",
    facts: "仅附上应用版本和平台",
    factsUnavailable: "版本信息不可用，仍可发送报告。",
    preview: "查看完整报告",
    send: "私密发送",
    retry: "重试同一报告",
    copy: "复制报告",
    storageError: "无法保存本地重试副本，未开始新的发送。关闭前请复制报告。",
    deliveryError:
      "尚未确认送达。报告已保留并锁定，重试使用同一 ID，不会重复通知。",
    prepareError: "请填写简短标题和描述。",
    received: "报告已接收。编号：",
    notificationSent: "邮件服务已接受通知，尚未确认到达收件箱。",
    notificationUncertain: "报告已私密保存。邮件通知尚未确认，无需重新发送。",
    sending: "正在发送…",
  },
  "zh-hant": {
    ...localizedSupportFeedback['zh-hant'],
    title: "傳送意見",
    notice:
      "私密傳送至 Jason：jason@theft.studio。僅分享下方報告，不收集聊天、檔案、截圖或紀錄。請勿填寫密碼或機密資訊。傳送前草稿保留在此裝置上。",
    bug: "遇到問題",
    idea: "一個建議",
    summary: "一句話概述",
    detailsBug: "發生了什麼",
    detailsIdea: "什麼能幫助你",
    steps: "步驟或背景（選填）",
    facts: "僅附上應用程式版本和平台",
    factsUnavailable: "版本資訊無法取得，仍可傳送報告。",
    preview: "查看完整報告",
    send: "私密傳送",
    retry: "重試同一報告",
    copy: "複製報告",
    storageError: "無法儲存本機重試副本，未開始新的傳送。關閉前請複製報告。",
    deliveryError:
      "尚未確認送達。報告已保留並鎖定，重試使用同一 ID，不會重複通知。",
    prepareError: "請填寫簡短標題和描述。",
    received: "報告已接收。編號：",
    notificationSent: "郵件服務已接受通知，尚未確認抵達收件匣。",
    notificationUncertain: "報告已私密儲存。郵件通知尚未確認，無需重新傳送。",
    sending: "正在傳送…",
  },
  ar: {
    ...localizedSupportFeedback.ar,
    title: "إرسال ملاحظات",
    notice:
      "إرسال خاص إلى Jason على jason@theft.studio. تتم مشاركة التقرير أدناه فقط. لا نجمع المحادثات أو الملفات أو الصور أو السجلات. لا تكتب كلمات مرور أو أسرارًا. تبقى المسودة على هذا الجهاز حتى ترسلها.",
    bug: "حدث خلل",
    idea: "فكرة",
    summary: "في سطر واحد",
    detailsBug: "ماذا حدث",
    detailsIdea: "ما الذي سيساعدك",
    steps: "الخطوات أو السياق (اختياري)",
    facts: "إرفاق إصدار التطبيق والمنصة فقط",
    factsUnavailable:
      "معلومات الإصدار غير متاحة؛ لا يزال بإمكانك إرسال التقرير.",
    preview: "مراجعة التقرير الكامل",
    send: "إرسال خاص",
    retry: "إعادة محاولة التقرير",
    copy: "نسخ التقرير",
    storageError:
      "تعذر حفظ نسخة محلية. لم يبدأ إرسال جديد. انسخ التقرير قبل الإغلاق.",
    deliveryError:
      "لم يتم تأكيد التسليم. التقرير محفوظ ومقفل لإعادة المحاولة بنفس المعرّف دون إشعار مكرر.",
    prepareError: "أضف عنوانًا قصيرًا ووصفًا.",
    received: "تم استلام التقرير. المرجع:",
    notificationSent:
      "قبلت خدمة البريد الإشعار؛ لم يتأكد وصوله إلى صندوق الوارد.",
    notificationUncertain:
      "تم حفظ التقرير بشكل خاص. لم يتأكد إشعار البريد؛ لا داعي لإعادة الإرسال.",
    sending: "جارٍ الإرسال…",
  },
  ru: {
    ...localizedSupportFeedback.ru,
    title: "Отправить отзыв",
    notice:
      "Приватно отправить Джейсону: jason@theft.studio. Передаётся только отчёт ниже. Чаты, файлы, снимки и журналы не собираются. Не указывайте пароли и секреты. До отправки черновик остаётся на этом устройстве.",
    bug: "Ошибка",
    idea: "Идея",
    summary: "В одной строке",
    detailsBug: "Что произошло",
    detailsIdea: "Что было бы полезно",
    steps: "Шаги или контекст (необязательно)",
    facts: "Включить только версию приложения и платформу",
    factsUnavailable:
      "Сведения о сборке недоступны; отчёт всё равно можно отправить.",
    preview: "Проверить точный отчёт",
    send: "Отправить приватно",
    retry: "Повторить отчёт",
    copy: "Копировать отчёт",
    storageError:
      "Не удалось сохранить локальную копию. Новая отправка не начата. Скопируйте отчёт перед закрытием.",
    deliveryError:
      "Доставка не подтверждена. Отчёт сохранён и заблокирован для повтора с тем же ID без повторного уведомления.",
    prepareError: "Добавьте краткий заголовок и описание.",
    received: "Отчёт получен. Номер:",
    notificationSent:
      "Почтовая служба приняла уведомление; поступление во входящие не подтверждено.",
    notificationUncertain:
      "Отчёт сохранён приватно. Почтовое уведомление не подтверждено; отправлять повторно не нужно.",
    sending: "Отправка…",
  },
};

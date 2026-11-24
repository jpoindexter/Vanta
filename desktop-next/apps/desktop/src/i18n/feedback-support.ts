export const enSupportFeedback = {
  addDiagnostics: "Add diagnostic details",
  clearDiagnostics: "Clear saved failure codes",
  diagnosticsNotice:
    "Up to 20 failure codes are kept on this device. Add diagnostics to include app versions and the six latest codes from the past seven days in the editable context. No filenames, chat content, credentials or raw logs are collected. Nothing is sent until you review and send.",
  diagnosticsFull:
    "There is not enough room for diagnostics. Shorten the context first (3,000 characters maximum).",
  save: "Save report",
  saveFailed: "Could not save the report. Copy it before closing.",
};
type SupportCopy = typeof enSupportFeedback;
export const localizedSupportFeedback: Record<
  "fr" | "de" | "es" | "ja" | "zh" | "zh-hant" | "ar" | "ru",
  SupportCopy
> = {
  fr: {
    addDiagnostics: "Ajouter les détails de diagnostic",
    clearDiagnostics: "Effacer les codes d’erreur enregistrés",
    diagnosticsNotice:
      "Jusqu’à 20 codes d’erreur sont conservés sur cet appareil. Ajoutez les diagnostics pour inclure les versions et les six derniers codes des sept derniers jours dans le contexte modifiable. Aucun nom de fichier, contenu de chat, identifiant ou journal brut n’est collecté. Rien n’est envoyé sans votre vérification et votre envoi.",
    diagnosticsFull:
      "Raccourcissez le contexte avant d’ajouter les diagnostics (3 000 caractères maximum).",
    save: "Enregistrer le rapport",
    saveFailed:
      "Impossible d’enregistrer le rapport. Copiez-le avant de fermer.",
  },
  de: {
    addDiagnostics: "Diagnosedetails hinzufügen",
    clearDiagnostics: "Gespeicherte Fehlercodes löschen",
    diagnosticsNotice:
      "Bis zu 20 Fehlercodes werden auf diesem Gerät gespeichert. Diagnosen fügen App-Versionen und die sechs neuesten Codes der letzten sieben Tage zum bearbeitbaren Kontext hinzu. Keine Dateinamen, Chatinhalte, Zugangsdaten oder Rohprotokolle werden erfasst. Erst nach Prüfung und Senden wird etwas übertragen.",
    diagnosticsFull:
      "Kürzen Sie zuerst den Kontext für die Diagnosen (höchstens 3.000 Zeichen).",
    save: "Bericht speichern",
    saveFailed:
      "Bericht konnte nicht gespeichert werden. Vor dem Schließen kopieren.",
  },
  es: {
    addDiagnostics: "Añadir detalles de diagnóstico",
    clearDiagnostics: "Borrar códigos de error guardados",
    diagnosticsNotice:
      "Se conservan hasta 20 códigos de error en este dispositivo. Añade diagnósticos para incluir las versiones y los seis códigos más recientes de los últimos siete días en el contexto editable. No se recopilan nombres de archivo, conversaciones, credenciales ni registros sin procesar. Nada se envía hasta que lo revises y lo envíes.",
    diagnosticsFull:
      "Acorta el contexto para añadir diagnósticos (máximo 3000 caracteres).",
    save: "Guardar informe",
    saveFailed: "No se pudo guardar el informe. Cópialo antes de cerrar.",
  },
  ja: {
    addDiagnostics: "診断情報を追加",
    clearDiagnostics: "保存したエラーコードを消去",
    diagnosticsNotice:
      "最大20件のエラーコードをこの端末に保持します。診断情報を追加すると、アプリのバージョンと過去7日間の最新6件のコードが編集可能な状況欄に入ります。ファイル名、会話内容、認証情報、生ログは収集しません。確認して送信するまで送信されません。",
    diagnosticsFull:
      "診断情報を追加するには状況欄を短くしてください（最大3,000文字）。",
    save: "レポートを保存",
    saveFailed: "保存できませんでした。閉じる前にコピーしてください。",
  },
  zh: {
    addDiagnostics: "添加诊断详情",
    clearDiagnostics: "清除已保存的错误代码",
    diagnosticsNotice:
      "此设备最多保存20条错误代码。添加诊断可将应用版本和过去七天最近六条代码加入可编辑的背景信息。不收集文件名、聊天内容、凭据或原始日志。只有你查看并发送后才会传输。",
    diagnosticsFull: "请先缩短背景信息再添加诊断（最多3000字符）。",
    save: "保存报告",
    saveFailed: "无法保存报告。关闭前请先复制。",
  },
  "zh-hant": {
    addDiagnostics: "加入診斷詳情",
    clearDiagnostics: "清除已儲存的錯誤代碼",
    diagnosticsNotice:
      "此裝置最多保留20筆錯誤代碼。加入診斷可將應用程式版本與過去七天最近六筆代碼加入可編輯的背景資訊。不收集檔名、聊天內容、憑證或原始紀錄。只有你檢查並傳送後才會傳輸。",
    diagnosticsFull: "請先縮短背景資訊再加入診斷（最多3000字元）。",
    save: "儲存報告",
    saveFailed: "無法儲存報告。關閉前請先複製。",
  },
  ar: {
    addDiagnostics: "إضافة تفاصيل التشخيص",
    clearDiagnostics: "مسح رموز الأخطاء المحفوظة",
    diagnosticsNotice:
      "يُحفظ حتى 20 رمز خطأ على هذا الجهاز. أضف التشخيص لإدراج إصدارات التطبيق وآخر ستة رموز من الأيام السبعة الماضية في السياق القابل للتحرير. لا تُجمع أسماء الملفات أو المحادثات أو بيانات الدخول أو السجلات الخام. لا يُرسل شيء حتى تراجعه وترسله.",
    diagnosticsFull: "اختصر السياق أولاً لإضافة التشخيص (3000 حرف كحد أقصى).",
    save: "حفظ التقرير",
    saveFailed: "تعذر حفظ التقرير. انسخه قبل الإغلاق.",
  },
  ru: {
    addDiagnostics: "Добавить диагностику",
    clearDiagnostics: "Удалить сохранённые коды ошибок",
    diagnosticsNotice:
      "На этом устройстве хранятся до 20 кодов ошибок. Диагностика добавит версии приложения и шесть последних кодов за семь дней в редактируемый контекст. Имена файлов, чаты, учётные данные и необработанные журналы не собираются. Ничего не отправляется до вашей проверки и отправки.",
    diagnosticsFull:
      "Сократите контекст перед добавлением диагностики (не более 3000 символов).",
    save: "Сохранить отчёт",
    saveFailed: "Не удалось сохранить отчёт. Скопируйте его перед закрытием.",
  },
};

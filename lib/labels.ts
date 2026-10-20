export const STATUS_LABEL: Record<string, string> = {
  draft: "Ждёт отправки",
  needs_review: "На проверке",
  replied: "Ответили",
  failed: "Не отправилось",
  skipped: "Без ответа",
};

export const INTENT_LABEL: Record<string, string> = {
  price: "Цена",
  details: "Подробности",
  availability: "Наличие",
  buy: "Заказ",
  shipping: "Доставка",
  size: "Размер",
  wear: "Носка",
  other: "Другой вопрос",
  none: "Без запроса",
};

export const SOURCE_LABEL: Record<string, string> = {
  demo: "Учебный",
  simulator: "Проверка",
  webhook: "Instagram",
  poll: "Instagram",
};

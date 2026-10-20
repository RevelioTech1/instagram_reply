import type { IntentFlags, PrimaryIntent } from "./types.ts";

const EMPTY: IntentFlags = {
  price: false,
  details: false,
  availability: false,
  buy: false,
  shipping: false,
  size: false,
  wear: false,
  other: false,
};

function prepare(text: string): string {
  return text.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

export function classifyIntent(text: string): { flags: IntentFlags; primary: PrimaryIntent } {
  const source = prepare(text);
  const flags: IntentFlags = { ...EMPTY };
  if (!source || isReactionOnly(source)) {
    return { flags, primary: "none" };
  }

  flags.price =
    /цен[аыуеой]|сколько\s*(стоит|будет|выходит)|скок[ао]\b|скольк|поч[её]м|по\s*ч[её]м|стоимост|прайс|₽|\bруб(?:\.|лей|ля)?\b/.test(
      source,
    );
  flags.size = /размер|на какой палец|ширин|диаметр/.test(source);
  flags.details =
    /подробн|характерист|из чего|материал|проб[аыуе]|металл|покрыт|позолот|вес\b|описан|что (?:за |это |написан|изображ)|какая молитв|освящ/.test(
      source,
    );
  flags.availability =
    /в наличии|есть ли|есть в наличии|можно (?:ли )?заказать|под заказ|остал|когда будет|доступн/.test(
      source,
    );
  flags.shipping = /доставк|сд[еэ]к|отправ|почт(?:ой|а\b)|самовывоз|в какой срок/.test(source);
  flags.buy =
    /где (?:купить|заказать|смотреть|посмотреть)|как (?:купить|заказать|оформить)|хочу\b|беру\b|закаж|оформить|ссылк|на сайт|куплю|приобрести/.test(
      source,
    );
  flags.wear = /носить|кажд(?:ый|ое) день|повседнев/.test(source);
  flags.other =
    /[?]|\bможно ли\b|подскаж|скажите|расскаж|почему|зачем|а это\b/.test(source) &&
    !flags.price &&
    !flags.size &&
    !flags.details &&
    !flags.availability &&
    !flags.shipping &&
    !flags.buy &&
    !flags.wear;

  const primary = primaryOf(flags);
  return { flags, primary };
}

export function isCommercial(flags: IntentFlags): boolean {
  return (
    flags.price ||
    flags.details ||
    flags.availability ||
    flags.buy ||
    flags.shipping ||
    flags.size ||
    flags.wear
  );
}

function primaryOf(flags: IntentFlags): PrimaryIntent {
  if (flags.price) return "price";
  if (flags.availability) return "availability";
  if (flags.size) return "size";
  if (flags.shipping) return "shipping";
  if (flags.buy) return "buy";
  if (flags.details) return "details";
  if (flags.wear) return "wear";
  if (flags.other) return "other";
  return "none";
}

function isReactionOnly(source: string): boolean {
  const words = source
    .replace(/[^a-zа-я0-9?\s]+/gi, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return true;
  return words.every((word) => REACTION.has(word));
}

const REACTION = new Set([
  "красота",
  "красиво",
  "красивое",
  "красивая",
  "красивый",
  "красивые",
  "шикарно",
  "супер",
  "класс",
  "огонь",
  "вау",
  "топ",
  "люблю",
  "нравится",
  "обожаю",
  "аминь",
  "спасибо",
  "благодарю",
  "восторг",
  "прелесть",
  "чудо",
  "бомба",
  "мило",
  "круто",
  "отлично",
  "браво",
  "ого",
  "ах",
  "боже",
  "господи",
]);

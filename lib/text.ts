const CYR_TO_LAT: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "i",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "c",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

const STOP = new Set([
  "это",
  "как",
  "для",
  "что",
  "или",
  "при",
  "под",
  "над",
  "вас",
  "вам",
  "мне",
  "мой",
  "моя",
  "мои",
  "ещё",
  "еще",
  "уже",
  "вот",
  "там",
  "тут",
  "пожалуйста",
  "подскажите",
  "скажите",
  "можно",
  "узнать",
  "хочу",
  "очень",
  "просто",
  "такой",
  "такая",
  "такие",
  "есть",
  "нет",
  "фото",
  "видео",
  "пост",
  "артикул",
  "арт",
  "проба",
  "серебро",
  "золото",
  "изделие",
  "украшение",
  "новая",
  "новый",
  "новинка",
  "наша",
  "наш",
  "ваши",
  "ваш",
  "только",
  "тоже",
  "будет",
  "была",
  "было",
  "были",
  "этот",
  "эта",
  "эти",
  "него",
  "неё",
  "нее",
  "добрый",
  "здравствуйте",
  "привет",
]);

export function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(value: string): string[] {
  return normalize(value)
    .split(" ")
    .filter((token) => token.length >= 3 && !STOP.has(token) && !/^\d+$/.test(token));
}

export function codeKey(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]/gi, "");
}

export function translitKey(value: string): string {
  let out = "";
  for (const char of value.toLowerCase()) {
    if (CYR_TO_LAT[char] !== undefined) {
      out += CYR_TO_LAT[char];
      continue;
    }
    if (char >= "a" && char <= "z") {
      out += char === "c" ? "s" : char;
      continue;
    }
    if (char >= "0" && char <= "9") out += char;
  }
  return out;
}

const LETTER_CODE =
  /(?<![a-zа-яё0-9])([a-zа-яё]{1,4}\d{0,2}(?:[\-–—][a-zа-яё0-9.]{1,14}){1,4}(?:\/\d+)?)(?![a-zа-яё0-9])/gi;
const NUMBER_CODE = /(?<!\d)(\d{2}-\d{2}-\d{2,4}(?:-\d+)?)(?!\d)/g;
const SPACED_CODE =
  /(?<![a-zа-яё0-9])([a-zа-яё]{1,3})\s+([a-zа-яё]{1,4})\s+(\d{2,4})(?!\d)/gi;
const COMPACT_CODE = /(?<![a-zа-яё0-9])([a-zа-яё]{2,6}\d{2,4})(?![a-zа-яё0-9])/gi;

export function extractCodeFromSku(skuRaw: string): string {
  const raw = skuRaw.trim();
  const numeric = raw.match(/^(\d{2}-\d{2}-\d{2,4}(?:-\d+)?)/);
  if (numeric) return numeric[1];
  const letter = raw.match(
    /^([A-Za-zА-Яа-яЁё]{1,4}\d{0,2}(?:-[A-Za-zА-Яа-яЁё0-9.]{1,16}){1,4}(?:\/\d+)?)/,
  );
  if (letter) return letter[1].replace(/\.$/, "");
  return raw.split(/\s+/)[0] ?? raw;
}

export function extractCodes(text: string): string[] {
  const found: string[] = [];
  const push = (value: string) => {
    const clean = value.replace(/[–—]/g, "-").replace(/\.$/, "").trim();
    if (clean.length < 4) return;
    if (!found.some((item) => codeKey(item) === codeKey(clean))) found.push(clean);
  };
  for (const match of text.matchAll(NUMBER_CODE)) push(match[1]);
  for (const match of text.matchAll(LETTER_CODE)) push(match[1]);
  for (const match of text.matchAll(SPACED_CODE)) push(`${match[1]}-${match[2]}-${match[3]}`);
  for (const match of text.matchAll(COMPACT_CODE)) push(match[1]);
  return found;
}

const CATEGORY_HINTS: Array<[RegExp, string]> = [
  [/сер[её]ж|серьг/i, "sergi"],
  [/колечк|кольц|перстен/i, "koltsa"],
  [/подвеск|кулон/i, "podveski"],
  [/крестик\w*|крест(?:ы|а|ов|ом|у|е)?(?![а-я])/i, "kresty"],
  [/браслет/i, "braslety"],
  [/цепочк|цепь|цепи/i, "tsepi"],
  [/гайтан/i, "gaytany"],
  [/бусин/i, "businy"],
  [/колье/i, "kole"],
  [/брош/i, "broshi"],
  [/ложк/i, "lozhki"],
  [/ионизатор/i, "suvenir"],
];

export function categoryHint(text: string): string | null {
  const normalized = text.toLowerCase().replace(/ё/g, "е");
  for (const [pattern, slug] of CATEGORY_HINTS) {
    if (pattern.test(normalized)) return slug;
  }
  return null;
}

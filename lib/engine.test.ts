import assert from "node:assert/strict";
import test from "node:test";
import { buildIndex, prepareProduct } from "./catalog.ts";
import { classifyIntent } from "./intent.ts";
import { planComment } from "./plan.ts";
import { DEFAULT_POLICY, type RawProduct } from "./types.ts";

const ring: RawProduct = {
  url: "https://iordani.com/catalog/koltsa/koltsa_s_molitvoy/koltso_b_ko_338_spasi_i_sokhrani/",
  skuRaw: "Б-КО-338 Спаси и Сохрани",
  title: "Кольцо Б-КО-338 Спаси и Сохрани",
  price: 2600,
  image: null,
  description: "Кольцо с молитвой.",
  availability: "in_stock",
  props: {
    "Тип изделия": "Кольцо",
    "Размер": "Маленькие",
    "Коллекция": "Спаси и Сохрани",
    Металл: "Серебро 925",
    Покрытие: "Оксид",
    "Средний вес": "1.88",
    Ширина: "5.9",
  },
  category: "Кольца",
  categorySlug: "koltsa",
};

const earrings: RawProduct = {
  url: "https://iordani.com/catalog/sergi/sergi_b_s_073_vera_nadezhda_lyubov/",
  skuRaw: "Б-С-073 Вера,Надежда,Любовь",
  title: "Серьги Б-С-073 Вера,Надежда,Любовь",
  price: 7000,
  image: null,
  description: "",
  availability: "in_stock",
  props: { Металл: "Серебро 925", Размер: "Маленькие", "Средний вес": "3.2", Ширина: "12" },
  category: "Серьги",
  categorySlug: "sergi",
};

const george: RawProduct = {
  url: "https://iordani.com/catalog/koltsa/george/",
  skuRaw: "Е-КО-367 Георгий Победоносец",
  title: "Кольцо Е-КО-367 Георгий Победоносец",
  price: 5400,
  image: null,
  description: "",
  availability: "in_stock",
  props: { Металл: "Серебро 925", Коллекция: "Георгий Победоносец" },
  category: "Кольца",
  categorySlug: "koltsa",
};

const seraph: RawProduct = {
  url: "https://iordani.com/catalog/koltsa/seraph/",
  skuRaw: "Е-КО-367 Серафим",
  title: "Кольцо Е-КО-367 Серафим",
  price: 5400,
  image: null,
  description: "",
  availability: "in_stock",
  props: { Металл: "Серебро 925", Коллекция: "Серафим" },
  category: "Кольца",
  categorySlug: "koltsa",
};

const driver: RawProduct = {
  url: "https://iordani.com/catalog/koltsa/driver/",
  skuRaw: "Б-КО-565 Молитва водителя",
  title: "Кольцо Б-КО-565 Молитва водителя",
  price: 10100,
  image: null,
  description: "",
  availability: "in_stock",
  props: { Металл: "Серебро 925", Размер: "Средние" },
  category: "Кольца",
  categorySlug: "koltsa",
};

const anotherPrayer: RawProduct = {
  url: "https://iordani.com/catalog/koltsa/koltsa_s_molitvoy/koltso_b_ko_341/",
  skuRaw: "Б-КО-341 Спаси и Сохрани",
  title: "Кольцо Б-КО-341 Спаси и Сохрани",
  price: 2900,
  image: null,
  description: "",
  availability: "in_stock",
  props: { Металл: "Серебро 925", Коллекция: "Спаси и Сохрани" },
  category: "Кольца",
  categorySlug: "koltsa",
};

const matrona: RawProduct = {
  url: "https://iordani.com/catalog/podveski/matrona/",
  skuRaw: "Б-П-184 Матрона",
  title: "Подвеска Б-П-184 Матрона",
  price: 5300,
  image: null,
  description: "",
  availability: "in_stock",
  props: { Металл: "Серебро 925", Размер: "Средние" },
  category: "Подвески",
  categorySlug: "podveski",
};

const morePrayer = [342, 528, 632].map((code): RawProduct => ({
  url: `https://iordani.com/catalog/koltsa/extra-${code}/`,
  skuRaw: `Б-КО-${code} Спаси и Сохрани`,
  title: `Кольцо Б-КО-${code} Спаси и Сохрани`,
  price: 3000 + code,
  image: null,
  description: "",
  availability: "in_stock",
  props: { Металл: "Серебро 925", Коллекция: "Спаси и Сохрани" },
  category: "Кольца",
  categorySlug: "koltsa",
}));

const catalog = buildIndex(
  [ring, anotherPrayer, earrings, george, seraph, driver, matrona, ...morePrayer].map((item) =>
    prepareProduct(item),
  ),
);

const auto = { ...DEFAULT_POLICY, autoReply: true };

function plan(comment: string, caption: string, policy = DEFAULT_POLICY) {
  return planComment({ comment, caption, catalog, policy });
}

test("price question under a caption with an article links the exact card", () => {
  const result = plan(
    "Подскажите, сколько стоит?",
    "Кольцо «Спаси и Сохрани», артикул Б-КО-338. Серебро 925.",
  );
  assert.equal(result.primary, "price");
  assert.equal(result.status, "draft");
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].code, "Б-КО-338");
  assert.match(result.replyPublic, /2\s600 ₽/);
  assert.match(result.replyPublic, /koltso_b_ko_338_spasi_i_sokhrani/);
  assert.doesNotMatch(result.replyPublic, /7\s000/);
  assert.doesNotMatch(result.replyPublic, /освящ/i);
});

test("latin article in the comment still finds the card", () => {
  const result = plan("B-KO-338 сколько стоит?", "Новинка этой недели");
  assert.equal(result.products[0]?.code, "Б-КО-338");
  assert.match(result.replyPublic, /2\s600 ₽/);
});

test("a plus sign asks the price of the piece in the caption", () => {
  const result = plan("+", "Кольцо Б-КО-565 «Молитва водителя».");
  assert.equal(result.primary, "price");
  assert.equal(result.status, "draft");
  assert.match(result.replyPublic, /10\s100 ₽/);
});

test("repeated plus signs and a trailing question mark still ask the price", () => {
  const result = plan("+++?", "арт. Б-КО-338");
  assert.equal(result.primary, "price");
  assert.match(result.replyPublic, /2\s600 ₽/);
});

test("an article followed by a plus asks the price of that article", () => {
  const result = plan("B-KO-338 +", "Новинка недели.");
  assert.equal(result.primary, "price");
  assert.equal(result.products[0]?.code, "Б-КО-338");
});

test("a want-tag asks the price and a longer word does not", () => {
  const want = plan("Хочу!", "Кольцо Б-КО-565 «Молитва водителя».");
  assert.equal(want.primary, "price");
  assert.match(want.replyPublic, /10\s100 ₽/);
  const phrase = plan("хочу такое", "арт. Б-КО-338");
  assert.equal(phrase.primary, "price");
  assert.match(phrase.replyPublic, /2\s600 ₽/);
  assert.equal(plan("хочушка", "Б-КО-338").status, "skipped");
});

test("a symbol counts only when it is in the price-sign list", () => {
  const policy = { ...DEFAULT_POLICY, priceSymbols: ["§"] };
  assert.equal(plan("+", "Б-КО-338", policy).status, "skipped");
  assert.equal(plan("§", "Б-КО-338", policy).primary, "price");
});

test("a compliment gets one short reply and no product card", () => {
  const result = plan("Какая красота!", "Кольцо Б-КО-338 Спаси и Сохрани");
  assert.equal(result.status, "draft");
  assert.equal(result.products.length, 0);
  assert.equal(result.replyPrivate, "");
  assert.ok(DEFAULT_POLICY.praiseReplies.includes(result.replyPublic));
  assert.doesNotMatch(result.replyPublic, /₽|iordani\.com|http/);
  assert.equal(plan("Какая красота!", "другая подпись").replyPublic, result.replyPublic);
});

test("praise about the jewelry is answered without a catalog card", () => {
  for (const text of ["Супер украшения", "Супер крашения"]) {
    const result = plan(text, "Кольцо Б-КО-338");
    assert.equal(result.primary, "none");
    assert.equal(result.products.length, 0);
    assert.match(result.replyPublic, /Здравствуйте/);
  }
});

test("praise replies can be turned off", () => {
  const result = plan("Какая красота!", "Б-КО-338", { ...DEFAULT_POLICY, reactToPraise: false });
  assert.equal(result.status, "skipped");
  assert.equal(result.replyPublic, "");
});

test("earrings mentioned in the comment are not quoted as the ring", () => {
  const result = plan(
    "А серёжки почём?",
    "В кадре кольцо Б-КО-338 и серьги Б-С-073.",
  );
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].categorySlug, "sergi");
  assert.match(result.replyPublic, /7\s000 ₽/);
  assert.doesNotMatch(result.replyPublic, /2\s600/);
});

test("shared article is narrowed by the saint in the caption", () => {
  const result = plan("Цена?", "Кольцо Е-КО-367 Георгий Победоносец");
  assert.equal(result.products.length, 1);
  assert.match(result.products[0].name, /Георгий/);
  assert.match(result.replyPublic, /5\s400 ₽/);
});

test("a bare shared name does not invent one price", () => {
  const result = plan("сколько стоит спаси и сохрани", "");
  assert.equal(result.products.length, 0);
  assert.doesNotMatch(result.replyPublic, /₽/);
  assert.match(result.replyPublic, /артикул/i);
});

test("size question uses the card and does not invent a finger size", () => {
  const result = plan("Какой размер и вес?", "Б-КО-338");
  assert.match(result.replyPublic, /маленькие/i);
  assert.match(result.replyPublic, /15 рабочих дней/);
  assert.doesNotMatch(result.replyPublic, /16 размер|17 размер|18 размер/);
});

test("shipping answer names CDEK and the product card", () => {
  const result = plan("Доставка в Казань есть?", "Подвеска Б-П-184 Матрона");
  assert.equal(result.primary, "shipping");
  assert.match(result.replyPublic, /СДЭК/);
  assert.match(result.replyPublic, /podveski\/matrona/);
});

test("auto mode would send a confident price reply", () => {
  const result = plan("цена?", "арт. Б-КО-565", auto);
  assert.equal(result.status, "send");
  assert.match(result.replyPublic, /10\s100 ₽/);
});

test("an unclear question stays for a person", () => {
  const intent = classifyIntent("Можно ли крестить ребёнка в этом?");
  assert.equal(intent.primary, "other");
  const result = plan("Можно ли крестить ребёнка в этом?", "Кольцо Б-КО-338");
  assert.equal(result.status, "needs_review");
  assert.match(result.replyPublic, /8 800 222-32-13/);
});

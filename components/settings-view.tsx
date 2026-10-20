"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { SettingsDTO } from "@/lib/dto";
import { parsePriceSymbols } from "@/lib/intent";

type SyncState = {
  running: boolean;
  scanned: number;
  total: number;
  saved: number;
  error: string | null;
  finishedAt: string | null;
};

export function SettingsView() {
  const [settings, setSettings] = useState<SettingsDTO | null>(null);
  const [token, setToken] = useState("");
  const [secret, setSecret] = useState("");
  const [igSecret, setIgSecret] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [sync, setSync] = useState<SyncState | null>(null);
  const [busy, setBusy] = useState("");
  const [symbolDraft, setSymbolDraft] = useState<string | null>(null);

  function apply(next: SettingsDTO) {
    setSettings(next);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const problem = params.get("error");
    const user = params.get("user");
    if (connected) setNotice(user ? `Вошли в Instagram как @${user}.` : "Вошли в Instagram.");
    if (problem) setError(problem);
    if (connected || problem) window.history.replaceState(null, "", window.location.pathname);
    fetch("/api/settings")
      .then((response) => response.json())
      .then((data: SettingsDTO) => apply(data))
      .catch(() => setError("Настройки не открылись."));
  }, []);

  useEffect(() => {
    if (!sync?.running) return;
    const timer = window.setInterval(() => {
      fetch("/api/catalog/sync")
        .then((response) => response.json())
        .then((data: SyncState) => setSync(data))
        .catch(() => undefined);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [sync?.running]);

  function payload(extra: Record<string, unknown> = {}) {
    if (!settings) return null;
    return {
      autoReply: settings.autoReply,
      publicReply: settings.publicReply,
      privateReply: settings.privateReply,
      includePrice: settings.includePrice,
      minConfidence: settings.minConfidence,
      phone: settings.phone,
      priceSymbols: parsePriceSymbols(symbolDraft ?? (settings.priceSymbols ?? []).join("\n")),
      igUserId: settings.igUserId,
      igUsername: settings.igUsername,
      graphVersion: settings.graphVersion,
      igAppId: settings.igAppId,
      publicOrigin: settings.publicOrigin,
      ...extra,
    };
  }

  async function postSettings(extra: Record<string, unknown> = {}) {
    const body = payload(extra);
    if (!body) return null;
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as SettingsDTO;
    apply(data);
    return data;
  }

  async function save() {
    if (!settings) return;
    setBusy("save");
    await postSettings({
      accessToken: token,
      appSecret: secret,
      igAppSecret: igSecret,
      ...(token ? { authMode: "facebook" } : {}),
    });
    setToken("");
    setSecret("");
    setIgSecret("");
    setBusy("");
    setNotice("Сохранили.");
    setError("");
  }

  async function connectInstagram() {
    if (!settings) return;
    setNotice("");
    setError("");
    if (!settings.igAppId.trim() || (!igSecret.trim() && !settings.hasIgAppSecret)) {
      setError("Вставьте Instagram App ID и секрет приложения. Их видно в кабинете Meta, в продукте Instagram.");
      return;
    }
    setBusy("login");
    await postSettings({ igAppSecret: igSecret });
    window.location.assign("/api/instagram/login");
  }

  async function disconnect() {
    setBusy("logout");
    setNotice("");
    setError("");
    await postSettings({ disconnect: true });
    setBusy("");
    setNotice("Вышли из Instagram. Панель больше не отвечает от имени аккаунта.");
  }

  async function saveRules() {
    setBusy("rules");
    setNotice("");
    setError("");
    await postSettings();
    setBusy("");
    setSymbolDraft(null);
    setNotice("Правила сохранены.");
  }

  async function test() {
    setBusy("test");
    setNotice("");
    setError("");
    const typed = token;
    await postSettings({
      igAppSecret: igSecret,
      appSecret: secret,
      accessToken: typed,
      ...(typed ? { authMode: "facebook" as const } : {}),
    });
    const response = await fetch("/api/instagram/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: token || undefined }),
    });
    const data = (await response.json()) as { message?: string };
    setBusy("");
    if (!response.ok) setError(data.message || "Подключение не удалось.");
    else {
      setNotice(data.message || "Подключено.");
      const fresh = (await fetch("/api/settings").then((item) => item.json())) as SettingsDTO;
      apply(fresh);
    }
  }

  async function poll() {
    setBusy("poll");
    setNotice("");
    setError("");
    const response = await fetch("/api/instagram/poll", { method: "POST" });
    const data = (await response.json()) as { message?: string };
    setBusy("");
    if (!response.ok) setError(data.message || "Не удалось забрать комментарии.");
    else setNotice(data.message || "Готово. Новые вопросы лежат во входящих.");
  }

  async function refreshCatalog() {
    setBusy("sync");
    const response = await fetch("/api/catalog/sync", { method: "POST" });
    setSync((await response.json()) as SyncState);
    setBusy("");
  }

  if (!settings) {
    return <p className="text-sm text-muted-foreground">{error || "Открываем настройки…"}</p>;
  }

  const browserOrigin = typeof window === "undefined" ? "" : window.location.origin;
  const origin = (settings.publicOrigin || browserOrigin).replace(/\/$/, "");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-5xl text-[#2a211c]">Подключение @iordani925</h1>
          <p className="mt-2 max-w-2xl text-sm text-[#5c5348]">
            Пока автоответ выключен, бот только готовит текст. В Instagram ничего не уходит, пока вы не нажмёте
            «Отправить» или не включите автоответ.
          </p>
        </div>
        <section className="space-y-4 rounded-3xl border border-[#e4d8c4] bg-[#fffdf8] p-5">
          <Toggle
            label="Автоответ"
            hint="Уверенные вопросы о цене, наличии, размере и доставке уходят сами. Сомнительные остаются на проверке."
            checked={settings.autoReply}
            onChange={(autoReply) => setSettings({ ...settings, autoReply })}
          />
          <Toggle
            label="Ответ в комментарии"
            hint="Короткий текст с ценой и ссылкой на карточку."
            checked={settings.publicReply}
            onChange={(publicReply) => setSettings({ ...settings, publicReply })}
          />
          <Toggle
            label="Ссылка в директ"
            hint="Одно личное сообщение на комментарий. Там ссылка обычно нажимается."
            checked={settings.privateReply}
            onChange={(privateReply) => setSettings({ ...settings, privateReply })}
          />
          <Toggle
            label="Называть цену, даже если спросили только ссылку"
            hint="Если человек просит цену, сумма всё равно берётся из карточки."
            checked={settings.includePrice}
            onChange={(includePrice) => setSettings({ ...settings, includePrice })}
          />
          <label className="block text-sm">
            Порог автоответа, {Math.round(settings.minConfidence * 100)}%
            <input
              type="range"
              min={0.6}
              max={0.98}
              step={0.01}
              value={settings.minConfidence}
              onChange={(event) => setSettings({ ...settings, minConfidence: Number(event.target.value) })}
              className="mt-2 w-full"
            />
          </label>
          <label className="block text-sm">
            Знаки запроса цены
            <Textarea
              className="mt-1 min-h-20 bg-white"
              value={symbolDraft ?? (settings.priceSymbols ?? []).join("\n")}
              onChange={(event) => setSymbolDraft(event.target.value)}
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              По одному знаку в строке. Комментарий только из этих знаков считается вопросом о цене. «++» и «+++» тоже, если в списке есть «+».
            </span>
          </label>
          <label className="block text-sm">
            Телефон в ответах про доставку
            <Input className="mt-1 h-9 bg-white" value={settings.phone} onChange={(event) => setSettings({ ...settings, phone: event.target.value })} />
          </label>
          <Button variant="outline" className="h-9" disabled={busy !== ""} onClick={() => void saveRules()}>
            Сохранить правила
          </Button>
        </section>
        <section className="space-y-4 rounded-3xl border border-[#e4d8c4] bg-[#fffdf8] p-5">
          <h2 className="font-display text-3xl">Вход через Instagram</h2>
          <p className="text-sm text-[#5c5348]">
            Сервисы для постов подключаются так же: вы входите в сам @iordani925, и панель получает право читать
            комментарии и отвечать. Публичная страница Facebook для этого не нужна.
          </p>
          {settings.authMode === "instagram" && settings.hasAccessToken ? (
            <div className="rounded-2xl bg-[#e7f0e4] px-4 py-3 text-sm text-[#1c3b2c]">
              Вход выполнен: @{settings.igUsername || "iordani925"}
              {settings.tokenExpiresAt ? `. Сессия действует до ${formatExpiry(settings.tokenExpiresAt)}` : ""}.
              Перед истечением панель продлевает её сама.
            </div>
          ) : null}
          <ol className="list-decimal space-y-2 pl-5 text-sm text-[#5c5348]">
            <li>
              Откройте{" "}
              <a className="underline" href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer">
                список приложений
              </a>
              . Страница «Платформа Instagram» в меню продуктов — витрина, кнопки создания там нет. Справа сверху может быть «Начать»: это регистрация разработчика, войти можно личным аккаунтом Meta.
            </li>
            <li>
              Нажмите «Создать приложение». В сценариях выберите пункт про сообщения и контент Instagram — «Manage messaging & content on Instagram». Типа «Business» и кнопки «добавить продукт» в этом мастере нет.
            </li>
            <li>Дальше имя (без слов Insta, Gram и IG), почта и «Создать приложение». Meta может спросить пароль ещё раз.</li>
            <li>
              Уже внутри приложения откройте Instagram → «API setup with Instagram business login». Скопируйте оттуда Instagram App ID и Instagram App Secret. Это не номер из «Настройки → Основные».
            </li>
            <li>
              Адрес возврата — не поле «URL обратного вызова» в шаге 3 про Webhooks. Прокрутите до шага «4. Настройте вход в Instagram от имени компании», разверните его и откройте настройки входа. Туда вставьте адрес возврата ниже и сохраните.
            </li>
            <li>
              Пока приложение не опубликовано, войти может только аккаунт с ролью. Откройте вкладку «Роли», в блоке Instagram Testers добавьте iordani925. Затем на instagram.com под этим аккаунтом откройте Настройки → Сайт и приложения → Приглашения тестировщика и нажмите «Принять». Роль администратора Facebook эту ошибку не снимает.
            </li>
            <li>Вернитесь сюда и нажмите «Войти через Instagram».</li>
          </ol>
          <label className="block text-sm">
            Instagram App ID
            <Input
              className="mt-1 h-9 bg-white"
              value={settings.igAppId}
              autoComplete="off"
              onChange={(event) => setSettings({ ...settings, igAppId: event.target.value.trim() })}
            />
          </label>
          <label className="block text-sm">
            Instagram App Secret
            <Input
              className="mt-1 h-9 bg-white"
              type="password"
              value={igSecret}
              placeholder={settings.hasIgAppSecret ? "Секрет уже сохранён" : "Из продукта Instagram"}
              autoComplete="off"
              onChange={(event) => setIgSecret(event.target.value)}
            />
          </label>
          <div className="rounded-2xl bg-[#f6f1e7] px-4 py-3">
            <p className="text-xs tracking-[0.14em] text-[#8a6a32] uppercase">Адрес возврата</p>
            <p className="mt-2 text-sm break-all">{origin}/api/instagram/callback</p>
            <Button
              variant="outline"
              className="mt-3 h-8 bg-white"
              type="button"
              onClick={() => void navigator.clipboard.writeText(`${origin}/api/instagram/callback`).then(() => setNotice("Адрес возврата скопирован."))}
            >
              Скопировать адрес
            </Button>
            <p className="mt-2 text-xs text-[#8a6a32]">
              Кнопка «Войти через Instagram» отправляет в Instagram именно эту строку. В кабинете Meta должна быть она же, без слэша на конце. Адрес с localhost Instagram отклоняет.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button className="h-9" disabled={busy !== ""} onClick={() => void connectInstagram()}>
              {busy === "login" ? "Переходим в Instagram…" : "Войти через Instagram"}
            </Button>
            <Button variant="outline" className="h-9" disabled={busy !== ""} onClick={() => void test()}>
              Проверить подключение
            </Button>
            <Button variant="secondary" className="h-9" disabled={busy !== ""} onClick={() => void poll()}>
              Забрать последние комментарии
            </Button>
            {settings.hasAccessToken ? (
              <Button variant="ghost" className="h-9" disabled={busy !== ""} onClick={() => void disconnect()}>
                Выйти
              </Button>
            ) : null}
          </div>
          {notice ? <p className="text-sm text-[#1c3b2c]">{notice}</p> : null}
          {error ? <p className="text-sm break-words text-[#9b2c2c]">{error}</p> : null}
          <details className="rounded-2xl border border-[#e4d8c4] px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">Токен вручную</summary>
            <div className="mt-3 space-y-3">
              <p className="text-sm text-[#5c5348]">
                Если токен Страницы уже есть, вставьте его сюда. Кнопка «Войти через Instagram» выше этот шаг пропускает.
                Для подписи вебхука нужен секрет приложения Meta.
              </p>
              <label className="block text-sm">
                Токен {settings.hasAccessToken ? `(сохранён ${settings.accessTokenHint})` : ""}
                <Input className="mt-1 h-9 bg-white" type="password" value={token} placeholder="Вставьте токен" autoComplete="off" onChange={(event) => setToken(event.target.value)} />
              </label>
              <label className="block text-sm">
                Секрет приложения, для подписи вебхука
                <Input className="mt-1 h-9 bg-white" type="password" value={secret} placeholder={settings.hasAppSecret ? "Секрет уже сохранён" : "Необязательно, пока вебхук локальный"} autoComplete="off" onChange={(event) => setSecret(event.target.value)} />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  Имя аккаунта
                  <Input className="mt-1 h-9 bg-white" value={settings.igUsername} onChange={(event) => setSettings({ ...settings, igUsername: event.target.value })} />
                </label>
                <label className="block text-sm">
                  Id Instagram
                  <Input className="mt-1 h-9 bg-white" value={settings.igUserId} onChange={(event) => setSettings({ ...settings, igUserId: event.target.value })} />
                </label>
              </div>
              <label className="block text-sm">
                Версия Graph API
                <Input className="mt-1 h-9 bg-white" value={settings.graphVersion} onChange={(event) => setSettings({ ...settings, graphVersion: event.target.value })} />
              </label>
              <Button variant="outline" className="h-9" disabled={busy !== ""} onClick={() => void save()}>
                Сохранить токен
              </Button>
            </div>
          </details>
        </section>
      </div>
      <aside className="space-y-4">
        <section className="rounded-3xl bg-[#24382c] p-5 text-[#f6f3ea]">
          <p className="text-xs tracking-[0.16em] text-[#d7c39a] uppercase">Вебхук Meta</p>
          <p className="mt-3 text-sm break-all">{origin}/api/instagram/webhook</p>
          <p className="mt-4 text-xs tracking-[0.16em] text-[#d7c39a] uppercase">Проверочный токен</p>
          <p className="mt-2 text-sm break-all">{settings.verifyToken}</p>
          <p className="mt-4 text-sm text-[#d7e3da]">Подписка на поле comments. Пока нет публичного адреса, работает кнопка «Забрать последние комментарии».</p>
        </section>
        <section className="rounded-3xl border border-[#e4d8c4] bg-[#fffdf8] p-5">
          <h2 className="font-display text-3xl">Цены с сайта</h2>
          <p className="mt-2 text-sm text-[#5c5348]">Обновление проходит по всем карточкам и занимает пару минут. Старые цены остаются, пока загрузка не закончится.</p>
          <Button variant="outline" className="mt-4 h-9" disabled={busy === "sync" || sync?.running} onClick={() => void refreshCatalog()}>
            {sync?.running ? `Обновляем ${sync.scanned} из ${sync.total}` : "Обновить каталог"}
          </Button>
          {sync?.saved ? <p className="mt-2 text-sm">Сохранили {sync.saved} карточек.</p> : null}
          {sync?.error ? <p className="mt-2 text-sm text-[#9b2c2c]">{sync.error}</p> : null}
        </section>
      </aside>
    </div>
  );
}

function formatExpiry(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

const { Telegraf, Markup } = require("telegraf");

const BOT_TOKEN = process.env.BOT_TOKEN;
const bot = new Telegraf(BOT_TOKEN);

// ====== ХРАНИЛИЩЕ (in-memory) ======
const users = {};      // userId -> profile
const likes = {};      // userId -> Set(userId)
const likedBy = {};    // userId -> Set(userId)
const state = {};      // userId -> registration step

// ====== КЛАВИАТУРЫ ======
const mainMenu = Markup.keyboard([
  ["🔍 Смотреть анкеты"],
  ["👀 Кто меня лайкнул"],
  ["👤 Моя анкета"]
]).resize();

// ====== /start ======
bot.start((ctx) => {
  const id = ctx.from.id;

  if (users[id]) {
    return ctx.reply("С возвращением, философ одиночества 😏", mainMenu);
  }

  ctx.reply(
    "Привет 👋\n" +
    "Ты в ALEXANDER DUGINчике — пародии на дайвинчик.\n\n" +
    "Начнём регистрацию.\nКак тебя зовут?"
  );
  state[id] = "name";
});

// ====== РЕГИСТРАЦИЯ (TEXT) ======
bot.on("text", (ctx) => {
  const id = ctx.from.id;
  const text = ctx.message.text;

  if (!state[id]) return;

  switch (state[id]) {
    case "name":
      users[id] = { name: text };
      ctx.reply("Сколько тебе лет?");
      state[id] = "age";
      break;

    case "age":
      if (isNaN(text) || Number(text) < 18) {
        return ctx.reply("Только 18+ 🙂");
      }
      users[id].age = Number(text);
      ctx.reply(
        "Твой пол?",
        Markup.keyboard(["👨 Мужчина", "👩 Женщина"]).resize()
      );
      state[id] = "gender";
      break;

    case "gender":
      users[id].gender = text;
      ctx.reply(
        "Кого ищешь?",
        Markup.keyboard(["👨 Парня", "👩 Девушку", "🌈 Неважно"]).resize()
      );
      state[id] = "search_gender";
      break;

    case "search_gender":
      users[id].search_gender = text;
      ctx.reply("Из какого ты города?", Markup.removeKeyboard());
      state[id] = "city";
      break;

    case "city":
      users[id].city = text;
      ctx.reply("Пришли фото 📸");
      state[id] = "photo";
      break;

    case "about":
      users[id].about = text;

      likes[id] = new Set();
      likedBy[id] = new Set();
      delete state[id];

      ctx.reply("🔥 Анкета готова!", mainMenu);
      break;
  }
});

// ====== РЕГИСТРАЦИЯ (PHOTO) ======
bot.on("photo", (ctx) => {
  const id = ctx.from.id;
  if (state[id] !== "photo") return;

  users[id].photo = ctx.message.photo.at(-1).file_id;
  ctx.reply("Пару слов о себе 😉");
  state[id] = "about";
});

// ====== МОЯ АНКЕТА ======
bot.hears("👤 Моя анкета", (ctx) => {
  const id = ctx.from.id;
  const u = users[id];
  if (!u) return ctx.reply("Анкета не найдена 😢");

  ctx.replyWithPhoto(u.photo, {
    caption: `${u.name}, ${u.age}\n📍 ${u.city}\n\n${u.about}`
  });
});

// ====== ПОИСК АНКЕТ ======
bot.hears("🔍 Смотреть анкеты", (ctx) => {
  const id = ctx.from.id;

  if (Object.keys(users).length <= 1) {
    return ctx.reply("Пока ты здесь один.\nАбсолютная свобода. Абсолютное одиночество.");
  }

  const profiles = Object.entries(users).filter(
    ([uid]) => uid != id && !likes[id]?.has(Number(uid))
  );

  if (!profiles.length) {
    return ctx.reply("Анкеты закончились 😔");
  }

  const [targetId, profile] =
    profiles[Math.floor(Math.random() * profiles.length)];

  ctx.replyWithPhoto(profile.photo, {
    caption: `${profile.name}, ${profile.age}\n📍 ${profile.city}\n\n${profile.about}`,
    reply_markup: Markup.inlineKeyboard([
      Markup.button.callback("❤️ Лайк", `like_${targetId}`),
      Markup.button.callback("❌ Пропустить", "skip")
    ])
  });
});

// ====== ЛАЙК ======
bot.action(/like_(.+)/, (ctx) => {
  const userId = ctx.from.id;
  const targetId = Number(ctx.match[1]);

  likes[userId].add(targetId);
  likedBy[targetId].add(userId);

  if (likes[targetId]?.has(userId)) {
    // MATCH
    likedBy[userId].delete(targetId);
    likedBy[targetId].delete(userId);

    ctx.telegram.sendMessage(userId, "💘 MATCH! Диалектика сработала 😉");
    ctx.telegram.sendMessage(targetId, "💘 MATCH! Можно писать 😉");
  } else {
    ctx.reply("Лайк отправлен ❤️");
  }

  ctx.answerCbQuery();
});

// ====== SKIP ======
bot.action("skip", (ctx) => {
  ctx.deleteMessage();
  ctx.answerCbQuery();
});

// ====== КТО МЕНЯ ЛАЙКНУЛ ======
bot.hears("👀 Кто меня лайкнул", (ctx) => {
  const id = ctx.from.id;

  if (!likedBy[id] || likedBy[id].size === 0) {
    const jokes = [
      "Пока лайков нет.\nФилософ в изгнании.",
      "Тишина… где-то плачет один Гегель.",
      "Инцель-arc активен, но это временно.",
      "Никто не лайкнул.\nЗато ты лайкнул истину."
    ];
    return ctx.reply(jokes[Math.floor(Math.random() * jokes.length)]);
  }

  const targetId = [...likedBy[id]][0];
  const p = users[targetId];

  ctx.replyWithPhoto(p.photo, {
    caption:
      `👀 Тобой заинтересовались:\n\n${p.name}, ${p.age}\n📍 ${p.city}\n\n${p.about}`,
    reply_markup: Markup.inlineKeyboard([
      Markup.button.callback("❤️ Лайкнуть в ответ", `like_${targetId}`),
      Markup.button.callback("❌ Игнор (одиночество)", `ignore_${targetId}`)
    ])
  });
});

// ====== IGNORE ======
bot.action(/ignore_(.+)/, (ctx) => {
  const userId = ctx.from.id;
  const targetId = Number(ctx.match[1]);

  likedBy[userId].delete(targetId);
  ctx.reply("Ты выбрал путь одиночки.\nНаблюдай бытие дальше.");
  ctx.answerCbQuery();
});

// ====== RUN ======
bot.launch();
console.log("ALEXANDER DUGINчик запущен 🚀");

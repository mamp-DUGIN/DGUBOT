const { Telegraf, Markup } = require("telegraf");

const BOT_TOKEN = process.env.BOT_TOKEN;
const bot = new Telegraf(BOT_TOKEN);

// ====== ХРАНИЛИЩЕ (в памяти) ======
const users = {};      // userId -> анкета
const likes = {};      // userId -> Set
const likedBy = {};    // userId -> Set
const state = {};      // userId -> шаг регистрации

// ====== START ======
bot.start((ctx) => {
  ctx.reply(
    "Привет 👋\n" +
    "Ты в ALEXANDER DUGINчике — пародии на дайвинчик 😏\n" +
    "Как тебя зовут?"
  );
  state[ctx.from.id] = "name";
});

// ====== ТЕКСТОВЫЕ СООБЩЕНИЯ ======
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
        ctx.reply("Только 18+ 🙂");
        return;
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

      ctx.reply(
        "🔥 Анкета готова!\nНапиши: Смотреть анкеты"
      );
      break;
  }
});

// ====== ФОТО ======
bot.on("photo", (ctx) => {
  const id = ctx.from.id;
  if (state[id] !== "photo") return;

  users[id].photo = ctx.message.photo.at(-1).file_id;
  ctx.reply("Пару слов о себе 😉");
  state[id] = "about";
});

// ====== ПОКАЗ АНКЕТ ======
bot.hears("Смотреть анкеты", (ctx) => {
  const id = ctx.from.id;
  if (!users[id]) return ctx.reply("Сначала зарегистрируйся через /start");

  const profiles = Object.entries(users).filter(
    ([uid]) =>
      uid != id && !likes[id].has(Number(uid))
  );

  if (!profiles.length) {
    return ctx.reply("Анкеты закончились 😔");
  }

  const [targetId, profile] =
    profiles[Math.floor(Math.random() * profiles.length)];

  ctx.replyWithPhoto(
    profile.photo,
    {
      caption:
        `${profile.name}, ${profile.age}\n` +
        `📍 ${profile.city}\n\n` +
        profile.about,
      reply_markup: Markup.inlineKeyboard([
        Markup.button.callback("❤️", `like_${targetId}`),
        Markup.button.callback("❌", "skip")
      ])
    }
  );
});

// ====== ЛАЙК ======
bot.action(/like_(.+)/, (ctx) => {
  const userId = ctx.from.id;
  const targetId = Number(ctx.match[1]);

  likes[userId].add(targetId);
  likedBy[targetId].add(userId);

  if (likes[targetId]?.has(userId)) {
    ctx.telegram.sendMessage(userId, "💘 MATCH! Можно писать 😉");
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

// ====== RUN ======
bot.launch();
console.log("ALEXANDER DUGINчик запущен 🚀");

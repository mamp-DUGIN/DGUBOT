const { Telegraf, Markup } = require("telegraf");

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = 2007502528;

const START_PHOTO = "https://i.postimg.cc/zf5hCDHg/424242142141.png";
const HELP_PHOTO = "https://i.postimg.cc/3xkSsBt7/pozdnyakov.png";

let users = {};
let state = {};
let likes = {};
let likedBy = {};
let browsing = {};
let lastShown = {};
let adminState = {};

// ================== МЕНЮ ==================

function mainMenu() {
  return Markup.keyboard([
    ["🔍 Поиск"],
    ["👤 Мой профиль"],
    ["❤️ Кто меня лайкнул"],
    ["ℹ️ Помощь"]
  ]).resize();
}

function profileMenu() {
  return Markup.keyboard([
    ["🔄 Заполнить заново"],
    ["⬅️ Назад"]
  ]).resize();
}

// ================== START ==================

bot.start((ctx) => {
  ctx.replyWithPhoto(START_PHOTO, {
    caption:
      "Этот бот был создан инцелом для инцелов.\n" +
      "Знакомьтесь, играйте и получайте матчи.",
    reply_markup: mainMenu().reply_markup
  });
});

// ================== ПРОФИЛЬ ==================

bot.command("profile", (ctx) => {
  showProfile(ctx);
});

bot.hears("👤 Мой профиль", (ctx) => {
  showProfile(ctx);
});

function showProfile(ctx) {
  const user = users[ctx.from.id];

  if (!user) {
    state[ctx.from.id] = "name";
    return ctx.reply("У тебя нет анкеты. Введи имя:");
  }

  ctx.replyWithPhoto(user.photo, {
    caption:
      `${user.name}, ${user.age}\n` +
      `${user.type}\n` +
      `${user.city}\n\n` +
      `${user.about}`,
    reply_markup: profileMenu().reply_markup
  });
}

bot.hears("🔄 Заполнить заново", (ctx) => {
  state[ctx.from.id] = "name";
  ctx.reply("Введите имя:");
});

bot.hears("⬅️ Назад", (ctx) => {
  ctx.reply("Главное меню:", mainMenu());
});

// ================== ПОМОЩЬ ==================

bot.hears("ℹ️ Помощь", (ctx) => {
  ctx.replyWithPhoto(HELP_PHOTO, {
    caption:
      "Команды:\n" +
      "/start — меню\n" +
      "/profile — профиль\n" +
      "/broadcast — рассылка (админ)\n\n" +
      "Регистрация 14+\n\n" +
      "Официальный канал:\nhttps://t.me/DGUBOTOFF\n\n" +
      "Поддержка: @DjKozyavkin"
  });
});

// ================== ПОИСК ==================

bot.hears("🔍 Поиск", (ctx) => {
  if (!users[ctx.from.id]) {
    return ctx.reply("Сначала создай анкету через «Мой профиль»");
  }

  showNextProfile(ctx);
});

function showNextProfile(ctx) {
  const id = ctx.from.id;

  let candidates = Object.keys(users).filter(uid =>
    uid != id &&
    (!likes[id] || !likes[id].includes(uid))
  );

  candidates = candidates.filter(uid => uid !== lastShown[id]);

  if (!candidates.length) {
    return ctx.reply("Анкеты закончились 😢");
  }

  const target = candidates[Math.floor(Math.random() * candidates.length)];

  browsing[id] = target;
  lastShown[id] = target;

  const profile = users[target];

  ctx.replyWithPhoto(profile.photo, {
    caption:
      `${profile.name}, ${profile.age}\n` +
      `${profile.type}\n` +
      `${profile.city}\n\n` +
      `${profile.about}`,
    ...Markup.keyboard([
      ["❤️ Лайк", "⏭ Скип"],
      ["⬅️ Назад"]
    ]).resize()
  });
}

// ================== ЛАЙК ==================

bot.hears("❤️ Лайк", async (ctx) => {
  const from = ctx.from.id;
  const to = browsing[from];

  if (!to) return;

  if (!likes[from]) likes[from] = [];

  if (likes[from].includes(to)) {
    return ctx.reply("Ты уже лайкал этого человека");
  }

  likes[from].push(to);

  if (!likedBy[to]) likedBy[to] = [];
  likedBy[to].push(from);

  await ctx.telegram.sendMessage(
    to,
    "🔥 Кто-то лайкнул тебя!\nЗайди в «Кто меня лайкнул»"
  );

  if (likes[to] && likes[to].includes(String(from))) {
    await ctx.reply(
      `💖 МАТЧ!\n@${users[to].username || "без username"}`
    );

    await ctx.telegram.sendMessage(
      to,
      `💖 МАТЧ!\n@${users[from].username || "без username"}`
    );
  }

  showNextProfile(ctx);
});

bot.hears("⏭ Скип", (ctx) => {
  showNextProfile(ctx);
});

// ================== КТО МЕНЯ ЛАЙКНУЛ ==================

bot.hears("❤️ Кто меня лайкнул", (ctx) => {
  const id = ctx.from.id;

  if (!likedBy[id] || !likedBy[id].length) {
    return ctx.reply("Пока никто не лайкал");
  }

  const liker = likedBy[id][0];
  const profile = users[liker];

  ctx.replyWithPhoto(profile.photo, {
    caption:
      `${profile.name}, ${profile.age}\n` +
      `${profile.type}\n` +
      `${profile.city}\n\n` +
      `${profile.about}`
  });
});

// ================== BROADCAST ==================

bot.command("broadcast", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) {
    return ctx.reply("Нет доступа.");
  }

  adminState[ctx.from.id] = "broadcast";
  ctx.reply("Введи текст для рассылки:");
});

bot.on("text", async (ctx) => {
  const id = ctx.from.id;
  const text = ctx.message.text;

  // ===== РАССЫЛКА =====
  if (adminState[id] === "broadcast") {
    let sent = 0;

    for (const userId of Object.keys(users)) {
      try {
        await ctx.telegram.sendMessage(userId, text);
        sent++;
      } catch (e) {}
    }

    adminState[id] = null;
    return ctx.reply(`Рассылка завершена ✅\nОтправлено: ${sent}`);
  }

  if (!state[id]) return;

  switch (state[id]) {
    case "name":
      users[id] = { name: text };
      state[id] = "age";
      return ctx.reply("Возраст?");

    case "age":
      if (isNaN(text) || text < 14) {
        return ctx.reply("Регистрация с 14 лет.");
      }
      users[id].age = text;
      state[id] = "type";
      return ctx.reply(
        "Выбери тип:",
        Markup.keyboard([
          ["🧔 Инцел"],
          ["👩 Фемцел"]
        ]).resize()
      );

    case "type":
      users[id].type = text;
      state[id] = "city";
      return ctx.reply(
        "Москва или Село?",
        Markup.keyboard([
          ["🏙 Москва"],
          ["🌾 Село"]
        ]).resize()
      );

    case "city":
      users[id].city = text;
      state[id] = "about";
      return ctx.reply("О себе:");

    case "about":
      users[id].about = text;
      state[id] = "photo";
      return ctx.reply("Пришли фото:");
  }
});

bot.on("photo", (ctx) => {
  if (state[ctx.from.id] === "photo") {
    const fileId = ctx.message.photo.pop().file_id;

    users[ctx.from.id].photo = fileId;
    users[ctx.from.id].username = ctx.from.username;

    state[ctx.from.id] = null;

    ctx.reply("Анкета создана ✅", mainMenu());
  }
});

bot.launch();
console.log("Bot started");

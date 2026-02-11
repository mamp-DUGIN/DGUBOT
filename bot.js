const { Telegraf, Markup } = require("telegraf");

const bot = new Telegraf("YOUR_BOT_TOKEN"); // <-- вставь токен
const ADMIN_ID = 2007502528;

const START_PHOTO = "https://i.postimg.cc/zf5hCDHg/424242142141.png";
const HELP_PHOTO = "https://i.postimg.cc/3xkSsBt7/pozdnyakov.png";

let users = {};
let state = {};
let likes = {};
let likedBy = {};
let browsing = {};
let viewingLikes = {};
let broadcastMode = false;

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

bot.start((ctx) => {
  state[ctx.from.id] = null;
  ctx.replyWithPhoto(START_PHOTO, {
    caption: "Добро пожаловать в ALEXANDER DUGINчик 😈",
    reply_markup: mainMenu().reply_markup
  });
});

bot.command("profile", (ctx) => {
  showProfile(ctx);
});

bot.command("broadcast", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  broadcastMode = true;
  ctx.reply("Введи текст для рассылки:");
});

bot.hears("ℹ️ Помощь", (ctx) => {
  ctx.replyWithPhoto(HELP_PHOTO, {
    caption:
      "/start — меню\n" +
      "/profile — профиль\n\n" +
      "Регистрация 14+\n" +
      "Поддержка: @DjKozyavkin"
  });
});

bot.hears("👤 Мой профиль", (ctx) => {
  ctx.reply("Меню профиля:", profileMenu());
});

bot.hears("⬅️ Назад", (ctx) => {
  ctx.reply("Главное меню:", mainMenu());
});

bot.hears("🔄 Заполнить заново", (ctx) => {
  state[ctx.from.id] = "name";
  ctx.reply("Введите имя:");
});

function showProfile(ctx) {
  const user = users[ctx.from.id];
  if (!user) {
    return ctx.reply("У тебя нет анкеты. Нажми «Заполнить заново»");
  }

  ctx.replyWithPhoto(user.photo, {
    caption:
      `${user.name}, ${user.age}\n` +
      `${user.type}\n` +
      `${user.city}\n\n` +
      `${user.about}`
  });
}

bot.hears("🔍 Поиск", (ctx) => {
  if (!users[ctx.from.id]) {
    return ctx.reply("Сначала создай анкету 👤");
  }
  showNextProfile(ctx);
});

function showNextProfile(ctx) {
  const id = ctx.from.id;
  const list = Object.keys(users).filter(
    uid =>
      uid != id &&
      (!likes[id] || !likes[id].includes(uid))
  );

  if (!list.length) {
    return ctx.reply("Анкеты закончились 😢");
  }

  const target = list[Math.floor(Math.random() * list.length)];
  browsing[id] = target;

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

bot.hears("❤️ Лайк", (ctx) => {
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

  ctx.telegram.sendMessage(
    to,
    "🔥 Кто-то лайкнул тебя!\nЗайди в «Кто меня лайкнул»"
  );

  if (likes[to] && likes[to].includes(String(from))) {
    ctx.reply(
      `💖 МЕТЧ!\nВот его username: @${ctx.from.username || "без username"}`
    );

    ctx.telegram.sendMessage(
      to,
      `💖 МЕТЧ!\nВот его username: @${ctx.from.username || "без username"}`
    );
  }

  showNextProfile(ctx);
});

bot.hears("⏭ Скип", (ctx) => {
  showNextProfile(ctx);
});

bot.hears("❤️ Кто меня лайкнул", (ctx) => {
  const id = ctx.from.id;
  if (!likedBy[id] || !likedBy[id].length) {
    return ctx.reply("Пока никто не лайкал 😔");
  }

  const liker = likedBy[id].shift();
  viewingLikes[id] = liker;

  const profile = users[liker];

  ctx.replyWithPhoto(profile.photo, {
    caption:
      `${profile.name}, ${profile.age}\n` +
      `${profile.type}\n` +
      `${profile.city}\n\n` +
      `${profile.about}`,
    ...Markup.keyboard([
      ["❤️ Ответить лайком", "❌ Скип"],
      ["⬅️ Назад"]
    ]).resize()
  });
});

bot.hears("❤️ Ответить лайком", (ctx) => {
  const from = ctx.from.id;
  const to = viewingLikes[from];
  if (!to) return;

  if (!likes[from]) likes[from] = [];
  if (!likes[from].includes(to)) {
    likes[from].push(to);
  }

  ctx.reply(
    `💖 МЕТЧ!\nВот его username: @${users[to].username || "без username"}`
  );

  ctx.telegram.sendMessage(
    to,
    `💖 МЕТЧ!\nВот его username: @${ctx.from.username || "без username"}`
  );

  showNextProfile(ctx);
});

bot.hears("❌ Скип", (ctx) => {
  ctx.reply("Ок, пропустили");
  ctx.reply("Главное меню:", mainMenu());
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

bot.on("text", (ctx) => {
  const id = ctx.from.id;
  const text = ctx.message.text;

  if (broadcastMode && id === ADMIN_ID) {
    Object.keys(users).forEach(uid => {
      ctx.telegram.sendMessage(uid, text);
    });
    broadcastMode = false;
    return ctx.reply("Рассылка отправлена ✅");
  }

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

bot.launch();

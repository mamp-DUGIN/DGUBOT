const { Telegraf, Markup } = require("telegraf");

const bot = new Telegraf(process.env.BOT_TOKEN);

const users = {};
const state = {};
const likes = {}; // кто кого лайкнул

// ===== МЕНЮ =====
function mainMenu() {
  return Markup.keyboard([
    ["🔍 Смотреть анкеты"],
    ["👤 Мой профиль"],
    ["ℹ️ Помощь"]
  ]).resize();
}

bot.start((ctx) => {
  return ctx.reply("Главное меню:", mainMenu());
});

// ===== ПОМОЩЬ =====
bot.hears("ℹ️ Помощь", (ctx) => {
  return ctx.reply(
    "Команды:\n" +
    "/start — меню\n" +
    "/profile — профиль\n" +
    "/browse — поиск\n\n" +
    "Поддержка: @DjKozyavkin"
  );
});

// ===== ПРОФИЛЬ =====
bot.hears("👤 Мой профиль", (ctx) => showProfile(ctx));
bot.command("profile", (ctx) => showProfile(ctx));

function showProfile(ctx) {
  const id = ctx.from.id;
  const user = users[id];

  if (!user) {
    state[id] = "name";
    return ctx.reply("У тебя нет анкеты.\nКак тебя зовут?");
  }

  return ctx.replyWithPhoto(user.photo, {
    caption:
      `${user.name}, ${user.age}\n📍 ${user.city}\n\n${user.about}`,
    ...Markup.keyboard([
      ["🔄 Заполнить заново"],
      ["🔍 Смотреть анкеты"],
      ["ℹ️ Помощь"]
    ]).resize()
  });
}

bot.hears("🔄 Заполнить заново", (ctx) => {
  const id = ctx.from.id;
  delete users[id];
  delete likes[id];
  state[id] = "name";
  return ctx.reply("Начинаем заново.\nКак тебя зовут?");
});

// ===== ПОИСК =====
bot.hears("🔍 Смотреть анкеты", (ctx) => browse(ctx));
bot.command("browse", (ctx) => browse(ctx));

function browse(ctx) {
  const id = ctx.from.id;

  if (!users[id]) {
    return ctx.reply("Сначала создай анкету в разделе «👤 Мой профиль»");
  }

  const others = Object.entries(users).filter(
    ([uid]) => uid != id
  );

  if (others.length === 0) {
    return ctx.reply("Пока нет других анкет 😔");
  }

  const [targetId, profile] =
    others[Math.floor(Math.random() * others.length)];

  return ctx.replyWithPhoto(profile.photo, {
    caption:
      `${profile.name}, ${profile.age}\n📍 ${profile.city}\n\n${profile.about}`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "❤️ Лайк", callback_data: `like_${targetId}` },
          { text: "❌ Пропустить", callback_data: "skip" }
        ]
      ]
    }
  });
}

// ===== ЛАЙК =====
bot.action(/like_(.+)/, async (ctx) => {
  const userId = ctx.from.id;
  const targetId = ctx.match[1];

  if (!likes[userId]) likes[userId] = new Set();
  likes[userId].add(targetId);

  // Проверка взаимности
  if (likes[targetId] && likes[targetId].has(String(userId))) {

    const user1 = users[userId];
    const user2 = users[targetId];

    const username1 = ctx.from.username
      ? `@${ctx.from.username}`
      : "Юзернейм не указан";

    const username2 = ctx.telegram.getChat(targetId)
      .then(chat => chat.username ? `@${chat.username}` : "Юзернейм не указан")
      .catch(() => "Юзернейм не указан");

    // Отправка матча
    ctx.telegram.sendMessage(
      userId,
      `💘 У ВАС МАТЧ!\n\nЮзернейм собеседника: ${await username2}`
    );

    ctx.telegram.sendMessage(
      targetId,
      `💘 У ВАС МАТЧ!\n\nЮзернейм собеседника: ${username1}`
    );

  } else {
    ctx.reply("Лайк отправлен ❤️");
  }

  ctx.answerCbQuery();
});

// ===== ПРОПУСТИТЬ =====
bot.action("skip", (ctx) => {
  ctx.deleteMessage();
  ctx.answerCbQuery();
});

// ===== РЕГИСТРАЦИЯ =====
bot.on("text", (ctx) => {
  const id = ctx.from.id;
  if (!state[id]) return;

  const text = ctx.message.text;

  switch (state[id]) {
    case "name":
      users[id] = { name: text };
      state[id] = "age";
      return ctx.reply("Сколько тебе лет?");

    case "age":
      if (isNaN(text) || text < 18) {
        return ctx.reply("Только 18+");
      }
      users[id].age = text;
      state[id] = "city";
      return ctx.reply("Из какого ты города?");

    case "city":
      users[id].city = text;
      state[id] = "about";
      return ctx.reply("Напиши пару слов о себе:");

    case "about":
      users[id].about = text;
      state[id] = "photo";
      return ctx.reply("Отправь фото:");
  }
});

bot.on("photo", (ctx) => {
  const id = ctx.from.id;

  if (state[id] !== "photo") return;

  users[id].photo = ctx.message.photo.pop().file_id;
  delete state[id];

  return ctx.reply("Анкета сохранена ✅", mainMenu());
});

bot.launch();
console.log("Бот с лайками запущен 🚀");

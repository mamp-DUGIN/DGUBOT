const { Telegraf, Markup } = require("telegraf");

const bot = new Telegraf(process.env.BOT_TOKEN);

const ADMIN_ID = 2007502528;

const users = {};
const state = {};
const likes = {};
const likedBy = {};

// ===== ГЛАВНОЕ МЕНЮ =====
function mainMenu() {
  return Markup.keyboard([
    ["🔍 Смотреть анкеты"],
    ["❤️ Кто меня лайкнул"],
    ["👤 Мой профиль"],
    ["ℹ️ Помощь"]
  ]).resize();
}

// ===== МЕНЮ ПРОФИЛЯ =====
function profileMenu() {
  return Markup.keyboard([
    ["🔄 Заполнить анкету заново"],
    ["❌ Отмена"]
  ]).resize();
}

// ===== START =====
bot.start((ctx) => {
  return ctx.reply("Главное меню:", mainMenu());
});

// ===== ПОМОЩЬ =====
bot.hears("ℹ️ Помощь", (ctx) => {
  return ctx.reply(
    "Команды:\n" +
    "/start — меню\n" +
    "/browse — поиск\n" +
    "/profile — профиль\n\n" +
    "Поддержка: @DjKozyavkin"
  );
});

// ===== ПРОФИЛЬ =====
bot.hears("👤 Мой профиль", (ctx) => {
  const id = ctx.from.id;
  const user = users[id];

  if (!user) {
    state[id] = "name";
    return ctx.reply("У тебя нет анкеты.\nКак тебя зовут?");
  }

  ctx.replyWithPhoto(user.photo, {
    caption: `${user.name}, ${user.age}\n📍 ${user.city}\n\n${user.about}`
  });

  return ctx.reply("Управление анкетой:", profileMenu());
});

bot.hears("🔄 Заполнить анкету заново", (ctx) => {
  const id = ctx.from.id;
  delete users[id];
  delete likes[id];
  delete likedBy[id];
  state[id] = "name";
  return ctx.reply("Начинаем заново.\nКак тебя зовут?");
});

bot.hears("❌ Отмена", (ctx) => {
  return ctx.reply("Главное меню:", mainMenu());
});

// ===== ПОИСК =====
bot.hears("🔍 Смотреть анкеты", (ctx) => browse(ctx));

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
  if (!likedBy[targetId]) likedBy[targetId] = new Set();

  likes[userId].add(targetId);
  likedBy[targetId].add(String(userId));

  // Уведомление
  await ctx.telegram.sendMessage(
    targetId,
    "❤️ Тебя кто-то лайкнул!\nЗайди в «Кто меня лайкнул»"
  );

  // Проверка матча
  if (likes[targetId] && likes[targetId].has(String(userId))) {

    const username1 = ctx.from.username
      ? `@${ctx.from.username}`
      : "Юзернейм не указан";

    const chat = await ctx.telegram.getChat(targetId);
    const username2 = chat.username
      ? `@${chat.username}`
      : "Юзернейм не указан";

    await ctx.telegram.sendMessage(
      userId,
      `💘 У ВАС МАТЧ!\nЮзернейм: ${username2}`
    );

    await ctx.telegram.sendMessage(
      targetId,
      `💘 У ВАС МАТЧ!\nЮзернейм: ${username1}`
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

// ===== КТО МЕНЯ ЛАЙКНУЛ =====
bot.hears("❤️ Кто меня лайкнул", (ctx) => {
  const id = ctx.from.id;

  if (!likedBy[id] || likedBy[id].size === 0) {
    return ctx.reply("Пока никто не лайкнул 😔");
  }

  const likerId = [...likedBy[id]][0];
  const profile = users[likerId];

  if (!profile) {
    return ctx.reply("Ошибка анкеты.");
  }

  return ctx.replyWithPhoto(profile.photo, {
    caption:
      `Тебя лайкнул:\n\n${profile.name}, ${profile.age}\n📍 ${profile.city}\n\n${profile.about}`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "❤️ Лайкнуть в ответ", callback_data: `like_${likerId}` }
        ]
      ]
    }
  });
});

// ===== РАССЫЛКА =====
bot.command("broadcast", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) {
    return ctx.reply("У тебя нет доступа.");
  }

  state[ctx.from.id] = "broadcast";
  return ctx.reply("Введите текст для рассылки:");
});

// ===== ОБРАБОТКА ТЕКСТА =====
bot.on("text", async (ctx) => {
  const id = ctx.from.id;
  const text = ctx.message.text;

  // Рассылка
  if (state[id] === "broadcast") {
    if (id !== ADMIN_ID) return;

    let sent = 0;

    for (const userId of Object.keys(users)) {
      try {
        await ctx.telegram.sendMessage(
          userId,
          "📢 Обновление:\n\n" + text
        );
        sent++;
      } catch (e) {}
    }

    delete state[id];
    return ctx.reply(`Рассылка завершена.\nОтправлено: ${sent}`);
  }

  if (!state[id]) return;

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

// ===== ФОТО =====
bot.on("photo", (ctx) => {
  const id = ctx.from.id;
  if (state[id] !== "photo") return;

  users[id].photo = ctx.message.photo.pop().file_id;
  delete state[id];

  return ctx.reply("Анкета сохранена ✅", mainMenu());
});

bot.launch();
console.log("Бот полностью запущен 🚀");

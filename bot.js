const { Telegraf, Markup } = require("telegraf");

const bot = new Telegraf(process.env.BOT_TOKEN);

const ADMIN_ID = 2007502528;

const users = {};
const state = {};
const likes = {};
const likedBy = {};

// ===== МЕНЮ =====
function mainMenu() {
  return Markup.keyboard([
    ["🔍 Смотреть анкеты"],
    ["❤️ Кто меня лайкнул"],
    ["👤 Мой профиль"],
    ["ℹ️ Помощь"]
  ]).resize();
}

function profileMenu() {
  return Markup.keyboard([
    ["🔄 Заполнить анкету заново"],
    ["❌ Отмена"]
  ]).resize();
}

// ===== START =====
bot.start((ctx) => {
  ctx.reply("Главное меню:", mainMenu());
});

// ===== ПОМОЩЬ =====
bot.hears("ℹ️ Помощь", (ctx) => {
  ctx.reply(
    "Команды:\n" +
    "/start — меню\n" +
    "/profile — профиль\n" +
    "/broadcast — рассылка (админ)\n\n" +
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

  ctx.reply("Управление анкетой:", profileMenu());
});

bot.hears("🔄 Заполнить анкету заново", (ctx) => {
  const id = ctx.from.id;
  delete users[id];
  delete likes[id];
  delete likedBy[id];
  state[id] = "name";
  ctx.reply("Начинаем заново.\nКак тебя зовут?");
});

bot.hears("❌ Отмена", (ctx) => {
  ctx.reply("Главное меню:", mainMenu());
});

// ===== ПОИСК =====
bot.hears("🔍 Смотреть анкеты", (ctx) => browse(ctx));

function browse(ctx) {
  const id = String(ctx.from.id);

  if (!users[id]) {
    return ctx.reply("Сначала создай анкету в разделе «👤 Мой профиль»");
  }

  const others = Object.entries(users).filter(
    ([uid]) => uid !== id
  );

  if (others.length === 0) {
    return ctx.reply("Пока нет других анкет 😔");
  }

  const [targetId, profile] =
    others[Math.floor(Math.random() * others.length)];

  ctx.replyWithPhoto(profile.photo, {
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
  const userId = String(ctx.from.id);
  const targetId = String(ctx.match[1]);

  if (userId === targetId) {
    return ctx.answerCbQuery("Самого себя нельзя лайкнуть 😅");
  }

  if (!likes[userId]) likes[userId] = new Set();
  if (!likedBy[targetId]) likedBy[targetId] = new Set();

  if (likes[userId].has(targetId)) {
    return ctx.answerCbQuery("Ты уже лайкал этого человека ❤️");
  }

  likes[userId].add(targetId);
  likedBy[targetId].add(userId);

  // MATCH
  if (likes[targetId] && likes[targetId].has(userId)) {

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

    await ctx.telegram.sendMessage(
      targetId,
      "❤️ Тебя кто-то лайкнул!\nЗайди в «Кто меня лайкнул»"
    );

    ctx.answerCbQuery("Лайк отправлен ❤️");
  }
});

// ===== СКИП В ПОИСКЕ =====
bot.action("skip", (ctx) => {
  ctx.deleteMessage();
  ctx.answerCbQuery();
});

// ===== КТО МЕНЯ ЛАЙКНУЛ =====
bot.hears("❤️ Кто меня лайкнул", (ctx) => {
  showNextLiker(ctx);
});

function showNextLiker(ctx) {
  const id = String(ctx.from.id);

  if (!likedBy[id] || likedBy[id].size === 0) {
    return ctx.reply("Пока никто не лайкнул 😔");
  }

  const likerId = [...likedBy[id]][0];
  const profile = users[likerId];

  if (!profile) {
    likedBy[id].delete(likerId);
    return showNextLiker(ctx);
  }

  ctx.replyWithPhoto(profile.photo, {
    caption:
      `Тебя лайкнул:\n\n${profile.name}, ${profile.age}\n📍 ${profile.city}\n\n${profile.about}`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "❤️ Лайкнуть в ответ", callback_data: `like_${likerId}` }
        ],
        [
          { text: "❌ Скипнуть", callback_data: `skip_liker_${likerId}` }
        ]
      ]
    }
  });
}

bot.action(/skip_liker_(.+)/, (ctx) => {
  const userId = String(ctx.from.id);
  const likerId = ctx.match[1];

  if (likedBy[userId]) {
    likedBy[userId].delete(likerId);
  }

  ctx.deleteMessage();
  ctx.answerCbQuery();

  showNextLiker(ctx);
});

// ===== РАССЫЛКА =====
bot.command("broadcast", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) {
    return ctx.reply("У тебя нет доступа.");
  }

  state[ctx.from.id] = "broadcast";
  ctx.reply("Введите текст для рассылки:");
});

// ===== ОБРАБОТКА ТЕКСТА =====
bot.on("text", async (ctx) => {
  const id = String(ctx.from.id);
  const text = ctx.message.text;

  // РАССЫЛКА
  if (state[id] === "broadcast") {
    if (Number(id) !== ADMIN_ID) return;

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
      return ctx.reply("Москва или Село?");

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
  const id = String(ctx.from.id);

  if (state[id] !== "photo") return;

  users[id].photo = ctx.message.photo.pop().file_id;
  delete state[id];

  ctx.reply("Анкета сохранена ✅", mainMenu());
});

bot.launch();
console.log("DUGINчик полностью запущен 🚀");

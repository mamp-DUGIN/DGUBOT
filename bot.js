const { Telegraf, Markup } = require("telegraf");

const bot = new Telegraf(process.env.BOT_TOKEN);

const users = {};
const state = {};

// ===== МЕНЮ =====
function mainMenu() {
  return Markup.keyboard([
    ["🔍 Смотреть анкеты"],
    ["👤 Моя анкета"],
    ["ℹ️ Помощь"]
  ]).resize();
}

// ===== START =====
bot.start((ctx) => {
  return ctx.reply("Главное меню:", mainMenu());
});

bot.command("menu", (ctx) => {
  return ctx.reply("Главное меню:", mainMenu());
});

// ===== ПОМОЩЬ =====
bot.hears("ℹ️ Помощь", (ctx) => {
  return ctx.reply(
    "📌 Команды:\n" +
    "/start — меню\n" +
    "/profile — моя анкета\n" +
    "/browse — смотреть анкеты\n\n" +
    "По всем вопросам: @DjKozyavkin"
  );
});

// ===== ПРОФИЛЬ =====
bot.command("profile", (ctx) => {
  return showProfile(ctx);
});

bot.hears("👤 Моя анкета", (ctx) => {
  const id = ctx.from.id;

  if (!users[id]) {
    state[id] = "name";
    return ctx.reply("Создаём анкету.\nКак тебя зовут?");
  }

  return showProfile(ctx);
});

function showProfile(ctx) {
  const id = ctx.from.id;
  const user = users[id];

  if (!user) {
    return ctx.reply("Анкета не найдена.");
  }

  return ctx.replyWithPhoto(user.photo, {
    caption:
      `${user.name}, ${user.age}\n` +
      `📍 ${user.city}\n\n` +
      `${user.about}`
  });
}

// ===== ПОИСК =====
bot.command("browse", (ctx) => {
  return browse(ctx);
});

bot.hears("🔍 Смотреть анкеты", (ctx) => {
  return browse(ctx);
});

function browse(ctx) {
  const id = ctx.from.id;

  if (!users[id]) {
    return ctx.reply("Сначала создай анкету в разделе «👤 Моя анкета»");
  }

  const others = Object.entries(users).filter(
    ([uid]) => uid != id
  );

  if (others.length === 0) {
    return ctx.reply("Пока нет других анкет 😔");
  }

  const [_, profile] =
    others[Math.floor(Math.random() * others.length)];

  return ctx.replyWithPhoto(profile.photo, {
    caption:
      `${profile.name}, ${profile.age}\n` +
      `📍 ${profile.city}\n\n` +
      `${profile.about}`
  });
}

// ===== РЕГИСТРАЦИЯ =====
bot.on("text", (ctx) => {
  const id = ctx.from.id;

  if (!state[id]) return; // ВАЖНО

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

  return ctx.reply("Анкета создана ✅", mainMenu());
});

bot.launch();
console.log("Бот запущен 🚀");

const { Telegraf, Markup } = require("telegraf");

const bot = new Telegraf(process.env.BOT_TOKEN);

// ===== ХРАНИЛИЩЕ =====
const users = {};
const state = {};

// ===== ГЛАВНОЕ МЕНЮ =====
function mainMenu() {
  return Markup.keyboard([
    ["🔍 Смотреть анкеты"],
    ["👤 Моя анкета"],
    ["ℹ️ Помощь"]
  ]).resize();
}

// ===== START =====
bot.start((ctx) => {
  ctx.reply(
    "Добро пожаловать в ALEXANDER DUGINчик 😈",
    mainMenu()
  );
});

bot.command("menu", (ctx) => {
  ctx.reply("Главное меню:", mainMenu());
});

// ===== ПРОФИЛЬ =====
bot.command("profile", (ctx) => {
  showProfile(ctx);
});

bot.hears("👤 Моя анкета", (ctx) => {
  const id = ctx.from.id;

  if (!users[id]) {
    state[id] = "name";
    return ctx.reply("Создаём анкету.\nКак тебя зовут?");
  }

  showProfile(ctx);
});

function showProfile(ctx) {
  const id = ctx.from.id;
  const user = users[id];

  if (!user) {
    return ctx.reply("У тебя нет анкеты.\nНажми «👤 Моя анкета» чтобы создать.");
  }

  ctx.replyWithPhoto(user.photo, {
    caption:
      `${user.name}, ${user.age}\n` +
      `📍 ${user.city}\n\n` +
      `${user.about}`
  });
}

// ===== РЕГИСТРАЦИЯ =====
bot.on("text", (ctx) => {
  const id = ctx.from.id;
  if (!state[id]) return;

  const text = ctx.message.text;

  switch (state[id]) {
    case "name":
      users[id] = { name: text };
      state[id] = "age";
      ctx.reply("Сколько тебе лет?");
      break;

    case "age":
      if (isNaN(text) || text < 18) {
        return ctx.reply("Только 18+");
      }
      users[id].age = text;
      state[id] = "city";
      ctx.reply("Из какого ты города?");
      break;

    case "city":
      users[id].city = text;
      state[id] = "about";
      ctx.reply("Напиши пару слов о себе:");
      break;

    case "about":
      users[id].about = text;
      state[id] = "photo";
      ctx.reply("Отправь фото:");
      break;
  }
});

bot.on("photo", (ctx) => {
  const id = ctx.from.id;
  if (state[id] !== "photo") return;

  users[id].photo = ctx.message.photo.pop().file_id;
  delete state[id];

  ctx.reply("Анкета создана ✅", mainMenu());
});

// ===== ПОИСК АНКЕТ =====
bot.command("browse", (ctx) => {
  browseProfiles(ctx);
});

bot.hears("🔍 Смотреть анкеты", (ctx) => {
  browseProfiles(ctx);
});

function browseProfiles(ctx) {
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

  ctx.replyWithPhoto(profile.photo, {
    caption:
      `${profile.name}, ${profile.age}\n` +
      `📍 ${profile.city}\n\n` +
      `${profile.about}`
  });
}

// ===== ПОМОЩЬ =====
bot.hears("ℹ️ Помощь", (ctx) => {
  ctx.reply(
    "Команды:\n" +
    "/start — открыть меню\n" +
    "/menu — главное меню\n" +
    "/profile — моя анкета\n" +
    "/browse — смотреть анкеты"
  );
});

bot.launch();
console.log("Бот запущен 🚀");

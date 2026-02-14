const { Telegraf, Markup } = require("telegraf");
const { Pool } = require("pg");

if (!process.env.BOT_TOKEN) {
  console.error("BOT_TOKEN not found");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not found");
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const START_PHOTO = "https://i.postimg.cc/zf5hCDHg/424242142141.png";

let state = {};
let browsing = {};
let lastShown = {};

// ===== ИНИЦИАЛИЗАЦИЯ БАЗЫ =====

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT PRIMARY KEY,
        name TEXT,
        age INT,
        type TEXT,
        city TEXT,
        about TEXT,
        photo TEXT,
        username TEXT
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS likes (
        from_id BIGINT,
        to_id BIGINT,
        UNIQUE(from_id, to_id)
      );
    `);

    console.log("Database connected");
  } catch (err) {
    console.error("DB error:", err);
  }
}

initDB();

// ===== МЕНЮ =====

function mainMenu() {
  return Markup.keyboard([
    ["🔍 Поиск"],
    ["👤 Мой профиль"],
    ["❤️ Кто меня лайкнул"]
  ]).resize();
}

// ===== START =====

bot.start((ctx) => {
  ctx.replyWithPhoto(START_PHOTO, {
    caption:
      "Добро пожаловать.\n\n" +
      "Создай анкету и начинай поиск.",
    reply_markup: mainMenu().reply_markup
  });
});

// ===== ПРОФИЛЬ =====

bot.hears("👤 Мой профиль", async (ctx) => {
  const res = await pool.query(
    "SELECT * FROM users WHERE id = $1",
    [ctx.from.id]
  );

  if (!res.rows.length) {
    state[ctx.from.id] = { step: "name" };
    return ctx.reply("У тебя нет анкеты. Введи имя:");
  }

  const user = res.rows[0];

  ctx.replyWithPhoto(user.photo, {
    caption:
      `${user.name}, ${user.age}\n` +
      `${user.type}\n` +
      `${user.city}\n\n` +
      `${user.about}`
  });
});

// ===== СОЗДАНИЕ АНКЕТЫ =====

bot.on("text", async (ctx) => {
  const id = ctx.from.id;
  const text = ctx.message.text;

  if (!state[id]) return;

  const userState = state[id];

  if (userState.step === "name") {
    userState.name = text;
    userState.step = "age";
    return ctx.reply("Возраст?");
  }

  if (userState.step === "age") {
    if (isNaN(text) || text < 14)
      return ctx.reply("Минимум 14 лет.");

    userState.age = text;
    userState.step = "type";

    return ctx.reply(
      "Выбери тип:",
      Markup.keyboard([
        ["🧔 Инцел"],
        ["👩 Фемцел"]
      ]).resize()
    );
  }

  if (userState.step === "type") {
    userState.type = text;
    userState.step = "city";

    return ctx.reply(
      "Город:",
      Markup.keyboard([
        ["🏙 Москва"],
        ["🌾 Село"]
      ]).resize()
    );
  }

  if (userState.step === "city") {
    userState.city = text;
    userState.step = "about";
    return ctx.reply("Напиши о себе:");
  }

  if (userState.step === "about") {
    userState.about = text;
    userState.step = "photo";
    return ctx.reply("Пришли фото:");
  }
});

// ===== ФОТО =====

bot.on("photo", async (ctx) => {
  const id = ctx.from.id;

  if (!state[id] || state[id].step !== "photo") return;

  const fileId = ctx.message.photo.pop().file_id;
  const data = state[id];

  await pool.query(
    `INSERT INTO users (id, name, age, type, city, about, photo, username)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (id) DO UPDATE
     SET name=$2, age=$3, type=$4, city=$5, about=$6, photo=$7, username=$8`,
    [
      id,
      data.name,
      data.age,
      data.type,
      data.city,
      data.about,
      fileId,
      ctx.from.username
    ]
  );

  state[id] = null;
  ctx.reply("Анкета сохранена ✅", mainMenu());
});

// ===== ПОИСК =====

bot.hears("🔍 Поиск", async (ctx) => {
  const id = ctx.from.id;

  const res = await pool.query(
    "SELECT * FROM users WHERE id != $1 ORDER BY RANDOM() LIMIT 1",
    [id]
  );

  if (!res.rows.length)
    return ctx.reply("Анкет пока нет.");

  const user = res.rows[0];

  browsing[id] = user.id;
  lastShown[id] = user.id;

  ctx.replyWithPhoto(user.photo, {
    caption:
      `${user.name}, ${user.age}\n` +
      `${user.type}\n` +
      `${user.city}\n\n` +
      `${user.about}`,
    reply_markup: Markup.keyboard([
      ["❤️ Лайк", "➡️ Дальше"]
    ]).resize().reply_markup
  });
});

// ===== ДАЛЬШЕ =====

bot.hears("➡️ Дальше", (ctx) => {
  ctx.emit("text", { ...ctx.message, text: "🔍 Поиск" });
});

// ===== ЛАЙК =====

bot.hears("❤️ Лайк", async (ctx) => {
  const from = ctx.from.id;
  const to = browsing[from];

  if (!to) return;

  try {
    await pool.query(
      "INSERT INTO likes (from_id, to_id) VALUES ($1,$2)",
      [from, to]
    );

    ctx.reply("Лайк отправлен ❤️");

    ctx.telegram.sendMessage(
      to,
      "🔥 Тебя лайкнули!"
    );

  } catch {
    ctx.reply("Ты уже лайкал этого человека.");
  }
});

// ===== КТО МЕНЯ ЛАЙКНУЛ =====

bot.hears("❤️ Кто меня лайкнул", async (ctx) => {
  const res = await pool.query(
    "SELECT from_id FROM likes WHERE to_id = $1",
    [ctx.from.id]
  );

  if (!res.rows.length)
    return ctx.reply("Пока никто не лайкал.");

  ctx.reply(`Тебя лайкнули ${res.rows.length} человек(а).`);
});

// ===== ЗАПУСК =====

bot.launch();
console.log("Bot started");

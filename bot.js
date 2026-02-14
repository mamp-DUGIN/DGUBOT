const { Telegraf, Markup } = require("telegraf");
const { Pool } = require("pg");

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = 2007502528;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const START_PHOTO = "https://i.postimg.cc/zf5hCDHg/424242142141.png";
const HELP_PHOTO = "https://i.postimg.cc/3xkSsBt7/pozdnyakov.png";

let state = {};
let browsing = {};
let lastShown = {};
let adminState = {};

// ===== СОЗДАНИЕ ТАБЛИЦ =====

async function initDB() {
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
}

initDB();

// ===== МЕНЮ =====

function mainMenu() {
  return Markup.keyboard([
    ["🔍 Поиск"],
    ["👤 Мой профиль"],
    ["❤️ Кто меня лайкнул"],
    ["ℹ️ Помощь"]
  ]).resize();
}

// ===== START =====

bot.start((ctx) => {
  ctx.replyWithPhoto(START_PHOTO, {
    caption:
      "Этот бот был создан инцелом для инцелов.\n" +
      "Знакомьтесь, играйте и получайте матчи.",
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
    state[ctx.from.id] = "name";
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

// ===== СОХРАНЕНИЕ АНКЕТЫ =====

bot.on("text", async (ctx) => {
  const id = ctx.from.id;
  const text = ctx.message.text;

  if (!state[id]) return;

  switch (state[id]) {
    case "name":
      state[id] = { name: text };
      return ctx.reply("Возраст?");

    case "age":
      if (isNaN(text) || text < 14)
        return ctx.reply("Регистрация с 14 лет.");

      state[id].age = text;
      return ctx.reply(
        "Выбери тип:",
        Markup.keyboard([
          ["🧔 Инцел"],
          ["👩 Фемцел"]
        ]).resize()
      );

    case "🧔 Инцел":
    case "👩 Фемцел":
      state[id].type = text;
      return ctx.reply(
        "Москва или Село?",
        Markup.keyboard([
          ["🏙 Москва"],
          ["🌾 Село"]
        ]).resize()
      );

    case "🏙 Москва":
    case "🌾 Село":
      state[id].city = text;
      return ctx.reply("О себе:");

    default:
      if (state[id].city && !state[id].about) {
        state[id].about = text;
        return ctx.reply("Пришли фото:");
      }
  }
});

bot.on("photo", async (ctx) => {
  const id = ctx.from.id;

  if (!state[id] || !state[id].about) return;

  const fileId = ctx.message.photo.pop().file_id;

  await pool.query(
    `INSERT INTO users (id, name, age, type, city, about, photo, username)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (id) DO UPDATE
     SET name=$2, age=$3, type=$4, city=$5, about=$6, photo=$7, username=$8`,
    [
      id,
      state[id].name,
      state[id].age,
      state[id].type,
      state[id].city,
      state[id].about,
      fileId,
      ctx.from.username
    ]
  );

  state[id] = null;
  ctx.reply("Анкета сохранена навсегда ✅", mainMenu());
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
  } catch {
    return ctx.reply("Ты уже лайкал этого человека");
  }

  ctx.telegram.sendMessage(
    to,
    "🔥 Кто-то лайкнул тебя!"
  );
});

// ===== ЗАПУСК =====

bot.launch();
console.log("Bot with DB started");

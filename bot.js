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
const ADMIN_ID = Number(process.env.ADMIN_ID);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

let state = {};
let browsing = {};

// ===== INIT DB =====

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

  console.log("Database connected");
}

initDB();

// ===== MENU =====

function mainMenu() {
  return Markup.keyboard([
    ["🔍 Поиск"],
    ["👤 Мой профиль"],
    ["❤️ Кто меня лайкнул"]
  ]).resize();
}

// ===== START =====

bot.start((ctx) => {
  ctx.reply("Добро пожаловать!", mainMenu());
});

// ===== PROFILE =====

bot.hears("👤 Мой профиль", async (ctx) => {
  const res = await pool.query(
    "SELECT * FROM users WHERE id=$1",
    [ctx.from.id]
  );

  if (!res.rows.length) {
    state[ctx.from.id] = { step: "name" };
    return ctx.reply("У тебя нет анкеты. Введи имя:");
  }

  const u = res.rows[0];

  ctx.replyWithPhoto(u.photo, {
    caption: `${u.name}, ${u.age}\n${u.type}\n${u.city}\n\n${u.about}`
  });
});

// ===== CREATE PROFILE =====

bot.on("text", async (ctx) => {
  const id = ctx.from.id;
  const text = ctx.message.text;

  if (!state[id]) return;

  const s = state[id];

  if (s.step === "name") {
    s.name = text;
    s.step = "age";
    return ctx.reply("Возраст?");
  }

  if (s.step === "age") {
    if (isNaN(text) || text < 14)
      return ctx.reply("Минимум 14 лет.");

    s.age = Number(text);
    s.step = "type";
    return ctx.reply("Тип:", Markup.keyboard([
      ["🧔 Инцел"],
      ["👩 Фемцел"]
    ]).resize());
  }

  if (s.step === "type") {
    s.type = text;
    s.step = "city";
    return ctx.reply("Город:");
  }

  if (s.step === "city") {
    s.city = text;
    s.step = "about";
    return ctx.reply("О себе:");
  }

  if (s.step === "about") {
    s.about = text;
    s.step = "photo";
    return ctx.reply("Пришли фото:");
  }
});

// ===== PHOTO =====

bot.on("photo", async (ctx) => {
  const id = ctx.from.id;
  if (!state[id] || state[id].step !== "photo") return;

  const s = state[id];
  const fileId = ctx.message.photo.pop().file_id;

  await pool.query(
    `INSERT INTO users (id,name,age,type,city,about,photo,username)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (id) DO UPDATE SET
     name=$2,age=$3,type=$4,city=$5,about=$6,photo=$7,username=$8`,
    [id, s.name, s.age, s.type, s.city, s.about, fileId, ctx.from.username]
  );

  delete state[id];
  ctx.reply("Анкета сохранена ✅", mainMenu());
});

// ===== SEARCH =====

bot.hears("🔍 Поиск", async (ctx) => {
  const id = ctx.from.id;

  const res = await pool.query(
    "SELECT * FROM users WHERE id != $1 ORDER BY RANDOM() LIMIT 1",
    [id]
  );

  if (!res.rows.length)
    return ctx.reply("Анкет пока нет.");

  const u = res.rows[0];
  browsing[id] = u.id;

  ctx.replyWithPhoto(u.photo, {
    caption: `${u.name}, ${u.age}\n${u.type}\n${u.city}\n\n${u.about}`,
    reply_markup: Markup.keyboard([
      ["❤️ Лайк", "➡️ Дальше"]
    ]).resize().reply_markup
  });
});

// ===== NEXT =====

bot.hears("➡️ Дальше", async (ctx) => {
  ctx.deleteMessage().catch(()=>{});
  ctx.telegram.sendMessage(ctx.chat.id, "🔍 Поиск");
});

// ===== LIKE =====

bot.hears("❤️ Лайк", async (ctx) => {
  const from = ctx.from.id;
  const to = browsing[from];
  if (!to) return;

  try {
    await pool.query(
      "INSERT INTO likes (from_id,to_id) VALUES ($1,$2)",
      [from,to]
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

// ===== WHO LIKED ME =====

bot.hears("❤️ Кто меня лайкнул", async (ctx) => {
  const res = await pool.query(`
    SELECT u.* FROM likes l
    JOIN users u ON u.id = l.from_id
    WHERE l.to_id = $1
  `,[ctx.from.id]);

  if (!res.rows.length)
    return ctx.reply("Пока никто не лайкал.");

  for (const u of res.rows) {
    await ctx.replyWithPhoto(u.photo, {
      caption: `${u.name}, ${u.age}\n${u.type}\n${u.city}\n\n${u.about}`
    });
  }
});

// ===== BROADCAST =====

bot.command("broadcast", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID)
    return ctx.reply("Нет доступа.");

  const text = ctx.message.text.replace("/broadcast","").trim();
  if (!text) return ctx.reply("Напиши текст после команды.");

  const users = await pool.query("SELECT id FROM users");

  let sent = 0;

  for (const user of users.rows) {
    try {
      await ctx.telegram.sendMessage(user.id, text);
      sent++;
    } catch {}
  }

  ctx.reply(`Рассылка завершена. Отправлено: ${sent}`);
});

// ===== START BOT =====

bot.launch();
console.log("Bot started");

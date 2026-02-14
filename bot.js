const { Telegraf, Markup } = require("telegraf");
const { Pool } = require("pg");

// ===== ПРОВЕРЯЕМ ПЕРЕМЕННЫЕ =====
const BOT_TOKEN = process.env.BOT_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_ID = process.env.ADMIN_ID ? Number(process.env.ADMIN_ID) : 0;
const SUPPORT_USERNAME = process.env.SUPPORT_USERNAME || "support";

if (!BOT_TOKEN || !DATABASE_URL) {
  console.error("❌ Нет токена или базы данных");
  process.exit(1);
}

// ===== ПОДКЛЮЧАЕМ БОТА =====
const bot = new Telegraf(BOT_TOKEN);

// ===== ПОДКЛЮЧАЕМ БАЗУ =====
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ===== СОЗДАЕМ ТАБЛИЦЫ =====
pool.query(`
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
`).then(() => console.log("✅ Таблица users готова"));

pool.query(`
  CREATE TABLE IF NOT EXISTS likes (
    from_id BIGINT,
    to_id BIGINT,
    UNIQUE(from_id, to_id)
  );
`).then(() => console.log("✅ Таблица likes готова"));

pool.query(`
  CREATE TABLE IF NOT EXISTS views (
    user_id BIGINT,
    viewed_user_id BIGINT,
    UNIQUE(user_id, viewed_user_id)
  );
`).then(() => console.log("✅ Таблица views готова"));

// ===== ФОТКИ =====
const MENU_PHOTO = "https://i.postimg.cc/zf5hCDHg/424242142141.png";
const SUPPORT_PHOTO = "https://i.postimg.cc/3xkSsBt7/pozdnyakov.png";

// ===== КНОПКИ МЕНЮ =====
function mainMenu() {
  return Markup.keyboard([
    ["🔍 Поиск", "❤️ Лайки"],
    ["👤 Профиль", "📞 Поддержка"]
  ]).resize();
}

// ===== ЧТО БОТ ОТВЕЧАЕТ НА КОМАНДЫ =====

// /start
bot.start(async (ctx) => {
  console.log(`✅ /start от ${ctx.from.id}`);
  try {
    await ctx.replyWithPhoto(MENU_PHOTO, {
      caption: "👋 Привет! Это бот для знакомств",
      ...mainMenu()
    });
  } catch {
    await ctx.reply("👋 Привет! Это бот для знакомств", mainMenu());
  }
});

// /test
bot.command("test", async (ctx) => {
  console.log(`✅ /test от ${ctx.from.id}`);
  try {
    const result = await pool.query("SELECT NOW()");
    await ctx.reply(`✅ Бот работает!\n🕐 Время БД: ${result.rows[0].now}`);
  } catch (err) {
    await ctx.reply(`❌ Ошибка БД: ${err.message}`);
  }
});

// /broadcast
bot.command("broadcast", async (ctx) => {
  console.log(`✅ /broadcast от ${ctx.from.id}`);
  
  // Проверяем админа
  if (ctx.from.id !== ADMIN_ID) {
    return ctx.reply("⛔ Это только для админа");
  }
  
  // Получаем текст
  const text = ctx.message.text.replace("/broadcast", "").trim();
  if (!text) {
    return ctx.reply("📝 Напиши: /broadcast Привет всем!");
  }
  
  try {
    // Получаем всех пользователей
    const users = await pool.query("SELECT id FROM users");
    ctx.reply(`📨 Рассылка ${users.rows.length} пользователям...`);
    
    let sent = 0;
    for (const user of users.rows) {
      try {
        await ctx.telegram.sendMessage(user.id, `📢 РАССЫЛКА:\n\n${text}`);
        sent++;
      } catch (err) {
        console.log(`Не отправилось ${user.id}: ${err.message}`);
      }
    }
    
    ctx.reply(`✅ Отправлено: ${sent} из ${users.rows.length}`);
  } catch (err) {
    ctx.reply(`❌ Ошибка: ${err.message}`);
  }
});

// ===== КНОПКИ МЕНЮ =====

// Поддержка
bot.hears("📞 Поддержка", async (ctx) => {
  console.log(`✅ Поддержка от ${ctx.from.id}`);
  try {
    await ctx.replyWithPhoto(SUPPORT_PHOTO, {
      caption: `🛠 Напиши @${SUPPORT_USERNAME}`,
      ...Markup.keyboard([["🔙 Назад"]]).resize()
    });
  } catch {
    await ctx.reply(`🛠 Напиши @${SUPPORT_USERNAME}`, Markup.keyboard([["🔙 Назад"]]).resize());
  }
});

// Назад
bot.hears("🔙 Назад", async (ctx) => {
  await ctx.reply("Главное меню:", mainMenu());
});

// Профиль
bot.hears("👤 Профиль", async (ctx) => {
  console.log(`✅ Профиль от ${ctx.from.id}`);
  const userId = ctx.from.id;
  
  // Ищем в базе
  const user = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
  
  if (user.rows.length === 0) {
    // Нет профиля - начинаем создание
    await ctx.reply("У тебя нет профиля. Как тебя зовут?");
    state[userId] = { step: "name" };
    return;
  }
  
  // Показываем профиль
  const u = user.rows[0];
  await ctx.replyWithPhoto(u.photo, {
    caption: `${u.name}, ${u.age}\n${u.type}\n${u.city}\n\n${u.about}`,
    ...Markup.keyboard([
      ["🔍 Поиск", "❤️ Лайки"],
      ["🆕 Новый профиль", "📞 Поддержка"]
    ]).resize()
  });
});

// Новый профиль
bot.hears("🆕 Новый профиль", async (ctx) => {
  const userId = ctx.from.id;
  
  // Удаляем старый
  await pool.query("DELETE FROM users WHERE id = $1", [userId]);
  await pool.query("DELETE FROM views WHERE user_id = $1 OR viewed_user_id = $1", [userId]);
  await pool.query("DELETE FROM likes WHERE from_id = $1 OR to_id = $1", [userId]);
  
  await ctx.reply("Создаем новый профиль. Как тебя зовут?");
  state[userId] = { step: "name" };
});

// ===== СОЗДАНИЕ ПРОФИЛЯ =====
let state = {}; // { user123: { step: "name", name: "Вася", ... } }

bot.on("text", async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;
  
  // Пропускаем кнопки меню
  if (["🔍 Поиск", "❤️ Лайки", "👤 Профиль", "📞 Поддержка", "🔙 Назад", "🆕 Новый профиль"].includes(text)) {
    return;
  }
  
  // Если не в режиме создания - игнорим
  if (!state[userId]) return;
  
  const s = state[userId];
  
  try {
    // Шаг 1: Имя
    if (s.step === "name") {
      s.name = text;
      s.step = "age";
      return ctx.reply("Сколько тебе лет? (число)");
    }
    
    // Шаг 2: Возраст
    if (s.step === "age") {
      const age = parseInt(text);
      if (isNaN(age) || age < 14 || age > 99) {
        return ctx.reply("Напиши число от 14 до 99");
      }
      s.age = age;
      s.step = "type";
      return ctx.reply("Ты кто?", Markup.keyboard([
        ["🧔 Инцел"],
        ["👩 Фемцел"]
      ]).resize());
    }
    
    // Шаг 3: Тип
    if (s.step === "type") {
      if (text !== "🧔 Инцел" && text !== "👩 Фемцел") {
        return ctx.reply("Выбери из кнопок:");
      }
      s.type = text;
      s.step = "city";
      return ctx.reply("Откуда ты?", Markup.keyboard([
        ["Москва"],
        ["ЗаМКАДье"]
      ]).resize());
    }
    
    // Шаг 4: Город
    if (s.step === "city") {
      if (text !== "Москва" && text !== "ЗаМКАДье") {
        return ctx.reply("Выбери из кнопок:");
      }
      s.city = text;
      s.step = "about";
      return ctx.reply("Расскажи о себе:", Markup.removeKeyboard());
    }
    
    // Шаг 5: О себе
    if (s.step === "about") {
      if (text.length < 3) {
        return ctx.reply("Напиши хотя бы 3 символа");
      }
      s.about = text;
      s.step = "photo";
      return ctx.reply("Отправь фото:");
    }
    
  } catch (err) {
    console.log(`Ошибка: ${err.message}`);
    ctx.reply("Что-то пошло не так. Начни заново с /start");
    delete state[userId];
  }
});

// ===== ФОТО =====
bot.on("photo", async (ctx) => {
  const userId = ctx.from.id;
  
  if (!state[userId] || state[userId].step !== "photo") return;
  
  const s = state[userId];
  const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
  
  // Сохраняем в базу
  await pool.query(
    `INSERT INTO users (id, name, age, type, city, about, photo, username) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [userId, s.name, s.age, s.type, s.city, s.about, fileId, ctx.from.username]
  );
  
  delete state[userId];
  
  await ctx.reply("✅ Профиль создан!", mainMenu());
});

// ===== ПОИСК =====
bot.hears("🔍 Поиск", async (ctx) => {
  console.log(`✅ Поиск от ${ctx.from.id}`);
  const userId = ctx.from.id;
  
  // Проверяем есть ли профиль
  const me = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
  if (me.rows.length === 0) {
    return ctx.reply("Сначала создай профиль через 👤 Профиль");
  }
  
  // Ищем кого-нибудь
  const candidates = await pool.query(`
    SELECT * FROM users 
    WHERE id != $1 
    AND id NOT IN (SELECT COALESCE(viewed_user_id, 0) FROM views WHERE user_id = $1)
    ORDER BY RANDOM() 
    LIMIT 1
  `, [userId]);
  
  if (candidates.rows.length === 0) {
    return ctx.reply("😢 Больше никого нет", mainMenu());
  }
  
  const candidate = candidates.rows[0];
  
  // Запоминаем кого смотрим
  currentView[userId] = candidate.id;
  
  // Записываем просмотр
  await pool.query(
    "INSERT INTO views (user_id, viewed_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [userId, candidate.id]
  );
  
  // Показываем
  await ctx.replyWithPhoto(candidate.photo, {
    caption: `${candidate.name}, ${candidate.age}\n${candidate.type}\n${candidate.city}\n\n${candidate.about}`,
    ...Markup.keyboard([
      ["❤️ Лайк", "➡️ Дальше"],
      ["🔙 Назад"]
    ]).resize()
  });
});

// ===== ДАЛЬШЕ =====
bot.hears("➡️ Дальше", async (ctx) => {
  const userId = ctx.from.id;
  
  const candidates = await pool.query(`
    SELECT * FROM users 
    WHERE id != $1 
    AND id NOT IN (SELECT COALESCE(viewed_user_id, 0) FROM views WHERE user_id = $1)
    ORDER BY RANDOM() 
    LIMIT 1
  `, [userId]);
  
  if (candidates.rows.length === 0) {
    return ctx.reply("😢 Больше никого нет", mainMenu());
  }
  
  const candidate = candidates.rows[0];
  currentView[userId] = candidate.id;
  
  await pool.query(
    "INSERT INTO views (user_id, viewed_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [userId, candidate.id]
  );
  
  await ctx.replyWithPhoto(candidate.photo, {
    caption: `${candidate.name}, ${candidate.age}\n${candidate.type}\n${candidate.city}\n\n${candidate.about}`,
    ...Markup.keyboard([
      ["❤️ Лайк", "➡️ Дальше"],
      ["🔙 Назад"]
    ]).resize()
  });
});

// ===== ЛАЙК =====
let currentView = {}; // { user123: 456 } - кто кому сейчас показывается

bot.hears("❤️ Лайк", async (ctx) => {
  const fromId = ctx.from.id;
  const toId = currentView[fromId];
  
  if (!toId) {
    return ctx.reply("Сначала кого-нибудь найди через Поиск");
  }
  
  // Сохраняем лайк
  await pool.query(
    "INSERT INTO likes (from_id, to_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [fromId, toId]
  );
  
  await ctx.reply("✅ Лайк отправлен!");
  
  // Пробуем уведомить
  try {
    await ctx.telegram.sendMessage(toId, "🔥 Тебя лайкнули!");
  } catch {}
  
  // Показываем следующего
  const candidates = await pool.query(`
    SELECT * FROM users 
    WHERE id != $1 
    AND id NOT IN (SELECT COALESCE(viewed_user_id, 0) FROM views WHERE user_id = $1)
    ORDER BY RANDOM() 
    LIMIT 1
  `, [fromId]);
  
  if (candidates.rows.length > 0) {
    const candidate = candidates.rows[0];
    currentView[fromId] = candidate.id;
    
    await pool.query(
      "INSERT INTO views (user_id, viewed_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [fromId, candidate.id]
    );
    
    await ctx.replyWithPhoto(candidate.photo, {
      caption: `${candidate.name}, ${candidate.age}\n${candidate.type}\n${candidate.city}\n\n${candidate.about}`,
      ...Markup.keyboard([
        ["❤️ Лайк", "➡️ Дальше"],
        ["🔙 Назад"]
      ]).resize()
    });
  } else {
    ctx.reply("😢 Больше никого нет", mainMenu());
  }
});

// ===== КТО ЛАЙКНУЛ =====
bot.hears("❤️ Лайки", async (ctx) => {
  console.log(`✅ Лайки от ${ctx.from.id}`);
  const userId = ctx.from.id;
  
  const likes = await pool.query(`
    SELECT u.* FROM likes l
    JOIN users u ON u.id = l.from_id
    WHERE l.to_id = $1
  `, [userId]);
  
  if (likes.rows.length === 0) {
    return ctx.reply("😢 Тебя никто не лайкал", mainMenu());
  }
  
  await ctx.reply(`❤️ Тебя лайкнули ${likes.rows.length} человек:`);
  
  for (const user of likes.rows) {
    await ctx.replyWithPhoto(user.photo, {
      caption: `${user.name}, ${user.age}\n${user.type}\n${user.city}`
    });
  }
  
  ctx.reply("👆 Вот они", mainMenu());
});

// ===== ЛОВИМ ВСЕ СООБЩЕНИЯ =====
bot.on("text", (ctx) => {
  // Это чтобы видеть что вообще приходит в бота
  console.log(`📨 Сообщение от ${ctx.from.id}: ${ctx.message.text}`);
});

// ===== ЗАПУСК =====
bot.launch();
console.log("🤖 Бот запущен!");
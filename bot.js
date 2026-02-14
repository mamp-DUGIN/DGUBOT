const { Telegraf, Markup } = require("telegraf");
const { Pool } = require("pg");

// ===== ПРОВЕРКА ПЕРЕМЕННЫХ =====
if (!process.env.BOT_TOKEN) process.exit(1);
if (!process.env.DATABASE_URL) process.exit(1);
if (!process.env.ADMIN_ID) process.exit(1);
if (!process.env.SUPPORT_USERNAME) process.exit(1);

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = Number(process.env.ADMIN_ID);
const SUPPORT_USERNAME = process.env.SUPPORT_USERNAME;

// ===== ПОДКЛЮЧЕНИЕ К БД =====
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS views (
      user_id BIGINT,
      viewed_user_id BIGINT,
      UNIQUE(user_id, viewed_user_id)
    );
  `);

  console.log("✅ База данных готова");
}

initDB();

// ===== ХРАНИЛИЩА =====
let state = {};      // Для создания анкет
let currentView = {}; // Для текущего просматриваемого пользователя

// ===== ФОТО =====
const MENU_PHOTO = 'https://i.postimg.cc/zf5hCDHg/424242142141.png';
const SUPPORT_PHOTO = 'https://i.postimg.cc/3xkSsBt7/pozdnyakov.png';

// ===== МЕНЮ =====
function getMainMenu() {
  return Markup.keyboard([
    ["🔍 Поиск анкет"],
    ["❤️ Кто меня лайкнул"],
    ["👤 Мой профиль"],
    ["📞 Поддержка"]
  ]).resize();
}

// ===== СТАРТ =====
bot.start(async (ctx) => {
  try {
    await ctx.replyWithPhoto(MENU_PHOTO, {
      caption: "👋 Добро пожаловать в инцел-знакомства!",
      ...getMainMenu()
    });
  } catch {
    await ctx.reply("👋 Добро пожаловать!", getMainMenu());
  }
});

// ===== ПОДДЕРЖКА =====
bot.hears("📞 Поддержка", async (ctx) => {
  try {
    await ctx.replyWithPhoto(SUPPORT_PHOTO, {
      caption: `🛠 Связь с создателем: @${SUPPORT_USERNAME}`,
      ...Markup.keyboard([["🔙 Назад в меню"]]).resize()
    });
  } catch {
    await ctx.reply(`🛠 Связь с создателем: @${SUPPORT_USERNAME}`, 
      Markup.keyboard([["🔙 Назад в меню"]]).resize());
  }
});

// ===== НАЗАД =====
bot.hears("🔙 Назад в меню", async (ctx) => {
  await ctx.reply("Главное меню:", getMainMenu());
});

// ===== МОЙ ПРОФИЛЬ =====
bot.hears("👤 Мой профиль", async (ctx) => {
  const userId = ctx.from.id;
  
  // Проверяем есть ли анкета
  const user = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
  
  if (user.rows.length === 0) {
    state[userId] = { step: "name" };
    return ctx.reply("У тебя нет анкеты. Введи имя:");
  }

  const u = user.rows[0];
  
  await ctx.replyWithPhoto(u.photo, {
    caption: `${u.name}, ${u.age}\n${u.type}\n${u.city}\n\n${u.about}`,
    ...Markup.keyboard([
      ["🔄 Новая анкета"],
      ["🔍 Поиск анкет", "❤️ Кто меня лайкнул"],
      ["📞 Поддержка"]
    ]).resize()
  });
});

// ===== НОВАЯ АНКЕТА =====
bot.hears("🔄 Новая анкета", async (ctx) => {
  const userId = ctx.from.id;
  
  // Удаляем старые данные
  await pool.query("DELETE FROM users WHERE id = $1", [userId]);
  await pool.query("DELETE FROM views WHERE user_id = $1 OR viewed_user_id = $1", [userId]);
  await pool.query("DELETE FROM likes WHERE from_id = $1 OR to_id = $1", [userId]);
  
  state[userId] = { step: "name" };
  ctx.reply("Создаем новую анкету. Введи имя:");
});

// ===== СОЗДАНИЕ АНКЕТЫ =====
bot.on("text", async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;
  
  // Пропускаем кнопки меню
  if (["🔍 Поиск анкет", "❤️ Кто меня лайкнул", "👤 Мой профиль", "📞 Поддержка", "🔙 Назад в меню", "🔄 Новая анкета", "Москва", "ЗаМКАДье"].includes(text)) {
    return;
  }
  
  if (!state[userId]) return;
  
  const s = state[userId];
  
  if (s.step === "name") {
    s.name = text;
    s.step = "age";
    return ctx.reply("Сколько тебе лет?");
  }
  
  if (s.step === "age") {
    if (isNaN(text) || text < 14 || text > 99) {
      return ctx.reply("Введи число от 14 до 99");
    }
    s.age = parseInt(text);
    s.step = "type";
    return ctx.reply("Ты кто?", Markup.keyboard([
      ["🧔 Инцел"],
      ["👩 Фемцел"]
    ]).resize());
  }
  
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
  
  if (s.step === "city") {
    if (text !== "Москва" && text !== "ЗаМКАДье") {
      return ctx.reply("Выбери из кнопок:");
    }
    s.city = text;
    s.step = "about";
    return ctx.reply("Расскажи о себе:", Markup.keyboard([]).resize());
  }
  
  if (s.step === "about") {
    if (text.length < 5) {
      return ctx.reply("Напиши побольше (минимум 5 символов)");
    }
    s.about = text;
    s.step = "photo";
    return ctx.reply("Отправь фото:");
  }
});

// ===== ФОТО =====
bot.on("photo", async (ctx) => {
  const userId = ctx.from.id;
  
  if (!state[userId] || state[userId].step !== "photo") return;
  
  const s = state[userId];
  const fileId = ctx.message.photo.pop().file_id;
  
  // Сохраняем в БД
  await pool.query(
    `INSERT INTO users (id, name, age, type, city, about, photo, username)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [userId, s.name, s.age, s.type, s.city, s.about, fileId, ctx.from.username]
  );
  
  delete state[userId];
  
  ctx.reply("✅ Анкета создана!", getMainMenu());
});

// ===== ПОИСК АНКЕТ =====
bot.hears("🔍 Поиск анкет", async (ctx) => {
  const userId = ctx.from.id;
  
  // Проверяем есть ли анкета
  const userExists = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
  if (userExists.rows.length === 0) {
    state[userId] = { step: "name" };
    return ctx.reply("Сначала создай анкету. Введи имя:");
  }
  
  // Ищем непросмотренные анкеты
  const candidates = await pool.query(`
    SELECT * FROM users 
    WHERE id != $1 
    AND id NOT IN (SELECT COALESCE(viewed_user_id, 0) FROM views WHERE user_id = $1)
    ORDER BY RANDOM() 
    LIMIT 1
  `, [userId]);
  
  if (candidates.rows.length === 0) {
    return ctx.reply("😢 Анкет пока нет", getMainMenu());
  }
  
  const candidate = candidates.rows[0];
  currentView[userId] = candidate.id;
  
  // Записываем просмотр
  await pool.query(
    "INSERT INTO views (user_id, viewed_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [userId, candidate.id]
  );
  
  await ctx.replyWithPhoto(candidate.photo, {
    caption: `${candidate.name}, ${candidate.age}\n${candidate.type}\n${candidate.city}\n\n${candidate.about}`,
    ...Markup.keyboard([
      ["❤️ Лайк", "➡️ Дальше"],
      ["🔙 Назад в меню"]
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
    return ctx.reply("😢 Анкет больше нет", getMainMenu());
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
      ["🔙 Назад в меню"]
    ]).resize()
  });
});

// ===== ЛАЙК =====
bot.hears("❤️ Лайк", async (ctx) => {
  const fromId = ctx.from.id;
  const toId = currentView[fromId];
  
  if (!toId) {
    return ctx.reply("Сначала найди кого-то в поиске");
  }
  
  try {
    await pool.query(
      "INSERT INTO likes (from_id, to_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [fromId, toId]
    );
    
    ctx.reply("✅ Лайк отправлен!");
    
    // Пробуем отправить уведомление
    try {
      await ctx.telegram.sendMessage(toId, "🔥 Тебя лайкнули!");
    } catch {}
    
    // Показываем следующую анкету
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
          ["🔙 Назад в меню"]
        ]).resize()
      });
    } else {
      ctx.reply("😢 Анкет больше нет", getMainMenu());
    }
    
  } catch (error) {
    ctx.reply("Ошибка при отправке лайка");
  }
});

// ===== КТО ЛАЙКНУЛ =====
bot.hears("❤️ Кто меня лайкнул", async (ctx) => {
  const userId = ctx.from.id;
  
  const likes = await pool.query(`
    SELECT u.* FROM likes l
    JOIN users u ON u.id = l.from_id
    WHERE l.to_id = $1
  `, [userId]);
  
  if (likes.rows.length === 0) {
    return ctx.reply("😢 Тебя никто не лайкнул", getMainMenu());
  }
  
  await ctx.reply(`❤️ Тебя лайкнули ${likes.rows.length} человек:`);
  
  for (const user of likes.rows) {
    await ctx.replyWithPhoto(user.photo, {
      caption: `${user.name}, ${user.age}\n${user.type}\n${user.city}`
    });
  }
  
  ctx.reply("👆 Вот они", getMainMenu());
});

// ===== РАССЫЛКА =====
bot.command("broadcast", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) {
    return ctx.reply("Нет прав");
  }
  
  const text = ctx.message.text.replace("/broadcast", "").trim();
  if (!text) {
    return ctx.reply("Напиши текст после /broadcast");
  }
  
  const users = await pool.query("SELECT id FROM users");
  let sent = 0;
  
  ctx.reply(`📨 Рассылка ${users.rows.length} пользователям...`);
  
  for (const user of users.rows) {
    try {
      await ctx.telegram.sendMessage(user.id, `📢 ${text}`);
      sent++;
    } catch {}
  }
  
  ctx.reply(`✅ Отправлено: ${sent}`);
});

// ===== СТАТИСТИКА =====
bot.command("stats", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  
  const users = await pool.query("SELECT COUNT(*) FROM users");
  const likes = await pool.query("SELECT COUNT(*) FROM likes");
  
  ctx.reply(`👤 Пользователей: ${users.rows[0].count}\n❤️ Лайков: ${likes.rows[0].count}`);
});

// ===== ТЕСТ =====
bot.command("test", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  
  try {
    await pool.query("SELECT NOW()");
    ctx.reply("✅ Бот работает, БД подключена");
  } catch (error) {
    ctx.reply(`❌ Ошибка: ${error.message}`);
  }
});

// ===== ЗАПУСК =====
bot.launch();
console.log("🤖 Бот запущен");
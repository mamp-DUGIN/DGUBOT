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
async function initDB() {
  try {
    // Таблица пользователей
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
    console.log("✅ Таблица пользователей готова");

    // Таблица лайков
    await pool.query(`
      CREATE TABLE IF NOT EXISTS likes (
        from_id BIGINT,
        to_id BIGINT,
        UNIQUE(from_id, to_id)
      );
    `);
    console.log("✅ Таблица лайков готова");
    
  } catch (err) {
    console.error("❌ Ошибка создания таблиц:", err);
  }
}

initDB();

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

// ===== ХРАНИЛИЩА =====
let state = {};        // Для создания профиля
let currentView = {};  // Кого сейчас смотрит

// ===== КОМАНДЫ =====

// /start
bot.start(async (ctx) => {
  console.log(`✅ /start от ${ctx.from.id}`);
  try {
    await ctx.replyWithPhoto(MENU_PHOTO, {
      caption: "👋 Привет! Это бот для знакомств\n\nНажми /help для списка команд",
      ...mainMenu()
    });
  } catch {
    await ctx.reply("👋 Привет! Это бот для знакомств\n\nНажми /help для списка команд", mainMenu());
  }
});

// /help
bot.help(async (ctx) => {
  const commands = `
📋 КОМАНДЫ:
/start - Главное меню
/profile - Мой профиль
/search - Поиск анкет
/likes - Кто меня лайкнул
/support - Поддержка
/help - Это сообщение

Для админа:
/test - Проверка бота
/broadcast - Рассылка
  `;
  await ctx.reply(commands);
});

// /test
bot.command("test", async (ctx) => {
  console.log(`✅ /test от ${ctx.from.id}`);
  
  // Проверка админа
  if (ctx.from.id !== ADMIN_ID) {
    return ctx.reply("⛔ Нет доступа");
  }
  
  try {
    const result = await pool.query("SELECT NOW()");
    const users = await pool.query("SELECT COUNT(*) FROM users");
    const likes = await pool.query("SELECT COUNT(*) FROM likes");
    
    await ctx.reply(
      `✅ БОТ РАБОТАЕТ!\n\n` +
      `🕐 Время БД: ${result.rows[0].now}\n` +
      `👤 Пользователей: ${users.rows[0].count}\n` +
      `❤️ Лайков: ${likes.rows[0].count}`
    );
  } catch (err) {
    await ctx.reply(`❌ Ошибка БД: ${err.message}`);
  }
});

// /broadcast
bot.command("broadcast", async (ctx) => {
  console.log(`✅ /broadcast от ${ctx.from.id}`);
  
  // Проверка админа
  if (ctx.from.id !== ADMIN_ID) {
    return ctx.reply("⛔ Это только для админа");
  }
  
  // Получаем текст
  const text = ctx.message.text.replace("/broadcast", "").trim();
  if (!text) {
    return ctx.reply("📝 Напиши: /broadcast Привет всем!");
  }
  
  try {
    const users = await pool.query("SELECT id FROM users");
    
    if (users.rows.length === 0) {
      return ctx.reply("📭 Нет пользователей");
    }
    
    await ctx.reply(`📨 Рассылка ${users.rows.length} пользователям...`);
    
    let sent = 0;
    for (const user of users.rows) {
      try {
        await ctx.telegram.sendMessage(user.id, `📢 РАССЫЛКА:\n\n${text}`);
        sent++;
      } catch {
        // Игнорируем ошибки отправки
      }
    }
    
    await ctx.reply(`✅ Отправлено: ${sent} из ${users.rows.length}`);
  } catch (err) {
    await ctx.reply(`❌ Ошибка: ${err.message}`);
  }
});

// /profile
bot.command("profile", async (ctx) => {
  await showProfile(ctx);
});

// /search
bot.command("search", async (ctx) => {
  await searchProfiles(ctx);
});

// /likes
bot.command("likes", async (ctx) => {
  await showLikes(ctx);
});

// /support
bot.command("support", async (ctx) => {
  await showSupport(ctx);
});

// ===== КНОПКИ МЕНЮ =====

// 👤 Профиль
bot.hears("👤 Профиль", async (ctx) => {
  await showProfile(ctx);
});

// 🔍 Поиск
bot.hears("🔍 Поиск", async (ctx) => {
  await searchProfiles(ctx);
});

// ❤️ Лайки
bot.hears("❤️ Лайки", async (ctx) => {
  await showLikes(ctx);
});

// 📞 Поддержка
bot.hears("📞 Поддержка", async (ctx) => {
  await showSupport(ctx);
});

// 🔙 Назад
bot.hears("🔙 Назад", async (ctx) => {
  await ctx.reply("Главное меню:", mainMenu());
});

// 🆕 Новый профиль
bot.hears("🆕 Новый профиль", async (ctx) => {
  const userId = ctx.from.id;
  
  // Удаляем старый профиль
  await pool.query("DELETE FROM users WHERE id = $1", [userId]);
  await pool.query("DELETE FROM likes WHERE from_id = $1 OR to_id = $1", [userId]);
  
  await ctx.reply("Создаем новый профиль. Как тебя зовут?");
  state[userId] = { step: "name" };
});

// ➡️ Дальше
bot.hears("➡️ Дальше", async (ctx) => {
  await searchProfiles(ctx);
});

// ❤️ Лайк
bot.hears("❤️ Лайк", async (ctx) => {
  await sendLike(ctx);
});

// ===== ФУНКЦИИ =====

// Показать профиль
async function showProfile(ctx) {
  const userId = ctx.from.id;
  console.log(`✅ Профиль от ${userId}`);
  
  const user = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
  
  if (user.rows.length === 0) {
    await ctx.reply("У тебя нет профиля. Как тебя зовут?");
    state[userId] = { step: "name" };
    return;
  }
  
  const u = user.rows[0];
  
  try {
    await ctx.replyWithPhoto(u.photo, {
      caption: `👤 ТВОЙ ПРОФИЛЬ:\n\n${u.name}, ${u.age}\n${u.type}\n${u.city}\n\n${u.about}`,
      ...Markup.keyboard([
        ["🔍 Поиск", "❤️ Лайки"],
        ["🆕 Новый профиль", "📞 Поддержка"]
      ]).resize()
    });
  } catch {
    await ctx.reply(
      `${u.name}, ${u.age}\n${u.type}\n${u.city}\n\n${u.about}`,
      Markup.keyboard([
        ["🔍 Поиск", "❤️ Лайки"],
        ["🆕 Новый профиль", "📞 Поддержка"]
      ]).resize()
    );
  }
}

// Показать поддержку
async function showSupport(ctx) {
  console.log(`✅ Поддержка от ${ctx.from.id}`);
  try {
    await ctx.replyWithPhoto(SUPPORT_PHOTO, {
      caption: `🛠 Связь с поддержкой: @${SUPPORT_USERNAME}`,
      ...Markup.keyboard([["🔙 Назад"]]).resize()
    });
  } catch {
    await ctx.reply(
      `🛠 Связь с поддержкой: @${SUPPORT_USERNAME}`,
      Markup.keyboard([["🔙 Назад"]]).resize()
    );
  }
}

// Поиск анкет
async function searchProfiles(ctx) {
  const userId = ctx.from.id;
  console.log(`✅ Поиск от ${userId}`);
  
  // Проверяем есть ли профиль
  const me = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
  if (me.rows.length === 0) {
    await ctx.reply("Сначала создай профиль через 👤 Профиль");
    return;
  }
  
  // Ищем любого другого пользователя (кроме себя)
  const candidates = await pool.query(`
    SELECT * FROM users 
    WHERE id != $1 
    ORDER BY RANDOM() 
    LIMIT 1
  `, [userId]);
  
  if (candidates.rows.length === 0) {
    await ctx.reply("😢 Больше никого нет", mainMenu());
    return;
  }
  
  const candidate = candidates.rows[0];
  currentView[userId] = candidate.id;
  
  try {
    await ctx.replyWithPhoto(candidate.photo, {
      caption: `${candidate.name}, ${candidate.age}\n${candidate.type}\n${candidate.city}\n\n${candidate.about}`,
      ...Markup.keyboard([
        ["❤️ Лайк", "➡️ Дальше"],
        ["🔙 Назад"]
      ]).resize()
    });
  } catch {
    await ctx.reply(
      `${candidate.name}, ${candidate.age}\n${candidate.type}\n${candidate.city}\n\n${candidate.about}`,
      Markup.keyboard([
        ["❤️ Лайк", "➡️ Дальше"],
        ["🔙 Назад"]
      ]).resize()
    );
  }
}

// Отправить лайк
async function sendLike(ctx) {
  const fromId = ctx.from.id;
  const toId = currentView[fromId];
  
  console.log(`✅ Лайк от ${fromId} к ${toId || "никому"}`);
  
  if (!toId) {
    await ctx.reply("Сначала кого-нибудь найди через Поиск");
    return;
  }
  
  try {
    // Сохраняем лайк
    await pool.query(
      "INSERT INTO likes (from_id, to_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [fromId, toId]
    );
    
    await ctx.reply("✅ Лайк отправлен!");
    
    // Пробуем уведомить
    try {
      await ctx.telegram.sendMessage(toId, "🔥 Тебя лайкнули! Зайди в /likes посмотреть кто");
    } catch {
      console.log(`Не удалось уведомить ${toId}`);
    }
    
    // Показываем следующего
    await searchProfiles(ctx);
    
  } catch (err) {
    console.log(`Ошибка лайка: ${err.message}`);
    await ctx.reply("❌ Ошибка при отправке лайка");
  }
}

// Показать кто лайкнул
async function showLikes(ctx) {
  const userId = ctx.from.id;
  console.log(`✅ Лайки от ${userId}`);
  
  const likes = await pool.query(`
    SELECT u.* FROM likes l
    JOIN users u ON u.id = l.from_id
    WHERE l.to_id = $1
  `, [userId]);
  
  if (likes.rows.length === 0) {
    await ctx.reply("😢 Тебя никто не лайкал", mainMenu());
    return;
  }
  
  await ctx.reply(`❤️ Тебя лайкнули ${likes.rows.length} человек:`);
  
  for (const user of likes.rows) {
    try {
      await ctx.replyWithPhoto(user.photo, {
        caption: `${user.name}, ${user.age}\n${user.type}\n${user.city}`
      });
    } catch {
      await ctx.reply(`${user.name}, ${user.age}\n${user.type}\n${user.city}`);
    }
  }
  
  await ctx.reply("👆 Вот они", mainMenu());
}

// ===== СОЗДАНИЕ ПРОФИЛЯ =====
bot.on("text", async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;
  
  // Пропускаем кнопки меню
  if (["🔍 Поиск", "❤️ Лайки", "👤 Профиль", "📞 Поддержка", "🔙 Назад", "🆕 Новый профиль", "➡️ Дальше", "❤️ Лайк"].includes(text)) {
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
  
  try {
    // Сохраняем в базу
    await pool.query(
      `INSERT INTO users (id, name, age, type, city, about, photo, username) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, s.name, s.age, s.type, s.city, s.about, fileId, ctx.from.username]
    );
    
    delete state[userId];
    
    await ctx.reply("✅ Профиль создан!", mainMenu());
  } catch (err) {
    console.log(`Ошибка сохранения: ${err.message}`);
    ctx.reply("❌ Ошибка при сохранении");
  }
});

// ===== ЗАПУСК =====
bot.launch();
console.log("🤖 Бот запущен!");
const { Telegraf, Markup } = require("telegraf");
const { Pool } = require("pg");

// ===== ПРОВЕРКА ПЕРЕМЕННЫХ =====
const BOT_TOKEN = process.env.BOT_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_ID = process.env.ADMIN_ID ? Number(process.env.ADMIN_ID) : 0;
const SUPPORT_USERNAME = process.env.SUPPORT_USERNAME || "support";

if (!BOT_TOKEN || !DATABASE_URL) {
  console.error("❌ Нет токена или базы данных");
  process.exit(1);
}

// ===== ПОДКЛЮЧЕНИЕ =====
const bot = new Telegraf(BOT_TOKEN);
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ===== СОЗДАНИЕ ТАБЛИЦ =====
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
    console.log("✅ Таблица users готова");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS likes (
        id SERIAL PRIMARY KEY,
        from_id BIGINT,
        to_id BIGINT,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(from_id, to_id)
      );
    `);
    console.log("✅ Таблица likes готова");
    
  } catch (err) {
    console.error("❌ Ошибка создания таблиц:", err);
  }
}

initDB();

// ===== ФОТКИ =====
const MENU_PHOTO = "https://i.postimg.cc/zf5hCDHg/424242142141.png";
const SUPPORT_PHOTO = "https://i.postimg.cc/3xkSsBt7/pozdnyakov.png";

// ===== МЕМНЫЕ ШУТКИ =====
const SAD_MESSAGES = [
  "😢 Тебя никто не лайкнул. Поздняков с коробок тоже один стоит, но у него хоть коробки есть",
  "💔 0 лайков. Убермаргинал уже заказал додо пиццу с пенивайзом, а ты даже этого не можешь",
  "😔 Пусто. Джоджо Флойд: 'I CAN'T BREATHE' - это не про лайки, а про тебя",
  "📭 Лайков нет. Гофман накрутил бы тебе за бутылку, но ты не накрутил",
  "🦗 Ни одного. Поздняков с коробок хотя бы коробки собирает, а ты собираешь 0",
  "💀 Тебя не лайкнули. Додо пицца доставляется быстрее, чем тебе лайки"
];

const NO_PROFILES = [
  "😢 Кроме тебя никого. Поздняков с коробок ушел за новой партией",
  "🌚 Пусто. Убермаргинал пошел есть додо пиццу с пенивайзом",
  "📦 Анкет нет. Джоджо Флойд задохнулся от смеха над тобой",
  "💀 Ты один. Гофман сказал: 'На, выпей' и ушел"
];

const LIKE_NOTIFICATIONS = [
  "🔥 Тебя лайкнули! Поздняков с коробок одобряет (он сейчас в коробке)",
  "❤️ Лайк! Убермаргинал уже заказал додо пиццу в честь этого",
  "🎯 Новый лайк! Джоджо Флойд: 'I CAN FINALLY BREATHE'",
  "💕 Кто-то лайкнул! Гофман наливает"
];

const PROFILE_CREATION = {
  name: [
    "Как тебя зовут? (Поздняков представляется через коробку)",
    "Имя? (Убермаргинал уже заказал додо пиццу с твоим именем)",
    "Представься. Джоджо Флойд хочет знать, кем он не может дышать",
    "Как тебя величать? Гофман уже наливает"
  ],
  age: [
    "Сколько лет? (Позднякову столько же, сколько коробок в его коллекции)",
    "Возраст? (Убермаргинал в твоем возрасте уже ел додо пиццу с пенивайзом)",
    "Сколько стукнуло? Джоджо Флойду наступили на шею в 39",
    "Лет тебе? Гофман в твоем возрасте уже бухал"
  ]
};

// ===== КНОПКИ МЕНЮ =====
function mainMenu() {
  return Markup.keyboard([
    ["🔍 Искать жертв", "❤️ Кто лайкнул"],
    ["👤 Мой профиль", "📞 Дядя Гофман"]
  ]).resize();
}

// ===== ХРАНИЛИЩА =====
let state = {};
let currentView = {};

// ===== КОМАНДЫ =====

// /start
bot.start(async (ctx) => {
  console.log(`✅ /start от ${ctx.from.id}`);
  const greeting = `
👋 Здарова, уебище!

🤖 Это дно для таких же днышей как ты
📦 Поздняков с коробок уже в очереди
🍕 Убермаргинал жрет додо пиццу с пенивайзом
🫁 Джоджо Флойд: "I CAN'T BREATHE" (это ты без лайков)
🥃 Гофман: "На, выпей, полегчает"

Погнали на дно:
  `;
  try {
    await ctx.replyWithPhoto(MENU_PHOTO, {
      caption: greeting,
      ...mainMenu()
    });
  } catch {
    await ctx.reply(greeting, mainMenu());
  }
});

// /help
bot.help(async (ctx) => {
  const help = `
📋 КОМАНДЫ НА ДНЕ:

👤 Мой профиль - создай/посмотри свое убожество
🔍 Искать жертв - ищи таких же убогих
❤️ Кто лайкнул - посмотри кто хочет такое же убожество
📞 Дядя Гофман - налей и поговори

Для админа-алкаша:
/test - проверь не сдохло ли
/stats - сколько вас тут
/broadcast - всем налей

P.S. Поздняков в коробке, Убермаргинал в додо, 
Джоджо Флойд не дышит, Гофман наливает
  `;
  await ctx.reply(help);
});

// /test
bot.command("test", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply("⛔ Иди отсюда, Поздняков не звал");
  
  try {
    const db = await pool.query("SELECT NOW()");
    const users = await pool.query("SELECT COUNT(*) FROM users");
    const likes = await pool.query("SELECT COUNT(*) FROM likes");
    
    await ctx.reply(
      `✅ БОТ НА ДНЕ\n\n` +
      `🕐 Время: ${db.rows[0].now}\n` +
      `👤 Убогих: ${users.rows[0].count}\n` +
      `❤️ Лайков (бесполезных): ${likes.rows[0].count}\n\n` +
      `Поздняков собирает коробки, пока ты тут`
    );
  } catch (err) {
    await ctx.reply(`❌ Ошибка: ${err.message}\nГофман говорит: "Ну ты и лох"`);
  }
});

// /stats
bot.command("stats", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply("⛔ Иди, Убермаргинал, додо пиццу жри");
  
  const users = await pool.query("SELECT COUNT(*) FROM users");
  const likes = await pool.query("SELECT COUNT(*) FROM likes");
  
  await ctx.reply(
    `📊 СТАТИСТИКА ДНА:\n\n` +
    `👤 Днышей: ${users.rows[0].count}\n` +
    `❤️ Лайков (не взаимных): ${likes.rows[0].count}\n\n` +
    `Джоджо Флойд: "I CAN'T BREATHE" от такого количества`
  );
});

// /broadcast
bot.command("broadcast", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply("⛔ Гофман не налил тебе");
  
  const text = ctx.message.text.replace("/broadcast", "").trim();
  if (!text) return ctx.reply("📝 Напиши: /broadcast Всем налить?");
  
  const users = await pool.query("SELECT id FROM users");
  await ctx.reply(`📨 Наливаю ${users.rows.length} алкашам...`);
  
  let sent = 0;
  for (const user of users.rows) {
    try {
      await ctx.telegram.sendMessage(user.id, `📢 ГОФМАН НАЛИВАЕТ:\n\n${text}\n\nПейте до дна!`);
      sent++;
    } catch {}
  }
  
  ctx.reply(`✅ Налили: ${sent} из ${users.rows.length}\nПоздняков собирает пустые бутылки`);
});

// ===== КНОПКИ =====

// 👤 Мой профиль
bot.hears("👤 Мой профиль", async (ctx) => {
  const userId = ctx.from.id;
  console.log(`✅ Профиль от ${userId}`);
  
  const user = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
  
  if (user.rows.length === 0) {
    const randomName = PROFILE_CREATION.name[Math.floor(Math.random() * PROFILE_CREATION.name.length)];
    await ctx.reply(randomName);
    state[userId] = { step: "name" };
    return;
  }
  
  const u = user.rows[0];
  
  try {
    await ctx.replyWithPhoto(u.photo, {
      caption: `👤 ТВОЕ УБОЖЕСТВО:\n\n${u.name}, ${u.age} лет\n${u.type}\n📍 ${u.city}\n\n📝 ${u.about}\n\nПоздняков с коробок одобряет (он в коробке)`,
      ...Markup.keyboard([
        ["🔍 Искать жертв", "❤️ Кто лайкнул"],
        ["🆕 Новое убожество", "📞 Дядя Гофман"]
      ]).resize()
    });
  } catch {
    await ctx.reply(
      `${u.name}, ${u.age}\n${u.type}\n${u.city}\n\n${u.about}`,
      Markup.keyboard([
        ["🔍 Искать жертв", "❤️ Кто лайкнул"],
        ["🆕 Новое убожество", "📞 Дядя Гофман"]
      ]).resize()
    );
  }
});

// 🆕 Новое убожество
bot.hears("🆕 Новое убожество", async (ctx) => {
  const userId = ctx.from.id;
  
  await pool.query("DELETE FROM users WHERE id = $1", [userId]);
  await pool.query("DELETE FROM likes WHERE from_id = $1 OR to_id = $1", [userId]);
  
  await ctx.reply("🔄 Создаем новое убожество. Поздняков вылез из коробки ради такого\n\nКак тебя зовут?");
  state[userId] = { step: "name" };
});

// 📞 Дядя Гофман
bot.hears("📞 Дядя Гофман", async (ctx) => {
  try {
    await ctx.replyWithPhoto(SUPPORT_PHOTO, {
      caption: `🛠 ДЯДЯ ГОФМАН НАЛИВАЕТ:\n\nНапиши @${SUPPORT_USERNAME}\n\nОн нальет\nПоздняков вылезет из коробки\nУбермаргинал закажет додо\nДжоджо Флойд задышит\n\nНо не факт`,
      ...Markup.keyboard([["🔙 Назад на дно"]]).resize()
    });
  } catch {
    await ctx.reply(
      `🛠 Дядя Гофман: @${SUPPORT_USERNAME}`,
      Markup.keyboard([["🔙 Назад на дно"]]).resize()
    );
  }
});

// 🔙 Назад
bot.hears("🔙 Назад на дно", async (ctx) => {
  await ctx.reply("Ты снова на дне. Поздняков машет из коробки:", mainMenu());
});

// 🔍 Искать жертв
bot.hears("🔍 Искать жертв", async (ctx) => {
  await searchProfiles(ctx);
});

// ❤️ Кто лайкнул
bot.hears("❤️ Кто лайкнул", async (ctx) => {
  await showLikes(ctx);
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

// Поиск анкет
async function searchProfiles(ctx) {
  const userId = ctx.from.id;
  console.log(`✅ Поиск от ${userId}`);
  
  const me = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
  if (me.rows.length === 0) {
    await ctx.reply("Сначала создай убожество. Поздняков без убожества в коробке сидит");
    return;
  }
  
  const candidates = await pool.query(`
    SELECT * FROM users 
    WHERE id != $1 
    ORDER BY RANDOM() 
    LIMIT 1
  `, [userId]);
  
  if (candidates.rows.length === 0) {
    const randomSad = NO_PROFILES[Math.floor(Math.random() * NO_PROFILES.length)];
    await ctx.reply(randomSad, mainMenu());
    return;
  }
  
  const candidate = candidates.rows[0];
  currentView[userId] = candidate.id;
  
  try {
    await ctx.replyWithPhoto(candidate.photo, {
      caption: `🔍 НАШЛАСЬ ЖЕРТВА:\n\n${candidate.name}, ${candidate.age}\n${candidate.type}\n📍 ${candidate.city}\n\n📝 ${candidate.about}\n\nПоздняков уже лезет в коробку к этой жертве`,
      ...Markup.keyboard([
        ["❤️ Лайк", "➡️ Дальше"],
        ["🔙 Назад на дно"]
      ]).resize()
    });
  } catch {
    await ctx.reply(
      `${candidate.name}, ${candidate.age}\n${candidate.type}\n${candidate.city}\n\n${candidate.about}`,
      Markup.keyboard([
        ["❤️ Лайк", "➡️ Дальше"],
        ["🔙 Назад на дно"]
      ]).resize()
    );
  }
}

// Лайк
async function sendLike(ctx) {
  const fromId = ctx.from.id;
  const toId = currentView[fromId];
  
  if (!toId) {
    return ctx.reply("Сначала найди жертву. Поздняков в коробке ищет, но пока только коробки");
  }
  
  try {
    const existing = await pool.query(
      "SELECT * FROM likes WHERE from_id = $1 AND to_id = $2",
      [fromId, toId]
    );
    
    if (existing.rows.length > 0) {
      return ctx.reply("❌ Ты уже лайкал! Убермаргинал уже съел додо пиццу с пенивайзом, пока ты спамишь");
    }
    
    await pool.query(
      "INSERT INTO likes (from_id, to_id) VALUES ($1, $2)",
      [fromId, toId]
    );
    
    const likeMessages = [
      "✅ Лайк улетел! Поздняков вылез из коробки и зааплодировал",
      "❤️ Лайк! Убермаргинал заказал додо пиццу с пенивайзом в честь этого",
      "🎯 Есть! Джоджо Флойд: 'I CAN'T BREATHE' - но это от счастья",
      "💕 Лайк! Гофман наливает всем по 100 грамм"
    ];
    await ctx.reply(likeMessages[Math.floor(Math.random() * likeMessages.length)]);
    
    try {
      const notification = LIKE_NOTIFICATIONS[Math.floor(Math.random() * LIKE_NOTIFICATIONS.length)];
      await ctx.telegram.sendMessage(toId, `${notification}\n\nЗайди посмотри, пока Поздняков не залез в коробку!`);
    } catch {}
    
    await searchProfiles(ctx);
    
  } catch (err) {
    console.log(`Ошибка: ${err.message}`);
    ctx.reply("❌ Ошибка. Поздняков залез в коробку и плачет");
  }
}

// Кто лайкнул
async function showLikes(ctx) {
  const userId = ctx.from.id;
  console.log(`✅ Лайки от ${userId}`);
  
  const likes = await pool.query(`
    SELECT u.*, l.created_at FROM likes l
    JOIN users u ON u.id = l.from_id
    WHERE l.to_id = $1
    ORDER BY l.created_at DESC
  `, [userId]);
  
  if (likes.rows.length === 0) {
    const randomSad = SAD_MESSAGES[Math.floor(Math.random() * SAD_MESSAGES.length)];
    await ctx.reply(randomSad, mainMenu());
    return;
  }
  
  await ctx.reply(`❤️ ТЕБЯ ЛАЙКНУЛИ ${likes.rows.length} РАЗ:\n\nПоздняков вылез из коробки от удивления!`);
  
  for (const user of likes.rows) {
    const date = new Date(user.created_at).toLocaleDateString();
    try {
      await ctx.replyWithPhoto(user.photo, {
        caption: `${user.name}, ${user.age}\n${user.type}\n📍 ${user.city}\n\nЛайкнул: ${date}`
      });
    } catch {
      await ctx.reply(`${user.name}, ${user.age}\n${user.type}\n📍 ${user.city}\nЛайкнул: ${date}`);
    }
  }
  
  await ctx.reply("👆 Вот эти уроды. Джоджо Флойд: 'I CAN FINALLY BREATHE'", mainMenu());
}

// ===== СОЗДАНИЕ АНКЕТЫ =====
bot.on("text", async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;
  
  if (["🔍 Искать жертв", "❤️ Кто лайкнул", "👤 Мой профиль", "📞 Дядя Гофман", "🔙 Назад на дно", "🆕 Новое убожество", "➡️ Дальше", "❤️ Лайк", "Москва", "ЗаМКАДье"].includes(text)) {
    return;
  }
  
  if (!state[userId]) return;
  
  const s = state[userId];
  
  try {
    if (s.step === "name") {
      if (text.length < 2 || text.length > 30) {
        return ctx.reply("Имя должно быть от 2 до 30 символов. Поздняков в коробке столько не высидит");
      }
      s.name = text;
      s.step = "age";
      const randomAge = PROFILE_CREATION.age[Math.floor(Math.random() * PROFILE_CREATION.age.length)];
      return ctx.reply(randomAge);
    }
    
    if (s.step === "age") {
      const age = parseInt(text);
      if (isNaN(age) || age < 14 || age > 99) {
        return ctx.reply("Напиши число от 14 до 99. Поздняков в коробке и то старше тебя");
      }
      s.age = age;
      s.step = "type";
      return ctx.reply("Ты кто по жизни?", Markup.keyboard([
        ["🧔 Инцел (дно)"],
        ["👩 Фемцел (тоже дно)"]
      ]).resize());
    }
    
    if (s.step === "type") {
      if (!text.includes("Инцел") && !text.includes("Фемцел")) {
        return ctx.reply("Выбери из кнопок. Убермаргинал выбирает додо пиццу, а ты выбирай тип");
      }
      s.type = text;
      s.step = "city";
      return ctx.reply("Откуда ты?", Markup.keyboard([
        ["Москва (дно)"],
        ["ЗаМКАДье (глубокое дно)"]
      ]).resize());
    }
    
    if (s.step === "city") {
      if (!text.includes("Москва") && !text.includes("ЗаМКАДье")) {
        return ctx.reply("Выбери из кнопок. Гофман из Караганды, но ему похуй");
      }
      s.city = text;
      s.step = "about";
      return ctx.reply("Расскажи о себе. Поздняков рассказывает коробкам, Убермаргинал рассказывает додо пицце, Джоджо Флойд рассказал полу, Гофман рассказывает бутылке\n\nА ты че расскажешь?", Markup.removeKeyboard());
    }
    
    if (s.step === "about") {
      if (text.length < 5) {
        return ctx.reply("Напиши хотя бы 5 символов. Поздняков и то больше коробок собрал");
      }
      s.about = text;
      s.step = "photo";
      return ctx.reply("Отправь фото. Можно с коробкой как Поздняков, можно с додо пиццей как Убермаргинал, можно лежа как Джоджо Флойд, можно с бутылкой как Гофман");
    }
    
  } catch (err) {
    console.log(`Ошибка: ${err.message}`);
    ctx.reply("Что-то сломалось. Поздняков упал с коробки. Начни заново с /start");
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
    await pool.query(
      `INSERT INTO users (id, name, age, type, city, about, photo, username) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, s.name, s.age, s.type, s.city, s.about, fileId, ctx.from.username]
    );
    
    delete state[userId];
    
    await ctx.reply(
      "✅ УБОЖЕСТВО СОЗДАНО!\n\n" +
      "Поздняков: 'ПОЛЕЗАЙ В КОРОБКУ'\n" +
      "Убермаргинал: 'ДОДО ПИЦЦА С ПЕНИВАЙЗОМ'\n" +
      "Джоджо Флойд: *лежит*\n" +
      "Гофман: 'НА, ВЫПЕЙ'\n\n" +
      "Теперь ищи таких же уродов!",
      mainMenu()
    );
  } catch (err) {
    console.log(`Ошибка: ${err.message}`);
    ctx.reply("❌ Ошибка. Поздняков залез в коробку и не вылезет");
  }
});

// ===== ЗАПУСК =====
bot.launch();
console.log("🤖 Бот на дне запущен!");
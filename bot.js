const { Telegraf, Markup } = require("telegraf");
const { Pool } = require("pg");

// ===== ПРОВЕРКА ПЕРЕМЕННЫХ =====
const BOT_TOKEN = process.env.BOT_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_ID = process.env.ADMIN_ID ? Number(process.env.ADMIN_ID) : 0;
const SUPPORT_USERNAME = process.env.SUPPORT_USERNAME || "support";
const CHANNEL_ID = "@DGUBOTOFF";
const CHANNEL_LINK = "https://t.me/DGUBOTOFF";

if (!BOT_TOKEN || !DATABASE_URL) {
  console.error("❌ Нет токена или базы");
  process.exit(1);
}

// ===== ПОДКЛЮЧЕНИЕ =====
const bot = new Telegraf(BOT_TOKEN);
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ===== ИНИЦИАЛИЗАЦИЯ БД =====
async function initDB() {
  try {
    // Таблица пользователей
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT PRIMARY KEY,
        name TEXT,
        age INT,
        city TEXT,
        about TEXT,
        photo TEXT,
        username TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("✅ Таблица users готова");

    // Таблица лайков - добавили created_at
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

    // Проверяем, есть ли колонка created_at в существующей таблице
    try {
      await pool.query(`SELECT created_at FROM likes LIMIT 1`);
      console.log("✅ Колонка created_at существует");
    } catch {
      // Если нет - добавляем
      await pool.query(`ALTER TABLE likes ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`);
      console.log("✅ Добавлена колонка created_at");
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        user_id BIGINT PRIMARY KEY,
        checked_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("✅ Таблица subscriptions готова");

  } catch (err) {
    console.error("❌ Ошибка БД:", err);
  }
}

initDB();

// ===== ФОТКИ =====
const MENU_PHOTO = "https://i.postimg.cc/zf5hCDHg/424242142141.png";
const SUPPORT_PHOTO = "https://i.postimg.cc/3xkSsBt7/pozdnyakov.png";

// ===== ФРАЗЫ =====
const SAD_MESSAGES = [
  "😢 Тебя никто не лайкнул",
  "💔 0 лайков",
  "😔 Пока пусто",
  "📭 Нет лайков",
  "🦗 Ни одного лайка",
  "💀 Полный ноль",
  "📪 Пустота",
  "😴 Тишина"
];

const NO_PROFILES = [
  "😢 Пока никого нет",
  "🌚 Пусто",
  "📦 Анкет нет",
  "💀 Ты один",
  "🏝️ Один в поле воин"
];

// ===== ХРАНИЛИЩА =====
let state = {};
let currentView = {};
let lastLikeTime = {};

// ===== ПРОВЕРКА ПОДПИСКИ =====
async function checkSubscription(userId) {
  try {
    const chatMember = await bot.telegram.getChatMember(CHANNEL_ID, userId);
    return ['member', 'administrator', 'creator'].includes(chatMember.status);
  } catch {
    return false;
  }
}

// ===== МИДЛВАР НА ПОДПИСКУ =====
bot.use(async (ctx, next) => {
  if (!ctx.from) return next();
  
  const publicCommands = ['/start', '/help', '/check'];
  if (publicCommands.includes(ctx.message?.text)) {
    return next();
  }
  
  const isSubscribed = await checkSubscription(ctx.from.id);
  
  if (!isSubscribed) {
    return ctx.reply(
      `🔒 Для использования бота нужно подписаться на канал:\n${CHANNEL_LINK}`,
      Markup.inlineKeyboard([
        [Markup.button.url('📢 Перейти в канал', CHANNEL_LINK)],
        [Markup.button.callback('✅ Я подписался', 'check_sub')]
      ])
    );
  }
  
  return next();
});

// ===== ПРОВЕРКА ПОДПИСКИ =====
bot.action('check_sub', async (ctx) => {
  const isSubscribed = await checkSubscription(ctx.from.id);
  
  if (isSubscribed) {
    await ctx.answerCbQuery('✅ Подписка подтверждена!');
    await ctx.replyWithPhoto(MENU_PHOTO, {
      caption: "✅ Спасибо! Главное меню:",
      ...mainMenu()
    });
  } else {
    await ctx.answerCbQuery('❌ Ты не подписался!', { show_alert: true });
  }
});

// ===== МЕНЮ =====
function mainMenu() {
  return Markup.keyboard([
    ["🔍 Поиск", "❤️ Мои лайки"],
    ["👤 Профиль", "📞 Помощь"]
  ]).resize();
}

// ===== СТАРТ =====
bot.start(async (ctx) => {
  const isSubscribed = await checkSubscription(ctx.from.id);
  
  if (!isSubscribed) {
    return ctx.replyWithPhoto(MENU_PHOTO, {
      caption: `👋 Привет!\n\n🔒 Для использования нужно подписаться на канал:\n${CHANNEL_LINK}`,
      ...Markup.inlineKeyboard([
        [Markup.button.url('📢 Перейти в канал', CHANNEL_LINK)],
        [Markup.button.callback('✅ Я подписался', 'check_sub')]
      ])
    });
  }
  
  await ctx.replyWithPhoto(MENU_PHOTO, {
    caption: "👋 Главное меню:",
    ...mainMenu()
  });
});

// ===== ПОМОЩЬ =====
bot.help(async (ctx) => {
  const helpText = `
📋 КОМАНДЫ:

👤 Профиль - создать/посмотреть анкету
🔍 Поиск - искать анкеты
❤️ Мои лайки - кто тебя лайкнул
📞 Помощь - это меню

Для связи: @${SUPPORT_USERNAME}
  `;
  
  await ctx.replyWithPhoto(SUPPORT_PHOTO, {
    caption: helpText,
    ...mainMenu()
  });
});

bot.hears("📞 Помощь", async (ctx) => {
  await ctx.replyWithPhoto(SUPPORT_PHOTO, {
    caption: `🛠 Связь: @${SUPPORT_USERNAME}`,
    ...Markup.keyboard([["🔙 Назад"]]).resize()
  });
});

// ===== ПРОФИЛЬ =====
bot.hears("👤 Профиль", async (ctx) => {
  const userId = ctx.from.id;
  const user = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
  
  if (user.rows.length === 0) {
    state[userId] = { step: "name" };
    return ctx.reply("У тебя нет анкеты. Как тебя зовут?");
  }
  
  const u = user.rows[0];
  
  try {
    await ctx.replyWithPhoto(u.photo, {
      caption: `👤 Твоя анкета:\n\n${u.name}, ${u.age}\n📍 ${u.city}\n\n${u.about}`,
      ...Markup.keyboard([
        ["🔍 Поиск", "❤️ Мои лайки"],
        ["🆕 Новая анкета", "📞 Помощь"]
      ]).resize()
    });
  } catch {
    await ctx.reply(
      `${u.name}, ${u.age}\n📍 ${u.city}\n\n${u.about}`,
      Markup.keyboard([
        ["🔍 Поиск", "❤️ Мои лайки"],
        ["🆕 Новая анкета", "📞 Помощь"]
      ]).resize()
    );
  }
});

// ===== НОВАЯ АНКЕТА =====
bot.hears("🆕 Новая анкета", async (ctx) => {
  const userId = ctx.from.id;
  await pool.query("DELETE FROM users WHERE id = $1", [userId]);
  await pool.query("DELETE FROM likes WHERE from_id = $1 OR to_id = $1", [userId]);
  
  ctx.reply("Создаем новую анкету. Как тебя зовут?");
  state[userId] = { step: "name" };
});

// ===== ПОИСК =====
bot.hears("🔍 Поиск", async (ctx) => {
  await searchProfiles(ctx);
});

// ===== МОИ ЛАЙКИ =====
bot.hears("❤️ Мои лайки", async (ctx) => {
  await showLikes(ctx);
});

// ===== ДАЛЬШЕ =====
bot.hears("➡️ Дальше", async (ctx) => {
  await searchProfiles(ctx);
});

// ===== ЛАЙК =====
bot.hears("❤️ Лайк", async (ctx) => {
  await sendLike(ctx);
});

// ===== НАЗАД =====
bot.hears("🔙 Назад", async (ctx) => {
  await ctx.replyWithPhoto(MENU_PHOTO, {
    caption: "Главное меню:",
    ...mainMenu()
  });
});

// ===== ПОИСК АНКЕТ =====
async function searchProfiles(ctx) {
  const userId = ctx.from.id;
  
  const me = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
  if (me.rows.length === 0) {
    state[userId] = { step: "name" };
    return ctx.reply("Сначала создай анкету. Как тебя зовут?");
  }
  
  const candidates = await pool.query(`
    SELECT * FROM users 
    WHERE id != $1 
    ORDER BY RANDOM() 
    LIMIT 1
  `, [userId]);
  
  if (candidates.rows.length === 0) {
    const randomMsg = NO_PROFILES[Math.floor(Math.random() * NO_PROFILES.length)];
    return ctx.reply(randomMsg, mainMenu());
  }
  
  const candidate = candidates.rows[0];
  currentView[userId] = candidate.id;
  
  await ctx.replyWithPhoto(candidate.photo, {
    caption: `${candidate.name}, ${candidate.age}\n📍 ${candidate.city}\n\n${candidate.about}`,
    ...Markup.keyboard([
      ["❤️ Лайк", "➡️ Дальше"],
      ["🔙 Назад"]
    ]).resize()
  });
}

// ===== ЛАЙК =====
async function sendLike(ctx) {
  const fromId = ctx.from.id;
  const toId = currentView[fromId];
  
  if (!toId) {
    return ctx.reply("Сначала найди кого-нибудь в поиске");
  }
  
  const likeKey = `${fromId}_${toId}`;
  const lastTime = lastLikeTime[likeKey];
  const now = Date.now();
  
  if (lastTime && (now - lastTime) < 300000) {
    const minutesLeft = Math.ceil((300000 - (now - lastTime)) / 60000);
    return ctx.reply(`⏳ Ты уже лайкал. Подожди ${minutesLeft} мин.`);
  }
  
  try {
    const existing = await pool.query(
      "SELECT created_at FROM likes WHERE from_id = $1 AND to_id = $2",
      [fromId, toId]
    );
    
    if (existing.rows.length > 0) {
      const likeTime = new Date(existing.rows[0].created_at).getTime();
      if ((now - likeTime) < 300000) {
        lastLikeTime[likeKey] = likeTime;
        const minutesLeft = Math.ceil((300000 - (now - likeTime)) / 60000);
        return ctx.reply(`⏳ Ты уже лайкал. Подожди ${minutesLeft} мин.`);
      }
    }
    
    await pool.query(
      "INSERT INTO likes (from_id, to_id, created_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING",
      [fromId, toId]
    );
    
    lastLikeTime[likeKey] = now;
    
    ctx.reply("✅ Лайк отправлен!");
    
    try {
      const likeCount = await pool.query(
        "SELECT COUNT(*) FROM likes WHERE to_id = $1",
        [toId]
      );
      
      await ctx.telegram.sendMessage(
        toId,
        `❤️ Тебя лайкнули!\n\nВсего лайков: ${likeCount.rows[0].count}`
      );
    } catch {}
    
    await searchProfiles(ctx);
    
  } catch (err) {
    console.log("Ошибка лайка:", err);
    ctx.reply("❌ Ошибка при отправке лайка");
  }
}

// ===== КТО ЛАЙКНУЛ =====
async function showLikes(ctx, page = 0) {
  const userId = ctx.from.id;
  
  try {
    const likes = await pool.query(`
      SELECT u.*, l.created_at FROM likes l
      JOIN users u ON u.id = l.from_id
      WHERE l.to_id = $1
      ORDER BY l.id DESC
    `, [userId]);
    
    if (likes.rows.length === 0) {
      const randomMsg = SAD_MESSAGES[Math.floor(Math.random() * SAD_MESSAGES.length)];
      return ctx.reply(randomMsg, mainMenu());
    }
    
    if (page < 0) page = 0;
    if (page >= likes.rows.length) page = likes.rows.length - 1;
    
    const user = likes.rows[page];
    const date = user.created_at ? new Date(user.created_at).toLocaleDateString() : "недавно";
    
    const buttons = [];
    const navButtons = [];
    
    if (page > 0) {
      navButtons.push(Markup.button.callback('⬅️', `likes_${page - 1}`));
    }
    navButtons.push(Markup.button.callback(`${page + 1}/${likes.rows.length}`, 'noop'));
    if (page < likes.rows.length - 1) {
      navButtons.push(Markup.button.callback('➡️', `likes_${page + 1}`));
    }
    
    buttons.push(navButtons);
    buttons.push([Markup.button.callback('❤️ Лайк в ответ', `like_${user.id}`)]);
    buttons.push([Markup.button.callback('🔙 В меню', 'back_menu')]);
    
    await ctx.replyWithPhoto(user.photo, {
      caption: `${user.name}, ${user.age}\n📍 ${user.city}\n\nЛайкнул: ${date}`,
      ...Markup.inlineKeyboard(buttons)
    });
  } catch (err) {
    console.error("Ошибка showLikes:", err);
    ctx.reply("❌ Ошибка при загрузке лайков");
  }
}

// ===== INLINE КНОПКИ =====
bot.action(/likes_(\d+)/, async (ctx) => {
  const page = parseInt(ctx.match[1]);
  await ctx.deleteMessage();
  await showLikes(ctx, page);
});

bot.action('noop', async (ctx) => {
  await ctx.answerCbQuery();
});

bot.action(/like_(\d+)/, async (ctx) => {
  const fromId = ctx.from.id;
  const toId = parseInt(ctx.match[1]);
  
  const likeKey = `${fromId}_${toId}`;
  const lastTime = lastLikeTime[likeKey];
  const now = Date.now();
  
  if (lastTime && (now - lastTime) < 300000) {
    const minutesLeft = Math.ceil((300000 - (now - lastTime)) / 60000);
    await ctx.answerCbQuery(`⏳ Подожди ${minutesLeft} мин.`, { show_alert: true });
    return;
  }
  
  const existing = await pool.query(
    "SELECT created_at FROM likes WHERE from_id = $1 AND to_id = $2",
    [fromId, toId]
  );
  
  if (existing.rows.length > 0) {
    const likeTime = new Date(existing.rows[0].created_at).getTime();
    if ((now - likeTime) < 300000) {
      lastLikeTime[likeKey] = likeTime;
      const minutesLeft = Math.ceil((300000 - (now - likeTime)) / 60000);
      await ctx.answerCbQuery(`⏳ Уже лайкал. Подожди ${minutesLeft} мин.`, { show_alert: true });
      return;
    }
  }
  
  await pool.query(
    "INSERT INTO likes (from_id, to_id, created_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING",
    [fromId, toId]
  );
  
  lastLikeTime[likeKey] = now;
  
  await ctx.answerCbQuery('✅ Лайк отправлен!');
  
  try {
    await ctx.telegram.sendMessage(toId, "❤️ Тебя лайкнули в ответ!");
  } catch {}
});

bot.action('back_menu', async (ctx) => {
  await ctx.deleteMessage();
  await ctx.replyWithPhoto(MENU_PHOTO, {
    caption: "Главное меню:",
    ...mainMenu()
  });
});

// ===== СОЗДАНИЕ АНКЕТЫ =====
bot.on("text", async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;
  
  if (["🔍 Поиск", "❤️ Мои лайки", "👤 Профиль", "📞 Помощь", "🔙 Назад", "🆕 Новая анкета", "➡️ Дальше", "❤️ Лайк", "Москва", "ЗаМКАДье"].includes(text)) {
    return;
  }
  
  if (!state[userId]) return;
  
  const s = state[userId];
  
  try {
    if (s.step === "name") {
      if (text.length < 2 || text.length > 30) {
        return ctx.reply("Имя должно быть от 2 до 30 символов");
      }
      s.name = text;
      s.step = "age";
      return ctx.reply("Сколько тебе лет? (14-99)");
    }
    
    if (s.step === "age") {
      const age = parseInt(text);
      if (isNaN(age) || age < 14 || age > 99) {
        return ctx.reply("Введи число от 14 до 99");
      }
      s.age = age;
      s.step = "city";
      return ctx.reply("Твой город?", Markup.keyboard([
        ["Москва"],
        ["ЗаМКАДье"]
      ]).resize());
    }
    
    if (s.step === "city") {
      if (!text.includes("Москва") && !text.includes("ЗаМКАДье")) {
        return ctx.reply("Выбери из кнопок");
      }
      s.city = text;
      s.step = "about";
      return ctx.reply("Напиши о себе:", Markup.removeKeyboard());
    }
    
    if (s.step === "about") {
      if (text.length < 5) {
        return ctx.reply("Напиши хотя бы 5 символов");
      }
      s.about = text;
      s.step = "photo";
      return ctx.reply("Отправь фото:");
    }
    
  } catch (err) {
    console.log("Ошибка:", err);
    ctx.reply("❌ Ошибка. Начни заново с /start");
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
      `INSERT INTO users (id, name, age, city, about, photo, username) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, s.name, s.age, s.city, s.about, fileId, ctx.from.username]
    );
    
    delete state[userId];
    
    await ctx.replyWithPhoto(MENU_PHOTO, {
      caption: "✅ Анкета создана!",
      ...mainMenu()
    });
    
  } catch (err) {
    console.log("Ошибка:", err);
    ctx.reply("❌ Ошибка при сохранении");
  }
});

// ===== АДМИНКА =====
bot.command('stats', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  
  try {
    const users = await pool.query("SELECT COUNT(*) FROM users");
    const likes = await pool.query("SELECT COUNT(*) FROM likes");
    
    ctx.reply(`📊 СТАТИСТИКА:\n\n👤 Пользователей: ${users.rows[0].count}\n❤️ Лайков: ${likes.rows[0].count}`);
  } catch (err) {
    ctx.reply(`❌ Ошибка: ${err.message}`);
  }
});

// ===== BROADCAST =====
bot.command('broadcast', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) {
    return ctx.reply("⛔ У тебя нет прав на рассылку");
  }
  
  const text = ctx.message.text.replace('/broadcast', '').trim();
  
  if (!text) {
    return ctx.reply(
      "📝 Использование: /broadcast [текст]\n\n" +
      "Пример: /broadcast Всем привет!"
    );
  }
  
  try {
    const users = await pool.query("SELECT id FROM users");
    
    if (users.rows.length === 0) {
      return ctx.reply("📭 Нет пользователей для рассылки");
    }
    
    await ctx.reply(`📨 Начинаю рассылку ${users.rows.length} пользователям...`);
    
    let sent = 0;
    let failed = 0;
    
    for (const user of users.rows) {
      try {
        await ctx.telegram.sendMessage(
          user.id, 
          `📢 РАССЫЛКА:\n\n${text}`
        );
        sent++;
      } catch (error) {
        failed++;
        console.log(`Не удалось отправить ${user.id}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    await ctx.reply(
      `✅ Рассылка завершена!\n\n` +
      `📨 Отправлено: ${sent}\n` +
      `❌ Не доставлено: ${failed}`
    );
    
  } catch (err) {
    console.error("Ошибка рассылки:", err);
    ctx.reply(`❌ Ошибка при рассылке: ${err.message}`);
  }
});

// ===== ТЕСТ =====
bot.command('test', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  
  try {
    await ctx.reply("✅ Бот работает!");
  } catch (err) {
    await ctx.reply(`❌ Ошибка: ${err.message}`);
  }
});

// ===== ЗАПУСК =====
bot.launch();
console.log("✅ Бот запущен");
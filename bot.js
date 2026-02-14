const { Telegraf, Markup } = require("telegraf");
const { Pool } = require("pg");

// ===== ПРОВЕРКА ПЕРЕМЕННЫХ =====
if (!process.env.BOT_TOKEN) {
  console.error("❌ BOT_TOKEN not found");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL not found");
  process.exit(1);
}

if (!process.env.ADMIN_ID) {
  console.error("❌ ADMIN_ID not found");
  process.exit(1);
}

if (!process.env.SUPPORT_USERNAME) {
  console.error("❌ SUPPORT_USERNAME not found");
  process.exit(1);
}

console.log("✅ Environment variables loaded");

// ===== ИНИЦИАЛИЗАЦИЯ =====
const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = Number(process.env.ADMIN_ID);
const SUPPORT_USERNAME = process.env.SUPPORT_USERNAME;

// Подключение к PostgreSQL с подробным логированием
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Проверяем подключение к БД
pool.connect((err, client, release) => {
  if (err) {
    console.error("❌ Database connection error:", err.stack);
  } else {
    console.log("✅ Database connected successfully");
    release();
  }
});

// Хранилище состояний
let state = {};
let browsing = {};

// ===== ИНИЦИАЛИЗАЦИЯ БД =====
async function initDB() {
  try {
    // Таблица пользователей
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT PRIMARY KEY,
        name TEXT NOT NULL,
        age INTEGER NOT NULL,
        type TEXT NOT NULL,
        city TEXT NOT NULL,
        about TEXT NOT NULL,
        photo TEXT NOT NULL,
        username TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("✅ Users table ready");

    // Таблица лайков
    await pool.query(`
      CREATE TABLE IF NOT EXISTS likes (
        id SERIAL PRIMARY KEY,
        from_id BIGINT NOT NULL,
        to_id BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(from_id, to_id)
      );
    `);
    console.log("✅ Likes table ready");

    // Таблица просмотров
    await pool.query(`
      CREATE TABLE IF NOT EXISTS views (
        id SERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        viewed_user_id BIGINT NOT NULL,
        viewed_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, viewed_user_id)
      );
    `);
    console.log("✅ Views table ready");

    // Индексы для быстрого поиска
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_id ON users(id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_likes_to_id ON likes(to_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_likes_from_id ON likes(from_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_views_user_id ON views(user_id);`);
    
    console.log("✅ Database initialization complete");
  } catch (error) {
    console.error("❌ Database initialization error:", error);
  }
}

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====

// Главное меню с фото 424242142141.png
async function sendMainMenu(ctx) {
  const photo = 'https://i.postimg.cc/zf5hCDHg/424242142141.png';
  const caption = `👋 Добро пожаловать в инцел-знакомства!\n\nВыбирай, чего хочешь:`;

  const keyboard = Markup.keyboard([
    ["🔍 Поиск анкет"],
    ["❤️ Кто меня лайкнул"],
    ["👤 Мой профиль"],
    ["📞 Поддержка"]
  ]).resize();

  try {
    await ctx.replyWithPhoto(photo, {
      caption: caption,
      ...keyboard
    });
  } catch (error) {
    console.log("Ошибка отправки фото меню:", error);
    await ctx.reply(caption, keyboard);
  }
}

// Поддержка с фото pozdnyakov.png
async function sendSupport(ctx) {
  const photo = 'https://i.postimg.cc/3xkSsBt7/pozdnyakov.png';
  const caption = `🛠 Связь с поддержкой\n\nНапиши создателю бота: @${SUPPORT_USERNAME}\n\nОн ответит, если не будет ныть в треде.`;
  
  const keyboard = Markup.keyboard([
    ["🔙 Назад в меню"]
  ]).resize();

  try {
    await ctx.replyWithPhoto(photo, {
      caption: caption,
      ...keyboard
    });
  } catch (error) {
    console.log("Ошибка отправки фото поддержки:", error);
    await ctx.reply(caption, keyboard);
  }
}

// Проверка существования анкеты
async function checkProfile(userId) {
  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE id = $1",
      [userId]
    );
    return result.rows[0];
  } catch (error) {
    console.error("Error checking profile:", error);
    return null;
  }
}

// Самоироничные сообщения
const sadMessages = [
  "😢 Тебя пока никто не лайкнул. Ну и ладно, они просто не оценили твою ауру.",
  "💔 Ноль лайков. Зато у тебя есть мы, а это чего-то да стоит.",
  "😔 Пока тишина. Но ты не грусти, даже у топ-инцелов не сразу всё получалось.",
  "📭 Лайков нет. Может, дело в фото? Или в описании? Или в нас? Не, в нас точно не дело.",
  "🦗 Сверчки, а не лайки. Но ты держись, брат!"
];

const noProfilesMessages = [
  "😢 Анкет больше нет... Совсем.",
  "💀 Ты всех пересмотрел. Пригласи друзей или создай вторую анкету (тссс...)",
  "🌚 Пусто. Даже инцелы закончились.",
  "📦 Анкет нет. Может, сам кого-нибудь приведёшь?"
];

// ===== СТАРТ =====
bot.start(async (ctx) => {
  console.log(`User ${ctx.from.id} started bot`);
  await sendMainMenu(ctx);
});

// ===== ПОДДЕРЖКА =====
bot.hears("📞 Поддержка", async (ctx) => {
  console.log(`User ${ctx.from.id} opened support`);
  await sendSupport(ctx);
});

// ===== НАЗАД В МЕНЮ =====
bot.hears("🔙 Назад в меню", async (ctx) => {
  await sendMainMenu(ctx);
});

// ===== МОЙ ПРОФИЛЬ =====
bot.hears("👤 Мой профиль", async (ctx) => {
  console.log(`User ${ctx.from.id} opened profile`);
  const userId = ctx.from.id;
  const profile = await checkProfile(userId);

  if (!profile) {
    state[userId] = { step: "name" };
    return ctx.reply(
      "👤 У тебя нет анкеты. Давай создадим, брат!\n\n" +
      "Введи имя (можно ненастоящее, мы никому не расскажем):"
    );
  }

  try {
    await ctx.replyWithPhoto(profile.photo, {
      caption: `👤 Твоя анкета:\n\n${profile.name}, ${profile.age}\n${profile.type}\n📍 ${profile.city}\n\n📝 ${profile.about}`,
      reply_markup: Markup.keyboard([
        ["🔄 Заполнить анкету заново"],
        ["🔍 Поиск анкет", "❤️ Кто меня лайкнул"],
        ["📞 Поддержка"]
      ]).resize().reply_markup
    });
  } catch (error) {
    console.error("Error showing profile:", error);
    ctx.reply("Ошибка при показе профиля");
  }
});

// ===== ЗАПОЛНИТЬ АНКЕТУ ЗАНОВО =====
bot.hears("🔄 Заполнить анкету заново", async (ctx) => {
  console.log(`User ${ctx.from.id} recreating profile`);
  const userId = ctx.from.id;
  
  try {
    // Удаляем старую анкету
    await pool.query("DELETE FROM views WHERE user_id = $1 OR viewed_user_id = $1", [userId]);
    await pool.query("DELETE FROM likes WHERE from_id = $1 OR to_id = $1", [userId]);
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    
    state[userId] = { step: "name" };
    ctx.reply(
      "🔄 Начинаем создание новой анкеты!\n\n" +
      "Введи имя (можно ненастоящее, мы никому не расскажем):"
    );
  } catch (error) {
    console.error("Error recreating profile:", error);
    ctx.reply("Ошибка при создании новой анкеты");
  }
});

// ===== СОЗДАНИЕ АНКЕТЫ =====
bot.on("text", async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;

  // Пропускаем команды и кнопки меню
  if (text.startsWith('/') || 
      text === "🔍 Поиск анкет" || 
      text === "❤️ Кто меня лайкнул" || 
      text === "👤 Мой профиль" || 
      text === "📞 Поддержка" ||
      text === "🔙 Назад в меню" ||
      text === "🔄 Заполнить анкету заново" ||
      text === "Москва" || 
      text === "ЗаМКАДье") {
    return;
  }

  if (!state[userId]) return;

  const s = state[userId];

  try {
    if (s.step === "name") {
      if (text.length < 2 || text.length > 30) {
        return ctx.reply("Имя должно быть от 2 до 30 символов. Давай еще раз:");
      }
      s.name = text;
      s.step = "age";
      return ctx.reply("Сколько тебе лет? (числом от 14 до 99)");
    }

    if (s.step === "age") {
      const age = parseInt(text);
      if (isNaN(age) || age < 14 || age > 99) {
        return ctx.reply("Возраст должен быть числом от 14 до 99. Попробуй еще:");
      }
      s.age = age;
      s.step = "type";
      return ctx.reply(
        "Выбери свой тип:",
        Markup.keyboard([
          ["🧔 Инцел"],
          ["👩 Фемцел"]
        ]).resize()
      );
    }

    if (s.step === "type") {
      if (text !== "🧔 Инцел" && text !== "👩 Фемцел") {
        return ctx.reply("Выбери тип из кнопок ниже:");
      }
      s.type = text;
      s.step = "city";
      return ctx.reply(
        "Откуда ты?",
        Markup.keyboard([
          ["Москва"],
          ["ЗаМКАДье"]
        ]).resize()
      );
    }

    if (s.step === "city") {
      if (text !== "Москва" && text !== "ЗаМКАДье") {
        return ctx.reply("Выбери город из кнопок ниже:");
      }
      s.city = text;
      s.step = "about";
      return ctx.reply("Расскажи о себе (немного, но честно):");
    }

    if (s.step === "about") {
      if (text.length < 10 || text.length > 500) {
        return ctx.reply("Описание должно быть от 10 до 500 символов. Постарайся:");
      }
      s.about = text;
      s.step = "photo";
      return ctx.reply("Теперь пришли своё фото. Можно с котом, можно без, главное, чтобы лицо было видно:");
    }
  } catch (error) {
    console.error("Error in profile creation:", error);
    ctx.reply("Произошла ошибка. Начни заново через /start");
    delete state[userId];
  }
});

// ===== ФОТО =====
bot.on("photo", async (ctx) => {
  const userId = ctx.from.id;
  
  if (!state[userId] || state[userId].step !== "photo") return;

  try {
    const s = state[userId];
    const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;

    await pool.query(
      `INSERT INTO users (id, name, age, type, city, about, photo, username)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
       name = $2, age = $3, type = $4, city = $5, about = $6, photo = $7, username = $8`,
      [userId, s.name, s.age, s.type, s.city, s.about, fileId, ctx.from.username]
    );

    console.log(`User ${userId} created profile`);
    delete state[userId];

    await ctx.reply(
      "✅ Анкета сохранена! Теперь можно искать таких же одиноких... Удачи!",
      Markup.keyboard([
        ["🔍 Поиск анкет"],
        ["❤️ Кто меня лайкнул"],
        ["👤 Мой профиль"],
        ["📞 Поддержка"]
      ]).resize()
    );

  } catch (error) {
    console.error("Error saving photo:", error);
    ctx.reply("Ошибка при сохранении. Попробуй еще раз через /start");
    delete state[userId];
  }
});

// ===== ПОИСК АНКЕТ =====
bot.hears("🔍 Поиск анкет", async (ctx) => {
  console.log(`User ${ctx.from.id} started search`);
  const userId = ctx.from.id;
  
  const profile = await checkProfile(userId);
  if (!profile) {
    state[userId] = { step: "name" };
    return ctx.reply("Сначала создай анкету. Введи имя:");
  }

  try {
    // Проверяем сколько всего пользователей
    const totalUsers = await pool.query(
      "SELECT COUNT(*) FROM users WHERE id != $1",
      [userId]
    );
    console.log(`Total other users: ${totalUsers.rows[0].count}`);

    // Проверяем сколько просмотрено
    const viewedUsers = await pool.query(
      "SELECT COUNT(*) FROM views WHERE user_id = $1",
      [userId]
    );
    console.log(`Viewed users: ${viewedUsers.rows[0].count}`);

    // Ищем непросмотренную анкету
    const result = await pool.query(`
      SELECT u.* FROM users u
      WHERE u.id != $1
      AND u.id NOT IN (
        SELECT COALESCE(viewed_user_id, 0) FROM views WHERE user_id = $1
      )
      ORDER BY RANDOM()
      LIMIT 1
    `, [userId]);

    console.log(`Search result rows: ${result.rows.length}`);

    if (!result.rows.length) {
      return ctx.reply(
        "😢 Ты уже просмотрел все анкеты!\n\n" +
        "Хочешь начать заново и посмотреть их еще раз?",
        Markup.keyboard([
          ["🔄 Сбросить историю просмотров"],
          ["👤 Мой профиль"],
          ["📞 Поддержка"]
        ]).resize()
      );
    }

    const candidate = result.rows[0];
    browsing[userId] = candidate.id;
    console.log(`Showing candidate ${candidate.id} to user ${userId}`);

    // Записываем просмотр
    await pool.query(
      "INSERT INTO views (user_id, viewed_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [userId, candidate.id]
    );

    await ctx.replyWithPhoto(candidate.photo, {
      caption: `🎭 Найден:\n\n${candidate.name}, ${candidate.age}\n${candidate.type}\n📍 ${candidate.city}\n\n📝 ${candidate.about}`,
      reply_markup: Markup.keyboard([
        ["❤️ Лайк", "➡️ Дальше"],
        ["🔙 Назад в меню"]
      ]).resize().reply_markup
    });

  } catch (error) {
    console.error("Search error:", error);
    ctx.reply("Ошибка при поиске. Попробуй позже.");
  }
});

// ===== СБРОС ИСТОРИИ ПРОСМОТРОВ =====
bot.hears("🔄 Сбросить историю просмотров", async (ctx) => {
  const userId = ctx.from.id;
  
  await pool.query("DELETE FROM views WHERE user_id = $1", [userId]);
  console.log(`User ${userId} reset view history`);
  
  ctx.reply(
    "✅ История просмотров сброшена! Теперь можно заново просмотреть все анкеты.",
    Markup.keyboard([
      ["🔍 Поиск анкет"],
      ["❤️ Кто меня лайкнул"],
      ["👤 Мой профиль"],
      ["📞 Поддержка"]
    ]).resize()
  );
});

// ===== ДАЛЬШЕ =====
bot.hears("➡️ Дальше", async (ctx) => {
  const userId = ctx.from.id;
  
  try {
    const result = await pool.query(`
      SELECT u.* FROM users u
      WHERE u.id != $1
      AND u.id NOT IN (
        SELECT COALESCE(viewed_user_id, 0) FROM views WHERE user_id = $1
      )
      ORDER BY RANDOM()
      LIMIT 1
    `, [userId]);

    if (!result.rows.length) {
      return ctx.reply(
        "😢 Ты уже просмотрел все анкеты!",
        Markup.keyboard([
          ["🔄 Сбросить историю просмотров"],
          ["👤 Мой профиль"],
          ["📞 Поддержка"]
        ]).resize()
      );
    }

    const candidate = result.rows[0];
    browsing[userId] = candidate.id;

    await pool.query(
      "INSERT INTO views (user_id, viewed_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [userId, candidate.id]
    );

    await ctx.replyWithPhoto(candidate.photo, {
      caption: `🎭 Следующий:\n\n${candidate.name}, ${candidate.age}\n${candidate.type}\n📍 ${candidate.city}\n\n📝 ${candidate.about}`,
      reply_markup: Markup.keyboard([
        ["❤️ Лайк", "➡️ Дальше"],
        ["🔙 Назад в меню"]
      ]).resize().reply_markup
    });

  } catch (error) {
    console.error("Next error:", error);
    ctx.reply("Ошибка при поиске.");
  }
});

// ===== ЛАЙК =====
bot.hears("❤️ Лайк", async (ctx) => {
  const fromId = ctx.from.id;
  const toId = browsing[fromId];

  if (!toId) {
    return ctx.reply("Сначала найди кого-нибудь в поиске!");
  }

  try {
    // Проверяем, не лайкал ли уже
    const existingLike = await pool.query(
      "SELECT * FROM likes WHERE from_id = $1 AND to_id = $2",
      [fromId, toId]
    );

    if (existingLike.rows.length > 0) {
      return ctx.reply("Ты уже лайкал этого человека!");
    }

    await pool.query(
      "INSERT INTO likes (from_id, to_id) VALUES ($1, $2)",
      [fromId, toId]
    );

    console.log(`Like from ${fromId} to ${toId} saved`);
    await ctx.reply("✅ Лайк отправлен! ❤️");

    // Отправляем уведомление
    try {
      await ctx.telegram.sendMessage(
        toId,
        "🔥 Тебя лайкнули! Зайди посмотреть кто."
      );
    } catch (e) {
      console.log("User blocked bot or deleted account");
    }

    // Показываем следующую анкету
    const result = await pool.query(`
      SELECT u.* FROM users u
      WHERE u.id != $1
      AND u.id NOT IN (
        SELECT COALESCE(viewed_user_id, 0) FROM views WHERE user_id = $1
      )
      ORDER BY RANDOM()
      LIMIT 1
    `, [fromId]);

    if (result.rows.length > 0) {
      const candidate = result.rows[0];
      browsing[fromId] = candidate.id;

      await pool.query(
        "INSERT INTO views (user_id, viewed_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [fromId, candidate.id]
      );

      await ctx.replyWithPhoto(candidate.photo, {
        caption: `🎭 Следующий:\n\n${candidate.name}, ${candidate.age}\n${candidate.type}\n📍 ${candidate.city}\n\n📝 ${candidate.about}`,
        reply_markup: Markup.keyboard([
          ["❤️ Лайк", "➡️ Дальше"],
          ["🔙 Назад в меню"]
        ]).resize().reply_markup
      });
    } else {
      ctx.reply(
        "😢 Больше анкет нет!",
        Markup.keyboard([
          ["🔄 Сбросить историю просмотров"],
          ["👤 Мой профиль"],
          ["📞 Поддержка"]
        ]).resize()
      );
    }

  } catch (error) {
    console.error("Like error:", error);
    ctx.reply("Ошибка при отправке лайка.");
  }
});

// ===== КТО МЕНЯ ЛАЙКНУЛ =====
bot.hears("❤️ Кто меня лайкнул", async (ctx) => {
  console.log(`User ${ctx.from.id} checking likes`);
  const userId = ctx.from.id;

  const profile = await checkProfile(userId);
  if (!profile) {
    state[userId] = { step: "name" };
    return ctx.reply("Сначала создай анкету. Введи имя:");
  }

  try {
    const result = await pool.query(`
      SELECT u.* FROM likes l
      JOIN users u ON u.id = l.from_id
      WHERE l.to_id = $1
      ORDER BY l.created_at DESC
    `, [userId]);

    console.log(`Found ${result.rows.length} likes for user ${userId}`);

    if (!result.rows.length) {
      const randomMessage = sadMessages[Math.floor(Math.random() * sadMessages.length)];
      return ctx.reply(randomMessage, Markup.keyboard([
        ["🔍 Поиск анкет"],
        ["👤 Мой профиль"],
        ["📞 Поддержка"]
      ]).resize());
    }

    await ctx.reply(`❤️ Тебя лайкнули ${result.rows.length} человек(а):`);

    for (const user of result.rows) {
      await ctx.replyWithPhoto(user.photo, {
        caption: `${user.name}, ${user.age}\n${user.type}\n📍 ${user.city}\n\n📝 ${user.about}`
      });
    }

    await ctx.reply("👆 Вот они, твои поклонники!", Markup.keyboard([
      ["🔍 Поиск анкет"],
      ["👤 Мой профиль"],
      ["📞 Поддержка"]
    ]).resize());

  } catch (error) {
    console.error("Who liked me error:", error);
    ctx.reply("Ошибка при загрузке лайков.");
  }
});

// ===== РАССЫЛКА (ИСПРАВЛЕННАЯ) =====
bot.command("broadcast", async (ctx) => {
  console.log(`Broadcast command from user ${ctx.from.id}`);
  
  // Проверяем права администратора
  if (ctx.from.id !== ADMIN_ID) {
    console.log(`Access denied for user ${ctx.from.id}`);
    return ctx.reply("⛔ У тебя нет прав на рассылку.");
  }

  // Получаем текст сообщения
  const messageText = ctx.message.text;
  const broadcastText = messageText.replace("/broadcast", "").trim();

  if (!broadcastText) {
    return ctx.reply(
      "📝 Использование: /broadcast [текст сообщения]\n\n" +
      "Пример: /broadcast Всем привет! У нас обнова."
    );
  }

  try {
    // Получаем всех пользователей
    const users = await pool.query("SELECT id FROM users");
    console.log(`Found ${users.rows.length} users for broadcast`);
    
    if (users.rows.length === 0) {
      return ctx.reply("📭 В базе нет пользователей для рассылки.");
    }

    await ctx.reply(`📨 Начинаю рассылку ${users.rows.length} пользователям...\nЭто может занять некоторое время.`);

    let sent = 0;
    let failed = 0;
    const failedUsers = [];

    // Отправляем сообщение каждому пользователю
    for (const user of users.rows) {
      try {
        await ctx.telegram.sendMessage(user.id, `📢 Рассылка:\n\n${broadcastText}`);
        sent++;
        
        // Небольшая задержка чтобы избежать флуда
        await new Promise(resolve => setTimeout(resolve, 70));
      } catch (error) {
        failed++;
        failedUsers.push(user.id);
        console.log(`Failed to send to user ${user.id}:`, error.description || error.message);
      }
    }

    // Отправляем отчет
    let report = `✅ Рассылка завершена!\n\n`;
    report += `📨 Отправлено: ${sent}\n`;
    report += `❌ Не доставлено: ${failed}\n`;
    
    if (failedUsers.length > 0) {
      report += `\n⚠️ Не получили (ID): ${failedUsers.join(', ')}`;
    }

    await ctx.reply(report);
    console.log(`Broadcast completed. Sent: ${sent}, Failed: ${failed}`);

  } catch (error) {
    console.error("Broadcast error:", error);
    ctx.reply("❌ Произошла ошибка при рассылке.");
  }
});

// ===== СТАТИСТИКА (ДЛЯ АДМИНА) =====
bot.command("stats", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) {
    return ctx.reply("⛔ Нет доступа.");
  }

  try {
    const usersCount = await pool.query("SELECT COUNT(*) FROM users");
    const likesCount = await pool.query("SELECT COUNT(*) FROM likes");
    const viewsCount = await pool.query("SELECT COUNT(*) FROM views");
    
    const stats = `
📊 СТАТИСТИКА БОТА

👤 Пользователей: ${usersCount.rows[0].count}
❤️ Всего лайков: ${likesCount.rows[0].count}
👀 Просмотров анкет: ${viewsCount.rows[0].count}
    `;

    ctx.reply(stats);

  } catch (error) {
    console.error("Stats error:", error);
    ctx.reply("❌ Ошибка при получении статистики.");
  }
});

// ===== ТЕСТОВАЯ КОМАНДА =====
bot.command("test", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  
  try {
    // Проверяем подключение к БД
    const dbTest = await pool.query("SELECT NOW()");
    const userCount = await pool.query("SELECT COUNT(*) FROM users");
    
    await ctx.reply(
      `✅ Бот работает!\n\n` +
      `📊 В базе ${userCount.rows[0].count} пользователей\n` +
      `🕐 Время сервера: ${dbTest.rows[0].now}`
    );
  } catch (error) {
    ctx.reply(`❌ Ошибка: ${error.message}`);
  }
});

// ===== ЗАПУСК =====
async function startBot() {
  await initDB();
  
  bot.launch();
  console.log("🤖 Bot started");
}

startBot();

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
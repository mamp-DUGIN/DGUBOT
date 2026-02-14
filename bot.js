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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS views (
      user_id BIGINT,
      viewed_user_id BIGINT,
      UNIQUE(user_id, viewed_user_id)
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
  ctx.reply(
    "🤖 Бот созданный инцелом для инцелов, наслаждайся!\n\n" +
    "Помни: здесь тебя если и не полюбят, то хотя бы поймут. У нас тут все свои, можно ныть сколько влезет.",
    mainMenu()
  );
});

// ===== PROFILE =====

bot.hears("👤 Мой профиль", async (ctx) => {
  const res = await pool.query(
    "SELECT * FROM users WHERE id=$1",
    [ctx.from.id]
  );

  if (!res.rows.length) {
    state[ctx.from.id] = { step: "name" };
    return ctx.reply(
      "👤 У тебя нет анкеты. Давай создадим, брат!\n\n" +
      "Не бойся, тут все такие же... эмм... интересные. Введи имя (можно ненастоящее, мы никому не расскажем):"
    );
  }

  const u = res.rows[0];

  await ctx.replyWithPhoto(u.photo, {
    caption: `👤 Твоя анкета:\n\n${u.name}, ${u.age}\n${u.type}\n${u.city}\n\n${u.about}\n\n(Ну как тебе? Сам писал?)`,
    ...mainMenu()
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
    return ctx.reply("Возраст? (числом)");
  }

  if (s.step === "age") {
    if (isNaN(text) || text < 14 || text > 100)
      return ctx.reply("Возраст должен быть числом от 14 до 100. Даже если в душе тебе 12, пиши честно (или почти честно).");

    s.age = Number(text);
    s.step = "type";
    return ctx.reply(
      "🧔 Выбери свой тип:\n\n" +
      "P.S. Если не уверен, инцел — это состояние души, а фемцел — когда девочки тоже страдают. Выбирай сердцем!",
      Markup.keyboard([
        ["🧔 Инцел (классический страдалец)"],
        ["👩 Фемцел (сестра по несчастью)"]
      ]).resize()
    );
  }

  if (s.step === "type") {
    s.type = text;
    s.step = "city";
    return ctx.reply("Из какого ты города? (Город или 'деревня инцелов')");
  }

  if (s.step === "city") {
    s.city = text;
    s.step = "about";
    return ctx.reply("Расскажи о себе. Чем живёшь, что ищешь, сколько котлет съел на завтрак?");
  }

  if (s.step === "about") {
    s.about = text;
    s.step = "photo";
    return ctx.reply("Пришли своё фото. Можно с котом, можно без, главное, чтобы лицо было (ну или хотя бы намёк на него).");
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
  ctx.reply("✅ Анкета сохранена! Теперь можно искать таких же одиноких как и ты... Удачи, она нам всем нужна.", mainMenu());
});

// ===== SEARCH =====

bot.hears("🔍 Поиск", async (ctx) => {
  const id = ctx.from.id;

  const userExists = await pool.query("SELECT id FROM users WHERE id=$1", [id]);
  if (!userExists.rows.length) {
    state[id] = { step: "name" };
    return ctx.reply("Без анкеты искать некого. Сначала создай профиль, брат. Введи имя:");
  }

  const res = await pool.query(`
    SELECT u.* FROM users u
    WHERE u.id != $1
    AND u.id NOT IN (
      SELECT viewed_user_id FROM views WHERE user_id = $1
    )
    ORDER BY RANDOM()
    LIMIT 1
  `, [id]);

  if (!res.rows.length) {
    return ctx.reply(
      "😢 Анкет больше нет... Совсем.\n\n" +
      "Либо ты всех уже пересмотрел, либо мы тут просто компания из трёх инцелов. Пригласи друзей, или сам создай вторую анкету (тссс... никому не скажем).",
      mainMenu()
    );
  }

  const u = res.rows[0];
  browsing[id] = u.id;

  await pool.query(
    "INSERT INTO views (user_id, viewed_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [id, u.id]
  );

  await ctx.replyWithPhoto(u.photo, {
    caption: `🎭 Найден кандидат:\n\n${u.name}, ${u.age}\n${u.type}\n${u.city}\n\n${u.about}\n\n(Ну как тебе? Ставь лайк или листай дальше)`,
    reply_markup: Markup.keyboard([
      ["❤️ Лайк", "➡️ Дальше"]
    ]).resize().reply_markup
  });
});

// ===== NEXT =====

bot.hears("➡️ Дальше", async (ctx) => {
  await ctx.deleteMessage().catch(() => {});

  const id = ctx.from.id;

  const res = await pool.query(`
    SELECT u.* FROM users u
    WHERE u.id != $1
    AND u.id NOT IN (
      SELECT viewed_user_id FROM views WHERE user_id = $1
    )
    ORDER BY RANDOM()
    LIMIT 1
  `, [id]);

  if (!res.rows.length) {
    return ctx.reply(
      "😢 Анкет больше нет... Совсем.\n\n" +
      "Либо ты всех уже пересмотрел, либо мы тут просто компания из трёх инцелов. Пригласи друзей, или сам создай вторую анкету (тссс... никому не скажем).",
      mainMenu()
    );
  }

  const u = res.rows[0];
  browsing[id] = u.id;

  await pool.query(
    "INSERT INTO views (user_id, viewed_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [id, u.id]
  );

  await ctx.replyWithPhoto(u.photo, {
    caption: `🎭 Следующий:\n\n${u.name}, ${u.age}\n${u.type}\n${u.city}\n\n${u.about}`,
    reply_markup: Markup.keyboard([
      ["❤️ Лайк", "➡️ Дальше"]
    ]).resize().reply_markup
  });
});

// ===== LIKE =====

bot.hears("❤️ Лайк", async (ctx) => {
  const from = ctx.from.id;
  const to = browsing[from];

  if (!to) {
    return ctx.reply("А кого лайкать-то? Сначала найди кого-нибудь в поиске 🔍", mainMenu());
  }

  try {
    await pool.query(
      "INSERT INTO likes (from_id, to_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [from, to]
    );

    await ctx.reply("✅ Лайк отправлен! ❤️ Может, этот человек — твоя судьба... или просто очередной инцел.");

    const userExists = await pool.query("SELECT id FROM users WHERE id=$1", [to]);
    if (userExists.rows.length) {
      try {
        await ctx.telegram.sendMessage(
          to,
          "🔥 Тебя лайкнули! Кто-то оценил твою анкету. Зайди и посмотри, вдруг это тот самый человек."
        );
      } catch (e) {
        console.log("Не удалось отправить уведомление пользователю", to);
      }
    }

    await ctx.reply("🔍 Ищем дальше...");

    const res = await pool.query(`
      SELECT u.* FROM users u
      WHERE u.id != $1
      AND u.id NOT IN (
        SELECT viewed_user_id FROM views WHERE user_id = $1
      )
      ORDER BY RANDOM()
      LIMIT 1
    `, [from]);

    if (!res.rows.length) {
      return ctx.reply(
        "😢 Анкет больше нет... Совсем.\n\n" +
        "Либо ты всех уже пересмотрел, либо мы тут просто компания из трёх инцелов. Пригласи друзей, или сам создай вторую анкету (тссс... никому не скажем).",
        mainMenu()
      );
    }

    const u = res.rows[0];
    browsing[from] = u.id;

    await pool.query(
      "INSERT INTO views (user_id, viewed_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [from, u.id]
    );

    await ctx.replyWithPhoto(u.photo, {
      caption: `🎭 Новая анкета:\n\n${u.name}, ${u.age}\n${u.type}\n${u.city}\n\n${u.about}`,
      reply_markup: Markup.keyboard([
        ["❤️ Лайк", "➡️ Дальше"]
      ]).resize().reply_markup
    });

  } catch (error) {
    console.error(error);
    ctx.reply("Произошла ошибка при отправке лайка. Видимо, не судьба.");
  }
});

// ===== WHO LIKED ME =====

bot.hears("❤️ Кто меня лайкнул", async (ctx) => {
  const userId = ctx.from.id;

  const userExists = await pool.query("SELECT id FROM users WHERE id=$1", [userId]);
  if (!userExists.rows.length) {
    state[userId] = { step: "name" };
    return ctx.reply("Сначала создай анкету, чтобы тебя могли лайкать. Введи имя:");
  }

  const res = await pool.query(`
    SELECT u.* FROM likes l
    JOIN users u ON u.id = l.from_id
    WHERE l.to_id = $1
  `, [userId]);

  if (!res.rows.length) {
    const sadMessages = [
      "😢 Тебя пока никто не лайкнул. Ну и ладно, они просто не оценили твою ауру.",
      "💔 Ноль лайков. Зато у тебя есть мы, а это чего-то да стоит.",
      "😔 Пока тишина. Но ты не грусти, даже у топ-инцелов не сразу всё получалось.",
      "📭 Лайков нет. Может, дело в фото? Или в описании? Или в нас? Не, в нас точно не дело."
    ];
    return ctx.reply(sadMessages[Math.floor(Math.random() * sadMessages.length)], mainMenu());
  }

  await ctx.reply(`❤️ Тебя лайкнули ${res.rows.length} человек(а). Вот они, твои тайные поклонники:`);

  for (const u of res.rows) {
    if (u.id !== userId) {
      await ctx.replyWithPhoto(u.photo, {
        caption: `${u.name}, ${u.age}\n${u.type}\n${u.city}\n\n${u.about}\n\n(Видишь, кому-то ты нужен!)`
      });
    }
  }

  await ctx.reply("👆 Смотри, радуйся. Или грусти, если их мало.", mainMenu());
});

// ===== BROADCAST =====

bot.command("broadcast", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID)
    return ctx.reply("Нет доступа. Ты не создатель, иди ныть в другом месте.");

  const text = ctx.message.text.replace("/broadcast", "").trim();
  if (!text) return ctx.reply("Напиши текст после команды. Что разослать-то?");

  const users = await pool.query("SELECT id FROM users");

  let sent = 0;
  let failed = 0;

  for (const user of users.rows) {
    try {
      await ctx.telegram.sendMessage(user.id, text);
      sent++;
    } catch (e) {
      failed++;
    }
  }

  ctx.reply(`Рассылка завершена.\n✅ Отправлено: ${sent}\n❌ Не доставлено: ${failed}`);
});

// ===== START BOT =====

bot.launch();
console.log("Bot started");
import TelegramBot from 'node-telegram-bot-api';
import { storage } from './storage';
import { log } from './vite';

interface MinesGame {
  chatId: number;
  userId: string;
  bet: number;
  mines: Set<number>;
  opened: Set<number>;
  active: boolean;
  multiplier: number;
  messageId?: number;
  mineCount: number;
}

// In-memory game state (key = userId)
const activeGames = new Map<string, MinesGame>();

function generateMines(count: number): Set<number> {
  const mines = new Set<number>();
  while (mines.size < count) {
    mines.add(Math.floor(Math.random() * 25));
  }
  return mines;
}

// Formula: product of (25 / (25 - mines - i)) for i in 0..opened-1, with house edge 0.97
function calcMultiplier(opened: number, mineCount: number): number {
  let mult = 1.0;
  for (let i = 0; i < opened; i++) {
    mult *= 25 / (25 - mineCount - i);
  }
  return Math.round(mult * 97) / 100;
}

function buildKeyboard(game: MinesGame): any {
  const rows: any[][] = [];

  for (let row = 0; row < 5; row++) {
    const cols: any[] = [];
    for (let col = 0; col < 5; col++) {
      const pos = row * 5 + col;
      let text: string;
      let cbData: string;

      if (game.opened.has(pos)) {
        text = game.mines.has(pos) ? '🟦' : '⬜';
        cbData = `mg_done_${pos}`;
      } else {
        text = '❓';
        cbData = game.active ? `mg_open_${pos}` : `mg_done_${pos}`;
      }

      cols.push({ text, callback_data: cbData });
    }
    rows.push(cols);
  }

  if (game.active) {
    const winAmount = game.opened.size > 0 ? Math.floor(game.bet * game.multiplier) : 0;
    if (game.opened.size > 0) {
      rows.push([{
        text: `💰 Забрать ${winAmount} хамяфов`,
        callback_data: 'mg_cashout'
      }]);
    }
  } else {
    rows.push([{ text: '🔄 Новая игра — напиши Мины [ставка]', callback_data: 'mg_info' }]);
  }

  return { inline_keyboard: rows };
}

function buildStatusText(game: MinesGame, suffix: string = ''): string {
  const winAmount = game.opened.size > 0 ? Math.floor(game.bet * game.multiplier) : 0;
  return (
    `🎮 Мины\n` +
    `Ставка: ${game.bet} хамяфов | Выигрыш: ${winAmount} | Множитель: ${game.multiplier}x\n\n` +
    (suffix || 'Открывайте ячейки! Кликни на ❓ чтобы открыть.')
  );
}

export async function handleMinesStart(msg: any, bot: TelegramBot, betAmount: number) {
  const chatId = msg.chat.id;
  const userId = msg.from?.id?.toString();
  if (!userId) return;

  try {
    const user = await storage.getBotUserByTelegramId(userId);
    if (!user || !user.isRegistered) {
      await bot.sendMessage(chatId, '❌ Вы не зарегистрированы в боте!', { reply_to_message_id: msg.message_id });
      return;
    }

    if (betAmount < 10) {
      await bot.sendMessage(chatId, '❌ Минимальная ставка: 10 хамяфов!', { reply_to_message_id: msg.message_id });
      return;
    }

    const balance = parseInt(user.hamsters || '0');
    if (balance < betAmount) {
      await bot.sendMessage(chatId,
        `❌ Недостаточно хамяфов!\nВаш баланс: ${balance}\nСтавка: ${betAmount}`,
        { reply_to_message_id: msg.message_id }
      );
      return;
    }

    if (activeGames.has(userId)) {
      await bot.sendMessage(chatId, '⚠️ У вас уже есть активная игра! Сначала завершите её.', { reply_to_message_id: msg.message_id });
      return;
    }

    // Deduct bet immediately
    await storage.addHamsters(user.id, -betAmount);

    // Generate mines: 2% — 5 mines, 98% — 6 or 7 randomly
    const rand = Math.random();
    const mineCount = rand < 0.02 ? 5 : (Math.random() < 0.5 ? 6 : 7);
    const mines = generateMines(mineCount);

    const game: MinesGame = {
      chatId,
      userId,
      bet: betAmount,
      mines,
      opened: new Set(),
      active: true,
      multiplier: 1.0,
      mineCount,
    };

    activeGames.set(userId, game);

    const keyboard = buildKeyboard(game);
    const text = buildStatusText(game);

    const sentMsg = await bot.sendMessage(chatId, text, {
      reply_markup: keyboard,
      reply_to_message_id: msg.message_id
    });
    game.messageId = sentMsg.message_id;

    log(`Mines game started: user=${userId} bet=${betAmount} mines=${mineCount}`);
  } catch (error) {
    log(`Error starting mines game: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при запуске игры.', { reply_to_message_id: msg.message_id });
  }
}

export async function handleMinesCallback(callbackQuery: any, bot: TelegramBot): Promise<boolean> {
  const data: string = callbackQuery.data || '';
  if (!data.startsWith('mg_')) return false;

  const userId = callbackQuery.from.id.toString();
  const chatId = callbackQuery.message?.chat.id;
  const messageId = callbackQuery.message?.message_id;

  if (!chatId || !messageId) return true;

  // Info button (inactive game prompt)
  if (data === 'mg_info') {
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: 'Напишите "Мины [ставка]" чтобы начать новую игру!',
      show_alert: true
    });
    return true;
  }

  // Already-opened cell
  if (data.startsWith('mg_done_')) {
    await bot.answerCallbackQuery(callbackQuery.id, { text: 'Ячейка уже открыта' });
    return true;
  }

  // Cashout
  if (data === 'mg_cashout') {
    const game = activeGames.get(userId);
    if (!game || !game.active) {
      await bot.answerCallbackQuery(callbackQuery.id, { text: 'Игра не найдена', show_alert: true });
      return true;
    }
    if (game.opened.size === 0) {
      await bot.answerCallbackQuery(callbackQuery.id, { text: 'Откройте хотя бы одну ячейку!', show_alert: true });
      return true;
    }

    const winAmount = Math.floor(game.bet * game.multiplier);
    game.active = false;
    activeGames.delete(userId);

    try {
      const user = await storage.getBotUserByTelegramId(userId);
      if (user) await storage.addHamsters(user.id, winAmount);
    } catch (e) {
      log(`Error crediting mines winnings: ${e}`);
    }

    await bot.answerCallbackQuery(callbackQuery.id, { text: `💰 Вы забрали ${winAmount} хамяфов!` });

    const keyboard = buildKeyboard(game);
    const text = buildStatusText(game, `💰 Вы забрали ${winAmount} хамяфов! Игра завершена.`);
    try {
      await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, reply_markup: keyboard });
    } catch (_) {}

    log(`Mines cashout: user=${userId} win=${winAmount}`);
    return true;
  }

  // Open cell
  if (data.startsWith('mg_open_')) {
    const pos = parseInt(data.replace('mg_open_', ''));
    if (isNaN(pos) || pos < 0 || pos > 24) return true;

    const game = activeGames.get(userId);
    if (!game || !game.active) {
      await bot.answerCallbackQuery(callbackQuery.id, { text: 'Игра не найдена или уже завершена', show_alert: true });
      return true;
    }

    // Make sure it's the right game message
    if (game.chatId !== chatId) {
      await bot.answerCallbackQuery(callbackQuery.id, { text: 'Это не ваша игра!', show_alert: true });
      return true;
    }

    if (game.opened.has(pos)) {
      await bot.answerCallbackQuery(callbackQuery.id, { text: 'Ячейка уже открыта' });
      return true;
    }

    game.opened.add(pos);

    if (game.mines.has(pos)) {
      // Hit mine — reveal all mines
      game.mines.forEach(m => game.opened.add(m));
      game.active = false;
      activeGames.delete(userId);

      await bot.answerCallbackQuery(callbackQuery.id, { text: '💥 МИНА! Вы проиграли!', show_alert: true });

      const keyboard = buildKeyboard(game);
      const text = (
        `🎮 Мины\n` +
        `Ставка: ${game.bet} хамяфов | Выигрыш: 0 | Множитель: 0x\n\n` +
        `💥 Вы попали на мину! Проигрыш: ${game.bet} хамяфов.`
      );
      try {
        await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, reply_markup: keyboard });
      } catch (_) {}

      log(`Mines loss: user=${userId} bet=${game.bet}`);
      return true;
    }

    // Safe cell
    game.multiplier = calcMultiplier(game.opened.size, game.mineCount);
    const winAmount = Math.floor(game.bet * game.multiplier);

    await bot.answerCallbackQuery(callbackQuery.id, { text: `⬜ Пусто! Множитель: ${game.multiplier}x` });

    const keyboard = buildKeyboard(game);
    const text = buildStatusText(game);
    try {
      await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, reply_markup: keyboard });
    } catch (_) {}

    return true;
  }

  return false;
}

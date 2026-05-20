import { bot, botConfig, ADMIN_IDS, BONUS_AMOUNT, BONUS_COOLDOWN, notifyAllAdmins } from './bot-shared';
import { storage } from './storage';
import { log } from './vite';
import type { BotUser, AdTask } from '@shared/schema';
import { promises as fs } from 'fs';
import { join } from 'path';
import { notifyAdminUserRegistered } from './notifications';

// Защита от двойного нажатия на бонус (race condition)
const bonusClaimInProgress = new Set<string>();

async function getBonusStatus(telegramId: string) {
  try {
    const user = await storage.getBotUserByTelegramId(telegramId);
    if (!user) {
      return { available: false, timeLeft: 'Пользователь не найден' };
    }

    const lastClaimRaw = user.lastBonusClaim ? Number(user.lastBonusClaim) : 0;
    const lastClaim = Number.isFinite(lastClaimRaw) ? lastClaimRaw : 0;
    const now = Date.now();
    const timeSinceLastClaim = now - lastClaim;

    if (timeSinceLastClaim >= BONUS_COOLDOWN) {
      return { available: true, timeLeft: '' };
    }

    const timeLeft = BONUS_COOLDOWN - timeSinceLastClaim;
    const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000));
    const minutesLeft = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

    return {
      available: false,
      timeLeft: `${hoursLeft}ч ${minutesLeft}м`
    };
  } catch (error) {
    log(`Error getting bonus status: ${error}`);
    return { available: false, timeLeft: 'Ошибка' };
  }
}

// Handle bonus claim — защита от двойного нажатия через in-memory lock
async function handleBonusClaim(telegramId: string, chatId: number) {
  // Если уже обрабатывается запрос от этого пользователя — молча игнорируем
  if (bonusClaimInProgress.has(telegramId)) {
    return;
  }
  bonusClaimInProgress.add(telegramId);

  try {
    // Перечитываем свежие данные из БД уже под блокировкой
    const bonusStatus = await getBonusStatus(telegramId);

    if (!bonusStatus.available) {
      await bot.sendMessage(chatId,
        `❌ Бонус недоступен!\n\n` +
        `⏰ Осталось ждать: ${bonusStatus.timeLeft}\n` +
        `Следующий бонус: ${BONUS_AMOUNT} хамяфков`
      );
      return;
    }

    const user = await storage.getBotUserByTelegramId(telegramId);
    if (!user) {
      await bot.sendMessage(chatId, 'Ошибка: пользователь не найден');
      return;
    }

    // Повторная проверка cooldown сразу перед записью (защита от race condition)
    const lastClaimRaw = user.lastBonusClaim ? Number(user.lastBonusClaim) : 0;
    const lastClaim = Number.isFinite(lastClaimRaw) ? lastClaimRaw : 0;
    if (Date.now() - lastClaim < BONUS_COOLDOWN) {
      const timeLeft = BONUS_COOLDOWN - (Date.now() - lastClaim);
      const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000));
      const minutesLeft = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
      await bot.sendMessage(chatId,
        `❌ Бонус недоступен!\n\n` +
        `⏰ Осталось ждать: ${hoursLeft}ч ${minutesLeft}м\n` +
        `Следующий бонус: ${BONUS_AMOUNT} хамяфков`
      );
      return;
    }

    const currentHamsters = safeParseInt(user.hamsters);
    const newBalance = currentHamsters + BONUS_AMOUNT;
    const now = Date.now();

    await storage.updateBotUser(user.id, {
      hamsters: newBalance.toString(),
      lastBonusClaim: now.toString()
    });

    await bot.sendMessage(chatId,
      `🎉 БОНУС ПОЛУЧЕН! 🎉\n\n` +
      `Получено: ${BONUS_AMOUNT} хамяфков\n` +
      `💵 Новый баланс: ${newBalance} хамяфков\n\n` +
      `⏰ Следующий бонус через 12 часов!`
    );

    log(`User ${user.nickname} claimed bonus: ${BONUS_AMOUNT} hamsters, new balance: ${newBalance}`);

  } catch (error) {
    log(`Error claiming bonus: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при получении бонуса. Попробуйте позже.');
  } finally {
    bonusClaimInProgress.delete(telegramId);
  }
}
async function showRegistrationChoice(chatId: number) {
  const telegramId = chatId.toString();
  const userAccounts = await storage.getBotUsersByTelegramId(telegramId);
  const registeredCount = userAccounts.filter(acc => acc.isRegistered).length;

  let welcomeText = `Добро пожаловать в наш бот!

Выберите действие:`;

  if (registeredCount >= 3) {
    welcomeText += `\n\nУ вас уже есть максимальное количество аккаунтов (3)`;
  }

  const buttons = [];

  buttons.push([{ text: 'Создать аккаунт', callback_data: 'register_new' }]);

  const keyboard = {
    inline_keyboard: buttons
  };

  await bot.sendMessage(chatId, welcomeText, { reply_markup: keyboard });
}

async function startNewRegistration(chatId: number) {
  const welcomeText = `Создание нового аккаунта

Пожалуйста, введите желаемый никнейм:
• Минимум 3 символа
• Максимум 20 символов
• Русские/английские буквы, цифры и _`;

  await bot.sendMessage(chatId, welcomeText);
}

async function handleNicknameInput(chatId: number, user: BotUser, nickname: string) {
  // Validate nickname
  if (nickname.length < 3) {
    await bot.sendMessage(chatId, 'Никнейм должен содержать минимум 3 символа. Попробуйте еще раз:');
    return;
  }

  if (nickname.length > 20) {
    await bot.sendMessage(chatId, 'Никнейм не должен превышать 20 символов. Попробуйте еще раз:');
    return;
  }

  // Updated regex to support Russian and English letters, numbers, and underscore
  if (!/^[a-zA-Zа-яА-Я0-9_]+$/.test(nickname)) {
    await bot.sendMessage(chatId, 'Никнейм может содержать только русские, латинские буквы, цифры и знак подчеркивания. Попробуйте еще раз:');
    return;
  }

  // Check if nickname is unique
  const existingUser = await storage.getBotUserByNickname(nickname);
  if (existingUser) {
    await bot.sendMessage(chatId, 'Этот никнейм уже занят. Выберите другой:');
    return;
  }

  // Update user with nickname and mark as registered
  await storage.updateBotUser(user.id, {
    nickname,
    isRegistered: true,
    registrationStep: 'none'
  });

  // Check if user was referred and give bonus
  if (user.referredBy) {
    try {
      const referrer = await storage.getBotUser(user.referredBy);
      if (referrer) {
        const REFERRAL_BONUS = 15000;
        // Give bonus to referrer
        const updatedReferrer = await storage.addHamsters(referrer.id, REFERRAL_BONUS);
        if (updatedReferrer) {
          await bot.sendMessage(referrer.telegramId,
            `🎉 У вас новый реферал!\n\n` +
            `Пользователь: ${nickname}\n` +
            `Вы получили: ${REFERRAL_BONUS} хамяфков!\n` +
            `💵 Ваш баланс: ${updatedReferrer.hamsters || '0'}`
          );
        }

        // Notify admin
        if (referrer) {
          await notifyAdminReferralBonus(referrer, user);
        }
      }
    } catch (error) {
      log(`Error processing referral bonus: ${error}`);
    }
  }

  await bot.sendMessage(chatId, `✅ Аккаунт создан!

Никнейм: ${nickname}

Добро пожаловать в эконому хамяфков! 🐹`);

  // Show main menu
  setTimeout(() => showMainMenu(chatId, nickname), 1500);
}

async function handlePasswordInput(chatId: number, user: BotUser, password: string) {
  // Validate password
  if (password.length < 6) {
    await bot.sendMessage(chatId, 'Пароль должен содержать минимум 6 символов. Попробуйте еще раз:');
    return;
  }

  if (password.length > 50) {
    await bot.sendMessage(chatId, 'Пароль не должен превышать 50 символов. Попробуйте еще раз:');
    return;
  }

  // Complete registration immediately after password
  await storage.updateBotUser(user.id, {
    password: password,
    registrationStep: 'none',
    isRegistered: true
  });

  // Notify admin about new registration
  await notifyAdminUserRegistered(user.nickname, user.telegramId, user.referredBy);

  await bot.sendMessage(chatId, `🎉 Регистрация завершена!

Добро пожаловать в наш бот!

Ваши данные:
• Никнейм: ${user.nickname}
• Пароль: установлен

Теперь вы можете пользоваться всеми функциями бота!`);

  // Show main menu
  setTimeout(() => showMainMenu(chatId, user.nickname), 2000);
}

async function handlePasswordConfirmation(chatId: number, user: BotUser, confirmation: string) {
  if (confirmation.toLowerCase() === 'да' || confirmation.toLowerCase() === 'yes') {
    // Complete registration immediately after password confirmation
    await storage.updateBotUser(user.id, {
      registrationStep: 'none',
      isRegistered: true
    });

    // Notify admin about new registration
    await notifyAdminUserRegistered(user.nickname, user.telegramId, user.referredBy);

    await bot.sendMessage(chatId, `🎉 Регистрация завершена!

Добро пожаловать в наш бот!

Ваши данные:
• Никнейм: ${user.nickname}
• Пароль: подтвержден

Теперь вы можете пользоваться всеми функциями бота!`);

    // Show main menu
    setTimeout(() => showMainMenu(chatId, user.nickname), 2000);
  } else {
    // Reject password, ask for new one
    await storage.updateBotUser(user.id, {
      password: null,
      registrationStep: 'awaiting_password'
    });

    await bot.sendMessage(chatId, `Пароль отклонен.

Введите новый пароль для вашего аккаунта.
Пароль должен содержать минимум 6 символов:`);
  }
}

async function showMainMenu(chatId: number, nickname: string) {
  const menuText = `Добро пожаловать, ${nickname}!`;

  const keyboard = {
    keyboard: [
      [{ text: 'Клан' }],
      [{ text: 'Зарабатывать' }, { text: 'Рекламировать' }],
      [{ text: 'Профиль' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };

  await bot.sendMessage(chatId, menuText, { reply_markup: keyboard });
}

async function showProfile(chatId: number, user: BotUser) {
  const hamsters = user.hamsters || '0';

  // Check if bonus is available
  const bonusStatus = await getBonusStatus(user.telegramId);

  let profileText = `Профиль\n\n`;
  profileText += `Никнейм: ${user.nickname}\n`;
  profileText += `ID: ${user.telegramId}\n`;
  profileText += `Хамяфки: ${user.hamsters || '0'}\n`;
  profileText += `Личная армия: ${user.armyHamsters || '0'}\n`;
  profileText += `\n`;

  const keyboard = {
    inline_keyboard: [
      [{ text: 'Дополнительно', callback_data: 'additional_menu' }],
      [{ text: 'Магазин армии', callback_data: 'personal_army_shop' }],
      [{ text: bonusStatus.available ? 'Бонус (2500)' : `Бонус (${bonusStatus.timeLeft})`, callback_data: 'claim_bonus' }],
      [{ text: 'Донат', callback_data: 'donate_menu' }]
    ]
  };

  await bot.sendMessage(chatId, profileText, { reply_markup: keyboard });
}

async function showAdditionalMenu(chatId: number) {
  const telegramId = chatId.toString();
  const userAccounts = await storage.getBotUsersByTelegramId(telegramId);
  const registeredCount = userAccounts.filter(acc => acc.isRegistered).length;

  const menuText = `Дополнительные настройки

Выберите что хотите изменить:`;

  const buttons = [
    [{ text: 'Изменить никнейм', callback_data: 'change_nickname' }],
    [{ text: 'Управление заданиями', callback_data: 'manage_my_tasks' }],
    [{ text: 'Команды', callback_data: 'show_commands' }],
    [{ text: 'Реф ссылка', callback_data: 'referral_link' }],
    [{ text: 'Поддержка', url: 'https://t.me/cat10010' }],
    [{ text: 'Назад к профилю', callback_data: 'back_to_profile' }]
  ];

  const keyboard = {
    inline_keyboard: buttons
  };

  await bot.sendMessage(chatId, menuText, { reply_markup: keyboard });
}

async function startNicknameChange(chatId: number, user: BotUser) {
  await storage.updateBotUser(user.id, {
    registrationStep: 'changing_nickname'
  });

  await bot.sendMessage(chatId, `Текущий никнейм: ${user.nickname}

Введите новый никнейм:
• Минимум 3 символа
• Максимум 20 символов
• Русские/английские буквы, цифры и _`);
}

async function handleNicknameChange(chatId: number, user: BotUser, newNickname: string) {
  // Validate nickname (same validation as registration)
  if (newNickname.length < 3) {
    await bot.sendMessage(chatId, 'Никнейм должен содержать минимум 3 символа. Попробуйте еще раз:');
    return;
  }

  if (newNickname.length > 20) {
    await bot.sendMessage(chatId, 'Никнейм не должен превышать 20 символов. Попробуйте еще раз:');
    return;
  }

  if (!/^[a-zA-Zа-яА-Я0-9_]+$/.test(newNickname)) {
    await bot.sendMessage(chatId, 'Никнейм может содержать только русские, латинские буквы, цифры и знак подчеркивания. Попробуйте еще раз:');
    return;
  }

  // Check if nickname is unique (excluding current user)
  const existingUser = await storage.getBotUserByNickname(newNickname);
  if (existingUser && existingUser.id !== user.id) {
    await bot.sendMessage(chatId, 'Этот никнейм уже занят. Выберите другой:');
    return;
  }

  // Update nickname
  await storage.updateBotUser(user.id, {
    nickname: newNickname,
    registrationStep: 'none'
  });

  // Notify admin about nickname change
  await notifyAdminNicknameChange(user, newNickname);

  await bot.sendMessage(chatId, `Никнейм успешно изменен!

Старый: ${user.nickname}
Новый: ${newNickname}`);

  // Show updated profile
  setTimeout(() => showProfile(chatId, { ...user, nickname: newNickname }), 1000);
}

async function startPasswordChange(chatId: number, user: BotUser) {
  await storage.updateBotUser(user.id, {
    registrationStep: 'changing_password'
  });

  await bot.sendMessage(chatId, `Изменение пароля

Введите новый пароль:
• Минимум 6 символов
• Максимум 50 символов`);
}

async function handlePasswordChange(chatId: number, user: BotUser, newPassword: string) {
  // Validate password
  if (newPassword.length < 6) {
    await bot.sendMessage(chatId, 'Пароль должен содержать минимум 6 символов. Попробуйте еще раз:');
    return;
  }

  if (newPassword.length > 50) {
    await bot.sendMessage(chatId, 'Пароль не должен превышать 50 символов. Попробуйте еще раз:');
    return;
  }

  // Update password
  await storage.updateBotUser(user.id, {
    password: newPassword,
    registrationStep: 'none'
  });

  await bot.sendMessage(chatId, `Пароль успешно изменен!

Новый пароль сохранен в системе.`);

  // Show profile
  setTimeout(() => showProfile(chatId, user), 1000);
}

async function requestContact(chatId: number) {
  const requestText = `Поделиться контактом

Чтобы поделиться вашим номером телефона, нажмите кнопку ниже:`;

  const keyboard = {
    keyboard: [
      [{ text: 'Поделиться контактом', request_contact: true }]
    ],
    one_time_keyboard: true,
    resize_keyboard: true
  };

  await bot.sendMessage(chatId, requestText, { reply_markup: keyboard });
}

// Contact sharing removed from registration process

// Delete account functions
async function confirmDeleteAccount(chatId: number, user: BotUser) {
  const confirmText = `Удаление аккаунта

Вы уверены, что хотите удалить свой аккаунт?
Все данные будут безвозвратно утеряны.

Никнейм: ${user.nickname}
ID: ${user.telegramId}`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: 'Да, удалить', callback_data: 'confirm_delete' },
        { text: 'Отменить', callback_data: 'cancel_delete' }
      ]
    ]
  };

  await bot.sendMessage(chatId, confirmText, { reply_markup: keyboard });
}

async function deleteAccount(chatId: number, user: BotUser) {
  try {
    // Delete user from storage
    const deleted = await storage.deleteBotUser(user.id);

    if (deleted) {
      // Notify admin about account deletion
      await notifyAdminAccountDeletion(user);

      await bot.sendMessage(chatId, `Аккаунт успешно удален.

Никнейм "${user.nickname}" освобожден.
Для создания нового аккаунта используйте /start`);
    } else {
      await bot.sendMessage(chatId, 'Произошла ошибка при удалении аккаунта.');
    }
  } catch (error: any) {
    log(`Error deleting account: ${error}`);
    await notifyAdminError('Ошибка при удалении аккаунта', error.toString(), user.telegramId);
    await bot.sendMessage(chatId, 'Произошла ошибка при удалении аккаунта.');
  }
}

// Login functions
async function startLogin(chatId: number) {
  const loginText = `Вход в аккаунт

Введите ваш никнейм:`;

  // Update user step
  const telegramId = chatId.toString();
  const user = await storage.getBotUserByTelegramId(telegramId);
  if (user) {
    await storage.updateBotUser(user.id, { registrationStep: 'login_nickname' });
  }

  await bot.sendMessage(chatId, loginText);
}

async function handleLoginNickname(chatId: number, user: BotUser, nickname: string) {
  // Find user by nickname
  const targetUser = await storage.getBotUserByNickname(nickname);

  if (!targetUser) {
    await bot.sendMessage(chatId, 'Пользователь с таким никнеймом не найден. Попробуйте еще раз:');
    return;
  }

  if (!targetUser.isRegistered || !targetUser.password) {
    await bot.sendMessage(chatId, 'Этот аккаунт не завершил регистрацию. Попробуйте другой никнейм:');
    return;
  }

  // Store target user ID temporarily
  await storage.updateBotUser(user.id, {
    registrationStep: 'login_password',
    // Store target user ID in a temporary field (we'll add this to schema if needed)
    password: targetUser.id // temporary storage
  });

  await bot.sendMessage(chatId, `Никнейм найден: ${nickname}

Введите пароль:`);
}

async function handleLoginPassword(chatId: number, user: BotUser, password: string) {
  try {
    // Get target user ID from temporary storage
    const targetUserId = user.password; // temporary storage
    const targetUser = await storage.getBotUser(targetUserId || '');

    if (!targetUser || targetUser.password !== password) {
      await bot.sendMessage(chatId, 'Неверный пароль. Попробуйте еще раз:');
      return;
    }

    // Reset current user registration step
    await storage.updateBotUser(user.id, {
      registrationStep: 'none'
    });

    await bot.sendMessage(chatId, `Успешный вход в аккаунт!

Добро пожаловать, ${targetUser.nickname}!`);

    // Show main menu
    setTimeout(() => showMainMenu(chatId, targetUser.nickname), 1000);
  } catch (error) {
    log(`Error during login: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при входе в аккаунт.');
  }
}

// Account switching functions
async function showAccountSwitcher(chatId: number, telegramId: string) {
  try {
    const userAccounts = await storage.getBotUsersByTelegramId(telegramId);
    const registeredAccounts = userAccounts.filter(acc => acc.isRegistered);

    if (registeredAccounts.length <= 1) {
      await bot.sendMessage(chatId, 'У вас только один зарегистрированный аккаунт. Создайте дополнительные аккаунты для переключения.');
      return;
    }

    const switchText = `Переключение аккаунта

Выберите аккаунт для входа:`;

    const keyboard = {
      inline_keyboard: [
        ...registeredAccounts.map(account => [
          { text: `${account.nickname}`, callback_data: `switch_to_${account.id}` }
        ]),
        [{ text: 'Назад', callback_data: 'additional_menu' }]
      ]
    };

    await bot.sendMessage(chatId, switchText, { reply_markup: keyboard });
  } catch (error) {
    log(`Error showing account switcher: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при получении списка аккаунтов.');
  }
}

async function switchToAccount(chatId: number, telegramId: string, accountId: string) {
  try {
    const targetAccount = await storage.getBotUser(accountId);

    if (!targetAccount || targetAccount.telegramId !== telegramId || !targetAccount.isRegistered) {
      await bot.sendMessage(chatId, 'Аккаунт не найден или недоступен для переключения.');
      return;
    }

    await bot.sendMessage(chatId, `Переключение на аккаунт "${targetAccount.nickname}"!`);

    // Show main menu for switched account
    setTimeout(() => showMainMenu(chatId, targetAccount.nickname), 1000);
  } catch (error) {
    log(`Error switching accounts: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при переключении аккаунта.');
  }
}

async function handleDonateStars(chatId: number, callbackData: string) {
  let starsAmount = '';
  let hamsters = '';

  if (callbackData === 'donate_15_stars') {
    starsAmount = '15';
    hamsters = '60,000';
  } else if (callbackData === 'donate_25_stars') {
    starsAmount = '25';
    hamsters = '120,000';
  } else if (callbackData === 'donate_50_stars') {
    starsAmount = '50';
    hamsters = '180,000';
  }

  const donateInstructions = `Пожертвование ${starsAmount} звёзд

Вы выбрали: ${starsAmount} звёзд = ${hamsters} хамяфков

Инструкция по оплате:

1. Перейдите в личные сообщения с @pusikOG
2. Отправьте ${starsAmount} звёзд администратору
3. Обязательно напишите ваш никнейм в боте
4. Дождитесь подтверждения и получения хамяфков

ВАЖНО:
• Указывайте точный никнейм из профиля бота
• Не забудьте написать администратору после отправки звёзд
• Хамяфки будут зачислены после проверки платежа

Спасибо за поддержку проекта!`;

  const keyboard = {
    inline_keyboard: [
      [{ text: 'Написать @pusikOG', url: 'https://t.me/pusikOG' }],
      [{ text: 'Назад к вариантам', callback_data: 'donate_menu' }],
      [{ text: 'В профиль', callback_data: 'back_to_profile' }]
    ]
  };

  await bot.sendMessage(chatId, donateInstructions, { reply_markup: keyboard });
}

async function showDonateMenu(chatId: number) {
  const donateText = `Пожертвования звёздами

Поддержите проект и получите хамяфки!

Выберите сумму пожертвования:

15 звёзд = 60,000 хамяфков
25 звёзд = 120,000 хамяфков
50 звёзд = 180,000 хамяфков

Как донатить:
1. Выберите нужную сумму ниже
2. Отправьте звёзды администратору @pusikOG
3. Администратор выдаст вам хамяфки

Важно: После отправки звёзд напишите администратору ваш никнейм в боте для получения хамяфков!`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '15 звёзд (60k хамяфков)', callback_data: 'donate_15_stars' }],
      [{ text: '25 звёзд (120k хамяфков)', callback_data: 'donate_25_stars' }],
      [{ text: '50 звёзд (180k хамяфков)', callback_data: 'donate_50_stars' }],
      [{ text: 'Связаться с @pusikOG', url: 'https://t.me/pusikOG' }],
      [{ text: 'Назад к профилю', callback_data: 'back_to_profile' }]
    ]
  };

  await bot.sendMessage(chatId, donateText, { reply_markup: keyboard });
}

async function showReferralLink(chatId: number, user: BotUser) {
  try {
    let referralCode = user.referralCode;

    // Generate referral code if user doesn't have one
    if (!referralCode) {
      referralCode = await storage.generateReferralCode(user.id);
      if (!referralCode) {
        await bot.sendMessage(chatId, 'Произошла ошибка при создании реферальной ссылки.');
        return;
      }
    }

    const botUsername = (await bot.getMe()).username;
    const referralLink = `https://t.me/${botUsername}?start=${referralCode}`;

    const referralText = `Ваша реферальная ссылка

Приглашайте друзей и получайте 15000 хамяфков за каждого зарегистрированного пользователя!

Ваша ссылка:
${referralLink}`;

    const keyboard = {
      inline_keyboard: [
        [{ text: 'Назад к дополнительным настройкам', callback_data: 'additional_menu' }]
      ]
    };

    await bot.sendMessage(chatId, referralText, { reply_markup: keyboard });
  } catch (error) {
    log(`Error showing referral link: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при получении реферальной ссылки.');
  }
}

// Helper functions for contact handling
async function saveContactToFile(user: BotUser, contact: any) {
  try {
    const contactsDir = join(process.cwd(), 'data');
    const contactsFile = join(contactsDir, 'contacts.json');

    // Ensure directory exists
    await fs.mkdir(contactsDir, { recursive: true });

    // Read existing contacts
    let contacts = [];
    try {
      const data = await fs.readFile(contactsFile, 'utf-8');
      contacts = JSON.parse(data);
    } catch (error) {
      // File doesn't exist, start with empty array
    }

    // Add new contact
    const contactData = {
      userId: user.id,
      telegramId: user.telegramId,
      nickname: user.nickname,
      phoneNumber: contact.phone_number,
      firstName: contact.first_name,
      lastName: contact.last_name || '',
      username: user.username,
      registrationDate: new Date().toISOString()
    };

    contacts.push(contactData);

    // Save contacts
    await fs.writeFile(contactsFile, JSON.stringify(contacts, null, 2), 'utf-8');
    log(`Contact saved for user ${user.nickname}: ${contact.phone_number}`);
  } catch (error) {
    log(`Error saving contact to file: ${error}`);
  }
}

async function notifyAdmin(user: BotUser, contact: any) {
  try {
    const adminMessage = `Новая регистрация в боте!

Никнейм: ${user.nickname}
Telegram ID: ${user.telegramId}
Номер телефона: ${contact.phone_number}
Имя: ${contact.first_name} ${contact.last_name || ''}
Username: ${user.username ? '@' + user.username : 'Не указан'}
Дата: ${new Date().toLocaleString('ru-RU')}`;

    await notifyAllAdmins(adminMessage);
    log(`Admin notification sent for new user: ${user.nickname}`);
  } catch (error) {
    log(`Error sending admin notification: ${error}`);
  }
}

async function notifyAdminNewUser(user: BotUser) {
  try {
    const adminMessage = `Новая регистрация в боте!

Никнейм: ${user.nickname}
Telegram ID: ${user.telegramId}
Имя: ${user.firstName} ${user.lastName || ''}
Username: ${user.username ? '@' + user.username : 'Не указан'}
Дата: ${new Date().toLocaleString('ru-RU')}`;

    await notifyAllAdmins(adminMessage);
    log(`Admin notification sent for new user: ${user.nickname}`);
  } catch (error) {
    log(`Error sending admin new user notification: ${error}`);
  }
}

async function notifyAdminAccountDeletion(user: BotUser) {
  try {
    const adminMessage = `Удаление аккаунта!

Никнейм: ${user.nickname}
Telegram ID: ${user.telegramId}
Номер телефона: ${user.phoneNumber || 'Не указан'}
Имя: ${user.firstName} ${user.lastName || ''}
Username: ${user.username ? '@' + user.username : 'Не указан'}
Дата удаления: ${new Date().toLocaleString('ru-RU')}`;

    await notifyAllAdmins(adminMessage);
    log(`Admin notification sent for account deletion: ${user.nickname}`);
  } catch (error) {
    log(`Error sending admin account deletion notification: ${error}`);
  }
}

async function notifyAdminNicknameChange(user: BotUser, newNickname: string) {
  try {
    const adminMessage = `Изменение никнейма!

Telegram ID: ${user.telegramId}
Старый никнейм: ${user.nickname}
Новый никнейм: ${newNickname}
Имя: ${user.firstName} ${user.lastName || ''}
Username: ${user.username ? '@' + user.username : 'Не указан'}
Дата изменения: ${new Date().toLocaleString('ru-RU')}`;

    await notifyAllAdmins(adminMessage);
    log(`Admin notification sent for nickname change: ${user.nickname} -> ${newNickname}`);
  } catch (error) {
    log(`Error sending admin nickname change notification: ${error}`);
  }
}

async function notifyAdminContactChange(user: BotUser, contact: any) {
  try {
    const adminMessage = `Изменение контакта!

Никнейм: ${user.nickname}
Telegram ID: ${user.telegramId}
Старый номер: ${user.phoneNumber || 'Не указан'}
Новый номер: ${contact.phone_number}
Имя в контакте: ${contact.first_name} ${contact.last_name || ''}
Username: ${user.username ? '@' + user.username : 'Не указан'}
Дата изменения: ${new Date().toLocaleString('ru-RU')}`;

    await notifyAllAdmins(adminMessage);
    log(`Admin notification sent for contact change: ${user.nickname}`);
  } catch (error) {
    log(`Error sending admin contact change notification: ${error}`);
  }
}

async function notifyAdminError(operation: string, errorMessage: string, telegramId: string = 'Неизвестен') {
  try {
    const adminMessage = `Ошибка в боте!

Операция: ${operation}
Telegram ID: ${telegramId}
Ошибка: ${errorMessage}
Дата: ${new Date().toLocaleString('ru-RU')}`;

    for (const adminId of ADMIN_IDS) {
      await bot.sendMessage(adminId, adminMessage).catch(() => {});
    }
    log(`Admin error notification sent: ${operation}`);
  } catch (error) {
    log(`Error sending admin error notification: ${error}`);
  }
}

// Функция для отправки обычных уведомлений администратору о событиях
async function notifyAdminReferralBonus(referrer: BotUser, newUser: BotUser) {
  try {
    const adminMessage = `Реферальный бонус выдан!

Пригласивший: ${referrer.nickname} (${referrer.telegramId})
Новый пользователь: ${newUser.nickname} (${newUser.telegramId})
Бонус: 15000 хамяфков
Дата: ${new Date().toLocaleString('ru-RU')}`;

    await notifyAllAdmins(adminMessage);
    log(`Admin referral bonus notification sent: ${referrer.nickname} -> ${newUser.nickname}`);
  } catch (error) {
    log(`Error sending admin referral bonus notification: ${error}`);
  }
}


export {
  getBonusStatus, handleBonusClaim, showRegistrationChoice, startNewRegistration,
  handleNicknameInput, handlePasswordInput, handlePasswordConfirmation,
  showMainMenu, showProfile, showAdditionalMenu,
  startNicknameChange, handleNicknameChange, startPasswordChange, handlePasswordChange,
  requestContact, confirmDeleteAccount, deleteAccount,
  startLogin, handleLoginNickname, handleLoginPassword,
  showAccountSwitcher, switchToAccount, handleDonateStars, showDonateMenu,
  showReferralLink, saveContactToFile, notifyAdmin, notifyAdminNewUser,
  notifyAdminAccountDeletion, notifyAdminNicknameChange, notifyAdminContactChange,
  notifyAdminError, notifyAdminReferralBonus
};

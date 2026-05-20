import { bot, botConfig, ADMIN_IDS, safeParseInt, notifyAllAdmins } from './bot-shared';
import { storage } from './storage';
import { log } from './vite';
import type { BotUser } from '@shared/schema';
import { notifyAdminClanCreated, notifyAdminClanDeleted } from './notifications';

async function showCommands(chatId: number, user: BotUser) {
  const commandsText = `📋 Команды бота

🏠 Основные команды:
• /start - Запуск бота
• /menu - Главное меню

💰 Команды в чатах:
• х - Проверить баланс
• х [сумма] (в ответ на сообщение) - Перевести хамяфки
• х к [сумма] - Поставить на красное в рулетке
• х ч [сумма] - Поставить на черное в рулетке  
• х го - Запустить рулетку

🛡️ Модерация (владельцы чатов и админы):
• х отключить рекламу - Удалять все ссылки (кроме админов)
• х включить рекламу - Разрешить всем отправлять ссылки
• х мут [время] [причина] (в ответ) - Заглушить пользователя
• х снять мут (в ответ) - Снять мут с пользователя
•х размут (в ответ) - Снять мут с пользователя
• х бан (в ответ) - Заблокировать пользователя в чате (только владелец)
• х розбан / х разбан (в ответ) - Разблокировать пользователя в чате (только владелец)
• х назначить админа (в ответ) - Назначить администратора (только владелец)
• х снять админа (в ответ) - Снять администратора (только владелец)
• х кто админ - Показать список администраторов чата
• х кто я - Показать информацию о себе и своей роли в чате

🎯 Пользовательские роли (только владелец):
• х создать [название] - Создать пользовательскую роль
• х настроить роль [название] - Настроить права доступа роли
• х назначить [роль] (в ответ) - Назначить роль пользователю
• х удалить роль [название] - Удалить пользовательскую роль

👑 Управление создателем (только владелец):
• х скрыть создателя - Скрыть создателя из списка админов
• х показать создателя - Показать создателя в списке админов
• х фейк создатель (в ответ) - Назначить пользователя фейковым создателем

Пожертвование армии клану:
• [количество] - Пожертвование армии хамяков клану

ℹ️ Примечания:
• Рулетка работает только в групповых чатах
• Переводы работают только при ответе на сообщение
• Модерация удаляет ссылки и рекламу от обычных пользователей
• Владельцы, администраторы чатов и админ бота освобождены от модерации
• Мут блокирует все сообщения пользователя и удаляет их автоматически
• Мут автоматически снимается по истечении времени
• Команды "х снять мут" и "х размут" позволяют снять мут досрочно
• Бан полностью исключает пользователя из чата (только владелец)
• Разбан возможен только для владельца чата
• Примеры времени для мута: "30 минут", "2 часа", "1 день", "1 неделя"`;

  await bot.sendMessage(chatId, commandsText);
}

async function showSupportContact(chatId: number) {
  const supportText = `📞 Техническая поддержка

Если у вас возникли вопросы или проблемы с ботом, обратитесь к администратору:

👤 @pusikOG

Мы поможем вам решить любые вопросы!`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '👤 Связаться с поддержкой', url: 'https://t.me/pusikOG' }],
      [{ text: 'Назад к дополнительным настройкам', callback_data: 'additional_menu' }]
    ]
  };

  await bot.sendMessage(chatId, supportText, { reply_markup: keyboard });
}

// Clan system functions
async function showClanMenu(chatId: number, user: BotUser) {
  try {
    const userClan = await storage.getUserClan(user.id);

    if (userClan) {
      // Пользователь уже в клане
      const menuText = `Система кланов

Вы состоите в клане "${userClan.name}"`;

      const keyboard = {
        inline_keyboard: [
          [{ text: 'Мой клан', callback_data: 'my_clan' }],
          [{ text: 'Статистика кланов', callback_data: 'clan_stats' }],
          [{ text: 'Пожертвовать армию', callback_data: 'clan_shop' }],
          [{ text: '↩️ Назад в главное меню', callback_data: 'back_to_main' }]
        ]
      };

      await bot.sendMessage(chatId, menuText, { reply_markup: keyboard });
    } else {
      // Пользователь не в клане
      const menuText = `Система кланов

Выберите что вам нужно:`;

      const keyboard = {
        inline_keyboard: [
          [{ text: '➕ Создать клан', callback_data: 'create_clan' }],
          [{ text: '🔍 Присоединиться к клану', callback_data: 'join_clan' }],
          [{ text: '📊 Статистика кланов', callback_data: 'clan_stats' }],
          [{ text: '↩️ Назад в главное меню', callback_data: 'back_to_main' }]
        ]
      };

      await bot.sendMessage(chatId, menuText, { reply_markup: keyboard });
    }
  } catch (error) {
    log(`Error showing clan menu: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при загрузке меню кланов.');
  }
}

async function startClanCreation(chatId: number, user: BotUser) {
  try {
    const userBalance = safeParseInt(user.hamsters);
    const clanCost = 100000; // 100к хамяфков

    if (userBalance < clanCost) {
      await bot.sendMessage(chatId, 
        `Недостаточно средств для создания клана!\n\n` +
        `Требуется: ${clanCost} хамяфков\n` +
        `Ваш баланс: ${userBalance} хамяфков\n` +
        `Не хватает: ${clanCost - userBalance} хамяфков`
      );
      return;
    }

    await storage.updateBotUser(user.id, {
      registrationStep: 'creating_clan_name'
    });

    await bot.sendMessage(chatId, 
      `Создание клана\n\n` +
      `Стоимость создания: ${clanCost} хамяфков\n\n` +
      `Придумайте название для вашего клана:\n` +
      `• Минимум 3 символа\n` +
      `• Максимум 30 символов\n` +
      `• Русские/английские буквы, цифры и пробелы`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '❌ Отмена', callback_data: 'cancel_clan_creation' }
          ]]
        }
      }
    );
  } catch (error) {
    log(`Error starting clan creation: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при создании клана.');
  }
}

async function handleClanNameInput(chatId: number, user: BotUser, name: string) {
  try {
    // Валидация названия клана
    if (name.length < 3) {
      await bot.sendMessage(chatId, 'Название клана должно содержать минимум 3 символа. Попробуйте еще раз:');
      return;
    }

    if (name.length > 30) {
      await bot.sendMessage(chatId, 'Название клана не должно превышать 30 символов. Попробуйте еще раз:');
      return;
    }

    if (!/^[a-zA-Zа-яА-Я0-9\s]+$/.test(name)) {
      await bot.sendMessage(chatId, 'Название клана может содержать только русские, латинские буквы, цифры и пробелы. Попробуйте еще раз:');
      return;
    }

    // Проверяем уникальность названия
    const existingClan = await storage.getClanByName(name);
    if (existingClan) {
      await bot.sendMessage(chatId, 'Клан с таким названием уже существует. Выберите другое название:');
      return;
    }

    const clanCost = 100000;
    const userBalance = safeParseInt(user.hamsters);

    if (userBalance < clanCost) {
      await bot.sendMessage(chatId, 'Недостаточно средств для создания клана.');
      await showClanMenu(chatId, user);
      return;
    }

    // Списываем средства
    await storage.addHamsters(user.id, -clanCost);

    // Создаем клан
    const newClan = await storage.createClan({
      name: name,
      ownerId: user.id,
      treasury: '0',
      maxMembers: '10'
    });

    // Добавляем создателя в клан
    await storage.createClanMembership({
      clanId: newClan.id,
      userId: user.id
    });

    // Сбрасываем шаг регистрации
    await storage.updateBotUser(user.id, {
      registrationStep: 'none'
    });

    const newBalance = userBalance - clanCost;

    await bot.sendMessage(chatId, 
      `Клан "${name}" успешно создан!\n\n` +
      `Владелец: ${user.nickname}\n` +
      `Участников: 1\n` +
      `Максимум участников: 10\n` +
      `Казна: 0 хамяфков` +
      `\nСписано с баланса: ${clanCost} хамяфков\n` +
      `Ваш баланс: ${newBalance} хамяфков`
    );

    // Показываем информацию о клане
    setTimeout(() => showMyClan(chatId, user), 2000);
  } catch (error) {
    log(`Error handling clan name input: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при создании клана.');
  }
}

async function showJoinClanMenu(chatId: number, user: BotUser) {
  try {
    await bot.sendMessage(chatId, `Вступление в клан\n\nВведите название клана, в который хотите вступить.`, {
      reply_markup: { force_reply: true }
    });
  } catch (error) {
    log(`Error showing join clan menu: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка.');
  }
}

async function showMyClan(chatId: number, user: BotUser) {
  try {
    const userClan = await storage.getUserClan(user.id);

    if (!userClan) {
      await bot.sendMessage(chatId, 'Вы не состоите в клане.');
      await showClanMenu(chatId, user);
      return;
    }

    const membersCount = await storage.getClanMembersCount(userClan.id);
    const isOwner = userClan.ownerId === user.id;
    const isDeputy = userClan.deputyId === user.id;
    const isAdmin = isOwner || isDeputy;

    const ownerUser = await storage.getBotUser(userClan.ownerId);
    const deputyUser = userClan.deputyId ? await storage.getBotUser(userClan.deputyId) : null;

    // Проверяем доступность кланового бонуса
    const clanBonusStatus = await getClanBonusStatus(user.telegramId);

    let clanText = `Клан "${userClan.name}"\n\n`;
    clanText += `Владелец: ${ownerUser?.nickname || 'Неизвестен'}\n`;
    if (deputyUser) {
      clanText += `Заместитель: ${deputyUser.nickname}\n`;
    }
    clanText += `Участников: ${membersCount}/${userClan.maxMembers}\n`;
    clanText += `Казна: ${userClan.treasury} хамяфков\n`;
    clanText += `Армия хамяков: ${userClan.armyHamsters || '0'}`;

    const buttons = [];

    // Кнопка кланового бонуса
    buttons.push([{
      text: clanBonusStatus.available ? 'Клановый бонус (1000)' : `Клановый бонус (${clanBonusStatus.timeLeft})`,
      callback_data: 'claim_clan_bonus'
    }]);

    // Кнопка пополнения казны
    buttons.push([{
      text: 'Пополнить казну',
      callback_data: 'add_to_treasury'
    }]);

    // Кнопка пожертвования армии для всех участников клана
    buttons.push([{
      text: 'Пожертвовать армию',
      callback_data: 'clan_shop'
    }]);

    // Админские кнопки (владелец и заместитель)
    if (isAdmin) {
      const pendingRequests = await storage.getClanJoinRequests(userClan.id);
      buttons.push([{
        text: pendingRequests.length > 0 ? `Запросы (${pendingRequests.length})` : 'Запросы',
        callback_data: `clan_requests_${userClan.id}`
      }]);

      // Удаление участника (владелец и заместитель)
      buttons.push([{
        text: 'Удалить участника',
        callback_data: `remove_member_${userClan.id}`
      }]);

      // Управление заместителем (только владелец)
      if (isOwner) {
        if (deputyUser) {
          buttons.push([{
            text: 'Снять заместителя',
            callback_data: `remove_deputy_${userClan.id}`
          }]);
        } else {
          buttons.push([{
            text: 'Назначить заместителя',
            callback_data: `set_deputy_${userClan.id}`
          }]);
        }

        buttons.push([{
          text: 'Удалить клан',
          callback_data: 'delete_clan'
        }]);
      } else if (isDeputy) {
        // Заместитель может выйти из клана
        buttons.push([{
          text: 'Выйти из клана',
          callback_data: 'leave_clan'
        }]);
      }
    } else {
      // Обычные участники могут выйти из клана
      buttons.push([{
        text: 'Выйти из клана',
        callback_data: 'leave_clan'
      }]);
    }

    buttons.push([{
      text: 'Назад к кланам',
      callback_data: 'back_to_clan'
    }]);

    const keyboard = { inline_keyboard: buttons };

    await bot.sendMessage(chatId, clanText, { reply_markup: keyboard });
  } catch (error) {
    log(`Error showing my clan: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при загрузке информации о клане.');
  }
}

async function confirmDeleteClan(chatId: number, user: BotUser) {
  try {
    const userClan = await storage.getUserClan(user.id);

    if (!userClan || userClan.ownerId !== user.id) {
      await bot.sendMessage(chatId, 'Вы не можете удалить этот клан.');
      return;
    }

    const confirmText = `Удаление клана\n\n` +
      `Вы уверены, что хотите удалить клан "${userClan.name}"?\n` +
      `Все данные клана будут безвозвратно утеряны.\n` +
      `Казна клана: ${userClan.treasury} хамяфков будет потеряна.`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: 'Да, удалить', callback_data: 'confirm_delete_clan' },
          { text: 'Отменить', callback_data: 'cancel_delete_clan' }
        ]
      ]
    };

    await bot.sendMessage(chatId, confirmText, { reply_markup: keyboard });
  } catch (error) {
    log(`Error confirming clan deletion: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка.');
  }
}

async function deleteClan(chatId: number, user: BotUser) {
  try {
    const userClan = await storage.getUserClan(user.id);

    if (!userClan || userClan.ownerId !== user.id) {
      await bot.sendMessage(chatId, 'Вы не можете удалить этот клан.');
      return;
    }

    // Удаляем клан
    const deleted = await storage.deleteClan(userClan.id);

    if (deleted) {
      await bot.sendMessage(chatId, `Клан "${userClan.name}" успешно удален.`);
      setTimeout(() => showClanMenu(chatId, user), 1000);
    } else {
      await bot.sendMessage(chatId, 'Произошла ошибка при удалении клана.');
    }
  } catch (error) {
    log(`Error deleting clan: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при удалении клана.');
  }
}

// Функция для проверки доступности кланового бонуса
async function getClanBonusStatus(telegramId: string) {
  try {
    const user = await storage.getBotUserByTelegramId(telegramId);
    if (!user) {
      return { available: false, timeLeft: 'Пользователь не найден' };
    }

    const lastClaim = user.lastClanBonusClaim ? parseInt(user.lastClanBonusClaim) : 0;
    const now = Date.now();
    const timeSinceLastClaim = now - lastClaim;
    const bonusCooldown = 12 * 60 * 60 * 1000; // 12 часов

    if (timeSinceLastClaim >= bonusCooldown) {
      return { available: true, timeLeft: '' };
    }

    const timeLeft = bonusCooldown - timeSinceLastClaim;
    const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000));
    const minutesLeft = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

    return {
      available: false,
      timeLeft: `${hoursLeft}ч ${minutesLeft}м`
    };
  } catch (error) {
    log(`Error getting clan bonus status: ${error}`);
    return { available: false, timeLeft: 'Ошибка' };
  }
}

// Обработка получения кланового бонуса
async function handleClanBonusClaim(telegramId: string, chatId: number) {
  try {
    const user = await storage.getBotUserByTelegramId(telegramId);
    if (!user) {
      await bot.sendMessage(chatId, 'Ошибка: пользователь не найден');
      return;
    }

    const userClan = await storage.getUserClan(user.id);
    if (!userClan) {
      await bot.sendMessage(chatId, 'Вы не состоите в клане!');
      return;
    }

    const bonusStatus = await getClanBonusStatus(telegramId);

    if (!bonusStatus.available) {
      await bot.sendMessage(chatId,
        `Клановый бонус недоступен!\n\n` +
        `Осталось ждать: ${bonusStatus.timeLeft}\n` +
        `Следующий клановый бонус: 1000 хамяфков`
      );
      return;
    }

    const bonusAmount = 1000;
    const currentHamsters = parseInt(user.hamsters || '0');
    const newBalance = currentHamsters + bonusAmount;
    const now = Date.now();

    await storage.updateBotUser(user.id, {
      hamsters: newBalance.toString(),
      lastClanBonusClaim: now.toString()
    });

    // Сохраняем информацию о бонусе
    await storage.createClanBonus({
      clanId: userClan.id,
      userId: user.id,
      amount: bonusAmount.toString()
    });

    await bot.sendMessage(chatId,
      `Клановый бонус получен!\n\n` +
      `Получено: ${bonusAmount} хамяфков\n` +
      `Новый баланс: ${newBalance} хамяфков\n\n` +
      `Следующий клановый бонус через 12 часов!`
    );

    log(`User ${user.nickname} claimed clan bonus: ${bonusAmount} hamsters, new balance: ${newBalance}`);

  } catch (error) {
    log(`Error claiming clan bonus: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при получении кланового бонуса. Попробуйте позже.');
  }
}

// Начать поиск кланов
async function startClanSearch(chatId: number, user: BotUser) {
  await storage.updateBotUser(user.id, {
    registrationStep: 'searching_clans'
  });

  await bot.sendMessage(chatId, 
    `Поиск кланов\n\n` +
    `Введите название клана для поиска:\n` +
    `Или введите никнейм владельца клана\n\n` +
    `Примеры:\n` +
    `• Название: МегаКлан\n` +
    `• Владелец: @nickname`
  );
}

// Обработать ввод поиска клана
async function handleClanSearchInput(chatId: number, user: BotUser, searchText: string) {
  try {
    let foundClans = [];

    // Поиск по названию клана
    const clanByName = await storage.getClanByName(searchText);
    if (clanByName) {
      foundClans.push(clanByName);
    } else {
      // Поиск по никнейму владельца (убираем @ если есть)
      const nickname = searchText.startsWith('@') ? searchText.substring(1) : searchText;
      const ownerUser = await storage.getBotUserByNickname(nickname);
      if (ownerUser) {
        const ownerClan = await storage.getUserClan(ownerUser.id);
        if (ownerClan && ownerClan.ownerId === ownerUser.id) {
          foundClans.push(ownerClan);
        }
      }
    }

    // Сбрасываем шаг поиска
    await storage.updateBotUser(user.id, { registrationStep: 'none' });

    if (foundClans.length === 0) {
      await bot.sendMessage(chatId, 
        `Клан не найден!\n\n` +
        `Попробуйте другое название или никнейм владельца.`
      );
      setTimeout(() => showClanMenu(chatId, user), 1000);
      return;
    }

    const foundClan = foundClans[0];
    const ownerUser = await storage.getBotUser(foundClan.ownerId);
    const membersCount = await storage.getClanMembersCount(foundClan.id);
    const userClan = await storage.getUserClan(user.id);

    let resultText = `Найденный клан\n\n`;
    resultText += `Название: ${foundClan.name}\n`;
    resultText += `Владелец: ${ownerUser?.nickname || 'Неизвестен'}\n`;
    resultText += `Участников: ${membersCount}/${foundClan.maxMembers}\n`;
    resultText += `Казна: ${foundClan.treasury} хамяфков`;

    const buttons = [];

    // Если пользователь не в клане и клан не полный, показываем кнопку запроса
    if (!userClan && membersCount < parseInt(foundClan.maxMembers)) {
      buttons.push([{
        text: 'Отправить запрос на вступление',
        callback_data: `request_join_${foundClan.id}`
      }]);
    }

    buttons.push([{
      text: 'Назад к кланам',
      callback_data: 'back_to_clan'
    }]);

    const keyboard = { inline_keyboard: buttons };

    await bot.sendMessage(chatId, resultText, { reply_markup: keyboard });
  } catch (error) {
    log(`Error handling clan search: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при поиске клана.');
  }
}

// Показать меню статистики кланов
async function showClanStatsMenu(chatId: number, user: BotUser) {
  const menuText = `Статистика кланов\n\n` +
    `Выберите тип статистики:`;

  const keyboard = {
    inline_keyboard: [
      [{ text: 'Топ кланы по хамяфкам', callback_data: 'clan_stats_treasury' }],
      [{ text: 'По армии хомякам', callback_data: 'clan_stats_army' }],
      [{ text: 'Назад', callback_data: 'back_to_clan' }]
    ]
  };

  await bot.sendMessage(chatId, menuText, { reply_markup: keyboard });
}

// Показать статистику кланов по казне
async function showClanStatsByTreasury(chatId: number, user: BotUser) {
  try {
    const allClans = await storage.getAllClans();

    if (allClans.length === 0) {
      await bot.sendMessage(chatId, 'Пока нет созданных кланов.');
      return;
    }

    // Сортируем по казне (от большей к меньшей)
    const sortedClans = allClans.sort((a, b) => 
      parseInt(b.treasury || '0') - parseInt(a.treasury || '0')
    );

    let statsText = `Топ 100 кланов по казне\n\n`;

    // Показываем до 100 кланов
    for (let i = 0; i < Math.min(100, sortedClans.length); i++) {
      const clan = sortedClans[i];
      const membersCount = await storage.getClanMembersCount(clan.id);
      const owner = await storage.getBotUser(clan.ownerId);

      statsText += `${i + 1}. ${clan.name} - ${clan.treasury} хамяфков\n`;
    }

    // Если статистика слишком длинная, разбиваем на части
    if (statsText.length > 4000) {
      // Отправляем первую часть
      const firstPart = statsText.substring(0, 4000);
      const lastNewline = firstPart.lastIndexOf('\n');
      const firstMessage = firstPart.substring(0, lastNewline);

      await bot.sendMessage(chatId, firstMessage);

      // Отправляем остальную часть
      const remainingText = statsText.substring(lastNewline + 1);
      if (remainingText.length > 0) {
        const keyboard = {
          inline_keyboard: [
            [{ text: 'Назад к статистике', callback_data: 'clan_stats' }]
          ]
        };
        await bot.sendMessage(chatId, remainingText, { reply_markup: keyboard });
      } else {
        const keyboard = {
          inline_keyboard: [
            [{ text: 'Назад к статистике', callback_data: 'clan_stats' }]
          ]
        };
        await bot.sendMessage(chatId, 'Статистика завершена.', { reply_markup: keyboard });
      }
    } else {
      const keyboard = {
        inline_keyboard: [
          [{ text: 'Назад к статистике', callback_data: 'clan_stats' }]
        ]
      };
      await bot.sendMessage(chatId, statsText, { reply_markup: keyboard });
    }
  } catch (error) {
    log(`Error showing clan treasury stats: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при загрузке статистики.');
  }
}

// Показать статистику кланов по армии хамяков
async function showClanStatsByArmy(chatId: number, user: BotUser) {
  try {
    const allClans = await storage.getClansByArmyHamsters();

    if (allClans.length === 0) {
      await bot.sendMessage(chatId, 'Пока нет кланов с армией хамяков.');
      return;
    }

    // Сортируем по армии хамяков (от большей к меньшей)
    // const sortedClans = allClans.sort((a, b) => 
    //   parseInt(b.armyHamsters || '0') - parseInt(a.armyHamsters || '0')
    // );

    let statsText = `АРМИЯ ХАМЯКОВ - ТОП 100\n\n`;

    // Показываем до 100 кланов
    for (let i = 0; i < Math.min(100, allClans.length); i++) {
      const clan = allClans[i];
      const position = i + 1;
      const armySize = parseInt(clan.armyHamsters || '0');

      if (armySize > 0) {
        const trophy = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `${position}.`;
        statsText += `${trophy} ${clan.name} - ${armySize} хамяков\n`;
      }
    }

    if (statsText === `АРМИЯ ХАМЯКОВ - ТОП 100\n\n`) {
      statsText += 'Пока ни один клан не купил армию хамяков.\n\nБудьте первыми! Купите хамяков в клановом магазине.';
    }

    // Если статистика слишком длинная, разбиваем на части
    if (statsText.length > 4000) {
      const firstPart = statsText.substring(0, 4000);
      const lastNewline = firstPart.lastIndexOf('\n');
      const firstMessage = firstPart.substring(0, lastNewline);

      await bot.sendMessage(chatId, firstMessage);

      const remainingText = statsText.substring(lastNewline + 1);
      if (remainingText.length > 0) {
        const keyboard = {
          inline_keyboard: [
            [{ text: 'Назад к статистике', callback_data: 'clan_stats' }]
          ]
        };
        await bot.sendMessage(chatId, remainingText, { reply_markup: keyboard });
      } else {
        const keyboard = {
          inline_keyboard: [
            [{ text: 'Назад к статистике', callback_data: 'clan_stats' }]
          ]
        };
        await bot.sendMessage(chatId, 'Статистика завершена.', { reply_markup: keyboard });
      }
    } else {
      const keyboard = {
        inline_keyboard: [
          [{ text: 'Назад к статистике', callback_data: 'clan_stats' }]
        ]
      };
      await bot.sendMessage(chatId, statsText, { reply_markup: keyboard });
    }
  } catch (error) {
    log(`Error showing clan army stats: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при загрузке статистики армии хамяков.');
  }
}

// Показать статистику кланов по участникам
async function showClanStatsByMembers(chatId: number, user: BotUser) {
  try {
    const allClans = await storage.getAllClans();

    if (allClans.length === 0) {
      await bot.sendMessage(chatId, 'Пока нет созданных кланов.');
      return;
    }

    // Получаем количество участников для каждого клана и сортируем
    const clansWithMembers = [];
    for (const clan of allClans) {
      const membersCount = await storage.getClanMembersCount(clan.id);
      clansWithMembers.push({ ...clan, membersCount });
    }

    const sortedClans = clansWithMembers.sort((a, b) => b.membersCount - a.membersCount);

    let statsText = `👥 Топ кланов по участникам\n\n`;

    for (let i = 0; i < Math.min(10, sortedClans.length); i++) {
      const clan = sortedClans[i];
      const owner = await storage.getBotUser(clan.ownerId);

      const position = i + 1;
      const trophy = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `${position}.`;

      statsText += `${trophy} ${clan.name}\n`;
      statsText += `   👥 Участников: ${clan.membersCount}/${clan.maxMembers}\n`;
      statsText += `   👑 Владелец: ${owner?.nickname || 'Неизвестен'}\n`;
      statsText += `   💰 Казна: ${clan.treasury} хамяфков\n\n`;
    }

    const keyboard = {
      inline_keyboard: [
        [{ text: 'Назад к статистике', callback_data: 'clan_stats' }]
      ]
    };

    await bot.sendMessage(chatId, statsText, { reply_markup: keyboard });
  } catch (error) {
    log(`Error showing clan members stats: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при загрузке статистики.');
  }
}

// Добавить обработку пополнения казны
async function handleAddToTreasury(chatId: number, user: BotUser) {
  await storage.updateBotUser(user.id, {
    registrationStep: 'adding_to_treasury'
  });

  await bot.sendMessage(chatId, 
    `Пополнение казны клана\n\n` +
    `Введите сумму хамяфков для пополнения казны:\n` +
    `Минимум: 10 хамяфков`
  );
}

// Показать магазин клана
async function showClanShop(chatId: number, user: BotUser) {
  try {
    const userClan = await storage.getUserClan(user.id);

    if (!userClan) {
      await bot.sendMessage(chatId, 'Вы не состоите в клане.');
      await showClanMenu(chatId, user);
      return;
    }

    const isOwner = userClan.ownerId === user.id;
    const isDeputy = userClan.deputyId === user.id;
    const isAdmin = isOwner || isDeputy;

    // Любой участник клана может жертвовать армию

    const shopText = `Пожертвование армии клану\n\n` +
                    `Армия хамяков\n` +
                    `Цена: 10 хамяфков за 1 боевого хамяка\n\n` +
                    `Казна клана: ${userClan.treasury || '0'} хамяфков\n` +
                    `Армия клана: ${userClan.armyHamsters || '0'} хамяков\n\n` +
                    `Введите количество хамяков для пожертвования:\n\n` +
                    `Пример: 5`;

    const keyboard = {
      inline_keyboard: [
        [{ text: 'Назад к клану', callback_data: 'my_clan' }]
      ]
    };

    await bot.sendMessage(chatId, shopText, { reply_markup: keyboard });
  } catch (error) {
    log(`Error showing clan shop: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при показе кланового магазина.');
  }
}

// Начать покупку армии хамяков
async function startBuyArmyHamsters(chatId: number, user: BotUser) {
  await storage.updateBotUser(user.id, {
    registrationStep: 'buying_army_hamsters'
  });

  await bot.sendMessage(chatId, 
    `Пожертвование армии клану\n\n` +
    `Введите количество хамяков для армии:\n\n` +
    `Цена: 10 хамяфков = 1 хамяк армии\n` +
    `Минимум: 1 хамяк армии (10 хамяфков)\n\n` +
    `Пример: 100`
  );
}

async function handleTreasuryInput(chatId: number, user: BotUser, amountText: string) {
  try {
    const amount = parseInt(amountText);

    if (isNaN(amount) || amount < 10) {
      await bot.sendMessage(chatId, 'Неверная сумма! Введите число больше или равное 10:');
      return;
    }

    const userBalance = safeParseInt(user.hamsters);
    if (userBalance < amount) {
      await bot.sendMessage(chatId, 
        `Недостаточно средств!\n\n` +
        `Требуется: ${amount} хамяфков\n` +
        `Ваш баланс: ${userBalance} хамяфков`
      );
      return;
    }

    const userClan = await storage.getUserClan(user.id);
    if (!userClan) {
      await bot.sendMessage(chatId, 'Вы не состоите в клане!');
      await storage.updateBotUser(user.id, { registrationStep: 'none' });
      return;
    }

    // Списываем с баланса пользователя
    await storage.addHamsters(user.id, -amount);

    // Добавляем в казну клана
    await storage.addToTreasury(userClan.id, amount);

    // Сбрасываем шаг регистрации
    await storage.updateBotUser(user.id, { registrationStep: 'none' });

    const newBalance = userBalance - amount;
    const newTreasury = parseInt(userClan.treasury || '0') + amount;

    await bot.sendMessage(chatId, 
      `Казна пополнена!\n\n` +
      `Внесено: ${amount} хамяфков\n` +
      `Ваш баланс: ${newBalance} хамяфков\n` +
      `Казна клана: ${newTreasury} хамяфков`
    );

    // Показываем обновленную информацию о клане
    setTimeout(() => showMyClan(chatId, user), 1500);
  } catch (error) {
    log(`Error handling treasury input: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при пополнении казны.');
  }
}

// Показать магазин личной армии

async function confirmLeaveClan(chatId: number, user: BotUser) {
  try {
    const userClan = await storage.getUserClan(user.id);
    if (!userClan) {
      await bot.sendMessage(chatId, 'Вы не состоите в клане!');
      return;
    }
    if (userClan.ownerId === user.id) {
      await bot.sendMessage(chatId,
        'Вы являетесь владельцем клана!\n\nСначала удалите клан или передайте владение другому участнику.'
      );
      return;
    }
    await bot.sendMessage(chatId,
      `Вы уверены что хотите покинуть клан "${userClan.name}"?\n\nЭто действие нельзя отменить.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Да, покинуть', callback_data: 'confirm_leave_clan' }],
            [{ text: '❌ Отмена', callback_data: 'cancel_leave_clan' }]
          ]
        }
      }
    );
  } catch (error) {
    log(`Error confirming leave clan: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте позже.');
  }
}

async function leaveClan(chatId: number, user: BotUser) {
  try {
    const userClan = await storage.getUserClan(user.id);
    if (!userClan) {
      await bot.sendMessage(chatId, 'Вы не состоите в клане!');
      return;
    }
    if (userClan.ownerId === user.id) {
      await bot.sendMessage(chatId,
        'Владелец не может покинуть клан! Сначала удалите клан или передайте владение.'
      );
      return;
    }
    await storage.removeClanMember(userClan.id, user.id);
    await bot.sendMessage(chatId,
      `✅ Вы покинули клан "${userClan.name}".\n\nВы можете вступить в другой клан или создать свой.`
    );
    await showClanMenu(chatId, user);
  } catch (error) {
    log(`Error leaving clan: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при выходе из клана.');
  }
}

export {
  showCommands, showSupportContact,
  showClanMenu, startClanCreation, handleClanNameInput,
  showJoinClanMenu, showMyClan, confirmDeleteClan, deleteClan,
  getClanBonusStatus, handleClanBonusClaim,
  startClanSearch, handleClanSearchInput,
  showClanStatsMenu, showClanStatsByTreasury, showClanStatsByArmy, showClanStatsByMembers,
  handleAddToTreasury, showClanShop, startBuyArmyHamsters, handleTreasuryInput,
  confirmLeaveClan, leaveClan
};

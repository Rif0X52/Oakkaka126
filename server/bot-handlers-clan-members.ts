import { bot, botConfig, ADMIN_IDS, safeParseInt, notifyAllAdmins } from './bot-shared';
import { storage } from './storage';
import { log } from './vite';
import type { BotUser } from '@shared/schema';
import { showProfile } from './bot-handlers-profile';
import { showMyClan, showClanMenu, showClanShop } from './bot-handlers-clan';

async function showPersonalArmyShop(chatId: number, user: BotUser) {
  const shopText = `Магазин армии\n\n` +
                  `Покупка личной армии хамяков\n` +
                  `Цена: 10 хамяфков за 1 боевого хамяка\n\n` +
                  `Ваш баланс: ${user.hamsters || '0'} хамяфков\n` +
                  `Ваша армия: ${user.armyHamsters || '0'} хамяков\n\n` +
                  `Введите количество хамяков для покупки:\n\n` +
                  `Пример: 10`;

  const keyboard = {
    inline_keyboard: [
      [{ text: 'Назад к профилю', callback_data: 'back_to_profile' }]
    ]
  };

  await storage.updateBotUser(user.id, {
    registrationStep: 'buying_personal_army'
  });

  await bot.sendMessage(chatId, shopText, { reply_markup: keyboard });
}

// Обработать покупку личной армии
async function handlePersonalArmyInput(chatId: number, user: BotUser, amountText: string) {
  try {
    const armyAmount = parseInt(amountText);

    if (isNaN(armyAmount) || armyAmount < 1) {
      await bot.sendMessage(chatId, 'Неверное количество! Введите число больше 0:');
      return;
    }

    const totalCost = armyAmount * 10; // 10 хамяфков за 1 хамяка армии
    const userBalance = safeParseInt(user.hamsters);

    if (userBalance < totalCost) {
      await bot.sendMessage(chatId, 
        `Недостаточно средств!\n\n` +
        `Требуется: ${totalCost} хамяфков\n` +
        `Ваш баланс: ${userBalance} хамяфков\n` +
        `Не хватает: ${totalCost - userBalance} хамяфков`
      );
      return;
    }

    // Списываем с баланса пользователя
    await storage.addHamsters(user.id, -totalCost);

    // Добавляем к личной армии
    await storage.addUserArmyHamsters(user.id, armyAmount);

    // Сбрасываем шаг регистрации
    await storage.updateBotUser(user.id, { registrationStep: 'none' });

    const newBalance = userBalance - totalCost;
    const newArmySize = parseInt(user.armyHamsters || '0') + armyAmount;

    await bot.sendMessage(chatId, 
      `Покупка завершена!\n\n` +
      `Куплено: ${armyAmount} боевых хамяков\n` +
      `Потрачено: ${totalCost} хамяфков\n\n` +
      `Новый баланс: ${newBalance} хамяфков\n` +
      `Размер армии: ${newArmySize} хамяков`
    );

    await showProfile(chatId, user);
  } catch (error) {
    log(`Error handling personal army input: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при покупке армии.');
  }
}

// Обработать покупку армии хамяков
// Handle direct army purchase from shop
async function handleDirectArmyPurchase(chatId: number, user: BotUser, amountText: string) {
  await handleArmyHamstersInput(chatId, user, amountText);
}

async function handleArmyHamstersInput(chatId: number, user: BotUser, amountText: string) {
  try {
    const armyAmount = parseInt(amountText);

    if (isNaN(armyAmount) || armyAmount < 1) {
      await bot.sendMessage(chatId, 'Неверное количество! Введите число больше или равное 1:');
      return;
    }

    const totalCost = armyAmount * 10; // 1 хамяк армии = 10 хамяфков
    const userBalance = safeParseInt(user.hamsters);

    if (userBalance < totalCost) {
      await bot.sendMessage(chatId, 
        `Недостаточно средств!\n\n` +
        `Требуется: ${totalCost} хамяфков (${armyAmount} хамяков армии × 10)\n` +
        `Ваш баланс: ${userBalance} хамяфков\n` +
        `Не хватает: ${totalCost - userBalance} хамяфков`
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
    await storage.addHamsters(user.id, -totalCost);

    // Добавляем хамяков в армию клана
    // Добавляем армию хамяков к клану
    await storage.updateClan(userClan.id, {
      armyHamsters: (parseInt(userClan.armyHamsters || '0') + armyAmount).toString()
    });

    // Сбрасываем шаг регистрации
    await storage.updateBotUser(user.id, { registrationStep: 'none' });

    const newBalance = userBalance - totalCost;
    const newArmySize = parseInt(userClan.armyHamsters || '0') + armyAmount;

    await bot.sendMessage(chatId, 
      `🐹 АРМИЯ ХАМЯКОВ ПОПОЛНЕНА!\n\n` +
      `Куплено: ${armyAmount} хамяков для армии\n` +
      `Потрачено: ${totalCost} хамяфков\n` +
      `Ваш баланс: ${newBalance} хамяфков\n\n` +
      `⚔️ Размер армии клана: ${newArmySize} хамяков\n\n` +
      `Ваш клан поднялся в рейтинге "Армия хамяков"!`
    );

    // Показываем обновленную информацию о клане
    setTimeout(() => showMyClan(chatId, user), 2000);
  } catch (error) {
    log(`Error handling army hamsters input: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при покупке армии хамяков.');
  }
}

// Запрос на вступление в клан
async function requestJoinClan(chatId: number, user: BotUser, clanId: string) {
  try {
    const targetClan = await storage.getClan(clanId);
    if (!targetClan) {
      await bot.sendMessage(chatId, 'Клан не найден.');
      return;
    }

    const userClan = await storage.getUserClan(user.id);
    if (userClan) {
      await bot.sendMessage(chatId, 'Вы уже состоите в клане! Сначала покиньте текущий клан.');
      return;
    }

    const membersCount = await storage.getClanMembersCount(clanId);
    if (membersCount >= parseInt(targetClan.maxMembers)) {
      await bot.sendMessage(chatId, 'В клане нет свободных мест.');
      return;
    }

    // Проверяем, не отправлял ли пользователь уже запрос
    const existingRequest = await storage.getUserClanJoinRequest(user.id, clanId);
    if (existingRequest) {
      await bot.sendMessage(chatId, 'Вы уже отправили запрос в этот клан. Ожидайте ответа.');
      return;
    }

    const pendingClanRequests = await storage.getClanJoinRequests(clanId);
    if (pendingClanRequests.some(r => r.userId === user.id && r.status === 'pending')) {
      await bot.sendMessage(chatId, 'Вы уже отправили запрос в этот клан. Ожидайте ответа.');
      return;
    }

    // Создаем запрос на вступление
    const joinRequest = await storage.createClanJoinRequest({
      clanId: clanId,
      userId: user.id
    });

    const clanOwner = await storage.getBotUser(targetClan.ownerId);
    if (!clanOwner) {
      await bot.sendMessage(chatId, 'Владелец клана не найден.');
      return;
    }

    // Отправляем уведомление владельцу и заместителю
    const requestText = `Запрос на вступление в клан!\n\n` +
      `Клан: ${targetClan.name}\n` +
      `От пользователя: ${user.nickname}\n` +
      `ID: ${user.telegramId}\n` +
      `Баланс: ${user.hamsters} хамяфков\n\n` +
      `Принять этого пользователя в клан?`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: 'Принять', callback_data: `accept_join_req_${joinRequest.id}` },
          { text: 'Отклонить', callback_data: `reject_join_req_${joinRequest.id}` }
        ]
      ]
    };

    // Уведомляем владельца
    try {
      await bot.sendMessage(parseInt(clanOwner.telegramId), requestText, { reply_markup: keyboard });
    } catch (error) {
      log(`Could not notify clan owner ${clanOwner.nickname}: ${error}`);
    }

    // Уведомляем заместителя, если есть
    if (targetClan.deputyId) {
      const deputy = await storage.getBotUser(targetClan.deputyId);
      if (deputy) {
        try {
          await bot.sendMessage(parseInt(deputy.telegramId), requestText, { reply_markup: keyboard });
        } catch (error) {
          log(`Could not notify clan deputy ${deputy.nickname}: ${error}`);
        }
      }
    }

    // Уведомляем отправителя запроса
    await bot.sendMessage(chatId, 
      `Запрос отправлен!\n\n` +
      `Ваш запрос на вступление в клан "${targetClan.name}" отправлен администрации клана.\n\n` +
      `Ожидайте ответа.`
    );

    log(`Clan join request created: ${user.nickname} -> ${targetClan.name} (request ID: ${joinRequest.id})`);
  } catch (error) {
    log(`Error requesting clan join: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при отправке запроса.');
  }
}

// Принять запрос на вступление в клан
async function acceptClanJoinRequest(chatId: number, admin: BotUser, requestId: string) {
  try {
    // Получаем все запросы и находим нужный
    const allClans = await storage.getAllClans();
    let request = null;

    for (const clan of allClans) {
      const clanRequests = await storage.getClanJoinRequests(clan.id);
      const foundRequest = clanRequests.find(r => r.id === requestId);
      if (foundRequest) {
        request = foundRequest;
        break;
      }
    }

    if (!request || request.status !== 'pending') {
      await bot.sendMessage(chatId, 'Запрос не найден или уже обработан.');
      return;
    }

    const clan = await storage.getClan(request.clanId);
    if (!clan) {
      await bot.sendMessage(chatId, 'Клан не найден.');
      return;
    }

    // Проверяем права администратора
    const isAdmin = await storage.isUserClanAdmin(admin.id, request.clanId);
    if (!isAdmin) {
      await bot.sendMessage(chatId, 'У вас нет прав для управления этим кланом.');
      return;
    }

    const requestUser = await storage.getBotUser(request.userId);
    if (!requestUser) {
      await bot.sendMessage(chatId, 'Пользователь не найден.');
      return;
    }

    // Проверяем, что пользователь еще не в клане
    const userClan = await storage.getUserClan(request.userId);
    if (userClan) {
      await bot.sendMessage(chatId, 'Пользователь уже состоит в другом клане.');
      await storage.updateClanJoinRequest(requestId, { 
        status: 'rejected', 
        processedAt: new Date().toISOString(),
        processedBy: admin.id 
      });
      return;
    }

    // Проверяем количество участников
    const membersCount = await storage.getClanMembersCount(request.clanId);
    if (membersCount >= parseInt(clan.maxMembers)) {
      await bot.sendMessage(chatId, 'В клане нет свободных мест.');
      return;
    }

    // Добавляем пользователя в клан
    await storage.createClanMembership({
      clanId: request.clanId,
      userId: request.userId
    });

    // Обновляем статус запроса
    await storage.updateClanJoinRequest(requestId, { 
      status: 'accepted', 
      processedAt: new Date().toISOString(),
      processedBy: admin.id 
    });

    // Уведомляем администратора
    await bot.sendMessage(chatId, 
      `Пользователь ${requestUser.nickname} принят в клан "${clan.name}"!\n\n` +
      `Участников в клане: ${membersCount + 1}/${clan.maxMembers}`
    );

    // Уведомляем нового участника
    try {
      await bot.sendMessage(parseInt(requestUser.telegramId), 
        `Поздравляем!

Вы приняты в клан "${clan.name}"!
Принял: ${admin.nickname}

Добро пожаловать в команду!`
      );
    } catch (error) {
      log(`Could not notify accepted user ${requestUser.nickname}: ${error}`);
    }

    log(`User ${requestUser.nickname} accepted to clan ${clan.name} by ${admin.nickname}`);
  } catch (error) {
    log(`Error accepting clan join request: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при принятии запроса.');
  }
}

// Отклонить запрос на вступление в клан
async function rejectClanJoinRequest(chatId: number, admin: BotUser, requestId: string) {
  try {
    // Получаем все запросы и находим нужный
    const allClans = await storage.getAllClans();
    let request = null;

    for (const clan of allClans) {
      const clanRequests = await storage.getClanJoinRequests(clan.id);
      const foundRequest = clanRequests.find(r => r.id === requestId);
      if (foundRequest) {
        request = foundRequest;
        break;
      }
    }

    if (!request || request.status !== 'pending') {
      await bot.sendMessage(chatId, 'Запрос не найден или уже обработан.');
      return;
    }

    const clan = await storage.getClan(request.clanId);
    if (!clan) {
      await bot.sendMessage(chatId, 'Клан не найден.');
      return;
    }

    // Проверяем права администратора
    const isAdmin = await storage.isUserClanAdmin(admin.id, request.clanId);
    if (!isAdmin) {
      await bot.sendMessage(chatId, 'У вас нет прав для управления этим кланом.');
      return;
    }

    const requestUser = await storage.getBotUser(request.userId);
    if (!requestUser) {
      await bot.sendMessage(chatId, 'Пользователь не найден.');
      return;
    }

    // Обновляем статус запроса
    await storage.updateClanJoinRequest(requestId, { 
      status: 'rejected', 
      processedAt: new Date().toISOString(),
      processedBy: admin.id 
    });

    // Уведомляем администратора
    await bot.sendMessage(chatId, 
      `Запрос от пользователя ${requestUser.nickname} отклонен.`
    );

    // Уведомляем пользователя
    try {
      await bot.sendMessage(parseInt(requestUser.telegramId), 
        `Ваш запрос на вступление в клан "${clan.name}" отклонен.

Попробуйте найти другой клан или создать свой!`
      );
    } catch (error) {
      log(`Could not notify rejected user ${requestUser.nickname}: ${error}`);
    }

    log(`User ${requestUser.nickname} rejected from clan ${clan.name} by ${admin.nickname}`);
  } catch (error) {
    log(`Error rejecting clan join request: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при отклонении запроса.');
  }
}

// Показать запросы на вступление в клан
async function showClanRequests(chatId: number, admin: BotUser, clanId: string) {
  try {
    const isAdmin = await storage.isUserClanAdmin(admin.id, clanId);
    if (!isAdmin) {
      await bot.sendMessage(chatId, 'У вас нет прав для просмотра запросов этого клана.');
      return;
    }

    const clan = await storage.getClan(clanId);
    const requests = await storage.getClanJoinRequests(clanId);

    if (requests.length === 0) {
      await bot.sendMessage(chatId, 
        `Запросы в клан "${clan?.name}"\n\n` +
        `Нет активных запросов на вступление.`
      );
      return;
    }

    let requestText = `Запросы в клан "${clan?.name}"\n\n`;
    const buttons = [];

    for (const request of requests.slice(0, 10)) {
      const requestUser = await storage.getBotUser(request.userId);
      if (requestUser) {
        requestText += `${requestUser.nickname}\n`;
        requestText += `Баланс: ${requestUser.hamsters} хамяфков\n`;
        requestText += `${new Date(request.requestedAt).toLocaleDateString('ru-RU')}\n\n`;

        buttons.push([
          { text: `Принять ${requestUser.nickname}`, callback_data: `accept_join_req_${request.id}` },
          { text: `Отклонить ${requestUser.nickname}`, callback_data: `reject_join_req_${request.id}` }
        ]);
      }
    }

    buttons.push([{ text: 'Назад к клану', callback_data: 'my_clan' }]);

    const keyboard = { inline_keyboard: buttons };
    await bot.sendMessage(chatId, requestText, { reply_markup: keyboard });
  } catch (error) {
    log(`Error showing clan requests: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при загрузке запросов.');
  }
}

// Начать назначение заместителя
async function startSetDeputy(chatId: number, owner: BotUser, clanId: string) {
  try {
    const clan = await storage.getClan(clanId);
    if (!clan || clan.ownerId !== owner.id) {
      await bot.sendMessage(chatId, 'У вас нет прав для управления этим кланом.');
      return;
    }

    const members = await storage.getClanMembers(clanId);
    if (members.length <= 1) {
      await bot.sendMessage(chatId, 'В клане нет других участников для назначения заместителем.');
      return;
    }

    // Показываем список участников и просим ввести никнейм
    let membersText = `Назначение заместителя\n\nУчастники клана:\n\n`;

    for (const member of members) {
      if (member.userId !== owner.id) { // Исключаем владельца
        const memberUser = await storage.getBotUser(member.userId);
        if (memberUser) {
          // Не показываем владельца клана, если админ - заместитель
          if (clan.ownerId === memberUser.id && owner.id !== clan.ownerId) {
            continue;
          }
          membersText += `${memberUser.nickname}\n`;
        }
      }
    }

    membersText += `\nНапишите никнейм пользователя, которого хотите назначить заместителем:`;

    // Устанавливаем состояние ожидания ввода никнейма заместителя
    await storage.updateBotUser(owner.id, {
      registrationStep: `setting_deputy_${clanId}`
    });

    await bot.sendMessage(chatId, membersText);
  } catch (error) {
    log(`Error starting set deputy: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка.');
  }
}

// Снять заместителя
async function removeClanDeputy(chatId: number, owner: BotUser, clanId: string) {
  try {
    const clan = await storage.getClan(clanId);
    if (!clan || clan.ownerId !== owner.id) {
      await bot.sendMessage(chatId, 'У вас нет прав для управления этим кланом.');
      return;
    }

    if (!clan.deputyId) {
      await bot.sendMessage(chatId, 'В клане нет заместителя.');
      return;
    }

    const deputy = await storage.getBotUser(clan.deputyId);
    await storage.setClanDeputy(clanId, null);

    await bot.sendMessage(chatId, 
      `${deputy?.nickname || 'Заместитель'} снят с должности заместителя клана "${clan.name}".`
    );

    if (deputy) {
      try {
        await bot.sendMessage(parseInt(deputy.telegramId), 
          `Вы сняты с должности заместителя клана "${clan.name}".`
        );
      } catch (error) {
        log(`Could not notify removed deputy ${deputy.nickname}: ${error}`);
      }
    }

    // Обновляем информацию о клане
    setTimeout(() => showMyClan(chatId, owner), 1000);
  } catch (error) {
    log(`Error removing clan deputy: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при снятии заместителя.');
  }
}

// Обработать ввод никнейма для назначения заместителем
async function handleDeputyNicknameInput(chatId: number, owner: BotUser, nickname: string) {
  try {
    const registrationStep = owner.registrationStep;
    if (!registrationStep || !registrationStep.startsWith('setting_deputy_')) {
      return;
    }

    const clanId = registrationStep.replace('setting_deputy_', '');

    const clan = await storage.getClan(clanId);
    if (!clan || clan.ownerId !== owner.id) {
      await bot.sendMessage(chatId, 'У вас нет прав для управления этим кланом.');
      await storage.updateBotUser(owner.id, { registrationStep: 'none' });
      return;
    }

    // Найти пользователя по никнейму
    const deputyUser = await storage.getBotUserByNickname(nickname);
    if (!deputyUser) {
      await bot.sendMessage(chatId, `Пользователь с никнеймом "${nickname}" не найден. Попробуйте еще раз:`);
      return;
    }

    // Проверить, что пользователь состоит в этом клане
    const userClan = await storage.getUserClan(deputyUser.id);
    if (!userClan || userClan.id !== clanId) {
      await bot.sendMessage(chatId, `Пользователь "${nickname}" не состоит в этом клане. Попробуйте еще раз:`);
      return;
    }

    // Проверить, что это не владелец клана
    if (deputyUser.id === owner.id) {
      await bot.sendMessage(chatId, 'Вы не можете назначить себя заместителем. Попробуйте еще раз:');
      return;
    }

    // Назначить заместителя
    await storage.setClanDeputy(clanId, deputyUser.id);

    // Сбросить состояние
    await storage.updateBotUser(owner.id, { registrationStep: 'none' });

    await bot.sendMessage(chatId, 
      `${deputyUser.nickname} назначен заместителем клана "${clan.name}"!\n\n` +
      `Заместитель получает все права администратора клана, кроме права удаления клана.`
    );

    // Уведомляем нового заместителя
    try {
      await bot.sendMessage(parseInt(deputyUser.telegramId), 
        `Поздравляем!

Вы назначены заместителем клана "${clan.name}"!\n` +
        `Теперь у вас есть права администратора клана.`
      );
    } catch (error) {
      log(`Could not notify new deputy ${deputyUser.nickname}: ${error}`);
    }

    // Показать обновленную информацию о клане
    setTimeout(() => showMyClan(chatId, owner), 1000);

    log(`${deputyUser.nickname} appointed as deputy of clan ${clan.name} by ${owner.nickname}`);
  } catch (error) {
    log(`Error handling deputy nickname input: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при назначении заместителя.');
    await storage.updateBotUser(owner.id, { registrationStep: 'none' });
  }
}

// Начать удаление участника
async function startRemoveMember(chatId: number, admin: BotUser, clanId: string) {
  try {
    const clan = await storage.getClan(clanId);
    if (!clan) {
      await bot.sendMessage(chatId, 'Клан не найден.');
      return;
    }

    const isAdmin = await storage.isUserClanAdmin(admin.id, clanId);
    if (!isAdmin) {
      await bot.sendMessage(chatId, 'У вас нет прав для управления этим кланом.');
      return;
    }

    const members = await storage.getClanMembers(clanId);
    if (members.length <= 1) {
      await bot.sendMessage(chatId, 'В клане нет других участников для удаления.');
      return;
    }

    // Показываем список участников и просим ввести никнейм
    let membersText = `Удаление участника из клана\n\nУчастники клана:\n\n`;

    for (const member of members) {
      if (member.userId !== admin.id) { // Исключаем администратора
        const memberUser = await storage.getBotUser(member.userId);
        if (memberUser) {
          // Не показываем владельца клана, если админ - заместитель
          if (clan.ownerId === memberUser.id && admin.id !== clan.ownerId) {
            continue;
          }
          membersText += `${memberUser.nickname}\n`;
        }
      }
    }

    membersText += `\nНапишите никнейм участника, которого хотите удалить из клана:`;

    // Устанавливаем состояние ожидания ввода никнейма для удаления
    await storage.updateBotUser(admin.id, {
      registrationStep: `removing_member_${clanId}`
    });

    await bot.sendMessage(chatId, membersText);
  } catch (error) {
    log(`Error starting remove member: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка.');
  }
}

// Обработать ввод никнейма для удаления участника
async function handleRemoveMemberNicknameInput(chatId: number, admin: BotUser, nickname: string) {
  try {
    const registrationStep = admin.registrationStep;
    if (!registrationStep || !registrationStep.startsWith('removing_member_')) {
      return;
    }

    const clanId = registrationStep.replace('removing_member_', '');

    const clan = await storage.getClan(clanId);
    if (!clan) {
      await bot.sendMessage(chatId, 'Клан не найден.');
      await storage.updateBotUser(admin.id, { registrationStep: 'none' });
      return;
    }

    const isAdmin = await storage.isUserClanAdmin(admin.id, clanId);
    if (!isAdmin) {
      await bot.sendMessage(chatId, 'У вас нет прав для управления этим кланом.');
      await storage.updateBotUser(admin.id, { registrationStep: 'none' });
      return;
    }

    // Найти пользователя по никнейму
    const memberUser = await storage.getBotUserByNickname(nickname);
    if (!memberUser) {
      await bot.sendMessage(chatId, `Пользователь с никнеймом "${nickname}" не найден. Попробуйте еще раз:`);
      return;
    }

    // Проверить, что пользователь состоит в этом клане
    const userClan = await storage.getUserClan(memberUser.id);
    if (!userClan || userClan.id !== clanId) {
      await bot.sendMessage(chatId, `Пользователь "${nickname}" не состоит в этом клане. Попробуйте еще раз:`);
      return;
    }

    // Проверить, что это не сам администратор
    if (memberUser.id === admin.id) {
      await bot.sendMessage(chatId, 'Вы не можете удалить себя из клана. Попробуйте еще раз:');
      return;
    }

    // Заместитель не может удалить владельца
    if (clan.ownerId === memberUser.id && admin.id !== clan.ownerId) {
      await bot.sendMessage(chatId, 'Заместитель не может удалить владельца клана. Попробуйте еще раз:');
      return;
    }

    // Подтверждение удаления
    const confirmText = `Подтверждение удаления участника\n\n` +
      `Участник: ${memberUser.nickname}\n` +
      `Клан: ${clan.name}\n\n` +
      `Вы уверены, что хотите удалить этого участника из клана?`;

    // Используем более короткую callback_data чтобы избежать BUTTON_DATA_INVALID
    const shortCallbackData = `crm_${memberUser.id.slice(-8)}_${clanId.slice(-8)}`;
    const keyboard = {
      inline_keyboard: [
        [
          { text: 'Да, удалить', callback_data: shortCallbackData },
          { text: 'Отменить', callback_data: 'my_clan' }
        ]
      ]
    };

    // Сбросить состояние
    await storage.updateBotUser(admin.id, { registrationStep: 'none' });

    await bot.sendMessage(chatId, confirmText, { reply_markup: keyboard });

    log(`Remove member confirmation requested: ${memberUser.nickname} from clan ${clan.name} by ${admin.nickname}`);
  } catch (error) {
    log(`Error handling remove member nickname input: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при удалении участника.');
    await storage.updateBotUser(admin.id, { registrationStep: 'none' });
  }
}

// Подтвердить удаление участника
async function confirmRemoveMember(chatId: number, admin: BotUser, memberId: string, clanId: string) {
  try {
    const clan = await storage.getClan(clanId);
    if (!clan) {
      await bot.sendMessage(chatId, 'Клан не найден.');
      return;
    }

    const isAdmin = await storage.isUserClanAdmin(admin.id, clanId);
    if (!isAdmin) {
      await bot.sendMessage(chatId, 'У вас нет прав для управления этим кланом.');
      return;
    }

    const memberUser = await storage.getBotUser(memberId);
    if (!memberUser) {
      await bot.sendMessage(chatId, 'Участник не найден.');
      return;
    }

    // Проверяем, что участник в клане
    const userClan = await storage.getUserClan(memberId);
    if (!userClan || userClan.id !== clanId) {
      await bot.sendMessage(chatId, 'Участник не состоит в этом клане.');
      return;
    }

    // Заместитель не может удалить владельца
    if (clan.ownerId === memberId && admin.id !== clan.ownerId) {
      await bot.sendMessage(chatId, 'Заместитель не может удалить владельца клана.');
      return;
    }

    // Если удаляем заместителя, сбрасываем его статус
    if (clan.deputyId === memberId) {
      await storage.setClanDeputy(clanId, null);
    }

    // Удаляем участника из клана
    await storage.removeClanMember(memberId);

    await bot.sendMessage(chatId, 
      `${memberUser.nickname} удален из клана "${clan.name}".\n\n` +
      `Удалил: ${admin.nickname}`
    );

    // Уведомляем удаленного участника
    try {
      await bot.sendMessage(parseInt(memberUser.telegramId), 
        `Вы исключены из клана "${clan.name}".\n\n` +
        `Исключил: ${admin.nickname}`
      );
    } catch (error) {
      log(`Could not notify removed member ${memberUser.nickname}: ${error}`);
    }

    // Обновляем информацию о клане
    setTimeout(() => showMyClan(chatId, admin), 1000);

    log(`${memberUser.nickname} removed from clan ${clan.name} by ${admin.nickname}`);
  } catch (error) {
    log(`Error confirming remove member: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при удалении участника.');
  }
}

// Подтвердить выход из клана
async function confirmLeaveClan(chatId: number, user: BotUser) {
  try {
    const userClan = await storage.getUserClan(user.id);

    if (!userClan) {
      await bot.sendMessage(chatId, 'Вы не состоите в клане.');
      return;
    }

    // Владелец не может выйти из клана - только удалить его
    if (userClan.ownerId === user.id) {
      await bot.sendMessage(chatId, 'Владелец клана не может выйти из клана. Удалите клан или передайте права другому участнику.');
      return;
    }

    const confirmText = `Выход из клана\n\n` +
      `Вы уверены, что хотите покинуть клан "${userClan.name}"?\n\n` +
      `${userClan.deputyId === user.id ? 'Внимание: Вы потеряете права заместителя клана!' : ''}`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: 'Да, выйти', callback_data: 'confirm_leave_clan' },
          { text: 'Отменить', callback_data: 'cancel_leave_clan' }
        ]
      ]
    };

    await bot.sendMessage(chatId, confirmText, { reply_markup: keyboard });
  } catch (error) {
    log(`Error confirming leave clan: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка.');
  }
}

// Выйти из клана
async function leaveClan(chatId: number, user: BotUser) {
  try {
    const userClan = await storage.getUserClan(user.id);

    if (!userClan) {
      await bot.sendMessage(chatId, 'Вы не состоите в клане.');
      return;
    }

    // Владелец не может выйти из клана
    if (userClan.ownerId === user.id) {
      await bot.sendMessage(chatId, 'Владелец клана не может выйти из клана.');
      return;
    }

    const isDeputy = userClan.deputyId === user.id;

    // Если заместитель выходит, убираем его статус
    if (isDeputy) {
      await storage.setClanDeputy(userClan.id, null);
    }

    // Удаляем участника из клана
    await storage.removeClanMember(user.id);

    await bot.sendMessage(chatId, 
      `Вы покинули клан "${userClan.name}".\n\n` +
      `${isDeputy ? 'Ваши права заместителя сняты.' : ''}`
    );

    // Уведомляем владельца клана
    const owner = await storage.getBotUser(userClan.ownerId);
    if (owner) {
      await bot.sendMessage(owner.telegramId, 
        `${user.nickname} покинул клан "${userClan.name}".\n\n` +
        `${isDeputy ? `${user.nickname} больше не является заместителем.` : ''}`
      );
    }

    // Показываем меню кланов
    setTimeout(() => showClanMenu(chatId, user), 1000);

    log(`${user.nickname} left clan ${userClan.name}${isDeputy ? ' (was deputy)' : ''}`);
  } catch (error) {
    log(`Error leaving clan: ${error}`);
    await bot.sendMessage(chatId, 'Произошла ошибка при выходе из клана.');
  }
}

// Stub functions for missing handlers

export {
  showPersonalArmyShop, handlePersonalArmyInput, handleDirectArmyPurchase,
  handleArmyHamstersInput,
  requestJoinClan, acceptClanJoinRequest, rejectClanJoinRequest, showClanRequests,
  startSetDeputy, removeClanDeputy, handleDeputyNicknameInput,
  startRemoveMember, handleRemoveMemberNicknameInput, confirmRemoveMember,
  confirmLeaveClan, leaveClan
};

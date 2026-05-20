import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, MessageCircle, User, Coins } from "lucide-react";
import type { BotUser } from "@shared/schema";

export function BotUsers() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<BotUser | null>(null);

  const { data: users = [], isLoading, error } = useQuery<BotUser[]>({
    queryKey: ['/api/bot-users'],
  });

  const filteredUsers = users.filter(user => 
    user.nickname?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.telegramId.includes(searchQuery) ||
    user.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.lastName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getRegistrationStatusBadge = (user: BotUser) => {
    if (user.isRegistered) {
      return <Badge variant="default" data-testid={`status-${user.id}`}>Зарегистрирован</Badge>;
    }
    
    switch (user.registrationStep) {
      case "awaiting_nickname":
        return <Badge variant="outline" data-testid={`status-${user.id}`}>Ожидает никнейм</Badge>;
      case "awaiting_password":
        return <Badge variant="outline" data-testid={`status-${user.id}`}>Ожидает пароль</Badge>;
      case "awaiting_password_confirm":
        return <Badge variant="outline" data-testid={`status-${user.id}`}>Подтверждение пароля</Badge>;
      default:
        return <Badge variant="secondary" data-testid={`status-${user.id}`}>Не зарегистрирован</Badge>;
    }
  };

  const getUserDisplayName = (user: BotUser) => {
    if (user.nickname) return user.nickname;
    if (user.firstName && user.lastName) return `${user.firstName} ${user.lastName}`;
    if (user.firstName) return user.firstName;
    if (user.username) return `@${user.username}`;
    return `ID: ${user.telegramId}`;
  };

  const getUserInitials = (user: BotUser) => {
    if (user.nickname) return user.nickname.slice(0, 2).toUpperCase();
    if (user.firstName) return user.firstName[0].toUpperCase();
    return "U";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Загрузка пользователей...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-8">
        <p className="text-red-600 dark:text-red-400">Ошибка загрузки пользователей</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Поиск по никнейму, имени или Telegram ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search-users"
          />
        </div>
        <Badge variant="outline" data-testid="badge-total-users">
          Всего: {users.length}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Список пользователей</CardTitle>
              <CardDescription>
                {filteredUsers.length} из {users.length} пользователей
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Пользователь</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Хамяфки</TableHead>
                    <TableHead>Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow 
                      key={user.id} 
                      className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() => setSelectedUser(user)}
                      data-testid={`row-user-${user.id}`}
                    >
                      <TableCell className="flex items-center space-x-3">
                        <Avatar>
                          <AvatarFallback>{getUserInitials(user)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium" data-testid={`text-username-${user.id}`}>
                            {getUserDisplayName(user)}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400" data-testid={`text-telegram-id-${user.id}`}>
                            Telegram ID: {user.telegramId}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {getRegistrationStatusBadge(user)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-1">
                          <Coins className="h-4 w-4 text-yellow-500" />
                          <span data-testid={`text-hamsters-${user.id}`}>{user.hamsters || "0"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedUser(user);
                          }}
                          data-testid={`button-view-${user.id}`}
                        >
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {filteredUsers.length === 0 && (
                <div className="text-center py-8">
                  <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">
                    {searchQuery ? "Пользователи не найдены" : "Нет пользователей"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1">
          {selectedUser ? (
            <Card>
              <CardHeader>
                <CardTitle>Детали пользователя</CardTitle>
                <CardDescription>
                  Информация о выбранном пользователе
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-3">
                  <Avatar className="h-16 w-16">
                    <AvatarFallback className="text-lg">
                      {getUserInitials(selectedUser)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="text-lg font-semibold" data-testid="text-selected-user-name">
                      {getUserDisplayName(selectedUser)}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400" data-testid="text-selected-user-id">
                      {selectedUser.telegramId}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <label className="font-medium text-gray-700 dark:text-gray-300">Имя</label>
                    <p className="text-gray-600 dark:text-gray-400" data-testid="text-selected-user-firstname">
                      {selectedUser.firstName || "—"}
                    </p>
                  </div>
                  <div>
                    <label className="font-medium text-gray-700 dark:text-gray-300">Фамилия</label>
                    <p className="text-gray-600 dark:text-gray-400" data-testid="text-selected-user-lastname">
                      {selectedUser.lastName || "—"}
                    </p>
                  </div>
                  <div>
                    <label className="font-medium text-gray-700 dark:text-gray-300">Username</label>
                    <p className="text-gray-600 dark:text-gray-400" data-testid="text-selected-user-username">
                      {selectedUser.username ? `@${selectedUser.username}` : "—"}
                    </p>
                  </div>
                  <div>
                    <label className="font-medium text-gray-700 dark:text-gray-300">Хамяфки</label>
                    <p className="text-gray-600 dark:text-gray-400" data-testid="text-selected-user-hamsters">
                      {selectedUser.hamsters || "0"}
                    </p>
                  </div>
                </div>

                <div>
                  <label className="font-medium text-gray-700 dark:text-gray-300">Статус регистрации</label>
                  <div className="mt-1">
                    {getRegistrationStatusBadge(selectedUser)}
                  </div>
                </div>

                {selectedUser.referralCode && (
                  <div>
                    <label className="font-medium text-gray-700 dark:text-gray-300">Реферальный код</label>
                    <p className="text-gray-600 dark:text-gray-400 font-mono text-sm" data-testid="text-selected-user-referral">
                      {selectedUser.referralCode}
                    </p>
                  </div>
                )}

                <Button 
                  className="w-full" 
                  onClick={() => {
                    // TODO: Open message dialog
                    console.log("Open message dialog for user:", selectedUser.id);
                  }}
                  data-testid="button-message-user"
                >
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Отправить сообщение
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center p-8">
                <div className="text-center">
                  <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">
                    Выберите пользователя для просмотра деталей
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
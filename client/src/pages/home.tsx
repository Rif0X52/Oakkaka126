import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { User, Users, UserCheck, Settings } from "lucide-react";
import { Link } from "wouter";
import type { BotUser } from "@shared/schema";

export default function Home() {
  const { data: users, isLoading, error } = useQuery<BotUser[]>({
    queryKey: ['/api/bot-users'],
    queryFn: async () => {
      const response = await fetch('/api/bot-users');
      if (!response.ok) throw new Error('Failed to fetch users');
      return response.json();
    }
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4" data-testid="loading-state">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-64 mb-8"></div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-48 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center" data-testid="error-state">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600 dark:text-red-400">Ошибка</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 dark:text-gray-400">
              Не удалось загрузить пользователей
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const registeredUsers = users?.filter(user => user.isRegistered) || [];
  const unregisteredUsers = users?.filter(user => !user.isRegistered) || [];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4" data-testid="home-page">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2" data-testid="page-title">
                Телеграм Бот - Пользователи
              </h1>
              <p className="text-gray-600 dark:text-gray-400" data-testid="page-description">
                Система управления пользователями телеграм бота
              </p>
            </div>
            <Link href="/admin">
              <Button data-testid="button-admin-panel">
                <Settings className="h-4 w-4 mr-2" />
                Админ-панель
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3 mb-8">
          <Card data-testid="stats-total-users">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Всего пользователей</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="total-users-count">
                {users?.length || 0}
              </div>
            </CardContent>
          </Card>

          <Card data-testid="stats-registered-users">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Зарегистрированных</CardTitle>
              <UserCheck className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600" data-testid="registered-users-count">
                {registeredUsers.length}
              </div>
            </CardContent>
          </Card>

          <Card data-testid="stats-pending-users">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">В процессе регистрации</CardTitle>
              <User className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600" data-testid="pending-users-count">
                {unregisteredUsers.length}
              </div>
            </CardContent>
          </Card>
        </div>

        {registeredUsers.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4" data-testid="registered-section-title">
              Зарегистрированные пользователи
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" data-testid="registered-users-grid">
              {registeredUsers.map((user) => (
                <Card key={user.id} data-testid={`user-card-${user.id}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg" data-testid={`user-nickname-${user.id}`}>
                        {user.nickname}
                      </CardTitle>
                      <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                        Активен
                      </Badge>
                    </div>
                    <CardDescription data-testid={`user-name-${user.id}`}>
                      {user.firstName} {user.lastName}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="text-sm">
                        <span className="text-gray-500 dark:text-gray-400">Telegram ID:</span>
                        <span className="ml-2 font-mono" data-testid={`user-telegram-id-${user.id}`}>
                          {user.telegramId}
                        </span>
                      </div>
                      {user.username && (
                        <div className="text-sm">
                          <span className="text-gray-500 dark:text-gray-400">Username:</span>
                          <span className="ml-2 font-mono" data-testid={`user-username-${user.id}`}>
                            @{user.username}
                          </span>
                        </div>
                      )}
                      <div className="text-sm">
                        <span className="text-gray-500 dark:text-gray-400">Пароль:</span>
                        <span className="ml-2" data-testid={`user-password-status-${user.id}`}>
                          {user.password ? '✅ Установлен' : '❌ Не установлен'}
                        </span>
                      </div>
                      {user.phoneNumber && (
                        <div className="text-sm">
                          <span className="text-gray-500 dark:text-gray-400">Телефон:</span>
                          <span className="ml-2 font-mono" data-testid={`user-phone-${user.id}`}>
                            {user.phoneNumber}
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {unregisteredUsers.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4" data-testid="pending-section-title">
              В процессе регистрации
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" data-testid="pending-users-grid">
              {unregisteredUsers.map((user) => (
                <Card key={user.id} data-testid={`pending-user-card-${user.id}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg" data-testid={`pending-user-name-${user.id}`}>
                        {user.firstName || 'Новый пользователь'}
                      </CardTitle>
                      <Badge variant="outline" className="border-orange-200 text-orange-800 dark:border-orange-800 dark:text-orange-200">
                        Ожидает
                      </Badge>
                    </div>
                    <CardDescription data-testid={`pending-user-step-${user.id}`}>
                      {user.registrationStep === 'awaiting_nickname' 
                        ? 'Ожидает ввода никнейма' 
                        : user.registrationStep === 'awaiting_password'
                        ? 'Ожидает создания пароля'
                        : user.registrationStep === 'awaiting_password_confirm'
                        ? 'Ожидает подтверждения пароля'
                        : user.registrationStep === 'changing_nickname'
                        ? 'Изменяет никнейм'
                        : user.registrationStep === 'changing_password'
                        ? 'Изменяет пароль'
                        : 'Начальный этап'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="text-sm">
                        <span className="text-gray-500 dark:text-gray-400">Telegram ID:</span>
                        <span className="ml-2 font-mono" data-testid={`pending-user-telegram-id-${user.id}`}>
                          {user.telegramId}
                        </span>
                      </div>
                      {user.username && (
                        <div className="text-sm">
                          <span className="text-gray-500 dark:text-gray-400">Username:</span>
                          <span className="ml-2 font-mono" data-testid={`pending-user-username-${user.id}`}>
                            @{user.username}
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {(!users || users.length === 0) && (
          <div className="text-center py-12" data-testid="empty-state">
            <Users className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-600 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Пользователей пока нет
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Отправьте команду /start в телеграм боте, чтобы начать регистрацию
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
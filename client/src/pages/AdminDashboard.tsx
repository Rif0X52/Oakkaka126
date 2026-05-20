import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, MessageCircle, Target, AlertTriangle, Settings } from "lucide-react";
import { RoleManager } from "@/components/RoleManager";

interface BotUser {
  id: string;
  telegramId: string;
  nickname: string;
  firstName?: string;
  lastName?: string;
  isRegistered: boolean;
  hamsters: string;
  registrationStep: string;
  referredBy?: string;
}

interface AdTask {
  id: string;
  creatorId: string;
  type: string;
  title: string;
  totalAmount: string;
  remainingAmount: string;
  subscribersNeeded: string;
  subscribersGot: string;
  isActive: boolean;
  createdAt: string;
}

interface Message {
  id: string;
  telegramChatId: string;
  telegramUserId: string;
  userName: string;
  messageText: string;
  messageType: string;
  isFromBot: boolean;
  createdAt: string;
}

export default function AdminDashboard() {
  const { data: users, isLoading: usersLoading } = useQuery<BotUser[]>({
    queryKey: ['/api/bot-users'],
  });

  const { data: tasks, isLoading: tasksLoading } = useQuery<AdTask[]>({
    queryKey: ['/api/ad-tasks'],
  });

  const { data: messages, isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ['/api/messages'],
  });

  const registeredUsers = users?.filter(user => user.isRegistered) || [];
  const activeTasks = tasks?.filter(task => task.isActive) || [];
  const recentMessages = messages?.slice(-50) || [];

  const totalHamsters = registeredUsers.reduce((sum, user) => sum + parseInt(user.hamsters || '0'), 0);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Админ Панель</h1>
        <Badge variant="outline">ID: 5286005736</Badge>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Всего пользователей</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              Зарегистрированных: {registeredUsers.length}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Активные задания</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeTasks.length}</div>
            <p className="text-xs text-muted-foreground">
              Всего заданий: {tasks?.length || 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Сообщений сегодня</CardTitle>
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{recentMessages.length}</div>
            <p className="text-xs text-muted-foreground">
              Последние 50 сообщений
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Общий баланс</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalHamsters.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">хамяфков</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="users">Пользователи</TabsTrigger>
          <TabsTrigger value="tasks">Задания</TabsTrigger>
          <TabsTrigger value="messages">Сообщения</TabsTrigger>
          <TabsTrigger value="roles">Роли</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Последние регистрации</CardTitle>
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <div>Загрузка...</div>
              ) : (
                <div className="space-y-2">
                  {registeredUsers.slice(-10).reverse().map((user) => (
                    <div key={user.id} className="flex items-center justify-between p-2 border rounded">
                      <div>
                        <div className="font-medium">{user.nickname}</div>
                        <div className="text-sm text-muted-foreground">
                          ID: {user.telegramId} | {user.firstName} {user.lastName}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{parseInt(user.hamsters).toLocaleString()} 🐹</div>
                        <Badge variant={user.isRegistered ? "default" : "secondary"}>
                          {user.isRegistered ? "Зарегистрирован" : "Не завершил"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tasks" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Активные задания</CardTitle>
            </CardHeader>
            <CardContent>
              {tasksLoading ? (
                <div>Загрузка...</div>
              ) : (
                <div className="space-y-2">
                  {activeTasks.map((task) => (
                    <div key={task.id} className="flex items-center justify-between p-2 border rounded">
                      <div>
                        <div className="font-medium">{task.title}</div>
                        <div className="text-sm text-muted-foreground">
                          Тип: {task.type} | Создатель: {task.creatorId}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{parseInt(task.totalAmount).toLocaleString()} 🐹</div>
                        <div className="text-sm text-muted-foreground">
                          {task.subscribersGot}/{task.subscribersNeeded}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="messages" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Последние сообщения</CardTitle>
            </CardHeader>
            <CardContent>
              {messagesLoading ? (
                <div>Загрузка...</div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {recentMessages.reverse().map((message) => (
                    <div key={message.id} className="flex items-start justify-between p-2 border rounded">
                      <div className="flex-1">
                        <div className="font-medium">{message.userName}</div>
                        <div className="text-sm">{message.messageText}</div>
                        <div className="text-xs text-muted-foreground">
                          Chat: {message.telegramChatId} | Type: {message.messageType}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(message.createdAt).toLocaleString('ru-RU')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles" className="space-y-4">
          <RoleManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
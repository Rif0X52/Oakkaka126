import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Send, MessageSquare, Users, Clock, CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { BotUser, Chat, WebMessage } from "@shared/schema";

export function MessageCenter() {
  const [messageText, setMessageText] = useState("");
  const [selectedRecipient, setSelectedRecipient] = useState<"user" | "chat">("user");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedChatId, setSelectedChatId] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: users = [] } = useQuery<BotUser[]>({
    queryKey: ['/api/bot-users'],
  });

  const { data: chats = [] } = useQuery<Chat[]>({
    queryKey: ['/api/chats'],
  });

  const { data: webMessages = [], isLoading: isLoadingMessages } = useQuery<WebMessage[]>({
    queryKey: ['/api/web-messages'],
    refetchInterval: 5000, // Обновлять каждые 5 секунд
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (data: { targetChatId: string; targetUserId?: string; messageText: string }) => {
      const response = await fetch('/api/web-messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        throw new Error('Failed to send message');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Сообщение отправлено",
        description: "Ваше сообщение добавлено в очередь отправки",
      });
      setMessageText("");
      setSelectedUserId("");
      setSelectedChatId("");
      queryClient.invalidateQueries({ queryKey: ['/api/web-messages'] });
    },
    onError: () => {
      toast({
        title: "Ошибка",
        description: "Не удалось отправить сообщение",
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = () => {
    if (!messageText.trim()) {
      toast({
        title: "Ошибка",
        description: "Введите текст сообщения",
        variant: "destructive",
      });
      return;
    }

    if (selectedRecipient === "user" && !selectedUserId) {
      toast({
        title: "Ошибка", 
        description: "Выберите пользователя",
        variant: "destructive",
      });
      return;
    }

    if (selectedRecipient === "chat" && !selectedChatId) {
      toast({
        title: "Ошибка",
        description: "Выберите чат",
        variant: "destructive",
      });
      return;
    }

    const targetChatId = selectedRecipient === "user" 
      ? selectedUserId // Для личных сообщений используем Telegram ID пользователя как chat ID
      : selectedChatId;

    sendMessageMutation.mutate({
      targetChatId,
      targetUserId: selectedRecipient === "user" ? selectedUserId : undefined,
      messageText: messageText.trim(),
    });
  };

  const getSelectedUser = () => {
    return users.find(user => user.telegramId === selectedUserId);
  };

  const getSelectedChat = () => {
    return chats.find(chat => chat.telegramChatId === selectedChatId);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      {/* Быстрые шаблоны сообщений */}
      <Card>
        <CardHeader>
          <CardTitle>Быстрые шаблоны</CardTitle>
          <CardDescription>
            Нажмите на шаблон, чтобы быстро использовать готовое сообщение
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMessageText("Добро пожаловать в наш бот! 🎉")}
              data-testid="template-welcome"
            >
              Приветствие
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMessageText("Спасибо за использование нашего бота! ❤️")}
              data-testid="template-thanks"
            >
              Благодарность
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMessageText("Бот временно недоступен. Попробуйте позже. 🔧")}
              data-testid="template-maintenance"
            >
              Тех. работы
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMessageText("Если у вас есть вопросы, обратитесь к администратору. 📞")}
              data-testid="template-support"
            >
              Поддержка
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="send" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="send" data-testid="tab-send-message">
            <Send className="h-4 w-4 mr-2" />
            Отправить сообщение
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-message-history">
            <Clock className="h-4 w-4 mr-2" />
            История сообщений
          </TabsTrigger>
        </TabsList>

        <TabsContent value="send">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Новое сообщение</CardTitle>
                <CardDescription>
                  Отправьте сообщение пользователю или в чат через бота
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Тип получателя</label>
                  <Select value={selectedRecipient} onValueChange={(value: "user" | "chat") => setSelectedRecipient(value)}>
                    <SelectTrigger data-testid="select-recipient-type">
                      <SelectValue placeholder="Выберите тип получателя" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">Личное сообщение пользователю</SelectItem>
                      <SelectItem value="chat">Сообщение в чат</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {selectedRecipient === "user" && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">Пользователь</label>
                    
                    {/* Быстрый доступ к активным пользователям */}
                    <div className="mb-3">
                      <div className="text-xs text-gray-500 mb-2">Недавно активные:</div>
                      <div className="flex flex-wrap gap-1">
                        {users
                          .filter(user => user.isRegistered)
                          .slice(0, 6)
                          .map((user) => (
                          <Button
                            key={user.id}
                            variant={selectedUserId === user.telegramId ? "default" : "outline"}
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => setSelectedUserId(user.telegramId)}
                            data-testid={`quick-user-${user.id}`}
                          >
                            {user.nickname || user.firstName || `@${user.username}` || 'Пользователь'}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                      <SelectTrigger data-testid="select-user">
                        <SelectValue placeholder="Выберите пользователя" />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map((user) => (
                          <SelectItem key={user.id} value={user.telegramId}>
                            {user.nickname || user.firstName || `@${user.username}` || user.telegramId}
                            {user.nickname && (
                              <span className="ml-2 text-gray-500">
                                ({user.firstName || user.telegramId})
                              </span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {selectedRecipient === "chat" && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">Чат</label>
                    <Select value={selectedChatId} onValueChange={setSelectedChatId}>
                      <SelectTrigger data-testid="select-chat">
                        <SelectValue placeholder="Выберите чат" />
                      </SelectTrigger>
                      <SelectContent>
                        {chats.map((chat) => (
                          <SelectItem key={chat.id} value={chat.telegramChatId}>
                            {chat.chatTitle || "Без названия"}
                            <span className="ml-2 text-gray-500">
                              ({chat.chatType})
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium mb-2 block">Текст сообщения</label>
                  <Textarea
                    placeholder="Введите ваше сообщение..."
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    rows={5}
                    className="resize-none"
                    data-testid="textarea-message"
                  />
                  <div className="flex justify-between items-center text-sm text-gray-500 mt-1">
                    <span>Символов: {messageText.length}</span>
                    <div className="space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setMessageText("")}
                        disabled={!messageText}
                        className="text-xs h-6 px-2"
                      >
                        Очистить
                      </Button>
                    </div>
                  </div>
                </div>

                <Button 
                  onClick={handleSendMessage}
                  disabled={sendMessageMutation.isPending || !messageText.trim()}
                  className="w-full"
                  data-testid="button-send-message"
                >
                  {sendMessageMutation.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Отправка...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Отправить сообщение
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Предварительный просмотр</CardTitle>
                <CardDescription>
                  Как будет выглядеть ваше сообщение
                </CardDescription>
              </CardHeader>
              <CardContent>
                {selectedRecipient === "user" && selectedUserId && getSelectedUser() && (
                  <div className="space-y-3">
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded">
                      <h4 className="font-medium text-blue-900 dark:text-blue-100">
                        Получатель:
                      </h4>
                      <div className="flex items-center space-x-2 mt-1">
                        <Users className="h-4 w-4 text-blue-600" />
                        <span data-testid="preview-recipient-user">
                          {getSelectedUser()?.nickname || getSelectedUser()?.firstName || `@${getSelectedUser()?.username}` || getSelectedUser()?.telegramId}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {selectedRecipient === "chat" && selectedChatId && getSelectedChat() && (
                  <div className="space-y-3">
                    <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded">
                      <h4 className="font-medium text-green-900 dark:text-green-100">
                        Чат:
                      </h4>
                      <div className="flex items-center space-x-2 mt-1">
                        <MessageSquare className="h-4 w-4 text-green-600" />
                        <span data-testid="preview-recipient-chat">
                          {getSelectedChat()?.chatTitle || "Без названия"}
                        </span>
                        <Badge variant="outline">
                          {getSelectedChat()?.chatType}
                        </Badge>
                      </div>
                    </div>
                  </div>
                )}

                {messageText && (
                  <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded">
                    <h4 className="font-medium mb-2">Текст сообщения:</h4>
                    <div className="bg-white dark:bg-gray-700 p-3 rounded border-l-4 border-blue-500" data-testid="preview-message-text">
                      {messageText}
                    </div>
                  </div>
                )}

                {!messageText && (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Введите сообщение для предварительного просмотра</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>История отправленных сообщений</CardTitle>
              <CardDescription>
                Список всех сообщений, отправленных через веб-интерфейс
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingMessages ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-600 dark:text-gray-400">Загрузка истории сообщений...</p>
                </div>
              ) : webMessages.length > 0 ? (
                <div className="space-y-4">
                  {webMessages
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .map((message) => (
                    <div 
                      key={message.id} 
                      className="p-4 border rounded-lg"
                      data-testid={`message-history-${message.id}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <Badge variant={message.sent ? "default" : "outline"}>
                            {message.sent ? (
                              <>
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Отправлено
                              </>
                            ) : (
                              <>
                                <Clock className="h-3 w-3 mr-1" />
                                В очереди
                              </>
                            )}
                          </Badge>
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {message.targetUserId ? "Личное сообщение" : "Групповое сообщение"}
                          </span>
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {formatDate(message.createdAt)}
                        </div>
                      </div>
                      
                      <div className="mb-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Получатель: 
                        </span>
                        <span className="text-sm text-gray-600 dark:text-gray-400 ml-1" data-testid={`message-target-${message.id}`}>
                          {message.targetChatId}
                        </span>
                      </div>

                      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                        <p className="text-gray-800 dark:text-gray-200" data-testid={`message-content-${message.id}`}>
                          {message.messageText}
                        </p>
                      </div>

                      {message.sent && message.sentAt && (
                        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                          Отправлено: {formatDate(message.sentAt)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">
                    Пока нет отправленных сообщений
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
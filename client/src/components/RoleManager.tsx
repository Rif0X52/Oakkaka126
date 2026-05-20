import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Trash2, Users, Settings, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

interface CustomRole {
  id: string;
  chatId: string;
  name: string;
  displayName: string;
  permissions: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

interface RoleAssignment {
  id: string;
  chatId: string;
  userId: string;
  roleId: string;
  assignedBy: string;
  createdAt: string;
}

interface Chat {
  id: string;
  chatId: string;
  title?: string;
  type: string;
}

const AVAILABLE_PERMISSIONS = [
  { id: 'mute', label: 'Мут пользователей', description: 'Возможность мутить пользователей' },
  { id: 'unmute', label: 'Снятие мута', description: 'Возможность снимать мут с пользователей' },
  { id: 'delete_messages', label: 'Удаление сообщений', description: 'Возможность удалять сообщения' },
  { id: 'warn_users', label: 'Предупреждения', description: 'Возможность выдавать предупреждения' },
  { id: 'manage_ads', label: 'Управление рекламой', description: 'Включение/отключение рекламы в чате' },
];

export function RoleManager() {
  const [selectedChatId, setSelectedChatId] = useState<string>('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<CustomRole | null>(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch chats
  const { data: chats = [] } = useQuery<Chat[]>({
    queryKey: ['/api/chats'],
  });

  // Fetch custom roles for selected chat
  const { data: roles = [], isLoading: rolesLoading } = useQuery<CustomRole[]>({
    queryKey: ['/api/custom-roles', selectedChatId],
    queryFn: () => fetch(`/api/custom-roles?chatId=${selectedChatId}`).then(res => res.json()),
    enabled: !!selectedChatId,
  });

  // Fetch role assignments for selected chat
  const { data: assignments = [] } = useQuery<RoleAssignment[]>({
    queryKey: ['/api/role-assignments', selectedChatId],
    queryFn: () => fetch(`/api/role-assignments?chatId=${selectedChatId}`).then(res => res.json()),
    enabled: !!selectedChatId,
  });

  // Create role mutation
  const createRoleMutation = useMutation({
    mutationFn: async (roleData: Partial<CustomRole>) => {
      const response = await fetch('/api/custom-roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(roleData),
      });
      if (!response.ok) throw new Error('Failed to create role');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/custom-roles'] });
      setCreateDialogOpen(false);
      setNewRoleName('');
      setSelectedPermissions([]);
      toast({ title: 'Роль создана успешно!' });
    },
    onError: () => {
      toast({ title: 'Ошибка при создании роли', variant: 'destructive' });
    },
  });

  // Update role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<CustomRole> & { id: string }) => {
      const response = await fetch(`/api/custom-roles/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error('Failed to update role');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/custom-roles'] });
      setEditingRole(null);
      setSelectedPermissions([]);
      toast({ title: 'Роль обновлена успешно!' });
    },
    onError: () => {
      toast({ title: 'Ошибка при обновлении роли', variant: 'destructive' });
    },
  });

  // Delete role mutation
  const deleteRoleMutation = useMutation({
    mutationFn: async (roleId: string) => {
      const response = await fetch(`/api/custom-roles/${roleId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete role');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/custom-roles'] });
      toast({ title: 'Роль удалена успешно!' });
    },
    onError: () => {
      toast({ title: 'Ошибка при удалении роли', variant: 'destructive' });
    },
  });

  const handleCreateRole = () => {
    if (!selectedChatId || !newRoleName.trim()) return;
    
    createRoleMutation.mutate({
      chatId: selectedChatId,
      name: newRoleName.toLowerCase(),
      displayName: newRoleName,
      permissions: JSON.stringify(selectedPermissions),
      createdBy: 'admin', // In real app, get from auth context
    });
  };

  const handleUpdateRole = () => {
    if (!editingRole) return;
    
    updateRoleMutation.mutate({
      id: editingRole.id,
      permissions: JSON.stringify(selectedPermissions),
      displayName: editingRole.displayName,
    });
  };

  const handleDeleteRole = (roleId: string) => {
    if (confirm('Вы уверены, что хотите удалить эту роль? Все назначения будут также удалены.')) {
      deleteRoleMutation.mutate(roleId);
    }
  };

  const startEditingRole = (role: CustomRole) => {
    setEditingRole(role);
    try {
      const permissions = JSON.parse(role.permissions || '[]');
      setSelectedPermissions(permissions);
    } catch {
      setSelectedPermissions([]);
    }
  };

  const togglePermission = (permissionId: string) => {
    setSelectedPermissions(prev => 
      prev.includes(permissionId)
        ? prev.filter(p => p !== permissionId)
        : [...prev, permissionId]
    );
  };

  const getRoleAssignmentsCount = (roleId: string) => {
    return assignments.filter(a => a.roleId === roleId).length;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Управление ролями</h2>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Создавайте и настраивайте пользовательские роли для модерации чатов
        </p>
      </div>

      {/* Chat selection */}
      <Card>
        <CardHeader>
          <CardTitle>Выбор чата</CardTitle>
          <CardDescription>
            Выберите чат для управления ролями
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedChatId} onValueChange={setSelectedChatId}>
            <SelectTrigger data-testid="select-chat">
              <SelectValue placeholder="Выберите чат..." />
            </SelectTrigger>
            <SelectContent>
              {chats.map((chat) => (
                <SelectItem key={chat.id} value={chat.chatId}>
                  {chat.title || `Чат ${chat.chatId}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedChatId && (
        <>
          {/* Create role button */}
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Роли чата</h3>
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-role">
                  <Plus className="w-4 h-4 mr-2" />
                  Создать роль
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Создать новую роль</DialogTitle>
                  <DialogDescription>
                    Создайте пользовательскую роль с определенными правами доступа
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="role-name">Название роли</Label>
                    <Input
                      id="role-name"
                      value={newRoleName}
                      onChange={(e) => setNewRoleName(e.target.value)}
                      placeholder="Например: модер"
                      data-testid="input-role-name"
                    />
                  </div>
                  <div>
                    <Label>Права доступа</Label>
                    <div className="space-y-2 mt-2">
                      {AVAILABLE_PERMISSIONS.map((permission) => (
                        <div key={permission.id} className="flex items-start space-x-2">
                          <Checkbox
                            id={permission.id}
                            checked={selectedPermissions.includes(permission.id)}
                            onCheckedChange={() => togglePermission(permission.id)}
                            data-testid={`checkbox-permission-${permission.id}`}
                          />
                          <div className="grid gap-1.5 leading-none">
                            <Label htmlFor={permission.id} className="text-sm font-medium">
                              {permission.label}
                            </Label>
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              {permission.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Button 
                    onClick={handleCreateRole} 
                    disabled={!newRoleName.trim() || createRoleMutation.isPending}
                    data-testid="button-confirm-create"
                  >
                    Создать роль
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Roles list */}
          <div className="grid gap-4">
            {rolesLoading ? (
              <div>Загрузка ролей...</div>
            ) : roles.length === 0 ? (
              <Card>
                <CardContent className="text-center py-8">
                  <Users className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">
                    В этом чате пока нет пользовательских ролей
                  </p>
                </CardContent>
              </Card>
            ) : (
              roles.map((role) => (
                <Card key={role.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold text-lg">{role.displayName}</h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Создана: {new Date(role.createdAt).toLocaleDateString('ru-RU')}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <Users className="w-4 h-4" />
                          <span className="text-sm">{getRoleAssignmentsCount(role.id)} назначений</span>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {(() => {
                            try {
                              const permissions = JSON.parse(role.permissions || '[]');
                              return permissions.map((perm: string) => {
                                const permData = AVAILABLE_PERMISSIONS.find(p => p.id === perm);
                                return (
                                  <Badge key={perm} variant="secondary" className="text-xs">
                                    {permData?.label || perm}
                                  </Badge>
                                );
                              });
                            } catch {
                              return <Badge variant="secondary">Нет прав</Badge>;
                            }
                          })()}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startEditingRole(role)}
                          data-testid={`button-edit-role-${role.id}`}
                        >
                          <Settings className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteRole(role.id)}
                          data-testid={`button-delete-role-${role.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </>
      )}

      {/* Edit role dialog */}
      <Dialog open={!!editingRole} onOpenChange={() => setEditingRole(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Редактировать роль: {editingRole?.displayName}</DialogTitle>
            <DialogDescription>
              Измените права доступа для этой роли
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Права доступа</Label>
              <div className="space-y-2 mt-2">
                {AVAILABLE_PERMISSIONS.map((permission) => (
                  <div key={permission.id} className="flex items-start space-x-2">
                    <Checkbox
                      id={`edit-${permission.id}`}
                      checked={selectedPermissions.includes(permission.id)}
                      onCheckedChange={() => togglePermission(permission.id)}
                      data-testid={`checkbox-edit-permission-${permission.id}`}
                    />
                    <div className="grid gap-1.5 leading-none">
                      <Label htmlFor={`edit-${permission.id}`} className="text-sm font-medium">
                        {permission.label}
                      </Label>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {permission.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <Button 
              onClick={handleUpdateRole} 
              disabled={updateRoleMutation.isPending}
              data-testid="button-confirm-update"
            >
              Сохранить изменения
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
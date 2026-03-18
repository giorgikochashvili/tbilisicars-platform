import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useListAdminTeam,
  useCreateAdminTeamMember,
  useUpdateAdminTeamMember,
  useDeleteAdminTeamMember,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, MoreHorizontal, Edit, Trash2, Shield, User, Lock } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export default function TeamPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<any>(null);
  const [formData, setFormData] = useState({ 
    username: "", email: "", fullName: "", password: "",
    adminRole: "agent" as any, isActive: true,
    permissions: [] as string[]
  });
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const reqOpts = { request: { credentials: "include" as const } };
  const { data: team, isLoading } = useListAdminTeam(reqOpts);
  
  const createMutation = useCreateAdminTeamMember(reqOpts);
  const updateMutation = useUpdateAdminTeamMember(reqOpts);
  const deleteMutation = useDeleteAdminTeamMember(reqOpts);

  const handleOpenModal = (member: any = null) => {
    if (member) {
      setEditingMember(member);
      setFormData({
        username: member.username || "",
        email: member.email || "",
        fullName: member.fullName || "",
        password: "", // Leave blank for edit
        adminRole: member.adminRole || "agent",
        isActive: member.isActive ?? true,
        permissions: member.permissions || [],
      });
    } else {
      setEditingMember(null);
      setFormData({ 
        username: "", email: "", fullName: "", password: "",
        adminRole: "agent", isActive: true, permissions: []
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = () => {
    const payload = {
      ...formData,
    };

    if (editingMember) {
      // Don't send password if empty when updating
      if (!payload.password) {
        delete (payload as any).password;
      }
      
      updateMutation.mutate(
        { id: editingMember.id, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Success", description: "Team member updated" });
            queryClient.invalidateQueries();
            setIsModalOpen(false);
          },
          onError: (err: any) => {
            toast({ title: "Error", description: err.message || "Failed to update", variant: "destructive" });
          }
        }
      );
    } else {
      if (!payload.password) {
        toast({ title: "Validation Error", description: "Password is required for new users", variant: "destructive" });
        return;
      }
      createMutation.mutate(
        { data: payload as any },
        {
          onSuccess: () => {
            toast({ title: "Success", description: "Team member created" });
            queryClient.invalidateQueries();
            setIsModalOpen(false);
          },
          onError: (err: any) => {
            toast({ title: "Error", description: err.message || "Failed to create", variant: "destructive" });
          }
        }
      );
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to remove this team member? This action cannot be undone.")) {
      deleteMutation.mutate(
        { id },
        {
          onSuccess: () => {
            toast({ title: "Success", description: "Team member deleted" });
            queryClient.invalidateQueries();
          },
          onError: (err: any) => {
            toast({ title: "Error", description: err.message || "Failed to delete", variant: "destructive" });
          }
        }
      );
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold font-display tracking-tight flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" /> Team Management
          </h2>
          <p className="text-muted-foreground">Manage administrative access and roles</p>
        </div>
        <Button onClick={() => handleOpenModal()} className="shadow-sm hover-elevate">
          <Plus className="w-4 h-4 mr-2" /> Add Member
        </Button>
      </div>

      <Card className="border-border/40 bg-card/60 backdrop-blur-md shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="border-border/40 hover:bg-transparent">
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <div className="space-y-1">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-3 w-32" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto rounded-md" /></TableCell>
                  </TableRow>
                ))
              ) : team?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    <User className="w-8 h-8 opacity-20 mx-auto mb-2" />
                    No team members found
                  </TableCell>
                </TableRow>
              ) : (
                team?.map((member: any) => (
                  <TableRow key={member.id} className="border-border/20 hover:bg-muted/30 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                          <User className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium text-foreground">{member.fullName || member.username}</div>
                          <div className="text-xs text-muted-foreground">{member.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        member.adminRole === 'superadmin' ? "bg-purple-500/10 text-purple-500 border-purple-500/20" :
                        member.adminRole === 'manager' ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                        "bg-slate-500/10 text-slate-500 border-slate-500/20"
                      }>
                        {member.adminRole.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {member.isActive ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">Suspended</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {member.lastLoginAt ? new Date(member.lastLoginAt).toLocaleString() : 'Never'}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleOpenModal(member)}>
                            <Edit className="w-4 h-4 mr-2" /> Edit User
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(member.id)} className="text-destructive focus:text-destructive">
                            <Trash2 className="w-4 h-4 mr-2" /> Remove User
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">{editingMember ? "Edit Team Member" : "Add Team Member"}</DialogTitle>
            <DialogDescription>Assign roles and system access permissions.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Username</Label>
                <Input value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} placeholder="johndoe" />
              </div>
              <div className="grid gap-2">
                <Label>Full Name</Label>
                <Input value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} placeholder="John Doe" />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Email</Label>
              <Input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="john@tbilisicars.com" />
            </div>

            <div className="grid gap-2">
              <Label className="flex justify-between">
                <span>Password</span>
                {editingMember && <span className="text-xs text-muted-foreground font-normal">Leave blank to keep unchanged</span>}
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  type="password" 
                  className="pl-9"
                  value={formData.password} 
                  onChange={e => setFormData({...formData, password: e.target.value})} 
                  placeholder={editingMember ? "••••••••" : "Create secure password"} 
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Role</Label>
              <Select value={formData.adminRole} onValueChange={(val: any) => setFormData({...formData, adminRole: val})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="agent">Agent (Standard)</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="superadmin">Super Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between p-3 border border-border/50 rounded-lg mt-2 bg-muted/30">
              <div>
                <Label className="text-base">Account Status</Label>
                <p className="text-sm text-muted-foreground">Allow user to login</p>
              </div>
              <Switch checked={formData.isActive} onCheckedChange={val => setFormData({...formData, isActive: val})} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

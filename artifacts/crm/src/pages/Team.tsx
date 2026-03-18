import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Plus, MoreHorizontal, Edit, Trash2, Shield, User, Lock, Phone } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const API = "/api/admin/team";

async function apiFetch(url: string, options: RequestInit = {}) {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

type AdminRole = "admin" | "regional_manager" | "service_manager" | "rental_agent";

interface TeamMember {
  id: number;
  username: string;
  email: string;
  fullName: string;
  phoneNumber: string | null;
  adminRole: AdminRole;
  isActive: boolean;
  lastLogin: string | null;
  createdAt: string;
}

const ROLE_LABELS: Record<AdminRole, string> = {
  admin: "Admin",
  regional_manager: "Regional Manager",
  service_manager: "Service Manager",
  rental_agent: "Rental Agent",
};

const ROLE_COLORS: Record<AdminRole, string> = {
  admin: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  regional_manager: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  service_manager: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  rental_agent: "bg-slate-500/10 text-slate-500 border-slate-500/20",
};

interface FormData {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  phoneNumber: string;
  password: string;
  adminRole: AdminRole;
  isActive: boolean;
}

const DEFAULT_FORM: FormData = {
  firstName: "",
  lastName: "",
  username: "",
  email: "",
  phoneNumber: "",
  password: "",
  adminRole: "rental_agent",
  isActive: true,
};

export default function TeamPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(DEFAULT_FORM);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: team = [], isLoading } = useQuery<TeamMember[]>({
    queryKey: ["admin-team"],
    queryFn: () => apiFetch(API),
  });

  const createMutation = useMutation({
    mutationFn: (payload: object) => apiFetch(API, { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      toast({ title: "Success", description: "Team member created" });
      queryClient.invalidateQueries({ queryKey: ["admin-team"] });
      setIsModalOpen(false);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: object }) =>
      apiFetch(`${API}/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => {
      toast({ title: "Success", description: "Team member updated" });
      queryClient.invalidateQueries({ queryKey: ["admin-team"] });
      setIsModalOpen(false);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`${API}/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Success", description: "Team member removed" });
      queryClient.invalidateQueries({ queryKey: ["admin-team"] });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const setField = <K extends keyof FormData>(key: K, val: FormData[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  const openCreate = () => {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setIsModalOpen(true);
  };

  const openEdit = (member: TeamMember) => {
    const parts = member.fullName.split(" ");
    setEditingId(member.id);
    setForm({
      firstName: parts[0] ?? "",
      lastName: parts.slice(1).join(" "),
      username: member.username,
      email: member.email,
      phoneNumber: member.phoneNumber ?? "",
      password: "",
      adminRole: member.adminRole,
      isActive: member.isActive,
    });
    setIsModalOpen(true);
  };

  const handleSave = () => {
    const fullName = [form.firstName, form.lastName].filter(Boolean).join(" ");
    if (!fullName) {
      toast({ title: "Validation Error", description: "Name is required", variant: "destructive" });
      return;
    }
    const payload: Record<string, unknown> = {
      fullName,
      username: form.username,
      email: form.email,
      phoneNumber: form.phoneNumber || null,
      adminRole: form.adminRole,
      isActive: form.isActive,
    };
    if (form.password) payload.password = form.password;

    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, payload });
    } else {
      if (!form.password) {
        toast({ title: "Validation Error", description: "Password is required for new users", variant: "destructive" });
        return;
      }
      createMutation.mutate(payload);
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to remove this team member? This action cannot be undone.")) {
      deleteMutation.mutate(id);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold font-display tracking-tight flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" /> Team Management
          </h2>
          <p className="text-muted-foreground">Manage administrative access and roles</p>
        </div>
        <Button onClick={openCreate} className="shadow-sm">
          <Plus className="w-4 h-4 mr-2" /> Add Member
        </Button>
      </div>

      <Card className="border-border/40 bg-card/60 backdrop-blur-md shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="border-border/40 hover:bg-transparent">
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-8 w-8 rounded-full" />
                          <div className="space-y-1">
                            <Skeleton className="h-4 w-28" />
                            <Skeleton className="h-3 w-36" />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell><Skeleton className="h-6 w-28 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto rounded-md" /></TableCell>
                    </TableRow>
                  ))
                : team.length === 0
                ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                        <User className="w-8 h-8 opacity-20 mx-auto mb-2" />
                        No team members found
                      </TableCell>
                    </TableRow>
                  )
                : team.map((member) => (
                    <TableRow key={member.id} className="border-border/20 hover:bg-muted/30 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                            <User className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <div className="font-medium text-foreground">{member.fullName || member.username}</div>
                            <div className="text-xs text-muted-foreground">{member.email}</div>
                            {member.phoneNumber && (
                              <div className="text-xs text-muted-foreground flex items-center gap-1">
                                <Phone className="w-3 h-3" /> {member.phoneNumber}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={ROLE_COLORS[member.adminRole]}>
                          {ROLE_LABELS[member.adminRole]}
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
                        {member.lastLogin ? new Date(member.lastLogin).toLocaleString() : "Never"}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(member)}>
                              <Edit className="w-4 h-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDelete(member.id)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="w-4 h-4 mr-2" /> Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {editingId !== null ? "Edit Team Member" : "Add Team Member"}
            </DialogTitle>
            <DialogDescription>Assign roles and system access for this CRM user.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>First Name</Label>
                <Input
                  value={form.firstName}
                  onChange={(e) => setField("firstName", e.target.value)}
                  placeholder="John"
                />
              </div>
              <div className="grid gap-2">
                <Label>Last Name</Label>
                <Input
                  value={form.lastName}
                  onChange={(e) => setField("lastName", e.target.value)}
                  placeholder="Doe"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Username</Label>
                <Input
                  value={form.username}
                  onChange={(e) => setField("username", e.target.value)}
                  placeholder="johndoe"
                />
              </div>
              <div className="grid gap-2">
                <Label>Phone</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    value={form.phoneNumber}
                    onChange={(e) => setField("phoneNumber", e.target.value)}
                    placeholder="+995 555 000 000"
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setField("email", e.target.value)}
                placeholder="john@tbilisicars.ge"
              />
            </div>

            <div className="grid gap-2">
              <Label className="flex justify-between">
                <span>Password</span>
                {editingId !== null && (
                  <span className="text-xs text-muted-foreground font-normal">Leave blank to keep unchanged</span>
                )}
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="password"
                  className="pl-9"
                  value={form.password}
                  onChange={(e) => setField("password", e.target.value)}
                  placeholder={editingId !== null ? "••••••••" : "Create secure password"}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Role</Label>
              <Select value={form.adminRole} onValueChange={(val) => setField("adminRole", val as AdminRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rental_agent">Rental Agent</SelectItem>
                  <SelectItem value="service_manager">Service Manager</SelectItem>
                  <SelectItem value="regional_manager">Regional Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between p-3 border border-border/50 rounded-lg bg-muted/30">
              <div>
                <Label className="text-base">Account Status</Label>
                <p className="text-sm text-muted-foreground">Allow this user to log in</p>
              </div>
              <Switch
                checked={form.isActive}
                onCheckedChange={(val) => setField("isActive", val)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, MoreHorizontal, Edit, Trash2, Shield, User, Lock, Phone, Settings,
  ChevronDown, CheckSquare, Square
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const API_TEAM = "/api/admin/team";
const API_ROLES = "/api/admin/roles";

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

type LegacyAdminRole = "admin" | "regional_manager" | "service_manager" | "rental_agent";

interface TeamMember {
  id: number;
  username: string;
  email: string;
  fullName: string;
  phoneNumber: string | null;
  adminRole: LegacyAdminRole;
  roleId: number | null;
  isActive: boolean;
  lastLogin: string | null;
  createdAt: string;
}

interface RoleItem {
  id: number;
  name: string;
  description: string | null;
  color: string | null;
  isSystem: boolean;
  isActive: boolean;
  permissions: Record<string, boolean>;
  memberCount?: number;
  createdAt: string;
  updatedAt: string;
}

const LEGACY_ROLE_LABELS: Record<LegacyAdminRole, string> = {
  admin: "Admin",
  regional_manager: "Regional Manager",
  service_manager: "Service Manager",
  rental_agent: "Rental Agent",
};

const PERMISSION_MODULES: Array<{
  label: string;
  permissions: Array<{ key: string; label: string }>;
}> = [
  {
    label: "Bookings",
    permissions: [
      { key: "canManageBookings", label: "Manage Bookings" },
      { key: "canManageCases", label: "Manage Cases" },
    ],
  },
  {
    label: "Fleet",
    permissions: [
      { key: "canManageVehicles", label: "Manage Vehicles" },
      { key: "canManageDamages", label: "Manage Damages" },
      { key: "canViewCalendar", label: "View Fleet Calendar" },
    ],
  },
  {
    label: "Service",
    permissions: [
      { key: "canManageService", label: "Manage Service & Maintenance" },
    ],
  },
  {
    label: "Accounting",
    permissions: [
      { key: "canViewAccounting", label: "View Accounting" },
      { key: "canManageAccounting", label: "Manage Accounting" },
    ],
  },
  {
    label: "Reports",
    permissions: [
      { key: "canViewReports", label: "View Reports" },
    ],
  },
  {
    label: "Alerts",
    permissions: [
      { key: "canViewAlerts", label: "View Alerts" },
      { key: "canManageTasks", label: "Manage Tasks" },
    ],
  },
  {
    label: "Customers",
    permissions: [
      { key: "canViewReviews", label: "View Customer Reviews" },
    ],
  },
  {
    label: "Locations",
    permissions: [
      { key: "canManageLocations", label: "Manage Locations" },
    ],
  },
  {
    label: "Extras",
    permissions: [
      { key: "canManageExtras", label: "Manage Extras" },
    ],
  },
  {
    label: "Rates",
    permissions: [
      { key: "canManageRates", label: "Manage Rates" },
    ],
  },
  {
    label: "Promotions",
    permissions: [
      { key: "canManagePromotions", label: "Manage Promotions" },
    ],
  },
  {
    label: "Team & Users",
    permissions: [
      { key: "canManageUsers", label: "Manage Team Members & Customers" },
    ],
  },
  {
    label: "Audit Log",
    permissions: [
      { key: "canViewAuditLog", label: "View Audit Log" },
    ],
  },
  {
    label: "TBS Air Parking",
    permissions: [
      { key: "canManageParking", label: "Manage Parking" },
    ],
  },
  {
    label: "Admin AI",
    permissions: [
      { key: "canUseAdminAI", label: "Use Admin AI Assistant" },
    ],
  },
  {
    label: "Settings",
    permissions: [
      { key: "canManageSettings", label: "Manage System Settings" },
    ],
  },
];

const PRESET_COLORS = [
  { label: "Purple", value: "#8b5cf6" },
  { label: "Blue", value: "#3b82f6" },
  { label: "Orange", value: "#f97316" },
  { label: "Slate", value: "#64748b" },
  { label: "Green", value: "#22c55e" },
  { label: "Red", value: "#ef4444" },
  { label: "Pink", value: "#ec4899" },
  { label: "Teal", value: "#14b8a6" },
];

function getRoleBadgeStyle(color: string | null) {
  const c = color ?? "#64748b";
  return { backgroundColor: `${c}18`, color: c, borderColor: `${c}40` };
}

interface MemberFormData {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  phoneNumber: string;
  password: string;
  roleId: string;
  isActive: boolean;
}

const DEFAULT_MEMBER_FORM: MemberFormData = {
  firstName: "",
  lastName: "",
  username: "",
  email: "",
  phoneNumber: "",
  password: "",
  roleId: "",
  isActive: true,
};

interface RoleFormData {
  name: string;
  description: string;
  color: string;
  permissions: Record<string, boolean>;
}

const DEFAULT_ROLE_FORM: RoleFormData = {
  name: "",
  description: "",
  color: "#64748b",
  permissions: {},
};

function PermissionMatrix({
  permissions,
  onChange,
}: {
  permissions: Record<string, boolean>;
  onChange: (updated: Record<string, boolean>) => void;
}) {
  const toggle = (key: string, value: boolean) =>
    onChange({ ...permissions, [key]: value });

  const toggleAll = (keys: string[], value: boolean) => {
    const updated = { ...permissions };
    for (const k of keys) updated[k] = value;
    onChange(updated);
  };

  return (
    <div className="space-y-4">
      {PERMISSION_MODULES.map((mod) => {
        const keys = mod.permissions.map((p) => p.key);
        const allGranted = keys.every((k) => permissions[k]);
        return (
          <div key={mod.label} className="border border-border/40 rounded-lg overflow-hidden">
            <div
              className="flex items-center justify-between px-3 py-2 bg-muted/40 cursor-pointer select-none"
              onClick={() => toggleAll(keys, !allGranted)}
            >
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {mod.label}
              </span>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground transition-colors"
                title={allGranted ? "Deselect all" : "Select all"}
              >
                {allGranted
                  ? <CheckSquare className="w-4 h-4 text-primary" />
                  : <Square className="w-4 h-4" />
                }
              </button>
            </div>
            <div className="divide-y divide-border/30">
              {mod.permissions.map((perm) => (
                <div key={perm.key} className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-sm text-foreground">{perm.label}</span>
                  <Switch
                    checked={!!permissions[perm.key]}
                    onCheckedChange={(v) => toggle(perm.key, v)}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function TeamPage() {
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<number | null>(null);
  const [memberForm, setMemberForm] = useState<MemberFormData>(DEFAULT_MEMBER_FORM);

  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<number | null>(null);
  const [roleForm, setRoleForm] = useState<RoleFormData>(DEFAULT_ROLE_FORM);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: team = [], isLoading: teamLoading } = useQuery<TeamMember[]>({
    queryKey: ["admin-team"],
    queryFn: () => apiFetch(API_TEAM),
  });

  const { data: roles = [], isLoading: rolesLoading } = useQuery<RoleItem[]>({
    queryKey: ["admin-roles"],
    queryFn: () => apiFetch(API_ROLES),
  });

  const editingMemberCurrentRoleId = editingMemberId !== null
    ? team.find((m) => m.id === editingMemberId)?.roleId ?? null
    : null;

  const { data: rolesForEdit = roles } = useQuery<RoleItem[]>({
    queryKey: ["admin-roles", editingMemberCurrentRoleId],
    queryFn: () =>
      editingMemberCurrentRoleId
        ? apiFetch(`${API_ROLES}?includeRoleId=${editingMemberCurrentRoleId}`)
        : apiFetch(API_ROLES),
    enabled: memberModalOpen,
  });

  const createMemberMutation = useMutation({
    mutationFn: (payload: object) => apiFetch(API_TEAM, { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      toast({ title: "Success", description: "Team member created" });
      queryClient.invalidateQueries({ queryKey: ["admin-team"] });
      setMemberModalOpen(false);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMemberMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: object }) =>
      apiFetch(`${API_TEAM}/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => {
      toast({ title: "Success", description: "Team member updated" });
      queryClient.invalidateQueries({ queryKey: ["admin-team"] });
      setMemberModalOpen(false);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMemberMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`${API_TEAM}/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Success", description: "Team member removed" });
      queryClient.invalidateQueries({ queryKey: ["admin-team"] });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const createRoleMutation = useMutation({
    mutationFn: (payload: object) => apiFetch(API_ROLES, { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      toast({ title: "Success", description: "Role created" });
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
      setRoleModalOpen(false);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: object }) =>
      apiFetch(`${API_ROLES}/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => {
      toast({ title: "Success", description: "Role updated" });
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-team"] });
      setRoleModalOpen(false);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deactivateRoleMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`${API_ROLES}/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Success", description: "Role deactivated" });
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const setMemberField = <K extends keyof MemberFormData>(key: K, val: MemberFormData[K]) =>
    setMemberForm((f) => ({ ...f, [key]: val }));

  const openCreateMember = () => {
    setEditingMemberId(null);
    setMemberForm(DEFAULT_MEMBER_FORM);
    setMemberModalOpen(true);
  };

  const openEditMember = (member: TeamMember) => {
    const parts = member.fullName.split(" ");
    setEditingMemberId(member.id);
    setMemberForm({
      firstName: parts[0] ?? "",
      lastName: parts.slice(1).join(" "),
      username: member.username,
      email: member.email,
      phoneNumber: member.phoneNumber ?? "",
      password: "",
      roleId: member.roleId !== null ? String(member.roleId) : "",
      isActive: member.isActive,
    });
    setMemberModalOpen(true);
  };

  const handleSaveMember = () => {
    const fullName = [memberForm.firstName, memberForm.lastName].filter(Boolean).join(" ");
    if (!fullName) {
      toast({ title: "Validation Error", description: "Name is required", variant: "destructive" });
      return;
    }
    if (!memberForm.roleId) {
      toast({ title: "Validation Error", description: "Please select a role for this member", variant: "destructive" });
      return;
    }

    const payload: Record<string, unknown> = {
      fullName,
      username: memberForm.username,
      email: memberForm.email,
      phoneNumber: memberForm.phoneNumber || null,
      isActive: memberForm.isActive,
      roleId: Number(memberForm.roleId),
    };
    if (memberForm.password) payload.password = memberForm.password;

    if (editingMemberId !== null) {
      updateMemberMutation.mutate({ id: editingMemberId, payload });
    } else {
      if (!memberForm.password) {
        toast({ title: "Validation Error", description: "Password is required for new users", variant: "destructive" });
        return;
      }
      createMemberMutation.mutate(payload);
    }
  };

  const openCreateRole = () => {
    setEditingRoleId(null);
    setRoleForm(DEFAULT_ROLE_FORM);
    setRoleModalOpen(true);
  };

  const openEditRole = (role: RoleItem) => {
    setEditingRoleId(role.id);
    setRoleForm({
      name: role.name,
      description: role.description ?? "",
      color: role.color ?? "#64748b",
      permissions: { ...role.permissions },
    });
    setRoleModalOpen(true);
  };

  const handleSaveRole = () => {
    if (!roleForm.name.trim()) {
      toast({ title: "Validation Error", description: "Role name is required", variant: "destructive" });
      return;
    }
    const payload = {
      name: roleForm.name.trim(),
      description: roleForm.description || undefined,
      color: roleForm.color,
      permissions: roleForm.permissions,
    };
    if (editingRoleId !== null) {
      updateRoleMutation.mutate({ id: editingRoleId, payload });
    } else {
      createRoleMutation.mutate(payload);
    }
  };

  const isMemberSaving = createMemberMutation.isPending || updateMemberMutation.isPending;
  const isRoleSaving = createRoleMutation.isPending || updateRoleMutation.isPending;

  const selectedRole = memberForm.roleId
    ? rolesForEdit.find((r) => r.id === Number(memberForm.roleId))
    : null;

  const grantedPermissions = selectedRole
    ? Object.entries(selectedRole.permissions)
        .filter(([, v]) => v)
        .map(([k]) => permKeyToLabel(k))
    : [];

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold font-display tracking-tight flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" /> Team Management
          </h2>
          <p className="text-muted-foreground">Manage administrative access and roles</p>
        </div>
      </div>

      <Tabs defaultValue="members">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
        </TabsList>

        {/* ─── Members Tab ─────────────────────────────────────────── */}
        <TabsContent value="members" className="mt-4">
          <div className="flex justify-end mb-4">
            <Button onClick={openCreateMember} className="shadow-sm">
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
                  {teamLoading
                    ? Array.from({ length: 4 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><div className="flex items-center gap-3"><Skeleton className="h-8 w-8 rounded-full" /><div className="space-y-1"><Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-36" /></div></div></TableCell>
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
                    : team.map((member) => {
                        const assignedRole = roles.find((r) => r.id === member.roleId);
                        const roleLabel = assignedRole?.name ?? LEGACY_ROLE_LABELS[member.adminRole];
                        const roleColor = assignedRole?.color ?? null;
                        return (
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
                              <Badge
                                variant="outline"
                                style={getRoleBadgeStyle(roleColor)}
                              >
                                {roleLabel}
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
                                  <DropdownMenuItem onClick={() => openEditMember(member)}>
                                    <Edit className="w-4 h-4 mr-2" /> Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      if (confirm("Remove this team member? This action cannot be undone.")) {
                                        deleteMemberMutation.mutate(member.id);
                                      }
                                    }}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" /> Remove
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* ─── Roles Tab ───────────────────────────────────────────── */}
        <TabsContent value="roles" className="mt-4">
          <div className="flex justify-end mb-4">
            <Button onClick={openCreateRole} className="shadow-sm">
              <Plus className="w-4 h-4 mr-2" /> Add Role
            </Button>
          </div>
          <Card className="border-border/40 bg-card/60 backdrop-blur-md shadow-sm">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="border-border/40 hover:bg-transparent">
                    <TableHead>Role</TableHead>
                    <TableHead>Permissions</TableHead>
                    <TableHead>Members</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rolesLoading
                    ? Array.from({ length: 4 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                          <TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto rounded-md" /></TableCell>
                        </TableRow>
                      ))
                    : roles.length === 0
                    ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                            <Settings className="w-8 h-8 opacity-20 mx-auto mb-2" />
                            No roles found
                          </TableCell>
                        </TableRow>
                      )
                    : roles.map((role) => {
                        const grantedCount = Object.values(role.permissions).filter(Boolean).length;
                        const totalCount = Object.keys(role.permissions).length;
                        const membersUsingRole = team.filter((m) => m.roleId === role.id).length;
                        return (
                          <TableRow key={role.id} className="border-border/20 hover:bg-muted/30 transition-colors">
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-3 h-3 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: role.color ?? "#64748b" }}
                                />
                                <span className="font-medium">{role.name}</span>
                                {role.isSystem && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-primary/5 text-primary border-primary/20">
                                    System
                                  </Badge>
                                )}
                              </div>
                              {role.description && (
                                <p className="text-xs text-muted-foreground mt-0.5 ml-5">{role.description}</p>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-muted-foreground">
                                {grantedCount} / {totalCount} granted
                              </span>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {membersUsingRole}
                            </TableCell>
                            <TableCell>
                              {role.isActive ? (
                                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Active</Badge>
                              ) : (
                                <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">Inactive</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => openEditRole(role)}>
                                    <Edit className="w-4 h-4 mr-2" /> Edit
                                  </DropdownMenuItem>
                                  {!role.isSystem && role.isActive && (
                                    <DropdownMenuItem
                                      onClick={() => {
                                        if (membersUsingRole > 0) {
                                          toast({
                                            title: "Cannot deactivate",
                                            description: `${membersUsingRole} member(s) are assigned this role. Reassign them first.`,
                                            variant: "destructive",
                                          });
                                          return;
                                        }
                                        if (confirm(`Deactivate the "${role.name}" role?`)) {
                                          deactivateRoleMutation.mutate(role.id);
                                        }
                                      }}
                                      className="text-destructive focus:text-destructive"
                                    >
                                      <Trash2 className="w-4 h-4 mr-2" /> Deactivate
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─── Member Add/Edit Dialog ─────────────────────────────────── */}
      <Dialog open={memberModalOpen} onOpenChange={setMemberModalOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {editingMemberId !== null ? "Edit Team Member" : "Add Team Member"}
            </DialogTitle>
            <DialogDescription>Assign roles and system access for this CRM user.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>First Name</Label>
                <Input value={memberForm.firstName} onChange={(e) => setMemberField("firstName", e.target.value)} placeholder="John" />
              </div>
              <div className="grid gap-2">
                <Label>Last Name</Label>
                <Input value={memberForm.lastName} onChange={(e) => setMemberField("lastName", e.target.value)} placeholder="Doe" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Username</Label>
                <Input value={memberForm.username} onChange={(e) => setMemberField("username", e.target.value)} placeholder="johndoe" />
              </div>
              <div className="grid gap-2">
                <Label>Phone</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input className="pl-9" value={memberForm.phoneNumber} onChange={(e) => setMemberField("phoneNumber", e.target.value)} placeholder="+995 555 000 000" />
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Email</Label>
              <Input type="email" value={memberForm.email} onChange={(e) => setMemberField("email", e.target.value)} placeholder="john@tbilisicars.ge" />
            </div>

            <div className="grid gap-2">
              <Label className="flex justify-between">
                <span>Password</span>
                {editingMemberId !== null && (
                  <span className="text-xs text-muted-foreground font-normal">Leave blank to keep unchanged</span>
                )}
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input type="password" className="pl-9" value={memberForm.password} onChange={(e) => setMemberField("password", e.target.value)} placeholder={editingMemberId !== null ? "••••••••" : "Create secure password"} />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Role</Label>
              <Select value={memberForm.roleId} onValueChange={(val) => setMemberField("roleId", val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role…" />
                </SelectTrigger>
                <SelectContent>
                  {rolesForEdit.map((role) => (
                    <SelectItem key={role.id} value={String(role.id)}>
                      <span className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0"
                          style={{ backgroundColor: role.color ?? "#64748b" }}
                        />
                        {role.name}
                        {!role.isActive && <span className="text-xs text-muted-foreground">(inactive)</span>}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedRole && grantedPermissions.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {grantedPermissions.slice(0, 6).map((label) => (
                    <span key={label} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                      {label}
                    </span>
                  ))}
                  {grantedPermissions.length > 6 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/40">
                      +{grantedPermissions.length - 6} more
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between p-3 border border-border/50 rounded-lg bg-muted/30">
              <div>
                <Label className="text-base">Account Status</Label>
                <p className="text-sm text-muted-foreground">Allow this user to log in</p>
              </div>
              <Switch checked={memberForm.isActive} onCheckedChange={(val) => setMemberField("isActive", val)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMemberModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveMember} disabled={isMemberSaving}>
              {isMemberSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Role Add/Edit Dialog ──────────────────────────────────── */}
      <Dialog open={roleModalOpen} onOpenChange={setRoleModalOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {editingRoleId !== null ? "Edit Role" : "Create Role"}
            </DialogTitle>
            <DialogDescription>
              Define a role and its module permissions. Members assigned this role will inherit these permissions.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-4">
            <div className="grid gap-2">
              <Label>Role Name</Label>
              <Input
                value={roleForm.name}
                onChange={(e) => setRoleForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Regional Coordinator"
              />
            </div>

            <div className="grid gap-2">
              <Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                value={roleForm.description}
                onChange={(e) => setRoleForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Brief description of this role's responsibilities"
                rows={2}
              />
            </div>

            <div className="grid gap-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    onClick={() => setRoleForm((f) => ({ ...f, color: c.value }))}
                    className="w-7 h-7 rounded-full border-2 transition-all hover:scale-110 focus:outline-none"
                    style={{
                      backgroundColor: c.value,
                      borderColor: roleForm.color === c.value ? "#fff" : c.value,
                      boxShadow: roleForm.color === c.value ? `0 0 0 2px ${c.value}` : "none",
                    }}
                  />
                ))}
              </div>
            </div>

            <Separator />

            <div className="grid gap-2">
              <Label className="text-base font-semibold">Permissions</Label>
              <p className="text-sm text-muted-foreground -mt-1">
                Click a module header to toggle all permissions in that section.
              </p>
              <PermissionMatrix
                permissions={roleForm.permissions}
                onChange={(updated) => setRoleForm((f) => ({ ...f, permissions: updated }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveRole} disabled={isRoleSaving}>
              {isRoleSaving ? "Saving..." : editingRoleId !== null ? "Save Changes" : "Create Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function permKeyToLabel(key: string): string {
  for (const mod of PERMISSION_MODULES) {
    const found = mod.permissions.find((p) => p.key === key);
    if (found) return found.label;
  }
  return key;
}


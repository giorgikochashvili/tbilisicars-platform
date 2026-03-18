import { Router, type IRouter } from "express";
import {
  ListAdminTeamResponse,
  GetAdminTeamMemberParams,
  GetAdminTeamMemberResponse,
  CreateAdminTeamMemberBody,
  UpdateAdminTeamMemberParams,
  UpdateAdminTeamMemberBody,
  UpdateAdminTeamMemberResponse,
  DeleteAdminTeamMemberParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import {
  listAdminTeam,
  getAdminTeamMember,
  createAdminTeamMember,
  updateAdminTeamMember,
  deleteAdminTeamMember,
} from "../services/admin-team.service.js";

const router: IRouter = Router();

router.get("/admin/team", requireAdmin, async (_req, res) => {
  const data = await listAdminTeam();
  res.json(ListAdminTeamResponse.parse(data));
});

router.post("/admin/team", requireAdmin, async (req, res) => {
  const body = CreateAdminTeamMemberBody.parse(req.body);
  const member = await createAdminTeamMember(body as any);
  res.status(201).json(member);
});

router.get("/admin/team/:id", requireAdmin, async (req, res) => {
  const { id } = GetAdminTeamMemberParams.parse({ id: req.params.id });
  const member = await getAdminTeamMember(id);
  res.json(GetAdminTeamMemberResponse.parse(member));
});

router.patch("/admin/team/:id", requireAdmin, async (req, res) => {
  const { id } = UpdateAdminTeamMemberParams.parse({ id: req.params.id });
  const body = UpdateAdminTeamMemberBody.parse(req.body);
  const member = await updateAdminTeamMember(id, body as any);
  res.json(UpdateAdminTeamMemberResponse.parse(member));
});

router.delete("/admin/team/:id", requireAdmin, async (req, res) => {
  const { id } = DeleteAdminTeamMemberParams.parse({ id: req.params.id });
  const result = await deleteAdminTeamMember(id);
  res.json(result);
});

export default router;

import { Router, type IRouter } from "express";
import {
  ListAdminExtrasResponse,
  GetAdminExtraParams,
  GetAdminExtraResponse,
  CreateAdminExtraBody,
  UpdateAdminExtraParams,
  UpdateAdminExtraBody,
  UpdateAdminExtraResponse,
  DeleteAdminExtraParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import {
  listAllExtras,
  getAdminExtra,
  createAdminExtra,
  updateAdminExtra,
  deleteAdminExtra,
} from "../services/admin-extras.service.js";

const router: IRouter = Router();

router.get("/admin/extras", requireAdmin, async (_req, res) => {
  const data = await listAllExtras();
  res.json(ListAdminExtrasResponse.parse(data));
});

router.post("/admin/extras", requireAdmin, async (req, res) => {
  const body = CreateAdminExtraBody.parse(req.body);
  const extra = await createAdminExtra(body as any);
  res.status(201).json(extra);
});

router.get("/admin/extras/:id", requireAdmin, async (req, res) => {
  const { id } = GetAdminExtraParams.parse({ id: req.params.id });
  const extra = await getAdminExtra(id);
  res.json(GetAdminExtraResponse.parse(extra));
});

router.patch("/admin/extras/:id", requireAdmin, async (req, res) => {
  const { id } = UpdateAdminExtraParams.parse({ id: req.params.id });
  const body = UpdateAdminExtraBody.parse(req.body);
  const extra = await updateAdminExtra(id, body as any);
  res.json(UpdateAdminExtraResponse.parse(extra));
});

router.delete("/admin/extras/:id", requireAdmin, async (req, res) => {
  const { id } = DeleteAdminExtraParams.parse({ id: req.params.id });
  const result = await deleteAdminExtra(id);
  res.json(result);
});

export default router;

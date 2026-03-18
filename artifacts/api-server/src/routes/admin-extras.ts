import { Router, type IRouter } from "express";
import {
  ListAdminExtrasResponse,
  GetAdminExtraParams,
  GetAdminExtraResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import {
  listAllExtras,
  getAdminExtra,
} from "../services/admin-extras.service.js";

const router: IRouter = Router();

router.get("/admin/extras", requireAdmin, async (_req, res) => {
  const data = await listAllExtras();
  res.json(ListAdminExtrasResponse.parse(data));
});

router.get("/admin/extras/:id", requireAdmin, async (req, res) => {
  const { id } = GetAdminExtraParams.parse({ id: req.params.id });
  const extra = await getAdminExtra(id);
  res.json(GetAdminExtraResponse.parse(extra));
});

export default router;

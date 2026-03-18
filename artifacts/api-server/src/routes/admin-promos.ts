import { Router, type IRouter } from "express";
import {
  ListAdminPromosResponse,
  GetAdminPromoParams,
  GetAdminPromoResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import {
  listAllPromos,
  getAdminPromo,
} from "../services/admin-promos.service.js";

const router: IRouter = Router();

router.get("/admin/promos", requireAdmin, async (_req, res) => {
  const data = await listAllPromos();
  res.json(ListAdminPromosResponse.parse(data));
});

router.get("/admin/promos/:id", requireAdmin, async (req, res) => {
  const { id } = GetAdminPromoParams.parse({ id: req.params.id });
  const promo = await getAdminPromo(id);
  res.json(GetAdminPromoResponse.parse(promo));
});

export default router;

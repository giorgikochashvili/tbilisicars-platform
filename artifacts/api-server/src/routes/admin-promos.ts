import { Router, type IRouter } from "express";
import {
  ListAdminPromosResponse,
  GetAdminPromoParams,
  GetAdminPromoResponse,
  CreateAdminPromoBody,
  UpdateAdminPromoParams,
  UpdateAdminPromoBody,
  UpdateAdminPromoResponse,
  DeleteAdminPromoParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import {
  listAllPromos,
  getAdminPromo,
  createAdminPromo,
  updateAdminPromo,
  deleteAdminPromo,
} from "../services/admin-promos.service.js";

const router: IRouter = Router();

router.get("/admin/promos", requireAdmin, async (_req, res) => {
  const data = await listAllPromos();
  res.json(ListAdminPromosResponse.parse(data));
});

router.post("/admin/promos", requireAdmin, async (req, res) => {
  const body = CreateAdminPromoBody.parse(req.body);
  const promo = await createAdminPromo(body as any);
  res.status(201).json(promo);
});

router.get("/admin/promos/:id", requireAdmin, async (req, res) => {
  const { id } = GetAdminPromoParams.parse({ id: req.params.id });
  const promo = await getAdminPromo(id);
  res.json(GetAdminPromoResponse.parse(promo));
});

router.patch("/admin/promos/:id", requireAdmin, async (req, res) => {
  const { id } = UpdateAdminPromoParams.parse({ id: req.params.id });
  const body = UpdateAdminPromoBody.parse(req.body);
  const promo = await updateAdminPromo(id, body as any);
  res.json(UpdateAdminPromoResponse.parse(promo));
});

router.delete("/admin/promos/:id", requireAdmin, async (req, res) => {
  const { id } = DeleteAdminPromoParams.parse({ id: req.params.id });
  const result = await deleteAdminPromo(id);
  res.json(result);
});

export default router;

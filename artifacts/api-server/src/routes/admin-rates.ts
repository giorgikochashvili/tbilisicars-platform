import { Router, type IRouter } from "express";
import {
  ListAdminRatesResponse,
  GetAdminRateParams,
  GetAdminRateResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import {
  listAllRates,
  getAdminRate,
} from "../services/admin-rates.service.js";

const router: IRouter = Router();

router.get("/admin/rates", requireAdmin, async (_req, res) => {
  const data = await listAllRates();
  res.json(ListAdminRatesResponse.parse(data));
});

router.get("/admin/rates/:id", requireAdmin, async (req, res) => {
  const { id } = GetAdminRateParams.parse({ id: req.params.id });
  const rate = await getAdminRate(id);
  res.json(GetAdminRateResponse.parse(rate));
});

export default router;

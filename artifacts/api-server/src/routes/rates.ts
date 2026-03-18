import { Router, type IRouter } from "express";
import {
  GetRateParams,
  GetRateResponse,
  ListRatesResponse,
} from "@workspace/api-zod";
import { getRate, listRates } from "../services/rates.service.js";

const router: IRouter = Router();

router.get("/rates", async (_req, res) => {
  const data = await listRates();
  res.json(ListRatesResponse.parse(data));
});

router.get("/rates/:id", async (req, res) => {
  const { id } = GetRateParams.parse(req.params);
  const data = await getRate(id);
  res.json(GetRateResponse.parse(data));
});

export default router;

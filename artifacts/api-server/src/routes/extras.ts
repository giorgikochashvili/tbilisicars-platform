import { Router, type IRouter } from "express";
import { ListExtrasResponse } from "@workspace/api-zod";
import { listExtras } from "../services/extras.service.js";

const router: IRouter = Router();

router.get("/extras", async (_req, res) => {
  const data = await listExtras();
  res.json(ListExtrasResponse.parse(data));
});

export default router;

import { Router, type IRouter } from "express";
import {
  GetLocationParams,
  GetLocationResponse,
  ListLocationsResponse,
} from "@workspace/api-zod";
import { getLocation, listLocations } from "../services/locations.service.js";

const router: IRouter = Router();

router.get("/locations", async (_req, res) => {
  const data = await listLocations();
  res.json(ListLocationsResponse.parse(data));
});

router.get("/locations/:id", async (req, res) => {
  const { id } = GetLocationParams.parse(req.params);
  const data = await getLocation(id);
  res.json(GetLocationResponse.parse(data));
});

export default router;

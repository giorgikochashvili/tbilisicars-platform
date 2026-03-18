import { Router, type IRouter } from "express";
import {
  GetFleetVehicleParams,
  GetFleetVehicleResponse,
  ListFleetBrandsResponse,
  ListFleetGroupsResponse,
  ListFleetModelsResponse,
  ListFleetVehiclesQueryParams,
  ListFleetVehiclesResponse,
} from "@workspace/api-zod";
import {
  getVehicle,
  listBrands,
  listVehicleGroups,
  listVehicleModels,
  listVehicles,
} from "../services/fleet.service.js";

const router: IRouter = Router();

router.get("/fleet/brands", async (_req, res) => {
  const data = await listBrands();
  res.json(ListFleetBrandsResponse.parse(data));
});

router.get("/fleet/models", async (_req, res) => {
  const data = await listVehicleModels();
  res.json(ListFleetModelsResponse.parse(data));
});

router.get("/fleet/groups", async (_req, res) => {
  const data = await listVehicleGroups();
  res.json(ListFleetGroupsResponse.parse(data));
});

router.get("/fleet/vehicles", async (req, res) => {
  const filters = ListFleetVehiclesQueryParams.parse(req.query);
  const data = await listVehicles(filters);
  res.json(ListFleetVehiclesResponse.parse(data));
});

router.get("/fleet/vehicles/:id", async (req, res) => {
  const { id } = GetFleetVehicleParams.parse(req.params);
  const data = await getVehicle(id);
  res.json(GetFleetVehicleResponse.parse(data));
});

export default router;

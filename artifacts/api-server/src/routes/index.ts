import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import locationsRouter from "./locations.js";
import fleetRouter from "./fleet.js";
import ratesRouter from "./rates.js";
import extrasRouter from "./extras.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(locationsRouter);
router.use(fleetRouter);
router.use(ratesRouter);
router.use(extrasRouter);

export default router;

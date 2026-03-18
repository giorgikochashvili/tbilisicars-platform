import { Router, type IRouter } from "express";
import {
  ListAdminCustomersQueryParams,
  ListAdminCustomersResponse,
  GetAdminCustomerParams,
  GetAdminCustomerResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import {
  listAdminCustomers,
  getAdminCustomer,
} from "../services/admin-customers.service.js";

const router: IRouter = Router();

router.get("/admin/customers", requireAdmin, async (req, res) => {
  const { page, limit, search } = ListAdminCustomersQueryParams.parse(
    req.query,
  );
  const result = await listAdminCustomers(search, page, limit);
  res.json(ListAdminCustomersResponse.parse(result));
});

router.get("/admin/customers/:id", requireAdmin, async (req, res) => {
  const { id } = GetAdminCustomerParams.parse({ id: req.params.id });
  const customer = await getAdminCustomer(id);
  res.json(GetAdminCustomerResponse.parse(customer));
});

export default router;

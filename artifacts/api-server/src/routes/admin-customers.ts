import { Router, type IRouter } from "express";
import {
  ListAdminCustomersQueryParams,
  ListAdminCustomersResponse,
  GetAdminCustomerParams,
  GetAdminCustomerResponse,
  CreateAdminCustomerBody,
  UpdateAdminCustomerParams,
  UpdateAdminCustomerBody,
  UpdateAdminCustomerResponse,
  DeleteAdminCustomerParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import {
  listAdminCustomers,
  getAdminCustomer,
  createAdminCustomer,
  updateAdminCustomer,
  deleteAdminCustomer,
} from "../services/admin-customers.service.js";
import { logAudit } from "../services/audit.service.js";

const router: IRouter = Router();

router.get("/admin/customers", requireAdmin, async (req, res) => {
  const { page, limit, search } = ListAdminCustomersQueryParams.parse(req.query);
  const result = await listAdminCustomers(search, page, limit);
  res.json(ListAdminCustomersResponse.parse(result));
});

router.post("/admin/customers", requireAdmin, async (req, res) => {
  const body = CreateAdminCustomerBody.parse(req.body);
  const customer = await createAdminCustomer(body as any);
  logAudit({
    actorId: req.session.adminId ?? null,
    entityType: "customer",
    entityId: customer.id,
    entityRef: (customer as any).email ?? String(customer.id),
    action: "created",
    summary: `Admin created customer ${(customer as any).fullName ?? (customer as any).email ?? customer.id}`,
    afterData: { email: (customer as any).email, fullName: (customer as any).fullName },
  });
  res.status(201).json(customer);
});

router.get("/admin/customers/:id", requireAdmin, async (req, res) => {
  const { id } = GetAdminCustomerParams.parse({ id: req.params.id });
  const customer = await getAdminCustomer(id);
  res.json(GetAdminCustomerResponse.parse(customer));
});

router.patch("/admin/customers/:id", requireAdmin, async (req, res) => {
  const { id } = UpdateAdminCustomerParams.parse({ id: req.params.id });
  const body = UpdateAdminCustomerBody.parse(req.body);
  const customer = await updateAdminCustomer(id, body as any);
  logAudit({
    actorId: req.session.adminId ?? null,
    entityType: "customer",
    entityId: id,
    entityRef: (customer as any).email ?? String(id),
    action: "updated",
    summary: `Admin updated customer ${(customer as any).fullName ?? (customer as any).email ?? id}`,
    afterData: { email: (customer as any).email, fullName: (customer as any).fullName },
  });
  res.json(UpdateAdminCustomerResponse.parse(customer));
});

router.delete("/admin/customers/:id", requireAdmin, async (req, res) => {
  const { id } = DeleteAdminCustomerParams.parse({ id: req.params.id });
  const result = await deleteAdminCustomer(id);
  logAudit({
    actorId: req.session.adminId ?? null,
    entityType: "customer",
    entityId: id,
    entityRef: String(id),
    action: "deleted",
    summary: `Admin deleted customer ID ${id}`,
  });
  res.json(result);
});

export default router;

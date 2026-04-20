import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  MutationFunction,
  QueryFunction,
  QueryKey,
  UseMutationOptions,
  UseMutationResult,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";
import type { ErrorType, BodyType } from "./custom-fetch";

// ── Type stubs (mirrors the Zod schemas in api-zod) ───────────────────────────

export interface DiscountVehicleModelItem {
  vehicleModelId: number;
  modelName: string | null;
  brandName: string | null;
}

export interface AdminDiscountItem {
  id: number;
  name: string;
  discountType: "PERCENT" | "FIXED";
  value: string | number;
  startDate: string;
  endDate: string;
  pickupLocationId: number;
  pickupLocationName: string | null;
  pickupLocationCity: string | null;
  isActive: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
  vehicleModels: DiscountVehicleModelItem[];
}

export interface CreateAdminDiscountBody {
  name: string;
  discountType: "PERCENT" | "FIXED";
  value: number;
  startDate: string;
  endDate: string;
  pickupLocationId: number;
  isActive?: boolean;
  vehicleModelIds: number[];
}

export interface UpdateAdminDiscountBody {
  name?: string;
  discountType?: "PERCENT" | "FIXED";
  value?: number;
  startDate?: string;
  endDate?: string;
  pickupLocationId?: number;
  isActive?: boolean;
  vehicleModelIds?: number[];
}

type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];

// ── List ──────────────────────────────────────────────────────────────────────

export const getListAdminDiscountsUrl = () => `/api/admin/discounts`;

export const listAdminDiscounts = async (
  options?: RequestInit,
): Promise<AdminDiscountItem[]> => {
  return customFetch<AdminDiscountItem[]>(getListAdminDiscountsUrl(), {
    ...options,
    method: "GET",
  });
};

export const getListAdminDiscountsQueryKey = () =>
  [`/api/admin/discounts`] as const;

export const getListAdminDiscountsQueryOptions = <
  TData = Awaited<ReturnType<typeof listAdminDiscounts>>,
  TError = ErrorType<unknown>,
>(options?: {
  query?: UseQueryOptions<Awaited<ReturnType<typeof listAdminDiscounts>>, TError, TData>;
  request?: SecondParameter<typeof customFetch>;
}) => {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? getListAdminDiscountsQueryKey();
  const queryFn: QueryFunction<Awaited<ReturnType<typeof listAdminDiscounts>>> = ({
    signal,
  }) => listAdminDiscounts({ signal, ...requestOptions });
  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof listAdminDiscounts>>, TError, TData
  > & { queryKey: QueryKey };
};

export function useListAdminDiscounts<
  TData = Awaited<ReturnType<typeof listAdminDiscounts>>,
  TError = ErrorType<unknown>,
>(options?: {
  query?: UseQueryOptions<Awaited<ReturnType<typeof listAdminDiscounts>>, TError, TData>;
  request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const queryOptions = getListAdminDiscountsQueryOptions(options);
  const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & { queryKey: QueryKey };
  query.queryKey = queryOptions.queryKey;
  return query;
}

// ── Create ─────────────────────────────────────────────────────────────────────

export const getCreateAdminDiscountUrl = () => `/api/admin/discounts`;

export const createAdminDiscount = async (
  body: CreateAdminDiscountBody,
  options?: RequestInit,
): Promise<AdminDiscountItem> => {
  return customFetch<AdminDiscountItem>(getCreateAdminDiscountUrl(), {
    ...options,
    method: "POST",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(body),
  });
};

export const getCreateAdminDiscountMutationOptions = <
  TError = ErrorType<unknown>,
  TContext = unknown,
>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof createAdminDiscount>>,
    TError,
    { data: BodyType<CreateAdminDiscountBody> },
    TContext
  >;
  request?: SecondParameter<typeof customFetch>;
}): UseMutationOptions<
  Awaited<ReturnType<typeof createAdminDiscount>>,
  TError,
  { data: BodyType<CreateAdminDiscountBody> },
  TContext
> => {
  const { mutation: mutationOptions, request: requestOptions } = options ?? {};
  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof createAdminDiscount>>,
    { data: BodyType<CreateAdminDiscountBody> }
  > = ({ data }) => createAdminDiscount(data, requestOptions);
  return { mutationFn, ...mutationOptions };
};

export function useCreateAdminDiscount<TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof createAdminDiscount>>,
      TError,
      { data: BodyType<CreateAdminDiscountBody> },
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationResult<
  Awaited<ReturnType<typeof createAdminDiscount>>,
  TError,
  { data: BodyType<CreateAdminDiscountBody> },
  TContext
> {
  const mutationOptions = getCreateAdminDiscountMutationOptions(options);
  return useMutation(mutationOptions);
}

// ── Update ─────────────────────────────────────────────────────────────────────

export const getUpdateAdminDiscountUrl = (id: number) =>
  `/api/admin/discounts/${id}`;

export const updateAdminDiscount = async (
  id: number,
  body: UpdateAdminDiscountBody,
  options?: RequestInit,
): Promise<AdminDiscountItem> => {
  return customFetch<AdminDiscountItem>(getUpdateAdminDiscountUrl(id), {
    ...options,
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(body),
  });
};

export const getUpdateAdminDiscountMutationOptions = <
  TError = ErrorType<unknown>,
  TContext = unknown,
>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof updateAdminDiscount>>,
    TError,
    { id: number; data: BodyType<UpdateAdminDiscountBody> },
    TContext
  >;
  request?: SecondParameter<typeof customFetch>;
}): UseMutationOptions<
  Awaited<ReturnType<typeof updateAdminDiscount>>,
  TError,
  { id: number; data: BodyType<UpdateAdminDiscountBody> },
  TContext
> => {
  const { mutation: mutationOptions, request: requestOptions } = options ?? {};
  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof updateAdminDiscount>>,
    { id: number; data: BodyType<UpdateAdminDiscountBody> }
  > = ({ id, data }) => updateAdminDiscount(id, data, requestOptions);
  return { mutationFn, ...mutationOptions };
};

export function useUpdateAdminDiscount<TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof updateAdminDiscount>>,
      TError,
      { id: number; data: BodyType<UpdateAdminDiscountBody> },
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationResult<
  Awaited<ReturnType<typeof updateAdminDiscount>>,
  TError,
  { id: number; data: BodyType<UpdateAdminDiscountBody> },
  TContext
> {
  const mutationOptions = getUpdateAdminDiscountMutationOptions(options);
  return useMutation(mutationOptions);
}

// ── Delete ─────────────────────────────────────────────────────────────────────

export const getDeleteAdminDiscountUrl = (id: number) =>
  `/api/admin/discounts/${id}`;

export const deleteAdminDiscount = async (
  id: number,
  options?: RequestInit,
): Promise<{ message: string }> => {
  return customFetch<{ message: string }>(getDeleteAdminDiscountUrl(id), {
    ...options,
    method: "DELETE",
  });
};

export const getDeleteAdminDiscountMutationOptions = <
  TError = ErrorType<unknown>,
  TContext = unknown,
>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof deleteAdminDiscount>>,
    TError,
    { id: number },
    TContext
  >;
  request?: SecondParameter<typeof customFetch>;
}): UseMutationOptions<
  Awaited<ReturnType<typeof deleteAdminDiscount>>,
  TError,
  { id: number },
  TContext
> => {
  const { mutation: mutationOptions, request: requestOptions } = options ?? {};
  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof deleteAdminDiscount>>,
    { id: number }
  > = ({ id }) => deleteAdminDiscount(id, requestOptions);
  return { mutationFn, ...mutationOptions };
};

export function useDeleteAdminDiscount<TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof deleteAdminDiscount>>,
      TError,
      { id: number },
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationResult<
  Awaited<ReturnType<typeof deleteAdminDiscount>>,
  TError,
  { id: number },
  TContext
> {
  const mutationOptions = getDeleteAdminDiscountMutationOptions(options);
  return useMutation(mutationOptions);
}

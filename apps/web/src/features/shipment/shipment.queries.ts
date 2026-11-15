import { keepPreviousData } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiQuery } from "@/lib/query/use-api-query";

import { shipmentKeys } from "./shipment.keys";

import type { Page } from "@otd/contracts/common";
import type {
  BookingDetailDto,
  BookingDto,
  ShipmentDetailDto,
  ShipmentDto,
  ShipmentKpiDto,
} from "@otd/contracts/shipment";

type Params = Record<string, string | number | boolean | undefined>;

export function useShipmentsQuery(params: Params) {
  return useApiQuery<Page<ShipmentDto>>({
    queryKey: shipmentKeys.list(params),
    queryFn: () => api.get<Page<ShipmentDto>>("/shipments", params),
    placeholderData: keepPreviousData,
  });
}

export function useShipmentKpisQuery() {
  return useApiQuery<ShipmentKpiDto>({
    queryKey: shipmentKeys.kpis(),
    queryFn: () => api.get<ShipmentKpiDto>("/shipments/kpis"),
  });
}

export function useShipmentQuery(id: string) {
  return useApiQuery<ShipmentDetailDto>({
    queryKey: shipmentKeys.detail(id),
    queryFn: () => api.get<ShipmentDetailDto>(`/shipments/${id}`),
  });
}

export function useBookingsQuery(params: Params, enabled = true) {
  return useApiQuery<Page<BookingDto>>({
    queryKey: shipmentKeys.bookings(params),
    queryFn: () => api.get<Page<BookingDto>>("/bookings", params),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useBookingQuery(id: string | null) {
  return useApiQuery<BookingDetailDto>({
    queryKey: shipmentKeys.booking(id ?? "none"),
    queryFn: () => api.get<BookingDetailDto>(`/bookings/${id}`),
    enabled: Boolean(id),
  });
}

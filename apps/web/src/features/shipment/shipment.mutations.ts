import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiMutation } from "@/lib/query/use-api-mutation";

import { shipmentKeys } from "./shipment.keys";

import type {
  BookingDto,
  ShipmentDto,
  bookingCancelSchema,
  bookingConfirmSchema,
  bookingCreateSchema,
  bookingUpdateSchema,
  shipmentAdvanceSchema,
  shipmentCreateSchema,
  shipmentSignSchema,
} from "@otd/contracts/shipment";
import type { z } from "zod";

type Action<S extends z.ZodType> = { id: string; input: z.input<S> };

function useShipmentMutation<TData, TVariables>(fn: (variables: TVariables) => Promise<TData>) {
  const queryClient = useQueryClient();
  return useApiMutation<TData, TVariables>({
    mutationFn: fn,
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: shipmentKeys.all() });
    },
  });
}

export function useCreateShipmentMutation() {
  return useShipmentMutation((input: z.input<typeof shipmentCreateSchema>) =>
    api.post<ShipmentDto>("/shipments", input),
  );
}

export function useAdvanceShipmentMutation() {
  return useShipmentMutation(({ id, input }: Action<typeof shipmentAdvanceSchema>) =>
    api.post<ShipmentDto>(`/shipments/${id}/advance`, input),
  );
}

export function useSignShipmentMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<ShipmentDto, Action<typeof shipmentSignSchema>>({
    mutationFn: ({ id, input }) => api.post<ShipmentDto>(`/shipments/${id}/sign`, input),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: shipmentKeys.all() });
      await queryClient.invalidateQueries({ queryKey: ["receivable"] });
    },
  });
}

export function useSaveBookingMutation() {
  return useShipmentMutation(
    ({
      id,
      input,
    }: {
      id?: string;
      input: z.input<typeof bookingCreateSchema> | z.input<typeof bookingUpdateSchema>;
    }) => (id ? api.put<BookingDto>(`/bookings/${id}`, input) : api.post<BookingDto>("/bookings", input)),
  );
}

export function useConfirmBookingMutation() {
  return useShipmentMutation(({ id, input }: Action<typeof bookingConfirmSchema>) =>
    api.post<BookingDto>(`/bookings/${id}/confirm`, input),
  );
}

export function useCancelBookingMutation() {
  return useShipmentMutation(({ id, input }: Action<typeof bookingCancelSchema>) =>
    api.post<BookingDto>(`/bookings/${id}/cancel`, input),
  );
}

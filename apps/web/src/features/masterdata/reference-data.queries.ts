import { keepPreviousData } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiQuery } from "@/lib/query/use-api-query";

import { REFERENCE_PATHS, referenceDataKeys, type ReferenceEntity } from "./reference-data.keys";

import type { PageOf } from "./masterdata.types";
import type {
  AgencyDto,
  BaseDetailDto,
  BaseMachineDto,
  DictionaryDto,
  DictionaryTypeDto,
  ExchangeRateDto,
  FactoryDto,
  ForwarderDto,
  MaterialDto,
  NeedleTypeDto,
  SeasonDto,
} from "@otd/contracts/masterdata";

type Params = Record<string, string | number | undefined>;

export const ALL_ROWS: Params = { page: 1, pageSize: 200 };

function usePage<T>(entity: ReferenceEntity, params: Params) {
  return useApiQuery<PageOf<T>>({
    queryKey: referenceDataKeys.list(entity, params),
    queryFn: () => api.get<PageOf<T>>(REFERENCE_PATHS[entity], params),
    placeholderData: keepPreviousData,
  });
}

export const useBasesQuery = (params: Params = ALL_ROWS) => usePage<BaseDetailDto>("bases", params);
export const useFactoriesQuery = (params: Params) => usePage<FactoryDto>("factories", params);
export const useNeedleTypesQuery = (params: Params = ALL_ROWS) => usePage<NeedleTypeDto>("needleTypes", params);
export const useBaseMachinesQuery = (params: Params) => usePage<BaseMachineDto>("baseMachines", params);
export const useMaterialsQuery = (params: Params) => usePage<MaterialDto>("materials", params);
export const useAgenciesQuery = (params: Params) => usePage<AgencyDto>("agencies", params);
export const useForwardersQuery = (params: Params) => usePage<ForwarderDto>("forwarders", params);
export const useDictionariesQuery = (params: Params) => usePage<DictionaryDto>("dictionaries", params);
export const useExchangeRatesQuery = (params: Params) => usePage<ExchangeRateDto>("exchangeRates", params);
export const useSeasonsQuery = (params: Params) => usePage<SeasonDto>("seasons", params);

export function useDictionaryTypesQuery() {
  return useApiQuery<DictionaryTypeDto[]>({
    queryKey: referenceDataKeys.entity("dictionaryTypes"),
    queryFn: () => api.get<DictionaryTypeDto[]>(REFERENCE_PATHS.dictionaryTypes),
  });
}

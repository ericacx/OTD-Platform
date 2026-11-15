export type ReferenceEntity =
  | "bases"
  | "factories"
  | "needleTypes"
  | "baseMachines"
  | "materials"
  | "agencies"
  | "forwarders"
  | "dictionaries"
  | "dictionaryTypes"
  | "exchangeRates"
  | "seasons";

export const REFERENCE_PATHS: Record<ReferenceEntity, string> = {
  bases: "/masterdata/bases",
  factories: "/masterdata/factories",
  needleTypes: "/masterdata/needle-types",
  baseMachines: "/masterdata/base-machines",
  materials: "/masterdata/materials",
  agencies: "/masterdata/test-agencies",
  forwarders: "/masterdata/forwarders",
  dictionaries: "/masterdata/dictionaries",
  dictionaryTypes: "/masterdata/dictionaries/types",
  exchangeRates: "/masterdata/exchange-rates",
  seasons: "/masterdata/seasons",
};

export const referenceDataKeys = {
  all: () => ["masterdata", "reference"] as const,
  entity: (entity: ReferenceEntity) => [...referenceDataKeys.all(), entity] as const,
  list: (entity: ReferenceEntity, params: Record<string, string | number | undefined>) =>
    [...referenceDataKeys.entity(entity), params] as const,
};

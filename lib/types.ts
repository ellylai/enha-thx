export type CaseFilters = {
  q: string; // keep general search
  court: string; // jurisdiction like "mnd", "ca9", etc.
  docketNumber: string; // specific docket number search
  natureOfSuit: string; // like "463" for habeas corpus
  dateFiledAfter: string; // was "filedAfter"
  dateFiledBefore: string; // was "filedBefore"
  // Remove the general "jurisdiction" field since "court" is more specific
};

export type CourtCase = {
  id: string;
  caseName: string;
  docketNumber: string;
  court: string;
  jurisdiction: string;
  dateFiled?: string;
  status?: string;
  absoluteUrl?: string;
  snippet: string;
  plainText: string;
  docketId?: number;
  // ML classification results
  noncomplianceScore?: number;
  weakLabel?: string;
};

export type CasesResponse = {
  results: CourtCase[];
  total: number;
  source: "live" | "fallback";
};

export type CaseAnalysis = {
  plainText: string;
  noncomplianceScore: number;
  weakLabel: "HIGH_RISK" | "MEDIUM_RISK" | "LOW_RISK";
  classifierSource: "external" | "heuristic";
  selectedDocketEntryId: string | null;
  docketDetails?: DocketSaveResponse;
};

/** Single entry in extracted_features format (same as data/extractFeatures.py output). */
export type ExtractedEntry = {
  entry_number: number | null;
  date_filed: string | null;
  time_filed: string | null;
  description: string | null;
  document_number: string | null;
  document_description: string | null;
  plain_text: string | null;
  page_count: number | null;
  is_available: boolean | null;
};

/** Case metadata in extracted_features format. */
export type ExtractedCaseMetadata = {
  case_number: string | null;
  case_name: string | null;
  year: number | null;
  docket_id: number | null;
  nature_of_suit: string | null;
  jurisdiction_type: string | null;
  assigned_to: string | null;
  referred_to: string | null;
  date_filed: string | null;
  date_terminated: string | null;
};

/** One case in extracted_features.json format (case_metadata + entries). */
export type ExtractedFeaturesPayload = {
  case_metadata: ExtractedCaseMetadata;
  entries: ExtractedEntry[];
};

export type DocketSaveResponse = {
  success: boolean;
  message?: string;
  error?: string;
  details?: string;
  docketId: string;
  caseName?: string;
  totalEntries?: number;
  filename?: string;
  /** Saved JSON in extracted_features format, for ML classifier and LLM summarizer. */
  extractedData?: ExtractedFeaturesPayload;
};

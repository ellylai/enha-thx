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
  // ML classification results
  noncomplianceScore?: number;
  weakLabel?: string;
};

export type CasesResponse = {
  results: CourtCase[];
  total: number;
  source: "live" | "fallback";
};

export type CaseFilters = {
  q: string;
  court: string;
  jurisdiction: string;
  filedAfter: string;
  filedBefore: string;
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
  // can be outputted by our classifier later
  noncomplianceScore?: number; 
  weakLabel?: string;
};

export type CasesResponse = {
  results: CourtCase[];
  total: number;
  source: "live" | "fallback";
};

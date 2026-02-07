import type { CourtCase } from "@/lib/types";

export const fallbackCases: CourtCase[] = [
  {
    id: "fallback-1",
    caseName: "United States v. Doe",
    docketNumber: "2:23-cv-01981",
    court: "Ninth Circuit",
    jurisdiction: "federal",
    dateFiled: "2023-07-12",
    status: "Open",
    absoluteUrl: "https://www.courtlistener.com",
    snippet:
      "Order to show cause entered after repeated delays in compliance with production timeline.",
    plainText:
      "This matter came before the Court on repeated failures to produce records. The Court issued an order to show cause and set a hearing to determine whether sanctions are appropriate.",
  },
  {
    id: "fallback-2",
    caseName: "Smith et al. v. Metro County Jail",
    docketNumber: "1:24-cv-00442",
    court: "District of Minnesota",
    jurisdiction: "state",
    dateFiled: "2024-02-03",
    status: "Pending",
    absoluteUrl: "https://www.courtlistener.com",
    snippet:
      "Plaintiffs allege delayed release and seek emergency relief for noncompliance with prior order.",
    plainText:
      "Plaintiffs moved for emergency relief, asserting that defendants did not timely comply with release directives. The filing includes timeline exhibits and affidavit testimony.",
  },
];

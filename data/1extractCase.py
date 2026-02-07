#!/usr/bin/env python3
"""
Step 1: Extract case information from Schiltz List PDF.
No API calls - just parsing.
"""

import re
import json
from pathlib import Path


def parse_schiltz_list_text(text: str) -> list[dict]:
    """
    Parse case entries from the Schiltz List text.
    
    Returns list of dicts with: case_number, case_name, judges, year, docket_number
    """
    cases = []
    
    # Pattern: "Name v. Name, Case No. XX-CV-XXXX (JUDGES) (dates)"
    pattern = r'(.+?),\s+(?:Case\s+)?No\.\s+([\d]+-CV-0*[\d]+)\s+\(([^)]+)\)'
    
    for match in re.finditer(pattern, text):
        case_name = match.group(1).strip()
        case_number = match.group(2).strip()
        judges = match.group(3).strip()
        
        # Extract year and docket number
        # Format: YY-CV-XXXXX where YY is 2-digit year
        parts = case_number.split('-CV-')
        year_prefix = parts[0]  # e.g., "26"
        docket_num = parts[1]    # e.g., "00537"
        
        # Convert 2-digit year to 4-digit (26 -> 2026, 25 -> 2025)
        year = f"20{year_prefix}"
        
        cases.append({
            "case_number": case_number,
            "case_name": case_name,
            "judges": judges,
            "year": int(year),
            "docket_number": docket_num,
        })
    
    return cases


def main():
    """Extract cases from the provided PDF text."""
    
    # From your Schiltz List PDF
    schiltz_text = """
Hakan K. v. Noem, et al., Case No. 25-CV-4722 (JMB/DTS) (January 24, 2026 order) 
Luis L.P. v. Brott, et al., Case No. 25-CV-4741 (NEB/DJF) (January 9, 2026 order) 
Ahmed A. v. Pamela Bondi, et al., Case No. 25-CV-4776 (JWB/DJF) (January 6, 2026 order)
Francisco E.O. v. Olson, et al., Case No. 26-CV-080 (JRT/DJF) (January 15, 2026 order) 
Suhaib M. v. Kristi Noem, et al., Case No. 26-CV-013 (JWB/DJF) (January 12, 2026 order) 
Alex V.Y.L. v. Pamela Bondi, et al., Case No. 26-CV-031 (JWB/DJF) (January 9, 2026 order) 
Francisco E.O. v. Olson, et al., Case No. 26-CV-080 (JRT/DJF) (January 15, 2026 order) 
Marlon M.M. v. Easterwood, et al., Case No. 26-CV-106 (NEB/ECW) (January 15, 2026 order) 
Juan T.R. v. Noem, et al., Case No. 26-CV-0107 (PJS/DLM) (January 14, 2026 order) 
Sharet B.G.M. v. Lyons, et al., Case No.26-CV-120 (JRT/DTS) (January 15, 2026 order) 
Botir B. v. Bondi, et al., Case No. 26-CV-130 (LMP/DJF) (January 15, 2026 order) 
Lide E.G.Q. v. Executive Office for Immigration Review, et al., Case No. 26-CV-138 (JWB/JFD) (January 9, 2026 order) 
Jhony A. v. Bondi, et al., Case No. 26-CV-00146 (JMB/LIB) (January 15, 2026 order) 
Christopher A.F.E. v. Pamela Bondi, et al., Case No. 26-CV-150 (JWB/ECW) (January 14, 2026 order) 
Evelin M.A. v. Bondi, et al., Case No. 26-CV-156 (NEB/DLM) (January 23, 2026 order) 
Jose A. v. Bondi, et al., Case No. 26-CV-160 (NEB/EMB) (January 15, 2026 order) 
Pascual G. v. Bondi, et al., Case No. 26-CV-00161 (JMB/LIB) (January 12, 2026 Order) 
Santiago A.C.P. v. Todd Lyons, et al., Case No. 26-CV-164 (JWB/DTS) (January 15, 2026 order; January 19, 2026 order; January 20, 2026 order) 
Andrei C. v. Lyons, et al., Case No. 26-CV-166 (SRN/ECW) (January 12, 2026 order) 
Oscar O.T. v. Pamela Bondi, et al., Case No. 26-CV-167 (JWB/JFD) (January 15, 2026 order; January 19, 2026 order: January 20, 2026 order) 
Martin R. v. Bondi, et al., Case No. 26-CV-00168 (JMB/LIB) (January 12, 2026 order; January 20, 2026 order; January 21, 2026 order) 
Abdi W. v. Trump, et al., Case No. 26-CV-00208 (KMM/SGE) (January 21, 2026) 
Adriana M.Y.M. v. David Easterwood, et al., Case No. 26-CV-213 (JWB/JFD) (January 24, 2026 order) 
Estefany J.S. v. Pamela Bondi, et al., Case No. 26-CV-216 (JWB/SGE) (Two January 13, 2026 orders) 
Martha S.S. v. Kristi Noem, et al., Case No. 26-CV-231 (JWB/DLM) (January 16, 2026 order; January 20, 2016 order) 
Joaquin Q. L. v. Bondi, et al., Case No. 26-CV-233 (LMP/DTS) (January 14, 2026 order; January 21, 2026 order) 
Jose L.C.C. v. Pamela Bondi, et al., Case No. 26-CV-244 (JWB/DTS) (January 15, 2026 order; January 19, 2026 order) 
Juan R. v. Bondi, et al., Case No. 26-CV-252 (SRN/DTS) (January 16, 2026 order) 
Jesus A.P. v. Bondi, et al., Case No. 26-CV-261 (PJS/EMB) (January 15, 2026 order) 
Abdiqadir A. v. Bondi, et al., Case No. 26-CV-272 (JMB/DTS) (January 16, 2026 order) 
Bashir Ali K. v. Noem, et al., Case No. 26-CV-276 (LMP/DTS) (January 22, 2026 order) 
Roman N. v. Donald Trump, et al., Case No. 26-CV-282 (JWB/DLM) (January 3, 2026 order; January 17, 2026 order) 
Sandra C. v. Bondi, et al., Case No. 26-CV-00283 (JMB/JFD) (January 16, 2026 order; January 21, 2026 order) 
Yeylin C.R. v. Bondi, et al., Case No. 26-CV-296 (NEB/LIB) (January 20, 2026 order) 
Liban G. v. Noem, et al., Case No. 26-CV-301 (SRN/ECW) (January 15, 2026 order; January 16, 2026 order; January 20, 2026 order; January 22, 2026 order) 
Joseph T.M. v. Bondi, et al., Case No. 26-CV-0309 (PJS/EMB) (January 22, 2026 order) 
Obildzhon E. v. Pamela Bondi, et al., Case No. 26-CV-312 (JWB/DTS) (January 17, 2026 order) 
Corina E. v. Pamela Bondi, et al., Case No. 26-CV-313 (JWB/DTS) (January 17, 2026 order) 
E.E. v. Pamela Bondi, et al., Case No. 26-CV-314 (JWB/DTS) (January 17, 2026 order) 
Manolo Z. L. v. Trump, et al., Case No. 26-CV-316 (LMP/DTS) (January 15, 2026 order) 
William L.-C. v. Bondi, et al., Case No. 26-CV-317 (NEB/JFD) (January 18, 2026 order) 
Diana L.-C. v. Bondi, et al., Case No. 26-CV-319 (NEB/JFD) (January 18, 2026 order) 
Felix J.C.A. v. Pamela Bondi, et al., Case No. 26-CV-328 (JWB/DLM) (January 24, 2026 order) 
Ihor D. v. Noem, et al., Case No. 26-CV-00351 (JMB/DTS) (January 20, 2026 order; January 22, 2026 order) 
Francisco M. v. Bondi, et al., Case No. 26-CV-369 (JMB/EMB) (January 16, 2026 order; January 23, 2026 order) 
Alberto C.M. v. Noem, et al., Case No. 26-CV-0380 (DWF/SGE) (January 23, 2026 order) 
Josue David P. A. v. Bondi, et al., Case No. 26-CV-396 (LMP/JFD) (January 17, 2026 order) 
Nadejda P. v. Lyons, et al., Case No. 26-CV-00404 (KMM/DLM) (January 22, 2026) 
Paula G. v. Bondi, et al., Case No. 26-CV-410 (JMB/DLM) (January 17, 2026 order; January 20, 2026 order) 
Ronnie C. v. Pamela Bondi, et al., Case No. 26-CV-423 (JWB/JFD) (January 18, 2026 order; January 21, 2026 order) 
J.B.C.O. et al., v. Bondi, et al., Case No. 26-CV-0424 (JRT/DJF) (Two January 19, 2026 orders; January 25, 2026 order) 
Silvestre R. C. v. Bondi, et al., No. 26-CV-436 (LMP/JFD) (January 23, 2026 order) 
Darvin M. v. Bondi, et al., Case No. 26-CV-437 (SRN/EMB) (January 19, 2026 order) 
Maria U.C.G. v. Pamela Bondi, et al., Case No. 26-CV-439 (JWB/LIB) (January 24, 2026 order) 
Abdirahman S. v. Bondi, et al., Case No. 26-CV-00440 (JMB/DJF) (January 22, 2026 order) 
Enrique L. v. Bondi, et al., Case No. 26-CV-00444 (JMB/SGE) (January 22, 2026 order) 
Fernando T. v. Noem, et al., Case No. 26-CV-0445 (ECT/EMB) (January 20, 2026 order) 
Alexis D.A.M. v. Bondi, et al., Case No. 26-CV-447 (JRT/ECW) (January 20, 2026 order) 
Miguel D. v. Bondi, et al., 26-CV-00448 (KMM/DLM) (January 23, 2026 order) 
Hector T.G. v. Bondi, et al., Case No. 26-CV-449 (NEB/LIB) (January 23, 2026 order) 
Luis S. v. Bondi, et al., Case No. 26-CV-454 (ECT/LIB) (January 22, 2026 order) 
Sonia M.M.C. v. Pamela Bondi, et al., Case No. 26-CV-457 (JWB/LIB) (January 24, 2026 order) 
Jose A. v. Noem, et al., Case No. 26-CV-00480 (JMB/ECW) (January 26, 2026 order) 
Ivan R. v. Pamela Bondi, et al., Case No. 26-CV-485 (JWB/EMB) (January 21, 2026 order; January 24, 2026 order) 
Yosber I.M.C. v. Bondi, et al., Case No. 26-CV-489 (JRT/DLM) (January 21, 2026 order) 
Fabian L.C. v. Bondi, et al., Case No. 26-CV-493 (NEB/DLM) (January 24, 2026 order) 
Maria P. v. Brott, et al., Case No. 26-CV-00504 (JMB/JFD) (January 23, 2026 order) 
Brayan M.O. v. Bondi, et al., Case No. 26-CV-517 (NEB/JFD) (January 24, 2026 order) 
Isidro L. v. Lyons, et al., Case No. 26-CV-00537 (JMB/DLM) (January 22, 2026 order) 
Maria V.H., et al., v. Bondi, et al., Case No. 26-CV-546 (JMG/DLM) (January 24, 2026 order) 
Elvis T. E., et al. v. Bondi, et al., Case No. 26-CV-00561 (KMM/JFD) (January 22, 2026 order) 
Guled O. v. Noem, et al., Case No. 26-CV-0575 (ADM/DJF) (January 23, 2026 order) 
Carlos A. G. v. Bondi, et al., Case No. 26-CV-00580 (SRB-DJF) (January 23, 2026 order) 
Jose V. v. Easterwood, et al., Case No. 26-CV-597 (DSD/LIB) (January 25, 2026 order) 
Marco Q. v. Noem, et al., Case No. 26-CV-00663 (SRB-DLM) (January 26, 2026 order)
    """
    
    cases = parse_schiltz_list_text(schiltz_text)
    
    # Remove duplicates (some cases appear twice)
    unique_cases = {}
    for case in cases:
        unique_cases[case["case_number"]] = case
    
    cases = list(unique_cases.values())
    
    # Save to JSON
    output_path = "caseInfo.json"
    with open(output_path, 'w') as f:
        json.dump(cases, f, indent=2)
    
    print(f"✓ Extracted {len(cases)} unique cases")
    print(f"✓ Saved to: {output_path}")
    print(f"\nFirst 3 cases:")
    for case in cases[:3]:
        print(f"  - {case['case_number']}: {case['case_name']}")
        print(f"    Year: {case['year']}, Docket: {case['docket_number']}")


if __name__ == "__main__":
    main()
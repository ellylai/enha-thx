import os
import time
from dotenv import load_dotenv
from google import genai
from google.genai import types
import google.api_core.exceptions

# Load environment variables from .env file at the project root
load_dotenv()


def summarize_docket(case_text: str, case_info: dict = None) -> str:
    """
    Summarize court docket text using Gemini API.
    Based on your existing prompt_llm() pattern.
    
    Args:
        case_text: Full docket text from 'text_descriptions' column
        case_info: Optional dict with metadata
    
    Returns: Plain text summary
    """
    # Build metadata lines (optional)
    metadata_lines = []
    if case_info:
        if case_info.get('case_number'):
            metadata_lines.append(f"Case Number: {case_info['case_number']}")
        if case_info.get('case_name'):
            metadata_lines.append(f"Case Name: {case_info['case_name']}")
        if case_info.get('date_filed'):
            metadata_lines.append(f"Date Filed: {case_info['date_filed']}")
    
    metadata = "\n".join(metadata_lines)
    
    # Build the prompt (simplified version of your frontend prompt)
    prompt = f"""
Summarize these federal court docket entries in plain English.

{metadata}

Docket entries:
{case_text[:6000]}

Provide a concise factual summary with these sections:
1. Core Issue: What is this case about?
2. Procedural History: Key events and filings
3. Court Orders: Any orders issued by the judge
4. Deadlines & Dates: Important timelines
5. Current Status: Where does the case stand?

Keep it neutral and factual. No legal advice or judgments.
"""
    
    print(f"Generating summary for case: {case_info.get('case_number', 'unknown')}")
    
    # Call Gemini (using your existing pattern)
    return prompt_gemini(prompt)


def prompt_gemini(prompt: str) -> str:
    """
    Prompts the Gemini model.
    Based on your existing prompt_llm() function.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError(
            "API key not found. Please set the GEMINI_API_KEY environment variable."
        )
    else:
        print("USING GEMINI FOR DOCKET SUMMARY")
        print(f"PROMPT LENGTH: {len(prompt)} characters")
        print(f"PROMPT PREVIEW: {prompt[:200]}...")

    client = genai.Client(api_key=api_key)
    
    # Optional: enable Google Search grounding if needed
    # grounding_tool = types.Tool(google_search=types.GoogleSearch())
    # config = types.GenerateContentConfig(tools=[grounding_tool])
    
    config = types.GenerateContentConfig(
        temperature=0.3,  # Lower for more factual output
        max_output_tokens=500  # Limit response length
    )

    # Retry logic (from your existing code)
    retries = 3
    delay = 4
    for i in range(retries):
        try:
            response = client.models.generate_content(
                model="gemini-2.0-flash",  # or gemini-1.5-flash
                contents=prompt,
                config=config
            )
            return response.text
        except google.api_core.exceptions.ResourceExhausted as e:
            if i < retries - 1:
                print(f"Rate limit exceeded. Retrying in {delay} seconds...")
                time.sleep(delay)
                delay *= 2
            else:
                print("Rate limit exceeded. Max retries reached.")
                raise e
    
    return ""


# Simple version for CSV integration
def summarize_csv_row(csv_row: dict) -> dict:
    """
    Process a single row from your annotation.py CSV output.
    Returns the row with an added 'llm_summary' field.
    """
    case_text = csv_row.get('text_descriptions', '')
    
    case_info = {
        'case_number': csv_row.get('case_number', ''),
        'case_name': csv_row.get('case_name', ''),
        'date_filed': csv_row.get('date_filed', '')
    }
    
    summary = summarize_docket(case_text, case_info)
    
    # Return the row with summary added
    result = dict(csv_row)
    result['llm_summary'] = summary
    return result


# Test function (like your existing mock responses)
def mock_summary() -> str:
    """Return a mock summary for testing without API calls."""
    print("USING MOCK SUMMARY (NO API CALL)")
    return """Core Issue: Habeas corpus petition challenging immigration detention.
Procedural History: Petition filed 1/14/2026. Court ordered response by 1/16/2026.
Court Orders: Order to show cause issued. Temporary restraining order against transfer.
Deadlines & Dates: Bond hearing required by 1/20/2026. Status updates due 1/21/2026.
Current Status: Multiple show cause motions filed for alleged violations of court orders."""


# Usage example
if __name__ == "__main__":
    # Test with your example data
    example_row = {
        'case_number': '26-CV-00283',
        'case_name': 'Sandra C. v. Bondi, et al.',
        'text_descriptions': 'ORDER TO SHOW CAUSE... petition for writ...',
        'date_filed': '2026-01-14',
        'noncompliance_score': 100.0,
        'weak_label': 'STRONG_SIGNAL'
    }
    
    # Option 1: Use real API (requires GEMINI_API_KEY in .env)
    try:
        result = summarize_csv_row(example_row)
        print("\n=== REAL SUMMARY ===")
        print(f"Case: {result['case_number']}")
        print(f"Noncompliance Score: {result['noncompliance_score']}")
        print(f"Summary: {result['llm_summary'][:300]}...")
    except ValueError as e:
        print(f"\nAPI Error: {e}")
        print("Using mock summary instead...")
        
        # Option 2: Use mock (for testing)
        example_row['llm_summary'] = mock_summary()
        print(f"\n=== MOCK SUMMARY ===")
        print(f"Case: {example_row['case_number']}")
        print(f"Summary: {example_row['llm_summary']}")
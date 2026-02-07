"use client";

// Simple test page for docket details API
// Visit: http://localhost:3000/api-test

import { useState } from "react";

export default function ApiTestPage() {
  const [docketId, setDocketId] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [sampleCases, setSampleCases] = useState<any[]>([]);

  const getSampleCases = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/cases?court=mnd&natureOfSuit=463");
      const data = await response.json();
      setSampleCases(data.results || []);
    } catch (error) {
      console.error("Error fetching sample cases:", error);
    }
    setLoading(false);
  };

  const testDocketApi = async () => {
    if (!docketId.trim()) {
      alert("Please enter a docket ID");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `/api/docket-details?docketId=${docketId.trim()}`,
      );
      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error("Error testing docket API:", error);
      setResult({ error: "Request failed" });
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: "20px", fontFamily: "monospace" }}>
      <h1>Docket Details API Test</h1>

      <div style={{ marginBottom: "20px" }}>
        <button onClick={getSampleCases} disabled={loading}>
          {loading ? "Loading..." : "Get Sample Cases"}
        </button>
        {sampleCases.length > 0 && (
          <div style={{ marginTop: "10px" }}>
            <h3>Sample Docket IDs:</h3>
            {sampleCases.slice(0, 5).map((case_, index) => (
              <div key={index} style={{ margin: "5px 0" }}>
                <button
                  onClick={() => setDocketId(case_.id)}
                  style={{ marginRight: "10px" }}
                >
                  Use
                </button>
                <code>{case_.id}</code> - {case_.caseName}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginBottom: "20px" }}>
        <h3>Test Docket Details:</h3>
        <input
          type="text"
          value={docketId}
          onChange={(e) => setDocketId(e.target.value)}
          placeholder="Enter docket ID"
          style={{ padding: "5px", marginRight: "10px", width: "300px" }}
        />
        <button onClick={testDocketApi} disabled={loading || !docketId.trim()}>
          {loading ? "Testing..." : "Test API"}
        </button>
      </div>

      {result && (
        <div>
          <h3>API Response:</h3>
          <pre
            style={{
              background: "#f5f5f5",
              padding: "10px",
              overflow: "auto",
              maxHeight: "600px",
            }}
          >
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

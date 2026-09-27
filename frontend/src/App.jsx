import { useState } from "react";

function App() {
  const [customerName, setCustomerName] = useState("");
  const [message, setMessage] = useState("");
  const [response, setResponse] = useState("");
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const sendMessage = async () => {
    if (!message.trim()) return;

    setLoading(true);
    setError("");
    setResponse("");
    setMemories([]);

    try {
      const res = await fetch("http://localhost:5000/support", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerName,
          message,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "Something went wrong.");
      }

      setResponse(data.response);
      setMemories(data.recalledMemories || []);
      setMessage("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f7fb",
        fontFamily: "Arial, sans-serif",
        color: "#172033",
      }}
    >
      {/* Header */}
      <header
        style={{
          background: "#111827",
          color: "white",
          padding: "20px 40px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "24px", color: "#ffffff" }}>
            SupportMind AI
          </h1>

          <p
            style={{
              margin: "5px 0 0",
              color: "#9ca3af",
              fontSize: "14px",
            }}
          >
            AI Customer Support with Resolution Memory
          </p>
        </div>

        <div
          style={{
            background: "#123c2a",
            color: "#6ee7b7",
            padding: "8px 14px",
            borderRadius: "20px",
            fontSize: "13px",
            fontWeight: "bold",
          }}
        >
          ● Memory Active
        </div>
      </header>

      {/* Main */}
      <main
        style={{
          maxWidth: "1200px",
          margin: "40px auto",
          padding: "0 20px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.5fr 1fr",
            gap: "25px",
          }}
        >
          {/* Chat Section */}
          <section
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "25px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
            }}
          >
            <h2 style={{ marginTop: 0 }}>Customer Support</h2>

            <p style={{ color: "#6b7280", fontSize: "14px" }}>
              Ask a support question and the agent will use relevant
              previous customer experiences.
            </p>

            {/* Customer Name */}
            <label
              style={{
                display: "block",
                marginTop: "25px",
                marginBottom: "8px",
                fontWeight: "bold",
                fontSize: "14px",
              }}
            >
              Customer Name
            </label>

            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Enter customer name"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "13px",
                border: "1px solid #d1d5db",
                borderRadius: "10px",
                fontSize: "15px",
              }}
            />

            {/* Message */}
            <label
              style={{
                display: "block",
                marginTop: "20px",
                marginBottom: "8px",
                fontWeight: "bold",
                fontSize: "14px",
              }}
            >
              Customer Message
            </label>

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe the customer's issue..."
              rows="6"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "13px",
                border: "1px solid #d1d5db",
                borderRadius: "10px",
                fontSize: "15px",
                resize: "vertical",
              }}
            />

            {/* Send Button */}
            <button
              onClick={sendMessage}
              disabled={loading || !message.trim()}
              style={{
                marginTop: "15px",
                width: "100%",
                padding: "14px",
                border: "none",
                borderRadius: "10px",
                background:
                  loading || !message.trim()
                    ? "#9ca3af"
                    : "#111827",
                color: "white",
                fontSize: "15px",
                fontWeight: "bold",
                cursor:
                  loading || !message.trim()
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {loading ? "Thinking..." : "Send to Support Agent"}
            </button>

            {/* Error */}
            {error && (
              <div
                style={{
                  marginTop: "20px",
                  padding: "15px",
                  background: "#fee2e2",
                  color: "#991b1b",
                  borderRadius: "10px",
                }}
              >
                {error}
              </div>
            )}

            {/* AI Response */}
            {response && (
              <div
                style={{
                  marginTop: "25px",
                  padding: "20px",
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: "12px",
                }}
              >
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: "bold",
                    color: "#15803d",
                    marginBottom: "10px",
                  }}
                >
                  AI SUPPORT RESPONSE
                </div>

                <div
                  style={{
                    whiteSpace: "pre-wrap",
                    lineHeight: "1.6",
                    fontSize: "15px",
                  }}
                >
                  {response}
                </div>
              </div>
            )}
          </section>

          {/* Memory Section */}
          <section
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "25px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
              height: "fit-content",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h2 style={{ marginTop: 0 }}>Memory Used</h2>

              <span
                style={{
                  fontSize: "12px",
                  background: "#ede9fe",
                  color: "#6d28d9",
                  padding: "6px 10px",
                  borderRadius: "15px",
                  fontWeight: "bold",
                }}
              >
                Hindsight
              </span>
            </div>

            <p
              style={{
                color: "#6b7280",
                fontSize: "14px",
                lineHeight: "1.5",
              }}
            >
              Relevant previous customer experiences recalled
              and used to personalize the response.
            </p>

            {memories.length === 0 && (
              <div
                style={{
                  marginTop: "25px",
                  padding: "20px",
                  background: "#f9fafb",
                  borderRadius: "10px",
                  color: "#9ca3af",
                  textAlign: "center",
                  fontSize: "14px",
                }}
              >
                No verified previous resolution found.
                <br />
                The agent will respond using the current conversation.
              </div>
            )}

            {memories.map((memory, index) => (
              <div
                key={memory.id || index}
                style={{
                  marginTop: "15px",
                  padding: "16px",
                  background: "#fafafa",
                  border: "1px solid #e5e7eb",
                  borderRadius: "10px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "10px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: "bold",
                      textTransform: "uppercase",
                      color: "#7c3aed",
                    }}
                  >
                    {memory.type || "Memory"}
                  </span>

                  <span
                    style={{
                      fontSize: "11px",
                      color: "#9ca3af",
                    }}
                  >
                    Recalled
                  </span>
                </div>

                <p
                  style={{
                    margin: 0,
                    fontSize: "13px",
                    lineHeight: "1.5",
                    color: "#374151",
                  }}
                >
                  {memory.text}
                </p>
              </div>
            ))}
          </section>
        </div>

        {/* Agent Memory Pipeline */}
        <div
          style={{
            marginTop: "25px",
            background: "white",
            borderRadius: "16px",
            padding: "25px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
          }}
        >
          <div
            style={{
              textAlign: "center",
              fontSize: "13px",
              color: "#6b7280",
              fontWeight: "bold",
              letterSpacing: "1px",
              marginBottom: "20px",
            }}
          >
            AGENT MEMORY PIPELINE
          </div>

          {/* Five pipeline stages */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
              gap: "10px",
              alignItems: "stretch",
            }}
          >
            {/* Step 1 */}
            <div
              style={{
                padding: "14px 8px",
                borderRadius: "10px",
                background: "#f3f4f6",
                fontWeight: "bold",
                fontSize: "12px",
                textAlign: "center",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "48px",
              }}
            >
              1. Customer Issue
            </div>

            {/* Step 2 */}
            <div
              style={{
                padding: "14px 8px",
                borderRadius: "10px",
                background: "#ede9fe",
                color: "#6d28d9",
                fontWeight: "bold",
                fontSize: "12px",
                textAlign: "center",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "48px",
              }}
            >
              2. Hindsight Recall
            </div>

            {/* Step 3 */}
            <div
              style={{
                padding: "14px 8px",
                borderRadius: "10px",
                background: "#ecfdf5",
                color: "#047857",
                fontWeight: "bold",
                fontSize: "12px",
                textAlign: "center",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "48px",
              }}
            >
              3. Verified Resolution
            </div>

            {/* Step 4 */}
            <div
              style={{
                padding: "14px 8px",
                borderRadius: "10px",
                background: "#eff6ff",
                color: "#1d4ed8",
                fontWeight: "bold",
                fontSize: "12px",
                textAlign: "center",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "48px",
              }}
            >
              4. Groq AI Response
            </div>

            {/* Step 5 */}
            <div
              style={{
                padding: "14px 8px",
                borderRadius: "10px",
                background: "#fef3c7",
                color: "#92400e",
                fontWeight: "bold",
                fontSize: "12px",
                textAlign: "center",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "48px",
              }}
            >
              5. Hindsight Retain
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
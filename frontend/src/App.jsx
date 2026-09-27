import { useState } from "react";

function App() {
  const [customerName, setCustomerName] = useState("");
  const [message, setMessage] = useState("");
  const [conversation, setConversation] = useState([]);
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [chatStarted, setChatStarted] = useState(false);
  const [chatEnded, setChatEnded] = useState(false);

  // ============================================================
  // SEND MESSAGE
  // ============================================================

  const sendMessage = async () => {
    if (
      !message.trim() ||
      !customerName.trim() ||
      loading ||
      chatEnded
    ) {
      return;
    }

    const currentMessage = message.trim();

    setLoading(true);
    setError("");

    try {
      // Build previous conversation context
      const previousConversation = conversation
        .map((item) => {
          return `${item.role === "customer"
            ? "Customer"
            : "Support Agent"
            }: ${item.text}`;
        })
        .join("\n");

      const contextualMessage =
        previousConversation.length > 0
          ? `
Previous conversation:

${previousConversation}

New customer message:

${currentMessage}
`
          : currentMessage;

      // Send to backend
      const res = await fetch(
        "http://localhost:5000/support",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            customerName: customerName.trim(),
            message: contextualMessage,
          }),
        }
      );

      const data = await res.json();

      if (!data.success) {
        throw new Error(
          data.error || "Something went wrong."
        );
      }

      // Add customer + agent messages
      setConversation((prev) => [
        ...prev,
        {
          role: "customer",
          text: currentMessage,
        },
        {
          role: "agent",
          text: data.response,
        },
      ]);

      // Update Hindsight memory panel
      setMemories(data.recalledMemories || []);

      // Mark chat as started
      setChatStarted(true);

      // Clear input
      setMessage("");
    } catch (err) {
      console.error("Send message error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // END CHAT
  // ============================================================

  const endChat = async () => {
    if (
      loading ||
      !customerName.trim() ||
      conversation.length === 0
    ) {
      return;
    }

    try {
      setLoading(true);
      setError("");

      // Get customer messages only
      const customerMessages = conversation
        .filter((item) => item.role === "customer")
        .map((item) => item.text.trim().toLowerCase());

      // Look only at the customer's FINAL message.
      // This prevents an earlier "it worked" from overriding
      // a later message saying the issue still exists.
      const lastCustomerMessage =
        customerMessages[customerMessages.length - 1] || "";

      // Explicit unresolved phrases
      const clearlyNotSolved =
        lastCustomerMessage.includes(
          "still doesn't work"
        ) ||
        lastCustomerMessage.includes(
          "still does not work"
        ) ||
        lastCustomerMessage.includes(
          "still not working"
        ) ||
        lastCustomerMessage.includes(
          "didn't work"
        ) ||
        lastCustomerMessage.includes(
          "did not work"
        ) ||
        lastCustomerMessage.includes("not fixed") ||
        lastCustomerMessage.includes("not solved") ||
        lastCustomerMessage.includes("not resolved");

      // Explicit successful confirmation
      const resolutionConfirmed =
        !clearlyNotSolved &&
        (
          lastCustomerMessage.includes(
            "it's working now"
          ) ||
          lastCustomerMessage.includes(
            "it is working now"
          ) ||
          lastCustomerMessage.includes(
            "working now"
          ) ||
          lastCustomerMessage.includes(
            "works now"
          ) ||
          lastCustomerMessage.includes(
            "working successfully"
          ) ||
          lastCustomerMessage.includes(
            "payment went through successfully"
          ) ||
          lastCustomerMessage.includes(
            "payment went through"
          ) ||
          lastCustomerMessage.includes(
            "problem is solved"
          ) ||
          lastCustomerMessage.includes(
            "issue is solved"
          ) ||
          lastCustomerMessage.includes(
            "problem is resolved"
          ) ||
          lastCustomerMessage.includes(
            "issue is resolved"
          ) ||
          lastCustomerMessage.includes(
            "it's resolved"
          ) ||
          lastCustomerMessage.includes(
            "it is resolved"
          ) ||
          lastCustomerMessage.includes(
            "fixed now"
          ) ||
          lastCustomerMessage === "fixed" ||
          lastCustomerMessage === "it works"
        );

      console.log(
        "Ending chat. Resolution confirmed:",
        resolutionConfirmed
      );

      // Send final conversation to backend
      const res = await fetch(
        "http://localhost:5000/end-chat",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            customerName: customerName.trim(),
            conversation,
            resolutionConfirmed,
          }),
        }
      );

      const data = await res.json();

      if (!data.success) {
        throw new Error(
          data.error || "Unable to end chat."
        );
      }

      // Close chat
      setChatEnded(true);
      setMessage("");
    } catch (err) {
      console.error("End chat error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // START NEW CHAT
  // ============================================================

  const startNewChat = () => {
    setCustomerName("");
    setMessage("");
    setConversation([]);
    setMemories([]);
    setError("");
    setChatStarted(false);
    setChatEnded(false);
  };

  // ============================================================
  // UI
  // ============================================================

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f7fb",
        fontFamily: "Arial, sans-serif",
        color: "#172033",
      }}
    >
      {/* ======================================================
          HEADER
      ====================================================== */}

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
          <h1
            style={{
              margin: 0,
              fontSize: "24px",
              color: "#ffffff",
            }}
          >
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

      {/* ======================================================
          MAIN
      ====================================================== */}

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
          {/* ==================================================
              CHAT SECTION
          ================================================== */}

          <section
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "25px",
              boxShadow:
                "0 4px 20px rgba(0,0,0,0.06)",
            }}
          >
            <h2 style={{ marginTop: 0 }}>
              Customer Support
            </h2>

            <p
              style={{
                color: "#6b7280",
                fontSize: "14px",
                lineHeight: "1.5",
              }}
            >
              Chat continuously with the support agent.
              Relevant previous customer experiences are
              recalled automatically.
            </p>

            {/* CUSTOMER NAME */}

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
              onChange={(e) =>
                setCustomerName(e.target.value)
              }
              placeholder="Enter customer name"
              disabled={chatStarted || chatEnded}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "13px",
                border: "1px solid #d1d5db",
                borderRadius: "10px",
                fontSize: "15px",
                background:
                  chatStarted || chatEnded
                    ? "#f3f4f6"
                    : "white",
              }}
            />

            {/* CHAT HISTORY */}

            {conversation.length > 0 && (
              <div
                style={{
                  marginTop: "25px",
                  maxHeight: "420px",
                  overflowY: "auto",
                  padding: "5px",
                }}
              >
                {conversation.map((item, index) => (
                  <div
                    key={index}
                    style={{
                      display: "flex",
                      justifyContent:
                        item.role === "customer"
                          ? "flex-end"
                          : "flex-start",
                      marginBottom: "15px",
                    }}
                  >
                    <div
                      style={{
                        maxWidth: "80%",
                        padding: "13px 16px",
                        borderRadius: "14px",
                        background:
                          item.role === "customer"
                            ? "#111827"
                            : "#f0fdf4",
                        color:
                          item.role === "customer"
                            ? "white"
                            : "#172033",
                        border:
                          item.role === "customer"
                            ? "none"
                            : "1px solid #bbf7d0",
                        lineHeight: "1.5",
                        fontSize: "14px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "11px",
                          fontWeight: "bold",
                          marginBottom: "6px",
                          opacity: 0.7,
                        }}
                      >
                        {item.role === "customer"
                          ? customerName
                          : "SupportMind AI"}
                      </div>

                      {item.text}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* =================================================
                MESSAGE INPUT
            ================================================= */}

            {!chatEnded && (
              <>
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
                  onChange={(e) =>
                    setMessage(e.target.value)
                  }
                  placeholder={
                    chatStarted
                      ? "Continue the conversation..."
                      : "Describe the customer's issue..."
                  }
                  rows="4"
                  disabled={loading}
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

                {/* SEND BUTTON */}

                <button
                  onClick={sendMessage}
                  disabled={
                    loading ||
                    !message.trim() ||
                    !customerName.trim()
                  }
                  style={{
                    marginTop: "15px",
                    width: "100%",
                    padding: "14px",
                    border: "none",
                    borderRadius: "10px",
                    background:
                      loading ||
                        !message.trim() ||
                        !customerName.trim()
                        ? "#9ca3af"
                        : "#111827",
                    color: "white",
                    fontSize: "15px",
                    fontWeight: "bold",
                    cursor:
                      loading ||
                        !message.trim() ||
                        !customerName.trim()
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  {loading
                    ? "Thinking..."
                    : "Send to Support Agent"}
                </button>

                {/* END CHAT BUTTON */}

                {chatStarted && (
                  <button
                    onClick={endChat}
                    disabled={loading}
                    style={{
                      marginTop: "10px",
                      width: "100%",
                      padding: "13px",
                      border:
                        "1px solid #dc2626",
                      borderRadius: "10px",
                      background: "white",
                      color: "#dc2626",
                      fontSize: "14px",
                      fontWeight: "bold",
                      cursor: loading
                        ? "not-allowed"
                        : "pointer",
                    }}
                  >
                    {loading
                      ? "Ending Chat..."
                      : "End Chat"}
                  </button>
                )}
              </>
            )}

            {/* ERROR */}

            {error && (
              <div
                style={{
                  marginTop: "20px",
                  padding: "15px",
                  background: "#fee2e2",
                  color: "#991b1b",
                  borderRadius: "10px",
                  fontSize: "14px",
                }}
              >
                {error}
              </div>
            )}

            {/* CHAT ENDED */}

            {chatEnded && (
              <div
                style={{
                  marginTop: "25px",
                  padding: "20px",
                  background: "#f3f4f6",
                  borderRadius: "12px",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: "16px",
                    fontWeight: "bold",
                    marginBottom: "8px",
                  }}
                >
                  Chat Ended
                </div>

                <div
                  style={{
                    fontSize: "14px",
                    color: "#6b7280",
                    lineHeight: "1.5",
                  }}
                >
                  This support conversation has been
                  closed.
                </div>

                <button
                  onClick={startNewChat}
                  style={{
                    marginTop: "15px",
                    padding: "12px 20px",
                    border: "none",
                    borderRadius: "10px",
                    background: "#111827",
                    color: "white",
                    fontWeight: "bold",
                    cursor: "pointer",
                  }}
                >
                  Start New Chat
                </button>
              </div>
            )}
          </section>

          {/* ==================================================
              MEMORY SECTION
          ================================================== */}

          <section
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "25px",
              boxShadow:
                "0 4px 20px rgba(0,0,0,0.06)",
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
              <h2 style={{ marginTop: 0 }}>
                Memory Used
              </h2>

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
              Relevant previous customer experiences
              recalled and used to personalize the
              response.
            </p>

            {/* NO MEMORY */}

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
                No relevant previous customer history
                found.
                <br />
                The agent will respond using the current
                conversation.
              </div>
            )}

            {/* MEMORY CARDS */}

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
                    {memory.memoryCategory ||
                      memory.type ||
                      "Memory"}
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
                  {memory.text ||
                    memory.content ||
                    memory.memory ||
                    "Memory recalled from Hindsight."}
                </p>
              </div>
            ))}
          </section>
        </div>

        {/* ======================================================
            AGENT MEMORY PIPELINE
        ====================================================== */}

        <div
          style={{
            marginTop: "25px",
            background: "white",
            borderRadius: "16px",
            padding: "25px",
            boxShadow:
              "0 4px 20px rgba(0,0,0,0.06)",
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

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(5, minmax(0, 1fr))",
              gap: "10px",
              alignItems: "stretch",
            }}
          >
            {/* STEP 1 */}

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

            {/* STEP 2 */}

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

            {/* STEP 3 */}

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
              3. Relevant Memory
            </div>

            {/* STEP 4 */}

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

            {/* STEP 5 */}

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
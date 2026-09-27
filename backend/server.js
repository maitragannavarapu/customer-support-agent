const express = require("express");
const cors = require("cors");
const Groq = require("groq-sdk");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

// ==========================================
// CHECK WHETHER MEMORY BELONGS TO CUSTOMER
// ==========================================

function belongsToCustomer(memory, customerName) {
    const text = (memory.text || "").toLowerCase();
    const name = customerName.trim().toLowerCase();

    if (!name) {
        return false;
    }

    return text.includes(name);
}

// ==========================================
// CHECK WHETHER MEMORY IS A VERIFIED
// SUCCESSFUL RESOLUTION
// ==========================================

function isVerifiedResolution(memory) {
    const text = (memory.text || "").toLowerCase();

    // Reject explicitly unverified interactions
    if (
        text.includes("not yet confirmed by customer") ||
        text.includes("not confirmed by customer") ||
        text.includes("must not be treated as a verified") ||
        text.includes("resolution status: not yet confirmed")
    ) {
        return false;
    }

    // Accept memories describing the known
    // successful payment resolution.
    const hasResolution =
        text.includes("resolved") ||
        text.includes("successfully resolved") ||
        text.includes("issue was resolved") ||
        text.includes("payment issue was resolved");

    const hasKnownSolution =
        text.includes("clearing the payment session") &&
        text.includes("fresh checkout");

    return hasResolution && hasKnownSolution;
}

// ==========================================
// CHECK WHETHER MEMORY IS RELEVANT
// TO THE CURRENT CUSTOMER ISSUE
// ==========================================

function isRelevantMemory(memory) {
    const semantic = Number(memory.scores?.semantic || 0);
    const keyword = Number(memory.scores?.keyword || 0);
    const reranker = Number(memory.scores?.reranker || 0);

    /*
      Hindsight gives us several relevance signals.

      Strong semantic similarity:
      >= 0.75

      Or a combination of:
      - reasonable semantic similarity
      - meaningful keyword overlap

      This prevents an unrelated verified resolution,
      such as a payment solution, from being shown
      for a login problem.
    */

    const strongSemanticMatch = semantic >= 0.75;

    const combinedMatch =
        semantic >= 0.70 &&
        keyword >= 0.40;

    const strongRerankerMatch = reranker >= 0.01;

    return (
        strongSemanticMatch ||
        combinedMatch ||
        strongRerankerMatch
    );
}

// ==========================================
// CURATE VERIFIED + RELEVANT MEMORIES
// ==========================================

function curateMemories(results, customerName) {
    if (!Array.isArray(results)) {
        return [];
    }

    // ------------------------------------------
    // 1. Customer-specific memories
    // ------------------------------------------

    const customerMemories = results.filter((memory) =>
        belongsToCustomer(memory, customerName)
    );

    // ------------------------------------------
    // 2. Verified successful resolutions
    // ------------------------------------------

    const verifiedMemories = customerMemories.filter((memory) =>
        isVerifiedResolution(memory)
    );

    // ------------------------------------------
    // 3. Current-issue relevance
    // ------------------------------------------

    const relevantMemories = verifiedMemories.filter((memory) =>
        isRelevantMemory(memory)
    );

    // ------------------------------------------
    // 4. Rank relevant memories
    // ------------------------------------------

    const scoredMemories = relevantMemories.map((memory) => {
        const text = (memory.text || "").toLowerCase();

        const semantic = Number(
            memory.scores?.semantic || 0
        );

        const keyword = Number(
            memory.scores?.keyword || 0
        );

        const reranker = Number(
            memory.scores?.reranker || 0
        );

        let priority = 0;

        if (text.includes("successfully resolved")) {
            priority += 100;
        }

        if (text.includes("issue was resolved")) {
            priority += 90;
        }

        if (text.includes("resolved")) {
            priority += 80;
        }

        if (text.includes("clearing the payment session")) {
            priority += 30;
        }

        if (text.includes("fresh checkout")) {
            priority += 30;
        }

        // Relevance signals from Hindsight
        priority += semantic * 100;
        priority += keyword * 50;
        priority += reranker * 100;

        if (memory.type === "experience") {
            priority += 20;
        }

        if (memory.type === "observation") {
            priority += 10;
        }

        if (memory.scores?.final) {
            priority += memory.scores.final * 10;
        }

        return {
            ...memory,
            memoryPriority: priority
        };
    });

    scoredMemories.sort(
        (a, b) => b.memoryPriority - a.memoryPriority
    );

    return scoredMemories.slice(0, 3);
}

// ==========================================
// BASIC TEST ROUTE
// ==========================================

app.get("/", (req, res) => {
    res.json({
        message: "Customer Support Agent backend is running!"
    });
});

// ==========================================
// HINDSIGHT RETAIN TEST
// ==========================================

app.post("/test-hindsight", async (req, res) => {
    try {
        const response = await fetch(
            `${process.env.HINDSIGHT_API_URL}/v1/default/banks/${process.env.HINDSIGHT_BANK_ID}/memories`,
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${process.env.HINDSIGHT_API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    items: [
                        {
                            content:
                                "Test memory: Rahul had a payment issue while upgrading to Premium."
                        }
                    ]
                })
            }
        );

        const data = await response.json();

        res.json({
            success: response.ok,
            status: response.status,
            data: data
        });

    } catch (error) {
        console.error("Hindsight connection error:", error);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==========================================
// HINDSIGHT RECALL TEST
// ==========================================

app.post("/test-recall", async (req, res) => {
    try {
        const query =
            req.body.query ||
            "What problem did Rahul have when upgrading to Premium?";

        const response = await fetch(
            `${process.env.HINDSIGHT_API_URL}/v1/default/banks/${process.env.HINDSIGHT_BANK_ID}/memories/recall`,
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${process.env.HINDSIGHT_API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    query: query
                })
            }
        );

        const data = await response.json();

        res.json({
            success: response.ok,
            status: response.status,
            query: query,
            data: data
        });

    } catch (error) {
        console.error("Hindsight recall error:", error);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==========================================
// VERIFIED RESOLUTION MEMORY
// ==========================================

app.post("/test-resolution", async (req, res) => {
    try {
        const response = await fetch(
            `${process.env.HINDSIGHT_API_URL}/v1/default/banks/${process.env.HINDSIGHT_BANK_ID}/memories`,
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${process.env.HINDSIGHT_API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    items: [
                        {
                            content: `
VERIFIED CUSTOMER OUTCOME

Customer: Rahul

Issue:
Payment failed while upgrading to Premium.

Attempted solution:
Retrying the payment did not work.

Verified customer outcome:
Rahul confirmed that clearing the payment session and starting a fresh checkout successfully resolved the payment failure.

Customer environment:
Android 15.

This resolution is verified because the customer confirmed that it worked.
`
                        }
                    ]
                })
            }
        );

        const data = await response.json();

        res.json({
            success: response.ok,
            status: response.status,
            data: data
        });

    } catch (error) {
        console.error("Resolution memory error:", error);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==========================================
// REAL CUSTOMER SUPPORT ENDPOINT
// ==========================================

app.post("/support", async (req, res) => {
    try {
        const { customerName, message } = req.body;

        if (!message) {
            return res.status(400).json({
                success: false,
                error: "Customer message is required."
            });
        }

        const name = customerName?.trim() || "Customer";

        // ------------------------------------------
        // 1. RECALL FROM HINDSIGHT
        // ------------------------------------------

        const recallResponse = await fetch(
            `${process.env.HINDSIGHT_API_URL}/v1/default/banks/${process.env.HINDSIGHT_BANK_ID}/memories/recall`,
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${process.env.HINDSIGHT_API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    query: `${name}: ${message}`
                })
            }
        );

        const recallData = await recallResponse.json();

        if (!recallResponse.ok) {
            throw new Error(
                `Hindsight recall failed: ${JSON.stringify(recallData)}`
            );
        }

        // ------------------------------------------
        // 2. FILTER TO VERIFIED + RELEVANT MEMORY
        // ------------------------------------------

        const curatedMemories = curateMemories(
            recallData.results || [],
            name
        );

        // ------------------------------------------
        // 3. PREPARE MEMORY CONTEXT
        // ------------------------------------------

        const memories = curatedMemories
            .map((item) => item.text)
            .join("\n");

        const memoryContext =
            memories ||
            `No verified previous resolution was found for ${name} that is relevant to the current issue.`;

        // ------------------------------------------
        // 4. GENERATE SUPPORT RESPONSE
        // ------------------------------------------

        const completion = await groq.chat.completions.create({
            model: "openai/gpt-oss-20b",
            messages: [
                {
                    role: "system",
                    content: `
You are a professional AI customer support agent.

Your job is to answer the customer's current issue using
verified and relevant customer resolution memories when
they exist.

CUSTOMER:
${name}

CURRENT CUSTOMER MESSAGE:
${message}

VERIFIED AND RELEVANT CUSTOMER RESOLUTION MEMORIES:
${memoryContext}

STRICT MEMORY RULES:

1. Only use memories that are provided in the
   VERIFIED AND RELEVANT CUSTOMER RESOLUTION MEMORIES
   section.

2. Never use information from another customer.

3. Never invent a previous solution.

4. A previous resolution must be relevant to the customer's
   CURRENT issue before you use it.

5. If the recalled memory is about a different type of issue,
   ignore it completely.

6. Never add troubleshooting steps that are not explicitly
   supported by the verified memory.

7. Never add alternative solutions.

8. Never suggest actions such as:
   - logging out
   - logging back in
   - reinstalling
   - clearing cache
   - changing payment methods
   - contacting support
   - checking settings
   unless that exact action is explicitly present
   in the verified memory.

9. Do not infer additional steps from the verified solution.

10. If a verified and relevant resolution exists, focus only
    on that resolution.

11. If no verified and relevant resolution exists, respond
    based only on the current customer message.

12. When no relevant memory exists, ask for useful information
    about the current issue instead of inventing a solution.

13. Never mention Hindsight, memory retrieval, APIs, prompts,
    models, or internal implementation.

14. Keep the answer concise and natural.

IMPORTANT:
A customer may have previous successful resolutions for
other problems. Those memories must NOT influence the
response to an unrelated current problem.
`
                },
                {
                    role: "user",
                    content: `Customer name: ${name}

Current issue:
${message}`
                }
            ]
        });

        const answer = completion.choices[0].message.content;

        // ------------------------------------------
        // 5. RETAIN CURRENT INTERACTION
        // ------------------------------------------

        const memoryContent = `
Customer: ${name}

Customer issue:
${message}

Support response provided:
${answer}

Resolution status:
Not yet confirmed by customer.

This interaction must NOT be treated as a verified successful resolution.
`;

        const retainResponse = await fetch(
            `${process.env.HINDSIGHT_API_URL}/v1/default/banks/${process.env.HINDSIGHT_BANK_ID}/memories`,
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${process.env.HINDSIGHT_API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    items: [
                        {
                            content: memoryContent
                        }
                    ]
                })
            }
        );

        const retainData = await retainResponse.json();

        if (!retainResponse.ok) {
            throw new Error(
                `Hindsight retain failed: ${JSON.stringify(retainData)}`
            );
        }

        // ------------------------------------------
        // 6. RETURN DATA TO FRONTEND
        // ------------------------------------------

        res.json({
            success: true,
            customer: name,
            message: message,
            response: answer,
            recalledMemories: curatedMemories,
            memoryStored: true
        });

    } catch (error) {
        console.error("Support agent error:", error);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==========================================
// START SERVER
// ==========================================

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
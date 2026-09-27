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

// ============================================================
// BASIC HELPERS
// ============================================================

function normalizeText(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[^\w\s'-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function containsAny(text, phrases) {
    return phrases.some((phrase) => text.includes(phrase));
}

// ============================================================
// CUSTOMER MATCHING
// ============================================================

function belongsToCustomer(memory, customerName) {
    const text = normalizeText(memory.text);
    const name = normalizeText(customerName);

    if (!name) {
        return false;
    }

    // Strong explicit customer fields
    const customerMatch = text.match(/customer:\s*([^\n|]+)/i);

    if (customerMatch) {
        const explicitCustomer = normalizeText(customerMatch[1]);

        if (
            explicitCustomer &&
            !explicitCustomer.includes(name) &&
            !name.includes(explicitCustomer)
        ) {
            return false;
        }
    }

    // Detect memories involving multiple customers.
    // Example:
    // "Ananya (customer), Rahul (customer)"
    const involvedCustomers = [];
    const customerRegex = /([a-z][a-z0-9_-]*)\s*\(customer\)/gi;

    let match;

    while ((match = customerRegex.exec(memory.text || "")) !== null) {
        involvedCustomers.push(normalizeText(match[1]));
    }

    if (involvedCustomers.length > 0) {
        const currentCustomerPresent = involvedCustomers.some(
            (person) =>
                person === name ||
                person.includes(name) ||
                name.includes(person)
        );

        if (!currentCustomerPresent) {
            return false;
        }

        // If the memory mixes multiple customers, reject it.
        // This prevents polluted memories such as:
        // "Ananya ... Rahul ... Previous successful resolution for Rahul."
        const uniqueCustomers = [...new Set(involvedCustomers)];

        if (uniqueCustomers.length > 1) {
            return false;
        }
    }

    // Normal name matching
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const nameRegex = new RegExp(
        `(^|\\s)${escapedName}($|\\s|[,.!?|:()])`,
        "i"
    );

    return nameRegex.test(text);
}

// ============================================================
// CURRENT ISSUE EXTRACTION
// ============================================================

function extractCurrentMessage(message) {
    const text = String(message || "");

    // Frontend sends the previous conversation followed by:
    //
    // New customer message:
    //
    // <current message>

    const marker = "New customer message:";

    if (text.toLowerCase().includes(marker.toLowerCase())) {
        const index = text
            .toLowerCase()
            .lastIndexOf(marker.toLowerCase());

        return text
            .slice(index + marker.length)
            .trim();
    }

    return text.trim();
}

// ============================================================
// ISSUE FAMILY DETECTION
// ============================================================

function getIssueFamily(text) {
    const value = normalizeText(text);

    // Duplicate charge must be checked BEFORE generic payment.
    if (
        containsAny(value, [
            "charged twice",
            "charge twice",
            "charged two times",
            "charged twice for",
            "double charge",
            "duplicate charge",
            "duplicate charges",
            "two charges",
            "two identical charges",
            "charged more than once",
            "charged me twice",
            "billed twice",
            "billing twice"
        ])
    ) {
        return "duplicate_charge";
    }

    // Login / account access
    if (
        containsAny(value, [
            "cant log in",
            "can't log in",
            "cannot log in",
            "unable to log in",
            "unable to login",
            "cannot login",
            "can't login",
            "login",
            "log in",
            "sign in",
            "signin",
            "password",
            "password isn't working",
            "password is not working",
            "account is locked",
            "locked out",
            "too many login attempts",
            "forgot password"
        ])
    ) {
        return "login_access";
    }

    // Payment failure
    if (
        containsAny(value, [
            "payment failed",
            "payment failure",
            "payment keeps failing",
            "payment is failing",
            "payment was rejected",
            "payment rejected",
            "payment declined",
            "transaction declined",
            "transaction was declined",
            "card was declined",
            "checkout payment failed",
            "payment error",
            "payment issue",
            "payment problem",
            "payment keeps getting rejected",
            "unable to complete payment",
            "cannot complete payment",
            "failed payment",
            "failed checkout"
        ])
    ) {
        return "payment_failure";
    }

    // Subscription / Premium upgrade
    if (
        containsAny(value, [
            "upgrade to premium",
            "upgrading to premium",
            "premium upgrade",
            "premium plan",
            "subscription upgrade",
            "upgrade my subscription",
            "upgrade subscription"
        ])
    ) {
        return "subscription_upgrade";
    }

    // Order-related issues
    if (
        containsAny(value, [
            "order",
            "ordered",
            "delivery",
            "shipment",
            "package",
            "order status",
            "where is my order"
        ])
    ) {
        return "order";
    }

    // Refund-related issues
    if (
        containsAny(value, [
            "refund",
            "refunded",
            "money back",
            "refund hasn't arrived",
            "refund has not arrived"
        ])
    ) {
        return "refund";
    }

    return "unknown";
}

// ============================================================
// MEMORY ISSUE MATCHING
// ============================================================

function memoryMatchesCurrentIssue(memory, currentMessage) {
    const memoryText = memory.text || "";

    const currentFamily = getIssueFamily(currentMessage);
    const memoryFamily = getIssueFamily(memoryText);

    // If we know both issue types, they MUST match.
    if (
        currentFamily !== "unknown" &&
        memoryFamily !== "unknown"
    ) {
        return currentFamily === memoryFamily;
    }

    // Unknown current issue:
    // use Hindsight relevance scores as fallback.
    if (currentFamily === "unknown") {
        const semantic = Number(memory.scores?.semantic || 0);
        const keyword = Number(memory.scores?.keyword || 0);
        const reranker = Number(memory.scores?.reranker || 0);

        return (
            semantic >= 0.78 ||
            (semantic >= 0.72 && keyword >= 0.50) ||
            reranker >= 0.20
        );
    }

    // Known current issue but unknown memory topic.
    // Do NOT allow broad semantic similarity to leak unrelated memory.
    return false;
}

// ============================================================
// VERIFIED RESOLUTION DETECTION
// ============================================================

function isVerifiedResolution(memory) {
    const text = normalizeText(memory.text);

    // Explicitly unresolved / failed memories
    if (
        containsAny(text, [
            "resolution status unresolved",
            "resolution status unconfirmed",
            "resolution status not yet confirmed",
            "not confirmed",
            "not confirmed by customer",
            "unverified",
            "must not be treated as a verified",
            "problem persists",
            "issue persists",
            "problem still persists",
            "issue still persists",
            "did not resolve",
            "didn't resolve",
            "did not work",
            "didn't work",
            "still failed",
            "still failing",
            "failed again",
            "attempted to resolve"
        ])
    ) {
        return false;
    }

    // Explicit verified markers
    if (
        containsAny(text, [
            "verified customer outcome",
            "resolution status verified",
            "customer explicitly confirmed",
            "successfully resolved",
            "confirmed success",
            "this outcome is verified",
            "customer confirmed that it worked",
            "successfully upgraded",
            "payment was successful",
            "payment was processed successfully",
            "payment went through successfully",
            "previous successful resolution"
        ])
    ) {
        return true;
    }

    // Hindsight-generated successful-resolution memories
    if (
        containsAny(text, [
            "issue was resolved by",
            "problem was resolved by",
            "payment issue was resolved by",
            "payment failure was resolved by",
            "payment problem was resolved by",
            "resolved the payment failure by",
            "resolved the payment issue by",
            "resolved the payment problem by",
            "previous similar issues were resolved using this method"
        ])
    ) {
        return true;
    }

    return false;
}

// ============================================================
// PREVIOUS CUSTOMER INTERACTION DETECTION
// ============================================================

function isPreviousInteraction(memory) {
    const text = normalizeText(memory.text);

    return (
        text.includes("customer issue") ||
        text.includes("customer experienced") ||
        text.includes("customer is experiencing") ||
        text.includes("support requested") ||
        text.includes("support advised") ||
        text.includes("assistant requested") ||
        text.includes("assistant advised") ||
        text.includes("support agent")
    );
}

// ============================================================
// HINDSIGHT RELEVANCE
// ============================================================

function isRelevantMemory(memory) {
    const semantic = Number(memory.scores?.semantic || 0);
    const keyword = Number(memory.scores?.keyword || 0);
    const reranker = Number(memory.scores?.reranker || 0);

    return (
        semantic >= 0.70 ||
        (semantic >= 0.65 && keyword >= 0.30) ||
        reranker >= 0.005
    );
}

// ============================================================
// MEMORY CATEGORY
// ============================================================

function getMemoryCategory(memory) {
    if (isVerifiedResolution(memory)) {
        return "VERIFIED RESOLUTION";
    }

    if (isPreviousInteraction(memory)) {
        return "PREVIOUS CUSTOMER HISTORY";
    }

    return "OTHER RELEVANT MEMORY";
}

// ============================================================
// MEMORY CURATION
// ============================================================

function curateMemories(results, customerName, currentMessage) {
    if (!Array.isArray(results)) {
        return [];
    }

    // --------------------------------------------------------
    // 1. CUSTOMER FILTER
    // --------------------------------------------------------

    const customerMemories = results.filter((memory) =>
        belongsToCustomer(memory, customerName)
    );

    // --------------------------------------------------------
    // 2. ISSUE FILTER
    // --------------------------------------------------------

    const issueRelevantMemories = customerMemories.filter((memory) =>
        memoryMatchesCurrentIssue(memory, currentMessage)
    );

    // --------------------------------------------------------
    // 3. HINDSIGHT RELEVANCE FILTER
    // --------------------------------------------------------

    const relevantMemories = issueRelevantMemories.filter((memory) =>
        isRelevantMemory(memory)
    );

    // --------------------------------------------------------
    // 4. SCORE / RANK
    // --------------------------------------------------------

    const scoredMemories = relevantMemories.map((memory) => {
        const text = normalizeText(memory.text);

        const semantic = Number(memory.scores?.semantic || 0);
        const keyword = Number(memory.scores?.keyword || 0);
        const reranker = Number(memory.scores?.reranker || 0);

        let priority = 0;

        // Verified outcomes should appear first.
        if (isVerifiedResolution(memory)) {
            priority += 100;
        }

        // Strong Hindsight relevance
        priority += semantic * 100;
        priority += keyword * 50;
        priority += reranker * 100;

        // Experience memories are useful for support context.
        if (memory.type === "experience") {
            priority += 20;
        }

        if (memory.type === "observation") {
            priority += 10;
        }

        // Specific successful-resolution phrases
        if (text.includes("successfully resolved")) {
            priority += 100;
        }

        if (text.includes("issue was resolved")) {
            priority += 90;
        }

        if (text.includes("resolved")) {
            priority += 50;
        }

        if (memory.scores?.final) {
            priority += Number(memory.scores.final) * 10;
        }

        return {
            ...memory,
            category: getMemoryCategory(memory),
            memoryPriority: priority
        };
    });

    scoredMemories.sort(
        (a, b) => b.memoryPriority - a.memoryPriority
    );

    return scoredMemories.slice(0, 5);
}

// ============================================================
// HINDSIGHT RECALL
// ============================================================

async function hindsightRecall(query) {
    const response = await fetch(
        `${process.env.HINDSIGHT_API_URL}/v1/default/banks/${process.env.HINDSIGHT_BANK_ID}/memories/recall`,
        {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.HINDSIGHT_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                query,
                max_tokens: 2000
            })
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            `Hindsight recall failed: ${JSON.stringify(data)}`
        );
    }

    return data;
}

// ============================================================
// HINDSIGHT RETAIN
// ============================================================

async function hindsightRetain(content) {
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
                        content
                    }
                ]
            })
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            `Hindsight retain failed: ${JSON.stringify(data)}`
        );
    }

    return data;
}

// ============================================================
// BASIC ROUTE
// ============================================================

app.get("/", (req, res) => {
    res.json({
        message: "Customer Support Agent backend is running!"
    });
});

// ============================================================
// TEST HINDSIGHT
// ============================================================

app.post("/test-hindsight", async (req, res) => {
    try {
        const data = await hindsightRetain(
            "Test memory: Rahul had a payment issue while upgrading to Premium."
        );

        res.json({
            success: true,
            data
        });

    } catch (error) {
        console.error("Hindsight connection error:", error);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// TEST RECALL
// ============================================================

app.get("/test-recall", async (req, res) => {
    try {
        const query =
            req.query.q ||
            "What problem did Rahul have when upgrading to Premium?";

        const data = await hindsightRecall(query);

        res.json({
            success: true,
            query,
            count: Array.isArray(data.results)
                ? data.results.length
                : 0,
            results: data.results || [],
            raw: data
        });

    } catch (error) {
        console.error("Hindsight recall error:", error);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Also support POST for compatibility.
app.post("/test-recall", async (req, res) => {
    try {
        const query =
            req.body.query ||
            "What problem did Rahul have when upgrading to Premium?";

        const data = await hindsightRecall(query);

        res.json({
            success: true,
            query,
            count: Array.isArray(data.results)
                ? data.results.length
                : 0,
            results: data.results || [],
            raw: data
        });

    } catch (error) {
        console.error("Hindsight recall error:", error);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// TEST VERIFIED RESOLUTION
// ============================================================

app.post("/test-resolution", async (req, res) => {
    try {
        const content = `
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
`;

        const data = await hindsightRetain(content);

        res.json({
            success: true,
            data
        });

    } catch (error) {
        console.error("Resolution memory error:", error);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// REAL CUSTOMER SUPPORT ENDPOINT
// ============================================================

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

        // ----------------------------------------------------
        // Extract ONLY the current message.
        // This prevents the entire previous conversation from
        // being sent into Hindsight recall.
        // ----------------------------------------------------

        const currentMessage = extractCurrentMessage(message);

        console.log("");
        console.log("=======================================");
        console.log("SUPPORT REQUEST");
        console.log("CUSTOMER:", name);
        console.log("CURRENT ISSUE:", currentMessage);
        console.log("ISSUE FAMILY:", getIssueFamily(currentMessage));
        console.log("=======================================");

        // ----------------------------------------------------
        // 1. RECALL FROM HINDSIGHT
        // ----------------------------------------------------

        const recallData = await hindsightRecall(
            `${name}: ${currentMessage}`
        );

        // ----------------------------------------------------
        // 2. CURATE MEMORIES
        // ----------------------------------------------------

        const curatedMemories = curateMemories(
            recallData.results || [],
            name,
            currentMessage
        );

        console.log(
            "MEMORIES AFTER FILTERING:",
            curatedMemories.length
        );

        curatedMemories.forEach((memory, index) => {
            console.log(
                `${index + 1}. [${memory.category}] ${memory.text}`
            );
        });

        // ----------------------------------------------------
        // 3. PREPARE MEMORY CONTEXT
        // ----------------------------------------------------

        const memories = curatedMemories
            .map(
                (item) =>
                    `[${item.category}] ${item.text}`
            )
            .join("\n");

        const memoryContext =
            memories ||
            `No verified or relevant previous memory was found for ${name} for this specific issue.`;

        // ----------------------------------------------------
        // 4. GENERATE SUPPORT RESPONSE
        // ----------------------------------------------------

        const completion =
            await groq.chat.completions.create({
                model: "openai/gpt-oss-20b",

                messages: [
                    {
                        role: "system",

                        content: `
You are SupportMind AI, a professional customer support agent.

Your job is to help the customer with their CURRENT issue.

CUSTOMER:
${name}

CURRENT CUSTOMER MESSAGE:
${currentMessage}

RELEVANT MEMORY FROM PREVIOUS CUSTOMER EXPERIENCES:
${memoryContext}

STRICT MEMORY RULES:

1. Only use memories supplied in the relevant-memory section.

2. Never use information from another customer.

3. Never invent a previous solution.

4. A previous memory must be about the same type of issue
   as the customer's current issue.

5. If the current issue is different from the recalled memory,
   ignore that memory completely.

6. If a previous action failed, never recommend that same
   failed action again.

7. If a verified successful resolution exists for the current
   issue, use that resolution naturally.

8. If no relevant previous resolution exists, ask a focused
   diagnostic question based on the customer's current issue.

9. Do not provide long generic troubleshooting lists.

10. Do not invent technical details.

11. Do not infer alternative troubleshooting steps that are
    not supported by the available memory.

12. Do not ask the customer for their name again.

13. Treat explicit customer statements such as
    "it didn't work", "still failing", or "the problem persists"
    as evidence that the previous attempt failed.

14. Never claim that an issue is resolved unless the customer
    explicitly confirms success.

15. If the customer explicitly confirms that the issue is solved,
    acknowledge the successful outcome naturally.

16. Never mention Hindsight, memory retrieval, APIs, prompts,
    models, internal filtering, or implementation details.

17. Keep the response concise and conversational.

18. A customer may have previous successful resolutions for
    other problems. Those memories must NOT influence the
    response to an unrelated current problem.
`
                    },

                    {
                        role: "user",

                        content: `
Customer name: ${name}

Current issue:

${currentMessage}
`
                    }
                ]
            });

        const answer =
            completion.choices[0].message.content;

        // ----------------------------------------------------
        // 5. RETAIN CURRENT INTERACTION
        // ----------------------------------------------------

        const memoryContent = `
Customer: ${name}

Customer issue:
${currentMessage}

Support response provided:
${answer}

Resolution status:
Not yet confirmed by customer.

This interaction must NOT be treated as a verified successful resolution.
`;

        try {
            await hindsightRetain(memoryContent);
        } catch (retainError) {
            console.warn(
                "Hindsight retain warning:",
                retainError.message
            );
        }

        // ----------------------------------------------------
        // 6. RETURN TO FRONTEND
        // ----------------------------------------------------

        res.json({
            success: true,
            customer: name,
            message: currentMessage,
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

// ============================================================
// END CHAT
// ============================================================

app.post("/end-chat", async (req, res) => {
    try {
        const {
            customerName,
            conversation,
            resolutionConfirmed
        } = req.body;

        const name =
            customerName?.trim() || "Customer";

        if (
            !Array.isArray(conversation) ||
            conversation.length === 0
        ) {
            return res.status(400).json({
                success: false,
                error: "Conversation is required."
            });
        }

        console.log("");
        console.log("=======================================");
        console.log("ENDING CHAT");
        console.log("CUSTOMER:", name);
        console.log(
            "RESOLUTION CONFIRMED:",
            resolutionConfirmed
        );
        console.log("=======================================");

        const conversationText = conversation
            .map(
                (item) =>
                    `${item.role === "customer"
                        ? "Customer"
                        : "Support Agent"
                    }: ${item.text}`
            )
            .join("\n");

        let memoryContent;

        if (resolutionConfirmed === true) {
            memoryContent = `
VERIFIED CUSTOMER OUTCOME

Customer:
${name}

Conversation:
${conversationText}

Resolution status:
VERIFIED

The customer explicitly confirmed that the issue was successfully resolved.

This outcome may be treated as a verified successful customer resolution
for future support interactions involving the same customer and the same
type of issue.
`;
        } else {
            memoryContent = `
CUSTOMER SUPPORT CHAT ENDED

Customer:
${name}

Conversation:
${conversationText}

Resolution status:
UNRESOLVED

The customer did not explicitly confirm that the issue was resolved.

This interaction must NOT be treated as a verified successful resolution.
`;
        }

        let memoryStored = false;

        try {
            await hindsightRetain(memoryContent);
            memoryStored = true;
        } catch (retainError) {
            console.warn(
                "End-chat retain warning:",
                retainError.message
            );
        }

        res.json({
            success: true,
            chatEnded: true,
            resolutionVerified:
                resolutionConfirmed === true,
            memoryStored,
            customer: name
        });

    } catch (error) {
        console.error("End chat error:", error);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// START SERVER
// ============================================================

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(
        `Server running on http://localhost:${PORT}`
    );
});
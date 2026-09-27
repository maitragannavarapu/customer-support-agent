const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

// Basic test route
app.get("/", (req, res) => {
    res.json({
        message: "Customer Support Agent backend is running!"
    });
});

// Test Hindsight connection
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

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
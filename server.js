const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();
const serverless = require('serverless-http');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for frontend communication
app.use(cors());
app.use(express.json());

// Base URL for the Context API
const CONTEXT_API_BASE_URL = 'https://backend.vgvishesh.com';



const multer = require('multer');
const FormData = require('form-data');
const upload = multer({ storage: multer.memoryStorage() }); // Store files in memory to forward them

// 1. List Knowledge Bases
app.get('/api/knowledgebase', async (req, res) => {
    try {
        const apiKey = process.env.API_KEY;
        const response = await axios.get(`${CONTEXT_API_BASE_URL}/knowledgebase`, {
            headers: {
                'x-api-key': apiKey
            },
            timeout:8000
        });
        res.json(response.data);
    } catch (error) {
        console.error("Error listing KBs:", error.message);
        res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
});

// 2. Create Knowledge Base (Upload Files)
app.post('/api/knowledgebase', upload.array('files'), async (req, res) => {
    try {
        const apiKey = process.env.API_KEY;
        
        // Prepare form data
        const form = new FormData();
        
        // Add required fields
        form.append('name', req.body.name || "New Knowledge Base");
        if (req.body.description) {
            form.append('description', req.body.description);
        }
        
        // Append uploaded files
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                form.append('files', file.buffer, {
                    filename: file.originalname,
                    contentType: file.mimetype
                });
            });
        }
        
        // Forward request
        const response = await axios.post(`${CONTEXT_API_BASE_URL}/knowledgebase`, form, {
            headers: {
                ...form.getHeaders(),
                'x-api-key': apiKey
            }
        });
        
        res.json(response.data);
    } catch (error) {
        console.error("Error creating KB:", error.message);
        res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
});




// 3. Check Creation Status
app.get('/api/knowledgebase/:requestId', async (req, res) => {
    try {
        const apiKey = process.env.API_KEY;
        const { requestId } = req.params;
        
        const response = await axios.get(`${CONTEXT_API_BASE_URL}/knowledgebase/${requestId}`, {
            headers: {
                'x-api-key': apiKey
            }
        });
        
        res.json(response.data);
    } catch (error) {
        console.error("Error checking status:", error.message);
        res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
});

app.post('/api/chat', async (req, res) => {
    try {
        console.log("\n--- NEW REQUEST ---");

        const { query } = req.body;
        console.log("User Query:", query);

        const apiKey = process.env.API_KEY;
        const knowledgeBaseId = process.env.KNOWLEDGE_BASE_ID;
        const geminiApiKey = process.env.GEMINI_API_KEY;

        if (!apiKey || !knowledgeBaseId || !geminiApiKey) {
            console.error("Missing API Keys in .env");
            return res.status(500).json({ error: 'Server misconfiguration.' });
        }

        console.log("[Step 1] Calling Context API...");
        const response = await axios.post(
            `${CONTEXT_API_BASE_URL}/knowledgebase/${knowledgeBaseId}/embeddings`,
            {
                knowledgeBaseId,
                query,
                topK: 5
            },
            {
                headers: {
                    'x-api-key': apiKey,
                    'Content-Type': 'application/json'
                }
            }
        );

        const results = response.data.embeddings || [];
        console.log(`[Step 1] Found ${results.length} chunks.`);

        if (!results.length) {
            return res.json({ answer: "No relevant information found." });
        }

        const context = results.map((item, index) => {
            console.log(`[Chunk ${index + 1}] ${item.content.substring(0, 80)}...`);
            return item.content.trim();
        }).join("\n\n");

        console.log("[Step 2] Initializing Gemini Model...");
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const prompt = `
Use the following context to answer clearly and concisely.

Context:
${context}

Question:
${query}
        `;

        console.log("[Step 3] Sending prompt to Gemini...");
        const result = await model.generateContent(prompt);
        const answer = result.response.text();

        console.log("[Step 4] Gemini Response Received");

        return res.json({ answer });

    } catch (error) {
        console.error("--- API ERROR ---");
        console.error(error);
        return res.status(500).json({ error: "Internal server error" });
    }
});


// Start the server
// app.listen(PORT, () => {
//     console.log(`\n--- Knowledge Base Proxy Server ---`);
//     console.log(`Running on: http://localhost:${PORT}`);
// });

module.exports = serverless(app);
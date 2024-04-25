require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { expressjwt: expressJwt } = require('express-jwt');
const { addTrainingJob, fetchJobDetailsById, registerMiner, authenticateMiner, fetchPendingJobDetails } = require('./firebase');

const app = express();
const port = 3000;

app.use(cors()); // Enable CORS for all origins

// Set up multer for file storage
const storage = multer.memoryStorage(); // Change to memory storage to handle files as buffers
const upload = multer({ storage: storage });

// Middleware to validate JWT
const checkJwt = expressJwt({
    secret: process.env.JWT_SECRET,
    algorithms: ['HS256']
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Route to handle the training job submissions
app.post('/submit-training', upload.fields([{ name: 'trainingFile' }, { name: 'validationFile' }]), async (req, res) => {
    const { body, files } = req;
    
    // Generate training script content dynamically based on request
    const scriptContent = generateTrainingScript(body);
    const scriptBuffer = Buffer.from(scriptContent, 'utf-8');
    const scriptFilename = `training_script-${Date.now()}.py`;

    try {
        // Prepare file data for upload
        const trainingFileData = files['trainingFile'] ? {
            originalname: files['trainingFile'][0].originalname,
            buffer: files['trainingFile'][0].buffer,
            mimetype: files['trainingFile'][0].mimetype
        } : null;

        const validationFileData = files['validationFile'] ? {
            originalname: files['validationFile'][0].originalname,
            buffer: files['validationFile'][0].buffer,
            mimetype: files['validationFile'][0].mimetype
        } : null;

        const scriptFileData = {
            originalname: scriptFilename,
            buffer: scriptBuffer,
            mimetype: 'text/x-python-script'
        };

        // Submit training job along with files
        const jobId = await addTrainingJob(body, trainingFileData, validationFileData, scriptFileData);
        res.status(200).send({ message: 'Training job submitted successfully!', jobId: jobId });
    } catch (error) {
        console.error('Error submitting training job:', error);
        res.status(500).send({ error: 'Failed to submit training job.' });
    }
});

app.get('/pending-jobs', checkJwt, async (req, res) => {
    try {
        const jobs = await fetchPendingJobDetails();
        res.status(200).json(jobs);
    } catch (error) {
        console.error('Failed to fetch pending jobs:', error);
        res.status(500).send({ error: 'Failed to fetch pending jobs' });
    }
});

app.get('/job-details/:docId', checkJwt, async (req, res) => {
    const { docId } = req.params;

    try {
        const jobDetails = await fetchJobDetailsById(docId);
        if (!jobDetails) {
            res.status(404).send({ message: 'Job not found' });
            return;
        }
        res.status(200).json(jobDetails);
    } catch (error) {
        console.error('Failed to fetch job details:', error);
        res.status(500).send({ error: 'Failed to fetch job details' });
    }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await authenticateMiner(username, password);
        const token = jwt.sign({ userId: user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });

        res.status(200).send({ token });
    } catch (error) {
        console.error('Login error:', error.message);
        res.status(401).send({ error: 'Login failed' });
    }
});

app.post('/register-miner', async (req, res) => {
    const { ethereumAddress, username, email } = req.body;
    const password = generatePassword(); // Automatically generate a password

    try {
        const result = await registerMiner({ ethereumAddress, username, email, password });
        res.status(200).send(result); // Send back the username and generated password
    } catch (error) {
        console.error('Error registering miner:', error);
        res.status(500).send({ error: 'Failed to register miner.' });
    }
});

function generatePassword() {
    const length = 6;
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let retVal = "";
    for (let i = 0, n = charset.length; i < length; ++i) {
        retVal += charset.charAt(Math.floor(Math.random() * n));
    }
    return retVal;
}

function generateTrainingScript(trainingData) {
    const { baseModel = 'gpt2', batchSize = 8, learningRateMultiplier = 5e-5, numberOfEpochs = 3, fineTuningType = 'text-generation', huggingFaceId = 'default-dataset', suffix = 'default', seed = '42' } = trainingData;
    return `
from transformers import AutoModelForCausalLM, Trainer, TrainingArguments
from datasets import load_dataset
import random
import torch

random.seed(${parseInt(seed, 10)})
torch.manual_seed(${parseInt(seed, 10)})

model = AutoModelForCausalLM.from_pretrained("${baseModel}")
dataset = load_dataset("${fineTuningType}", "${huggingFaceId}")

training_args = TrainingArguments(
    output_dir='./results-${suffix}',
    evaluation_strategy="epoch",
    learning_rate=${parseFloat(learningRateMultiplier)},
    per_device_train_batch_size=${parseInt(batchSize, 10)},
    num_train_epochs=${parseInt(numberOfEpochs, 10)},
    save_strategy="epoch",
    save_total_limit=1
)

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=dataset['train'],
    eval_dataset=dataset['validation']
)

trainer.train()
model.save_pretrained('./final_model-${suffix}')
`;
}

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
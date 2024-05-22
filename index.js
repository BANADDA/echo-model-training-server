require('dotenv').config();
const amqp = require('amqplib');
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { expressjwt: expressJwt } = require('express-jwt');
const { addTrainingJob, logMinerListening, fetchJobDetailsById, registerMiner, authenticateMiner, fetchPendingJobDetails, start_training, updatestatus } = require('./firebase');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors()); // Enable CORS for all origins
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Set up multer for file storage
const storage = multer.memoryStorage(); // Change to memory storage to handle files as buffers
const upload = multer({ storage: storage });

// Middleware to validate JWT
const checkJwt = expressJwt({
    secret: process.env.JWT_SECRET,
    algorithms: ['HS256'],
    requestProperty: 'user' // ensures decoded token is attached to req.user
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

        // const numParameters = await getModelParameters(body.baseModel, huggingFaceToken);
        // console.log(`Number of parameters for model ${body.baseModel}: ${numParameters}`);

        // Submit training job along with files
        const jobId = await addTrainingJob(body, trainingFileData, validationFileData, scriptFileData);


        // Construct job message
        const jobMessage = {
          jobId: jobId,
          fineTuningType: body.fineTuningType,
          status: 'pending',
          modelId: body.baseModel,
          params: body.params
        };
    
        // Send job message to RabbitMQ
        await sendToQueue(jobMessage);
        res.status(200).send({ message: 'Training job submitted successfully!', jobId: jobId });
    } catch (error) {
        console.error('Error submitting training job:', error);
        res.status(500).send({ error: 'Failed to submit training job.' });
    }
});

// Route to start listening for jobs
app.post('/start-listening', checkJwt, async (req, res) => {
    const { minerId } = req.user; // Assuming minerId is available after JWT validation

    // Connect to RabbitMQ and listen to the queue
    const connection = await amqp.connect('amqp://localhost');
    const channel = await connection.createChannel();
    const queue = 'job_queue';

    await channel.assertQueue(queue, { durable: true });
    console.log(`[*] Miner ID ${minerId} is now listening for messages in ${queue}. To exit press CTRL+C`);

    channel.consume(queue, (msg) => {
        if (msg !== null) {
            const job = JSON.parse(msg.content.toString());
            console.log(`[x] Received job for Miner ID ${minerId}:`, job);
            channel.ack(msg);
        }
    });

    // Since this is a listener, we do not send a typical response
    res.send({ message: "Started listening for jobs..." });
});

app.post('/start-training/:docId', checkJwt, async (req, res) => {
    console.log('Miner ID:', req.user.minerId); // Assuming minerId is in req.user
    console.log("Request to start training received with docId:", req.params.docId);
    console.log("Request body:", req.body);

    const { docId } = req.params;
    const systemDetails = req.body;
    const minerId = req.user.minerId; // Extract minerId from the decoded JWT

    try {
        const jobDetails = await start_training(docId, minerId, systemDetails); // Pass minerId here
        if (!jobDetails) {
            res.status(404).send({ message: 'Job not found or failed to start' });
            return;
        }
        res.status(200).json(jobDetails);
    } catch (error) {
        console.error('Failed to start training job:', error);
        res.status(500).send({ error: 'Failed to start training job' });
    }
});

// Endpoint to update the status of a specific training job
app.patch('/update-status/:docId', checkJwt, async (req, res) => {
    const { docId } = req.params;
    const { status } = req.body;

    if (!status) {
        return res.status(400).json({ error: 'Status is required.' });
    }

    try {
        // Assuming `updateStatus` is a function that updates the job's status in the database
        await updatestatus(docId, status);
        res.json({ message: `Status updated to ${status} for job ${docId}` });
    } catch (error) {
        console.error('Failed to update job status:', error);
        res.status(500).json({ error: 'Failed to update job status' });
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
        if (user) {
            // Log that the miner is listening
         const listen =   await logMinerListening(user.userId);
         console.log("Listening: ", listen);
            // Ensure minerId is included properly
            // console.log("Miner id: ", user.docId);
            const token = jwt.sign({
                username: user.username, // use for identification in the token if necessary
                minerId: user.userId // This should be the Firestore document ID
            }, process.env.JWT_SECRET, { expiresIn: '24h' });

            res.status(200).send({
                token,
                userId: user.username,  // This is fine for display purposes
                minerId: user.userId // Confirm this is the correct Firestore document ID
            });
        } else {
            res.status(401).send({ error: 'Authentication failed.' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).send({ error: 'Login failed due to server error.' });
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

// Route not found (404)
app.use((req, res, next) => {
    res.status(404).send({ error: 'Not Found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send({ error: 'Something broke!' });
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

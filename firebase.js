// firebase.js
const admin = require('firebase-admin');
const { getStorage } = require('firebase-admin/storage');

admin.initializeApp({
    credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
});

const db = admin.firestore();
const storage = getStorage();

async function uploadFile(bucketPath, fileBuffer, mimeType) {
  console.log("Uploading file:", fileBuffer);
  const file = storage.bucket().file(bucketPath);
  const options = {
      metadata: {
          contentType: mimeType,
      },
  };

  if (!fileBuffer) {
      throw new Error('File buffer is undefined');
  }

  await file.save(fileBuffer, options);
  console.log(`File uploaded to ${bucketPath}`);
  return bucketPath;
}

async function addTrainingJob(jobData, uploadedTrainingFile, uploadedValidationFile, trainingScriptFile) {
  try {
    // First, add a preliminary document to Firestore to generate docRef and get the ID
    const docRef = await db.collection('fine_tuning_jobs').add({
      ...jobData,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'pending'
    });

    // Initialize file paths using the generated docRef ID
    let trainingFilePath = uploadedTrainingFile ? `training/${docRef.id}/${uploadedTrainingFile.originalname}` : '';
    let validationFilePath = uploadedValidationFile ? `validation/${docRef.id}/${uploadedValidationFile.originalname}` : '';
    let scriptPath = trainingScriptFile ? `scripts/${docRef.id}/${new Date().toISOString().replace(/:/g, '-')}-script.py` : '';

    // Upload the files if they exist and update the paths in the document
    if (uploadedTrainingFile) {
      await uploadFile(trainingFilePath, uploadedTrainingFile.buffer, uploadedTrainingFile.mimetype);
    }
    if (uploadedValidationFile) {
      await uploadFile(validationFilePath, uploadedValidationFile.buffer, uploadedValidationFile.mimetype);
    }
    if (trainingScriptFile) {
      await uploadFile(scriptPath, trainingScriptFile.buffer, 'text/x-python-script');
    }

    // Update the Firestore document with the file paths
    await docRef.update({
      trainingFilePath, 
      validationFilePath,
      scriptPath
    });

    console.log("Fine-tuning job submitted with ID:", docRef.id);
    return docRef.id;  // Returning the document ID for further use
  } catch (error) {
    console.error("Error submitting fine-tuning job:", error);
    throw error;
  }
}

// Fetch training jobs
async function fetchPendingTrainingJobs() {
    try {
      const querySnapshot = await db.collection('fine_tuning_jobs')
        .where('status', '==', 'pending')
        .get();
  
      if (querySnapshot.empty) {
        console.log('No pending training jobs found.');
        return [];
      }
  
      const pendingJobs = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
  
      console.log(pendingJobs);  // Log the pending jobs to console for verification
      return pendingJobs;
    } catch (error) {
      console.error("Error fetching pending training jobs:", error);
      return [];  // Return an empty array in case of error
    }
  }

  async function fetchPendingJobDetails() {
    try {
      const querySnapshot = await db.collection('fine_tuning_jobs')
        .where('status', '==', 'pending')
        .get();
  
      if (querySnapshot.empty) {
        console.log('No pending training jobs found.');
        return [];
      }
  
      const pendingJobDetails = querySnapshot.docs.map(doc => ({
        id: doc.id,
        fineTuningType: doc.data().fineTuningType,
        status: doc.data().status
      }));
  
      console.log(pendingJobDetails);  // Log the details to console for verification
      return pendingJobDetails;
    } catch (error) {
      console.error("Error fetching pending job details:", error);
      return [];  // Return an empty array in case of error
    }
  }

  async function fetchJobDetailsById(docId) {
    const docRef = db.collection('fine_tuning_jobs').doc(docId);
    const doc = await docRef.get();

    if (!doc.exists) {
        console.log('No such document!');
        return null;
    }

    const jobDetails = doc.data();
    try {
        if (jobDetails.scriptPath) {
            const scriptRef = storage.bucket().file(jobDetails.scriptPath);
            jobDetails.scriptUrl = await scriptRef.getSignedUrl({ action: 'read', expires: '03-09-2491' });
        }
        if (jobDetails.trainingFilePath) {
            const trainingRef = storage.bucket().file(jobDetails.trainingFilePath);
            jobDetails.trainingFileUrl = await trainingRef.getSignedUrl({ action: 'read', expires: '03-09-2491' });
        }
        if (jobDetails.validationFilePath) {
            const validationRef = storage.bucket().file(jobDetails.validationFilePath);
            jobDetails.validationFileUrl = await validationRef.getSignedUrl({ action: 'read', expires: '03-09-2491' });
        }
    } catch (error) {
        console.error("Error generating download URLs:", error);
        return null; // Handle or log error as needed
    }

    return jobDetails;
}

async function registerMiner(minerData) {
  const hashedPassword = await bcrypt.hash(minerData.password, 10); // Hash the password
  try {
      const docRef = await db.collection('miners').add({
          ethereumAddress: minerData.ethereumAddress,
          username: minerData.username,
          email: minerData.email,
          password: hashedPassword, // Store the hashed password
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log("Miner registered with ID:", docRef.id);
      return { username: minerData.username, password: minerData.password };
  } catch (error) {
      console.error("Error registering miner:", error);
      throw error;
  }
}

async function authenticateMiner(username, password) {
  const minersRef = db.collection('miners');
  const snapshot = await minersRef.where('username', '==', username).limit(1).get();
  if (snapshot.empty) {
      throw new Error('No matching user');
  }
  
  const userDoc = snapshot.docs[0];
  const user = userDoc.data();

  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
      throw new Error('Invalid credentials');
  }

  return user; // Return the user document if authentication succeeds
}

module.exports = {
  addTrainingJob, authenticateMiner, registerMiner, fetchPendingTrainingJobs, fetchPendingJobDetails, fetchJobDetailsById
};

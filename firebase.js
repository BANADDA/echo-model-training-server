// firebase.js
const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET
});

const db = admin.firestore();
const storage = admin.storage();

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
        fineTuningType: doc.data().fineTuningType
      }));
  
      console.log(pendingJobDetails);  // Log the details to console for verification
      return pendingJobDetails;
    } catch (error) {
      console.error("Error fetching pending job details:", error);
      return [];  // Return an empty array in case of error
    }
  }

async function fetchJobDetailsById(docId) {
    try {
      const docRef = db.collection('fine_tuning_jobs').doc(docId);
      const doc = await docRef.get();
  
      if (!doc.exists) {
        console.log('No such document!');
        return null;
      }
  
      console.log('Document data:', doc.data());
      return doc.data();
    } catch (error) {
      console.error("Error fetching document:", error);
      return null;  // Return null in case of error
    }
}

module.exports = {
  addTrainingJob, fetchPendingTrainingJobs, fetchPendingJobDetails, fetchJobDetailsById
};

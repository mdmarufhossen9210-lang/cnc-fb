const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const admin = require('firebase-admin');
const bcrypt = require('bcrypt');
const app = express();
const PORT = process.env.PORT || 5000;
const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

// Firebase Admin Initialization (for Render)
let db = null;
try {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (sa) {
    const creds = JSON.parse(sa);
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(creds),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || undefined
      });
    }
    db = admin.firestore();
    console.log('✅ Firebase initialized');
  } else {
    console.log('⚠️ FIREBASE_SERVICE_ACCOUNT not set; proceeding without Firebase');
  }
} catch (e) {
  console.error('❌ Firebase init failed:', e.message);
}

// IPFS/Pinata Configuration (Unlimited Free Storage)
const IPFS_ENABLED = process.env.IPFS_ENABLED === 'true';
const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY;
const IPFS_GATEWAY = process.env.IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs/';

// Cloudinary Configuration (Optional - 25GB free storage)
let cloudinary = null;
const CLOUDINARY_ENABLED = process.env.CLOUDINARY_ENABLED === 'true';

if (CLOUDINARY_ENABLED) {
  try {
    cloudinary = require('cloudinary').v2;
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });
    console.log('✅ Cloudinary configured successfully');
  } catch (error) {
    console.log('⚠️ Cloudinary not configured');
    cloudinary = null;
  }
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/uploads', express.static('uploads'));

// Serve static HTML files
app.use(express.static(__dirname));

// User Registration System
const USER_DATA_FILE = 'user_registrations.json';

// Initialize user data file
async function initializeUserDataFile() {
  try {
    if (!fs.existsSync(USER_DATA_FILE)) {
      await fs.promises.writeFile(USER_DATA_FILE, JSON.stringify([], null, 2));
      console.log('User data file created');
    }
  } catch (error) {
    console.error('Error initializing user data file:', error);
  }
}

// Read user data
async function readUserData() {
  try {
    await initializeUserDataFile();
    const data = await fs.promises.readFile(USER_DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading user data:', error);
    return [];
  }
}

// Write user data
async function writeUserData(data) {
  try {
    await fs.promises.writeFile(USER_DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error writing user data:', error);
  }
}

// Firebase user helpers (when db available)
async function getUserByPhone(phoneNumber) {
  if (!db) return null;
  try {
    const doc = await db.collection('users').doc(phoneNumber).get();
    return doc.exists ? doc.data() : null;
  } catch (e) {
    console.error('Firestore getUserByPhone error:', e);
    return null;
  }
}

async function upsertUser(phoneNumber, data) {
  if (!db) return false;
  try {
    await db.collection('users').doc(phoneNumber).set({ phoneNumber, ...data }, { merge: true });
    return true;
  } catch (e) {
    console.error('Firestore upsertUser error:', e);
    return false;
  }
}

// API Endpoints for User Registration and Login

// Save user name
app.post('/api/save-user-name', async (req, res) => {
  try {
    const { firstName, lastName, timestamp } = req.body;
    const userData = await readUserData();
    
    const newEntry = {
      id: Date.now().toString(),
      step: 'name',
      firstName,
      lastName,
      timestamp
    };
    
    userData.push(newEntry);
    await writeUserData(userData);
    
    res.json({ success: true, message: 'Name saved successfully' });
  } catch (error) {
    console.error('Error saving user name:', error);
    res.status(500).json({ error: 'Failed to save name' });
  }
});

// Save user date of birth
app.post('/api/save-user-dob', async (req, res) => {
  try {
    const { month, day, year, timestamp } = req.body;
    const userData = await readUserData();
    
    const newEntry = {
      id: Date.now().toString(),
      step: 'dob',
      month,
      day,
      year,
      timestamp
    };
    
    userData.push(newEntry);
    await writeUserData(userData);
    
    res.json({ success: true, message: 'Date of birth saved successfully' });
  } catch (error) {
    console.error('Error saving user DOB:', error);
    res.status(500).json({ error: 'Failed to save date of birth' });
  }
});

// Check if phone number already exists
app.post('/api/check-phone', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    const userData = await readUserData();
    
    const existingUser = userData.find(item => 
      item.step === 'completed' && 
      item.phoneNumber === phoneNumber
    );
    
    if (existingUser) {
      res.json({ exists: true, message: 'Phone number already registered' });
    } else {
      res.json({ exists: false, message: 'Phone number available' });
    }
  } catch (error) {
    console.error('Error checking phone number:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Save user account (phone and password)
app.post('/api/save-user-account', async (req, res) => {
  try {
    const { phoneNumber, password, timestamp } = req.body;
    const userData = await readUserData();
    
    const newEntry = {
      id: Date.now().toString(),
      step: 'account',
      phoneNumber,
      password,
      timestamp
    };
    
    userData.push(newEntry);
    await writeUserData(userData);
    // Also persist to Firestore when available (hashed)
    if (db && phoneNumber && password) {
      const passwordHash = await bcrypt.hash(password, 10);
      await upsertUser(phoneNumber, { step: 'account', passwordHash, updatedAt: Date.now() });
    }
    
    res.json({ success: true, message: 'Account saved successfully' });
  } catch (error) {
    console.error('Error saving user account:', error);
    res.status(500).json({ error: 'Failed to save account' });
  }
});

// Complete user registration
app.post('/api/complete-user-registration', async (req, res) => {
  try {
    const { firstName, lastName, month, day, year, phoneNumber, password, timestamp } = req.body;
    const userData = await readUserData();
    
    const newEntry = {
      id: Date.now().toString(),
      step: 'completed',
      firstName,
      lastName,
      month,
      day,
      year,
      phoneNumber,
      password,
      accountStatus: 'completed',
      timestamp
    };
    
    userData.push(newEntry);
    await writeUserData(userData);

    // Also upsert into Firestore with hashed password
    if (db && phoneNumber && password) {
      const passwordHash = await bcrypt.hash(password, 10);
      await upsertUser(phoneNumber, {
        step: 'completed',
        firstName,
        lastName,
        month,
        day,
        year,
        accountStatus: 'completed',
        passwordHash,
        updatedAt: Date.now()
      });
    }
    
    res.json({ success: true, message: 'Registration completed successfully' });
  } catch (error) {
    console.error('Error completing registration:', error);
    res.status(500).json({ error: 'Failed to complete registration' });
  }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;
    
    if (!phoneNumber || !password) {
      return res.status(400).json({ error: 'Phone number and password are required' });
    }
    
    // Prefer Firestore auth when available
    if (db) {
      const fUser = await getUserByPhone(phoneNumber);
      if (fUser && fUser.passwordHash && await bcrypt.compare(password, fUser.passwordHash)) {
        console.log('Login successful (Firestore) for user:', fUser.firstName, fUser.lastName);
        return res.json({
          success: true,
          message: 'Login successful',
          user: {
            firstName: fUser.firstName || '',
            lastName: fUser.lastName || '',
            phoneNumber
          }
        });
      }
      console.log('Login failed (Firestore) for phone number:', phoneNumber);
      return res.status(401).json({ error: 'Invalid phone number or password' });
    }

    // Fallback to legacy JSON matching (plaintext)
    const userData = await readUserData();
    const user = userData.find(item =>
      item.step === 'completed' &&
      item.phoneNumber === phoneNumber &&
      item.password === password
    );
    if (user) {
      console.log('Login successful (JSON) for user:', user.firstName, user.lastName);
      return res.json({
        success: true,
        message: 'Login successful',
        user: { firstName: user.firstName, lastName: user.lastName, phoneNumber: user.phoneNumber }
      });
    }
    return res.status(401).json({ error: 'Invalid phone number or password' });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all registrations (for admin/debugging)
app.get('/api/registrations', async (req, res) => {
  try {
    const userData = await readUserData();
    res.json(userData);
  } catch (error) {
    console.error('Error getting registrations:', error);
    res.status(500).json({ error: 'Failed to get registrations' });
  }
});

// Get registration statistics
app.get('/api/stats', async (req, res) => {
  try {
    const userData = await readUserData();
    const completedRegistrations = userData.filter(item => item.step === 'completed');
    
    res.json({
      totalRegistrations: userData.length,
      completedRegistrations: completedRegistrations.length,
      pendingRegistrations: userData.length - completedRegistrations.length
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

// Get user profile data by phone number
app.get('/api/user-profile/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const userData = await readUserData();
    
    const user = userData.find(item => 
      item.step === 'completed' && 
      item.phoneNumber === phoneNumber
    );
    
    if (user) {
      res.json({
        success: true,
        user: {
          firstName: user.firstName,
          lastName: user.lastName,
          phoneNumber: user.phoneNumber,
          month: user.month,
          day: user.day,
          year: user.year
        }
      });
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    console.error('Error getting user profile:', error);
    res.status(500).json({ error: 'Failed to get user profile' });
  }
});

// Get current logged in user data (for session management)
app.get('/api/current-user', async (req, res) => {
  try {
    // For now, we'll use a simple approach - you can enhance this with proper session management
    const userData = await readUserData();
    const completedUsers = userData.filter(item => item.step === 'completed');
    
    if (completedUsers.length > 0) {
      // Return the most recent user (for demo purposes)
      const latestUser = completedUsers[completedUsers.length - 1];
      res.json({
        success: true,
        user: {
          firstName: latestUser.firstName,
          lastName: latestUser.lastName,
          phoneNumber: latestUser.phoneNumber,
          month: latestUser.month,
          day: latestUser.day,
          year: latestUser.year
        }
      });
    } else {
      res.status(404).json({ error: 'No users found' });
    }
  } catch (error) {
    console.error('Error getting current user:', error);
    res.status(500).json({ error: 'Failed to get current user' });
  }
});

// Get user profile by phone number (for public viewing)
app.get('/api/user-profile/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const userData = await readUserData();
    
    const user = userData.find(item => 
      item.step === 'completed' && 
      item.phoneNumber === phoneNumber
    );
    
    if (user) {
      // Return public profile data (without sensitive info)
      res.json({
        success: true,
        profile: {
          firstName: user.firstName,
          lastName: user.lastName,
          phoneNumber: user.phoneNumber,
          month: user.month,
          day: user.day,
          year: user.year,
          displayName: `${user.firstName} ${user.lastName}`,
          birthday: user.month && user.day && user.year ? 
            `${user.month}/${user.day}/${user.year}` : null
        }
      });
    } else {
      res.status(404).json({ error: 'User profile not found' });
    }
  } catch (error) {
    console.error('Error getting user profile:', error);
    res.status(500).json({ error: 'Failed to get user profile' });
  }
});

// Get all public profiles (for browsing)
app.get('/api/public-profiles', async (req, res) => {
  try {
    const userData = await readUserData();
    const completedUsers = userData.filter(item => item.step === 'completed');
    
    const publicProfiles = completedUsers.map(user => ({
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      displayName: `${user.firstName} ${user.lastName}`,
      birthday: user.month && user.day && user.year ? 
        `${user.month}/${user.day}/${user.year}` : null
    }));
    
    res.json({
      success: true,
      profiles: publicProfiles,
      total: publicProfiles.length
    });
  } catch (error) {
    console.error('Error getting public profiles:', error);
    res.status(500).json({ error: 'Failed to get public profiles' });
  }
});

// Password reset system
const resetCodes = new Map(); // Store reset codes temporarily

// SMS Configuration (for demo purposes)
const SMS_CONFIG = {
  enabled: false, // Set to true when you have SMS service credentials
  accountSid: process.env.TWILIO_ACCOUNT_SID || 'your_account_sid',
  authToken: process.env.TWILIO_AUTH_TOKEN || 'your_auth_token',
  fromNumber: process.env.TWILIO_FROM_NUMBER || '+1234567890'
};

// Generate reset code
function generateResetCode() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
}

// Send SMS function (using Twilio or similar service)
async function sendSMS(toNumber, message) {
  try {
    if (!SMS_CONFIG.enabled) {
      // For demo purposes, just log the SMS
      console.log(`📱 SMS would be sent to ${toNumber}:`);
      console.log(`📝 Message: ${message}`);
      console.log('🔧 To enable real SMS, set SMS_CONFIG.enabled = true and add Twilio credentials');
      return { success: true, message: 'SMS logged for demo' };
    }

    // Real SMS implementation with Twilio
    const twilio = require('twilio');
    const client = twilio(SMS_CONFIG.accountSid, SMS_CONFIG.authToken);
    
    const result = await client.messages.create({
      body: message,
      from: SMS_CONFIG.fromNumber,
      to: toNumber
    });
    
    console.log(`📱 SMS sent successfully to ${toNumber}, SID: ${result.sid}`);
    return { success: true, sid: result.sid };
    
  } catch (error) {
    console.error('❌ SMS sending failed:', error);
    return { success: false, error: error.message };
  }
}

// Request password reset
app.post('/api/request-password-reset', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    
    const userData = await readUserData();
    const user = userData.find(item => 
      item.step === 'completed' && 
      item.phoneNumber === phoneNumber
    );
    
    if (!user) {
      return res.status(404).json({ error: 'No account found with this phone number' });
    }
    
    // Generate reset code
    const resetCode = generateResetCode();
    const expiryTime = Date.now() + (10 * 60 * 1000); // 10 minutes expiry
    
    // Store reset code with expiry
    resetCodes.set(phoneNumber, {
      code: resetCode,
      expiry: expiryTime,
      user: {
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber
      }
    });
    
    // Send SMS with reset code
    const smsMessage = `CNC FB: Your password reset code is ${resetCode}. Valid for 10 minutes. Do not share this code with anyone.`;
    const smsResult = await sendSMS(phoneNumber, smsMessage);
    
    console.log(`Password reset code for ${phoneNumber}: ${resetCode}`);
    console.log(`Code expires at: ${new Date(expiryTime).toLocaleString()}`);
    console.log(`SMS status: ${smsResult.success ? 'Sent' : 'Failed'}`);
    
    if (smsResult.success) {
      res.json({
        success: true,
        message: 'Reset code sent to your phone number via SMS',
        expiresIn: '10 minutes',
        smsStatus: 'sent'
      });
    } else {
      res.json({
        success: false,
        message: 'Failed to send SMS. Please try again later.',
        smsStatus: 'failed'
      });
    }
    
  } catch (error) {
    console.error('Error requesting password reset:', error);
    res.status(500).json({ error: 'Failed to request password reset' });
  }
});

// Verify reset code
app.post('/api/verify-reset-code', async (req, res) => {
  try {
    const { phoneNumber, code } = req.body;
    
    if (!phoneNumber || !code) {
      return res.status(400).json({ error: 'Phone number and code are required' });
    }
    
    const resetData = resetCodes.get(phoneNumber);
    
    if (!resetData) {
      return res.status(404).json({ error: 'No reset request found for this phone number' });
    }
    
    if (Date.now() > resetData.expiry) {
      resetCodes.delete(phoneNumber);
      return res.status(400).json({ error: 'Reset code has expired' });
    }
    
    if (resetData.code !== code) {
      return res.status(400).json({ error: 'Invalid reset code' });
    }
    
    // Code is valid
    res.json({
      success: true,
      message: 'Reset code verified successfully',
      user: resetData.user
    });
    
  } catch (error) {
    console.error('Error verifying reset code:', error);
    res.status(500).json({ error: 'Failed to verify reset code' });
  }
});

// Reset password with new password
app.post('/api/reset-password', async (req, res) => {
  try {
    const { phoneNumber, code, newPassword } = req.body;
    
    if (!phoneNumber || !code || !newPassword) {
      return res.status(400).json({ error: 'Phone number, code, and new password are required' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }
    
    const resetData = resetCodes.get(phoneNumber);
    
    if (!resetData) {
      return res.status(404).json({ error: 'No reset request found for this phone number' });
    }
    
    if (Date.now() > resetData.expiry) {
      resetCodes.delete(phoneNumber);
      return res.status(400).json({ error: 'Reset code has expired' });
    }
    
    if (resetData.code !== code) {
      return res.status(400).json({ error: 'Invalid reset code' });
    }
    
    // Update password in Firestore (hashed) when available
    if (db) {
      const passwordHash = await bcrypt.hash(newPassword, 10);
      await upsertUser(phoneNumber, { passwordHash, updatedAt: Date.now() });
    }
    // Also update legacy JSON for backward compatibility
    const userData = await readUserData();
    const userIndex = userData.findIndex(item => item.step === 'completed' && item.phoneNumber === phoneNumber);
    if (userIndex !== -1) {
      userData[userIndex].password = newPassword;
      await writeUserData(userData);
    }
    
    // Remove reset code
    resetCodes.delete(phoneNumber);
    
    console.log(`Password reset successful for ${phoneNumber}`);
    
    res.json({
      success: true,
      message: 'Password reset successfully'
    });
    
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Ensure uploads directory exists (only for local storage)
if (!IPFS_ENABLED && !CLOUDINARY_ENABLED && !fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Helper function to upload file to IPFS/Pinata (Unlimited), Cloudinary, or local storage
async function uploadFile(file, folder = 'uploads') {
  // Priority 1: IPFS/Pinata (Unlimited Free Storage)
  if (IPFS_ENABLED && PINATA_API_KEY && PINATA_SECRET_KEY) {
    try {
      const FormData = require('form-data');
      const axios = require('axios');
      const formData = new FormData();
      
      formData.append('file', fs.createReadStream(file.path));
      formData.append('pinataMetadata', JSON.stringify({
        name: file.filename,
        keyvalues: {
          folder: folder,
          timestamp: Date.now().toString()
        }
      }));
      formData.append('pinataOptions', JSON.stringify({
        cidVersion: 0
      }));
      
      const response = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', formData, {
        maxBodyLength: Infinity,
        headers: {
          'Content-Type': `multipart/form-data; boundary=${formData._boundary}`,
          'pinata_api_key': PINATA_API_KEY,
          'pinata_secret_api_key': PINATA_SECRET_KEY
        }
      });
      
      const ipfsHash = response.data.IpfsHash;
      const url = `${IPFS_GATEWAY}${ipfsHash}`;
      
      // Delete local file after upload
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      
      console.log(`✅ File uploaded to IPFS: ${ipfsHash}`);
      
      return {
        url: url,
        ipfsHash: ipfsHash,
        type: file.mimetype
      };
    } catch (error) {
      console.error('IPFS/Pinata upload error:', error.response?.data || error.message);
      // Fallback to next option
    }
  }
  
  // Priority 2: Cloudinary (25GB Free Storage)
  if (CLOUDINARY_ENABLED && cloudinary) {
    try {
      const result = await cloudinary.uploader.upload(file.path, {
        folder: folder,
        resource_type: 'auto',
        use_filename: true,
        unique_filename: true
      });
      
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      
      return {
        url: result.secure_url,
        publicId: result.public_id,
        type: result.resource_type === 'image' ? `image/${result.format}` : `video/${result.format}`
      };
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      // Fallback to local storage
    }
  }
  
  // Priority 3: Local Storage (Fallback)
  const url = `${BASE_URL}/uploads/${file.filename}`;
  return {
    url: url,
    type: file.mimetype
  };
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    // Always preserve original extension
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext);
    cb(null, Date.now() + '-' + base.replace(/[^a-zA-Z0-9_-]/g, '') + ext);
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    // Only allow image and video
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed!'));
    }
  }
});

// DXF upload configuration
const dxfStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext);
    cb(null, 'dxf-' + Date.now() + '-' + base.replace(/[^a-zA-Z0-9_-]/g, '') + ext);
  }
});

const dxfUpload = multer({
  storage: dxfStorage,
  fileFilter: (req, file, cb) => {
    // Only allow DXF files
    if (file.originalname.toLowerCase().endsWith('.dxf')) {
      cb(null, true);
    } else {
      cb(new Error('Only DXF files are allowed!'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// In-memory story list (for demo; use DB in production)
let stories = [];

// In-memory deposit requests (for demo; use DB in production)
let depositRequests = [];

// In-memory withdraw requests (for demo; use DB in production)
let withdrawRequests = [];

// In-memory transaction data (for demo; use DB in production)
let transactionData = [];

// Load deposit requests from file
function loadDepositRequests() {
  try {
    if (fs.existsSync('depositRequests.json')) {
      const data = fs.readFileSync('depositRequests.json', 'utf8');
      depositRequests = JSON.parse(data);
      console.log('Loaded deposit requests from file:', depositRequests.length);
    }
  } catch (error) {
    console.error('Error loading deposit requests:', error);
    depositRequests = [];
  }
}

// Save deposit requests to file
function saveDepositRequests() {
  try {
    fs.writeFileSync('depositRequests.json', JSON.stringify(depositRequests, null, 2));
    console.log('Saved deposit requests to file:', depositRequests.length);
  } catch (error) {
    console.error('Error saving deposit requests:', error);
  }
}

// Load withdraw requests from file
function loadWithdrawRequests() {
  try {
    if (fs.existsSync('withdrawRequests.json')) {
      const data = fs.readFileSync('withdrawRequests.json', 'utf8');
      withdrawRequests = JSON.parse(data);
      console.log('Loaded withdraw requests from file:', withdrawRequests.length);
    }
  } catch (error) {
    console.error('Error loading withdraw requests:', error);
    withdrawRequests = [];
  }
}

// Save withdraw requests to file
function saveWithdrawRequests() {
  try {
    fs.writeFileSync('withdrawRequests.json', JSON.stringify(withdrawRequests, null, 2));
    console.log('Saved withdraw requests to file:', withdrawRequests.length);
  } catch (error) {
    console.error('Error saving withdraw requests:', error);
  }
}

// Load requests on startup
loadDepositRequests();
loadWithdrawRequests();

// Upload API
app.post('/upload', upload.single('file'), async (req, res) => {
  console.log('Story upload body:', req.body);
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  
  try {
    const uploadResult = await uploadFile(req.file, 'stories');
    const story = {
      url: uploadResult.url,
      time: Date.now(),
      userName: req.body.userName || 'Anonymous',
      profileImage: req.body.profileImage || 'default-profile.png',
      type: uploadResult.type || req.file.mimetype
    };
    stories.push(story);
    res.json(story);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Stories list API
app.get('/stories', (req, res) => {
  const now = Date.now();
  // Remove expired stories (older than 12 hours)
  stories = stories.filter(s => now - s.time < 12 * 60 * 60 * 1000);
  res.json(stories);
});

// DXF Upload API
app.post('/upload-dxf', dxfUpload.single('file'), async (req, res) => {
  console.log('DXF upload body:', req.body);
  if (!req.file) {
    return res.status(400).json({ error: 'No DXF file uploaded' });
  }
  
  try {
    const uploadResult = await uploadFile(req.file, 'dxf-files');
    const url = uploadResult.url;
  const dxfData = {
    fileUrl: url,
    projectName: req.body.projectName || 'Unnamed Project',
    description: req.body.description || '',
    category: req.body.category || 'other',
    tags: req.body.tags || '',
    privacy: req.body.privacy || 'public',
    user: req.body.user || 'Anonymous',
    profileImage: req.body.profileImage || 'default-profile.png',
    time: Date.now(),
    price: req.body.price || ''
  };
  
  // Add to posts as DXF type
  const post = {
    url,
    time: Date.now(),
    user: req.body.user || 'Anonymous',
    name: req.body.user || 'Anonymous',
    profileImage: req.body.profileImage || 'default-profile.png',
    caption: `📐 ${req.body.projectName}\n\n${req.body.description}\n\n#DXF #${req.body.category}`,
    type: 'dxf',
    category: req.body.category || 'other',
    tags: req.body.tags || '',
    privacy: req.body.privacy || 'public',
    thumbnail: req.body.thumbnail || null,
    price: req.body.price || '',
    like: 1,
    comment: 1,
    share: 1,
    reactions: []
  };
  
    posts.unshift(post);
    res.json(dxfData);
  } catch (error) {
    console.error('DXF upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// DXF File View API
app.get('/dxf/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'uploads', filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'DXF file not found' });
  }
  
  // Check if file is DXF
  if (!filename.toLowerCase().endsWith('.dxf')) {
    return res.status(400).json({ error: 'Not a DXF file' });
  }
  
  // Return file info
  const stats = fs.statSync(filePath);
  res.json({
    filename: filename,
    size: stats.size,
    url: `${BASE_URL}/uploads/${filename}`,
    createdAt: stats.birthtime
  });
});



// Add this endpoint to delete all stories
app.delete('/stories', (req, res) => {
  stories = [];
  res.json({ success: true, message: 'All stories deleted.' });
});

// In-memory post list (for demo; use DB in production)
let posts = [];

// In-memory comments storage (for demo; use DB in production)
let comments = {};

// Post Upload API
app.post('/post', upload.single('file'), async (req, res) => {
  console.log('POST /post called');
  console.log('req.file:', req.file);
  console.log('req.body:', req.body);
  if (!req.file) {
    console.error('No file uploaded!');
    return res.status(400).json({ error: 'No file uploaded (debug: req.file is undefined)' });
  }
  // Extra: check mimetype again
  if (!(req.file.mimetype.startsWith('image/') || req.file.mimetype.startsWith('video/'))) {
    return res.status(400).json({ error: 'Only image and video files are allowed!' });
  }
  
  try {
    const uploadResult = await uploadFile(req.file, 'posts');
    const post = {
      url: uploadResult.url,
      time: Date.now(),
      user: req.body.user || 'Anonymous',
      name: req.body.user || 'Anonymous',
      profileImage: req.body.profileImage || 'default-profile.png',
      caption: req.body.caption || '',
      type: uploadResult.type || req.file.mimetype,
      like: 1,
      comment: 1,
      share: 1,
      reactions: [] // [{user, emoji}]
    };
    posts.push(post);
    res.json(post);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Posts list API
app.get('/posts', (req, res) => {
  res.json(posts);
});

// Emoji Reaction API
app.post('/react', (req, res) => {
  const { postId, user, emoji } = req.body;
  const post = posts.find(p => 'post-' + p.time === postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (!user) return res.status(400).json({ error: 'User required' });
  // Remove previous reaction by this user
  post.reactions = post.reactions.filter(r => r.user !== user);
  if (emoji) {
    post.reactions.push({ user, emoji });
    post.like = post.reactions.length;
  } else {
    // If emoji is empty, just remove reaction
    post.like = post.reactions.length;
  }
  res.json({ reactions: post.reactions, like: post.like });
});
// Like API
app.post('/like', (req, res) => {
  const { postId, action } = req.body;
  const post = posts.find(p => 'post-' + p.time === postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (action === 'like') post.like = (post.like || 1) + 1;
  else if (action === 'unlike') post.like = Math.max(1, (post.like || 1) - 1);
  res.json({ like: post.like });
});
// Comment API (just count, not storing text)
app.post('/comment', (req, res) => {
  const { postId } = req.body;
  const post = posts.find(p => 'post-' + p.time === postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  post.comment = (post.comment || 1) + 1;
  res.json({ comment: post.comment });
});
// Share API
app.post('/share', (req, res) => {
  const { postId } = req.body;
  const post = posts.find(p => 'post-' + p.time === postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  post.share = (post.share || 1) + 1;
  res.json({ share: post.share });
});

// Delete all posts
app.delete('/posts', (req, res) => {
  posts = [];
  res.json({ success: true, message: 'All posts deleted.' });
});

// Comment APIs
app.post('/comments', (req, res) => {
  const { postId, author, text, profileImage } = req.body;
  
  if (!postId || !author || !text) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  const comment = {
    id: Date.now(),
    postId,
    author,
    text,
    profileImage: profileImage || 'default-profile.png',
    timestamp: new Date().toISOString()
  };
  
  // Initialize comments array for this post if it doesn't exist
  if (!comments[postId]) {
    comments[postId] = [];
  }
  
  // Add comment to the post
  comments[postId].push(comment);
  
  // Update post comment count
  const post = posts.find(p => 'post-' + p.time === postId);
  if (post) {
    post.comment = (post.comment || 0) + 1;
  }
  
  res.json(comment);
});

app.get('/comments/:postId', (req, res) => {
  const { postId } = req.params;
  const postComments = comments[postId] || [];
  res.json(postComments);
});

// Delete all comments
app.delete('/comments', (req, res) => {
  comments = {};
  res.json({ success: true, message: 'All comments deleted.' });
});

// --- Profile Upload & Fetch APIs ---
const PROFILES_FILE = 'profiles.json';

// Helper: Load profiles from file
function loadProfiles() {
  try {
    if (!fs.existsSync(PROFILES_FILE)) return [];
    const data = fs.readFileSync(PROFILES_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}
// Helper: Save profiles to file
function saveProfiles(profiles) {
  fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2));
}

// Profile image upload API
app.post('/upload-profile', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  
  try {
    const uploadResult = await uploadFile(req.file, 'profiles');
    const url = uploadResult.url;
    const { name, background } = req.body;
  let profiles = loadProfiles();
  let idx = profiles.findIndex(p => p.name === name);
  let profile;
  if (background === '1') {
    // Cover photo upload
    profile = {
      ...(profiles[idx] || {}),
      name: name || 'Anonymous',
      background: url,
      updated: Date.now()
    };
    if (idx >= 0) {
      profiles[idx] = { ...profiles[idx], ...profile };
    } else {
      profiles.push(profile);
    }
    saveProfiles(profiles);
    return res.json({ background: url });
  } else {
    // Profile image upload
    profile = {
      name: name || 'Anonymous',
      profileImage: url,
      background: (profiles[idx] && profiles[idx].background) || '',
      updated: Date.now()
    };
    if (idx >= 0) {
      profiles[idx] = { ...profiles[idx], ...profile };
    } else {
      profiles.push(profile);
    }
    saveProfiles(profiles);
    return res.json(profile);
  }
  } catch (error) {
    console.error('Error uploading profile:', error);
    return res.status(500).json({ error: 'Upload failed' });
  }
});

// Get all profiles
app.get('/profiles', (req, res) => {
  const profiles = loadProfiles();
  res.json(profiles);
});

// DXF to SVG API - Real DXF parsing
const DxfParser = require('dxf-parser');
app.get('/dxf-to-svg', (req, res) => {
  const { file } = req.query;
  if (!file) return res.status(400).send('No file specified');
  const filePath = path.join(__dirname, 'uploads', file);
  if (!fs.existsSync(filePath)) return res.status(404).send('File not found');
  
  try {
    // Read DXF file
    const dxfContent = fs.readFileSync(filePath, 'utf8');
    const parser = new DxfParser();
    const dxf = parser.parseSync(dxfContent);
    
    // Extract entities and create SVG
    let svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="600" height="500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 500">
  <!-- Background -->
  <rect width="100%" height="100%" fill="#ffffff" stroke="#e4e6ea" stroke-width="2" rx="12"/>
  
  <!-- DXF Content -->
  <g transform="translate(50, 50)">`;
    
    // Process entities with better parsing
    if (dxf.entities) {
      console.log('Found entities:', dxf.entities.length);
      
      // Calculate bounds for scaling
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      
      console.log('Processing DXF entities...');
      
      dxf.entities.forEach(entity => {
        console.log('Entity type:', entity.type, entity);
        switch (entity.type) {
          case 'LINE':
            if (entity.vertices && entity.vertices.length >= 2) {
              const x1 = entity.vertices[0].x || 0;
              const y1 = entity.vertices[0].y || 0;
              const x2 = entity.vertices[1].x || 0;
              const y2 = entity.vertices[1].y || 0;
              
              minX = Math.min(minX, x1, x2);
              minY = Math.min(minY, y1, y2);
              maxX = Math.max(maxX, x1, x2);
              maxY = Math.max(maxY, y1, y2);
              
              svgContent += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ff0000" stroke-width="2"/>`;
            }
            break;
          case 'CIRCLE':
            if (entity.center && entity.radius) {
              const cx = entity.center.x || 0;
              const cy = entity.center.y || 0;
              const r = entity.radius || 0;
              
              minX = Math.min(minX, cx - r);
              minY = Math.min(minY, cy - r);
              maxX = Math.max(maxX, cx + r);
              maxY = Math.max(maxY, cy + r);
              
              svgContent += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#ff0000" stroke-width="2"/>`;
            }
            break;
          case 'ARC':
            if (entity.center && entity.radius) {
              const cx = entity.center.x || 0;
              const cy = entity.center.y || 0;
              const r = entity.radius || 0;
              
              minX = Math.min(minX, cx - r);
              minY = Math.min(minY, cy - r);
              maxX = Math.max(maxX, cx + r);
              maxY = Math.max(maxY, cy + r);
              
              const startAngle = (entity.startAngle || 0) * Math.PI / 180;
              const endAngle = (entity.endAngle || 0) * Math.PI / 180;
              const x1 = cx + r * Math.cos(startAngle);
              const y1 = cy + r * Math.sin(startAngle);
              const x2 = cx + r * Math.cos(endAngle);
              const y2 = cy + r * Math.sin(endAngle);
              const largeArcFlag = Math.abs(endAngle - startAngle) > Math.PI ? 1 : 0;
              
              svgContent += `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2}" fill="none" stroke="#ff0000" stroke-width="2"/>`;
            }
            break;
          case 'POLYLINE':
            if (entity.vertices && entity.vertices.length > 1) {
              let pathData = `M ${entity.vertices[0].x || 0} ${entity.vertices[0].y || 0}`;
              
              for (let i = 1; i < entity.vertices.length; i++) {
                const x = entity.vertices[i].x || 0;
                const y = entity.vertices[i].y || 0;
                pathData += ` L ${x} ${y}`;
                
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
              }
              
              svgContent += `<path d="${pathData}" fill="none" stroke="#ff0000" stroke-width="2"/>`;
            }
            break;
          case 'LWPOLYLINE':
            if (entity.vertices && entity.vertices.length > 1) {
              let pathData = `M ${entity.vertices[0].x || 0} ${entity.vertices[0].y || 0}`;
              
              for (let i = 1; i < entity.vertices.length; i++) {
                const x = entity.vertices[i].x || 0;
                const y = entity.vertices[i].y || 0;
                pathData += ` L ${x} ${y}`;
                
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
              }
              
              svgContent += `<path d="${pathData}" fill="none" stroke="#ff0000" stroke-width="2"/>`;
            }
            break;
          case 'TEXT':
            if (entity.position && entity.text) {
              const x = entity.position.x || 0;
              const y = entity.position.y || 0;
              const text = entity.text || '';
              
              minX = Math.min(minX, x);
              minY = Math.min(minY, y);
              maxX = Math.max(maxX, x + text.length * 10);
              maxY = Math.max(maxY, y + 20);
              
              svgContent += `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="12" fill="#ff0000">${text}</text>`;
            }
            break;
          case 'DIMENSION':
            if (entity.definition && entity.definition.length >= 2) {
              const x1 = entity.definition[0].x || 0;
              const y1 = entity.definition[0].y || 0;
              const x2 = entity.definition[1].x || 0;
              const y2 = entity.definition[1].y || 0;
              
              minX = Math.min(minX, x1, x2);
              minY = Math.min(minY, y1, y2);
              maxX = Math.max(maxX, x1, x2);
              maxY = Math.max(maxY, y1, y2);
              
              svgContent += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ff0000" stroke-width="1" stroke-dasharray="5,5"/>`;
            }
            break;
          case 'HATCH':
            if (entity.boundaries && entity.boundaries.length > 0) {
              entity.boundaries.forEach(boundary => {
                if (boundary.vertices && boundary.vertices.length > 1) {
                  let pathData = `M ${boundary.vertices[0].x || 0} ${boundary.vertices[0].y || 0}`;
                  
                  for (let i = 1; i < boundary.vertices.length; i++) {
                    const x = boundary.vertices[i].x || 0;
                    const y = boundary.vertices[i].y || 0;
                    pathData += ` L ${x} ${y}`;
                    
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x);
                    maxY = Math.max(maxY, y);
                  }
                  
                  svgContent += `<path d="${pathData}" fill="none" stroke="#ff0000" stroke-width="1"/>`;
                }
              });
            }
            break;
        }
      });
      
      // Calculate scaling if we have valid bounds
      if (minX !== Infinity && minY !== Infinity && maxX !== -Infinity && maxY !== -Infinity) {
        const width = maxX - minX;
        const height = maxY - minY;
        const scale = Math.min(400 / width, 300 / height, 2); // Max scale 2
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        
        console.log('Bounds:', { minX, minY, maxX, maxY, width, height, scale });
        
        // Update the transform to center and scale the content
        svgContent = svgContent.replace(
          '<g transform="translate(50, 50)">',
          `<g transform="translate(300, 250) scale(${scale}) translate(${-centerX}, ${-centerY})">`
        );
      }
      
      // If no entities found, show a message
      if (dxf.entities.length === 0) {
        svgContent += `<text x="300" y="250" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#65676b">DXF ফাইলে কোনো এলিমেন্ট পাওয়া যায়নি</text>`;
      }
    } else {
      svgContent += `<text x="300" y="250" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#65676b">DXF ফাইল পার্স করতে সমস্যা</text>`;
    }
    
    svgContent += `
  </g>
  
  <!-- Title -->
  <text x="300" y="420" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#1c1e21">DXF File Preview</text>
  <text x="300" y="440" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#65676b">${file}</text>
  
  <!-- Status indicator -->
  <circle cx="540" cy="40" r="8" fill="#28a745"/>
  <text x="555" y="45" font-family="Arial, sans-serif" font-size="12" fill="#28a745">✓</text>
</svg>`;
    
    res.set('Content-Type', 'image/svg+xml');
    res.send(svgContent);
    
  } catch (error) {
    console.error('DXF parsing error:', error);
    // Fallback to simple SVG if parsing fails
    const fallbackSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="600" height="500" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#ffffff" stroke="#e4e6ea" stroke-width="2" rx="12"/>
  <text x="300" y="250" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#65676b">DXF ফাইল লোড করতে সমস্যা</text>
  <text x="300" y="270" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#888">${file}</text>
</svg>`;
    res.set('Content-Type', 'image/svg+xml');
    res.send(fallbackSvg);
  }
});

// About data storage (in-memory for demo; use DB in production)
let aboutData = {};

// Bio data storage (in-memory for demo; use DB in production)
let bioData = {};

// Load about data from file
function loadAboutData() {
  try {
    if (fs.existsSync('about-data.json')) {
      const data = fs.readFileSync('about-data.json', 'utf8');
      aboutData = JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading about data:', error);
    aboutData = {};
  }
}

// Save about data to file
function saveAboutData() {
  try {
    fs.writeFileSync('about-data.json', JSON.stringify(aboutData, null, 2));
  } catch (error) {
    console.error('Error saving about data:', error);
  }
}

// Load bio data from file
function loadBioData() {
  try {
    if (fs.existsSync('bio-data.json')) {
      const data = fs.readFileSync('bio-data.json', 'utf8');
      bioData = JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading bio data:', error);
    bioData = {};
  }
}

// Save bio data to file
function saveBioData() {
  try {
    fs.writeFileSync('bio-data.json', JSON.stringify(bioData, null, 2));
  } catch (error) {
    console.error('Error saving bio data:', error);
  }
}

// Load transaction data from file
function loadTransactionData() {
  try {
    if (fs.existsSync('transaction-data.json')) {
      const data = fs.readFileSync('transaction-data.json', 'utf8');
      transactionData = JSON.parse(data);
    } else {
      transactionData = [];
    }
    return transactionData;
  } catch (error) {
    console.error('Error loading transaction data:', error);
    transactionData = [];
    return transactionData;
  }
}

// Save transaction data to file
function saveTransactionData(transactions) {
  try {
    fs.writeFileSync('transaction-data.json', JSON.stringify(transactions || transactionData, null, 2));
  } catch (error) {
    console.error('Error saving transaction data:', error);
  }
}

// Load data on startup
loadAboutData();
loadBioData();
loadTransactionData();

// Upload about data API
app.post('/upload-about', (req, res) => {
  try {
    const { userName, aboutData: userAboutData } = req.body;
    
    if (!userName) {
      return res.status(400).json({ error: 'Username is required' });
    }
    
    // Update about data for the user
    aboutData[userName] = { ...aboutData[userName], ...userAboutData };
    
    // Save to file
    saveAboutData();
    
    console.log(`About data updated for user: ${userName}`);
    res.json({ success: true, message: 'About data saved successfully' });
    
  } catch (error) {
    console.error('Error saving about data:', error);
    res.status(500).json({ error: 'Failed to save about data' });
  }
});

// Get about data API
app.get('/about-data', (req, res) => {
  try {
    res.json(aboutData);
  } catch (error) {
    console.error('Error getting about data:', error);
    res.status(500).json({ error: 'Failed to get about data' });
  }
});

// Get specific user's about data
app.get('/about-data/:userName', (req, res) => {
  try {
    const { userName } = req.params;
    const userData = aboutData[userName] || {};
    res.json(userData);
  } catch (error) {
    console.error('Error getting user about data:', error);
    res.status(500).json({ error: 'Failed to get user about data' });
  }
});

// Upload bio data API
app.post('/upload-bio', (req, res) => {
  try {
    const { userName, bio } = req.body;
    
    if (!userName) {
      return res.status(400).json({ error: 'Username is required' });
    }
    
    // Update bio data for the user
    bioData[userName] = { bio: bio || '' };
    
    // Save to file
    saveBioData();
    
    console.log(`Bio updated for user: ${userName}`);
    res.json({ success: true, message: 'Bio saved successfully' });
    
  } catch (error) {
    console.error('Error saving bio data:', error);
    res.status(500).json({ error: 'Failed to save bio data' });
  }
});

// Get bio data API
app.get('/bio-data', (req, res) => {
  try {
    res.json(bioData);
  } catch (error) {
    console.error('Error getting bio data:', error);
    res.status(500).json({ error: 'Failed to get bio data' });
  }
});

// Get specific user's bio data
app.get('/bio-data/:userName', (req, res) => {
  try {
    const { userName } = req.params;
    const userBio = bioData[userName] || { bio: '' };
    res.json(userBio);
  } catch (error) {
    console.error('Error getting user bio data:', error);
    res.status(500).json({ error: 'Failed to get user bio data' });
  }
});

// Upload transaction API
app.post('/upload-transaction', (req, res) => {
  try {
    const transaction = req.body;
    
    if (!transaction.userName || !transaction.amount || !transaction.type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Add transaction to array
    transactionData.push(transaction);
    
    // Save to file
    saveTransactionData();
    
    console.log(`Transaction added for user: ${transaction.userName}`);
    res.json({ success: true, message: 'Transaction saved successfully' });
    
  } catch (error) {
    console.error('Error saving transaction:', error);
    res.status(500).json({ error: 'Failed to save transaction' });
  }
});

// Get all transactions API
app.get('/transactions', (req, res) => {
  try {
    res.json(transactionData);
  } catch (error) {
    console.error('Error getting transactions:', error);
    res.status(500).json({ error: 'Failed to get transactions' });
  }
});

// Get specific user's transactions API
app.get('/transactions/:userName', (req, res) => {
  try {
    const { userName } = req.params;
    const userTransactions = transactionData.filter(t => t.userName === userName);
    res.json(userTransactions);
  } catch (error) {
    console.error('Error getting user transactions:', error);
    res.status(500).json({ error: 'Failed to get user transactions' });
  }
});

// Update transaction status API (for admin)
app.put('/transactions/:transactionId/status', (req, res) => {
  try {
    const { transactionId } = req.params;
    const { status } = req.body;
    
    const transaction = transactionData.find(t => t.id == transactionId);
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    transaction.status = status;
    saveTransactionData();
    
    console.log(`Transaction ${transactionId} status updated to: ${status}`);
    res.json({ success: true, message: 'Transaction status updated' });
    
  } catch (error) {
    console.error('Error updating transaction status:', error);
    res.status(500).json({ error: 'Failed to update transaction status' });
  }
});

// Submit deposit request API
app.post('/submit-deposit', (req, res) => {
  try {
    const depositRequest = req.body;
    console.log('=== DEPOSIT REQUEST RECEIVED ===');
    console.log('Request body:', depositRequest);
    console.log('Current depositRequests array length:', depositRequests.length);
    
    depositRequests.push(depositRequest);
    console.log('Deposit request added. New array length:', depositRequests.length);
    console.log('All deposit requests:', depositRequests);
    console.log('=== END DEPOSIT REQUEST ===');
    
    // Save to file
    saveDepositRequests();
    
    res.json({ success: true, message: 'Deposit request submitted successfully' });
  } catch (error) {
    console.error('Error submitting deposit request:', error);
    res.status(500).json({ error: 'Failed to submit deposit request' });
  }
});

// Submit withdraw request API
app.post('/submit-withdraw', (req, res) => {
  try {
    const withdrawRequest = req.body;
    console.log('=== WITHDRAW REQUEST RECEIVED ===');
    console.log('Request body:', withdrawRequest);
    console.log('Current withdrawRequests array length:', withdrawRequests.length);
    
    withdrawRequests.push(withdrawRequest);
    console.log('Withdraw request added. New array length:', withdrawRequests.length);
    console.log('All withdraw requests:', withdrawRequests);
    console.log('=== END WITHDRAW REQUEST ===');
    
    // Save to file
    saveWithdrawRequests();
    
    res.json({ success: true, message: 'Withdraw request submitted successfully' });
  } catch (error) {
    console.error('Error submitting withdraw request:', error);
    res.status(500).json({ error: 'Failed to submit withdraw request' });
  }
});

// Admin: Get all deposit requests
app.get('/admin/requests', (req, res) => {
  try {
    console.log('=== ADMIN REQUESTS ENDPOINT CALLED ===');
    console.log('Current depositRequests array:', depositRequests);
    console.log('Array length:', depositRequests.length);
    console.log('=== END ADMIN REQUESTS ===');
    res.json(depositRequests);
  } catch (error) {
    console.error('Error getting deposit requests:', error);
    res.status(500).json({ error: 'Failed to get deposit requests' });
  }
});

// Admin: Get all withdraw requests
app.get('/admin/withdraw-requests', (req, res) => {
  try {
    console.log('=== ADMIN WITHDRAW REQUESTS ENDPOINT CALLED ===');
    console.log('Current withdrawRequests array:', withdrawRequests);
    console.log('Array length:', withdrawRequests.length);
    console.log('=== END ADMIN WITHDRAW REQUESTS ===');
    res.json(withdrawRequests);
  } catch (error) {
    console.error('Error getting withdraw requests:', error);
    res.status(500).json({ error: 'Failed to get withdraw requests' });
  }
});

// Admin: Approve deposit request
app.post('/admin/approve/:requestId', (req, res) => {
  try {
    const requestId = parseInt(req.params.requestId);
    const request = depositRequests.find(r => r.id === requestId);
    
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    
    request.status = 'approved';
    console.log('Deposit request approved:', requestId);
    saveDepositRequests();
    res.json({ success: true, message: 'Request approved successfully' });
  } catch (error) {
    console.error('Error approving request:', error);
    res.status(500).json({ error: 'Failed to approve request' });
  }
});

// Admin: Update deposit request status
app.put('/admin/request/:requestId/status', (req, res) => {
  try {
    const requestId = parseInt(req.params.requestId);
    const { status } = req.body;
    const request = depositRequests.find(r => r.id === requestId);
    
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    
    request.status = status;
    saveDepositRequests();
    console.log(`Deposit request ${requestId} status updated to: ${status}`);
    res.json({ success: true, message: 'Request status updated successfully' });
  } catch (error) {
    console.error('Error updating request status:', error);
    res.status(500).json({ error: 'Failed to update request status' });
  }
});

// Admin: Reject deposit request
app.post('/admin/reject/:requestId', (req, res) => {
  try {
    const requestId = parseInt(req.params.requestId);
    const request = depositRequests.find(r => r.id === requestId);
    
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    
    request.status = 'rejected';
    console.log('Deposit request rejected:', requestId);
    saveDepositRequests();
    res.json({ success: true, message: 'Request rejected successfully' });
  } catch (error) {
    console.error('Error rejecting request:', error);
    res.status(500).json({ error: 'Failed to reject request' });
  }
});

// Admin: Approve withdraw request
app.post('/admin/approve-withdraw', (req, res) => {
  try {
    const { requestId, status } = req.body;
    const request = withdrawRequests.find(r => r.id.toString() === requestId.toString());
    
    if (!request) {
      return res.status(404).json({ error: 'Withdraw request not found' });
    }
    
    request.status = status;
    console.log('Withdraw request approved:', requestId);
    saveWithdrawRequests();
    res.json({ success: true, message: 'Withdraw request approved successfully' });
  } catch (error) {
    console.error('Error approving withdraw request:', error);
    res.status(500).json({ error: 'Failed to approve withdraw request' });
  }
});

// Admin: Reject withdraw request
app.post('/admin/reject-withdraw', (req, res) => {
  try {
    const { requestId, status } = req.body;
    const request = withdrawRequests.find(r => r.id.toString() === requestId.toString());
    
    if (!request) {
      return res.status(404).json({ error: 'Withdraw request not found' });
    }
    
    request.status = status;
    console.log('Withdraw request rejected:', requestId);
    saveWithdrawRequests();
    res.json({ success: true, message: 'Withdraw request rejected successfully' });
  } catch (error) {
    console.error('Error rejecting withdraw request:', error);
    res.status(500).json({ error: 'Failed to reject withdraw request' });
  }
});

// Get user balance
app.get('/user/balance/:userName', (req, res) => {
  try {
    const { userName } = req.params;
    const profiles = loadProfiles();
    const userProfile = profiles.find(p => p.name === userName);
    
    if (!userProfile) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ balance: userProfile.balance || 0 });
  } catch (error) {
    console.error('Error getting user balance:', error);
    res.status(500).json({ error: 'Failed to get user balance' });
  }
});

// Update user balance (for admin approval)
app.post('/admin/update-balance', (req, res) => {
  try {
    const { userName, amount } = req.body;
    
    if (!userName || amount === undefined) {
      return res.status(400).json({ error: 'Username and amount are required' });
    }
    
    const profiles = loadProfiles();
    const userIndex = profiles.findIndex(p => p.name === userName);
    
    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Add the deposit amount to user's balance
    profiles[userIndex].balance = (profiles[userIndex].balance || 0) + parseFloat(amount);
    profiles[userIndex].updated = Date.now();
    
    saveProfiles(profiles);
    
    console.log(`Balance updated for user ${userName}: +${amount} = ${profiles[userIndex].balance}`);
    res.json({ 
      success: true, 
      message: 'Balance updated successfully',
      newBalance: profiles[userIndex].balance 
    });
  } catch (error) {
    console.error('Error updating user balance:', error);
    res.status(500).json({ error: 'Failed to update user balance' });
  }
});

// Subtract user balance (for withdraw)
app.post('/user/balance/:userName/subtract', (req, res) => {
  try {
    const { userName } = req.params;
    const { amount } = req.body;
    
    if (!amount) {
      return res.status(400).json({ error: 'Amount is required' });
    }
    
    const profiles = loadProfiles();
    const userIndex = profiles.findIndex(p => p.name === userName);
    
    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const currentBalance = profiles[userIndex].balance || 0;
    const withdrawAmount = parseFloat(amount);
    
    if (currentBalance < withdrawAmount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }
    
    // Subtract the withdraw amount from user's balance
    profiles[userIndex].balance = currentBalance - withdrawAmount;
    profiles[userIndex].updated = Date.now();
    
    saveProfiles(profiles);
    
    console.log(`Balance updated for user ${userName}: -${withdrawAmount} = ${profiles[userIndex].balance}`);
    res.json({ 
      success: true, 
      message: 'Balance updated successfully',
      newBalance: profiles[userIndex].balance 
    });
  } catch (error) {
    console.error('Error updating user balance:', error);
    res.status(500).json({ error: 'Failed to update user balance' });
  }
});

// File payment endpoint (for DXF, 3D, JD file downloads)
app.post('/file-payment', (req, res) => {
  try {
    const { buyer, seller, amount, fileType, filename, timestamp, url } = req.body;
    
    console.log('File payment request received:', { buyer, seller, amount, fileType, filename, url });
    
    if (!buyer || !seller || !amount || !fileType || !filename) {
      console.log('Missing required fields:', { buyer, seller, amount, fileType, filename });
      return res.status(400).json({ error: 'All payment details are required' });
    }
    
    console.log('All required fields present, proceeding with payment...');
    
    const profiles = loadProfiles();
    console.log('Loaded profiles:', profiles.length, 'profiles found');
    
    // Find buyer profile
    let buyerIndex = profiles.findIndex(p => p.name === buyer);
    console.log('Buyer search result:', { buyer, buyerIndex, found: buyerIndex !== -1 });
    if (buyerIndex === -1) {
      // If buyer not found, create a new profile for them
      const newBuyerProfile = {
        name: buyer,
        profileImage: "",
        background: "",
        balance: 0,
        updated: Date.now()
      };
      profiles.push(newBuyerProfile);
      buyerIndex = profiles.length - 1;
      console.log(`Created new profile for buyer: ${buyer}`);
    }
    
    // Find seller profile
    let sellerIndex = profiles.findIndex(p => p.name === seller);
    console.log('Seller search result:', { seller, sellerIndex, found: sellerIndex !== -1 });
    if (sellerIndex === -1) {
      // If seller not found, create a new profile for them
      const newSellerProfile = {
        name: seller,
        profileImage: "",
        background: "",
        balance: 0,
        updated: Date.now()
      };
      profiles.push(newSellerProfile);
      sellerIndex = profiles.length - 1;
      console.log(`Created new profile for seller: ${seller}`);
    }
    
    // Check if buyer has sufficient balance
    const buyerBalance = profiles[buyerIndex].balance || 0;
    const paymentAmount = parseFloat(amount);
    
    console.log('Balance check:', { buyerBalance, paymentAmount, sufficient: buyerBalance >= paymentAmount });
    
    if (buyerBalance < paymentAmount) {
      console.log('Insufficient balance for payment');
      return res.status(400).json({ error: 'Insufficient balance' });
    }
    
    console.log('Balance sufficient, proceeding with payment transfer...');
    
    // Process the payment
    console.log('Processing payment transfer...');
    
    // Deduct from buyer
    const newBuyerBalance = buyerBalance - paymentAmount;
    profiles[buyerIndex].balance = newBuyerBalance;
    profiles[buyerIndex].updated = Date.now();
    console.log(`Buyer balance updated: ${buyerBalance} -> ${newBuyerBalance}`);
    
    // Add to seller
    const sellerBalance = profiles[sellerIndex].balance || 0;
    const newSellerBalance = sellerBalance + paymentAmount;
    profiles[sellerIndex].balance = newSellerBalance;
    profiles[sellerIndex].updated = Date.now();
    console.log(`Seller balance updated: ${sellerBalance} -> ${newSellerBalance}`);
    
    // Save updated profiles
    saveProfiles(profiles);
    
    // Log the transaction
    console.log(`File payment processed: ${buyer} -> ${seller}, Amount: ${paymentAmount}, File: ${fileType} - ${filename}`);
    console.log(`Buyer balance: ${buyerBalance} -> ${profiles[buyerIndex].balance}`);
    console.log(`Seller balance: ${sellerBalance} -> ${profiles[sellerIndex].balance}`);
    console.log(`File URL for download: ${req.body.url || 'URL not provided'}`);
    
    // Save transaction record
    const transactions = loadTransactionData();
    const transaction = {
      id: Date.now(),
      type: 'file_payment',
      buyer: buyer,
      seller: seller,
      amount: paymentAmount,
      fileType: fileType,
      filename: filename,
      timestamp: timestamp || Date.now(),
      status: 'completed'
    };
    transactions.unshift(transaction);
    saveTransactionData(transactions);
    
    res.json({ 
      success: true, 
      message: 'Payment processed successfully',
      buyerBalance: profiles[buyerIndex].balance,
      sellerBalance: profiles[sellerIndex].balance,
      transactionId: transaction.id,
      fileUrl: url
    });
  } catch (error) {
    console.error('Error processing file payment:', error);
    res.status(500).json({ error: 'Failed to process payment' });
  }
});

// Secure file download endpoint
app.get('/download/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const { buyer, seller, amount, fileType, transactionId } = req.query;
    
    console.log('Download request:', { filename, buyer, seller, amount, fileType, transactionId });
    
    // Verify that a payment was made for this file
    if (!buyer || !seller || !amount || !fileType) {
      console.log('Missing payment verification parameters');
      return res.status(403).json({ error: 'Payment verification required' });
    }
    
    // Check if transaction exists in recent transactions (within last 5 minutes)
    const transactions = loadTransactionData();
    console.log('Loaded transactions:', transactions);
    
    const recentTransaction = transactions.find(t => 
      t.type === 'file_payment' &&
      t.buyer === buyer &&
      t.seller === seller &&
      t.amount === parseFloat(amount) &&
      t.fileType === fileType &&
      (Date.now() - t.timestamp) < 5 * 60 * 1000 // 5 minutes
    );
    
    console.log('Recent transaction found:', recentTransaction);
    
    if (!recentTransaction) {
      console.log('No recent payment transaction found for this download');
      return res.status(403).json({ error: 'Payment verification failed' });
    }
    
    // Construct file path
    const filePath = path.join(__dirname, 'uploads', filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.log('File not found:', filePath);
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Set appropriate headers for download
    const ext = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';
    
    if (ext === '.dxf') {
      contentType = 'application/dxf';
    } else if (ext === '.stl' || ext === '.obj' || ext === '.3ds') {
      contentType = 'application/3d';
    } else if (ext === '.gd' || ext === '.gcode') {
      contentType = 'application/gcode';
    }
    
    // Set headers for download
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
    console.log(`File download started: ${filename} for ${buyer}`);
    
  } catch (error) {
    console.error('Error in file download:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

app.listen(PORT, () => console.log('Server running on port', PORT));
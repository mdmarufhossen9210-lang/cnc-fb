# Cloudinary Free Storage Setup Guide

## কেন Cloudinary?

✅ **25GB Free Storage** - সবচেয়ে বেশি free storage  
✅ **25GB Bandwidth/month** - Free tier এ  
✅ **Image/Video Optimization** - Automatic compression  
✅ **CDN Included** - Fast global delivery  
✅ **Easy Integration** - Simple API  

## Setup Steps:

### 1. Cloudinary Account তৈরি করুন:
1. https://cloudinary.com/users/register/free এ যান
2. Free account তৈরি করুন
3. Dashboard এ যান

### 2. API Credentials সংগ্রহ করুন:
1. Dashboard এ "Settings" → "Security" এ যান
2. নিচের credentials copy করুন:
   - **Cloud Name**
   - **API Key**
   - **API Secret**

### 3. Environment Variables Setup:

#### Local Development:
`.env` file তৈরি করুন:
```
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLOUDINARY_ENABLED=false
```

#### Render.com Deployment:
1. Render dashboard এ আপনার service এ যান
2. "Environment" tab এ যান
3. Environment Variables add করুন:
   - `CLOUDINARY_CLOUD_NAME` = your_cloud_name
   - `CLOUDINARY_API_KEY` = your_api_key
   - `CLOUDINARY_API_SECRET` = your_api_secret
   - `CLOUDINARY_ENABLED` = true

### 4. Install Dependencies:
```bash
npm install cloudinary dotenv
```

### 5. Usage:
- `CLOUDINARY_ENABLED=false` হলে local storage ব্যবহার হবে
- `CLOUDINARY_ENABLED=true` হলে Cloudinary ব্যবহার হবে

## Free Tier Limits:
- **Storage**: 25GB
- **Bandwidth**: 25GB/month
- **Transformations**: 25,000/month
- **Uploads**: Unlimited

## Alternative Options:

### Supabase Storage (1GB free):
- PostgreSQL database সহ
- Real-time features
- https://supabase.com

### Firebase Storage (5GB free):
- Google ecosystem
- Real-time database
- https://firebase.google.com

### AWS S3 (5GB free):
- Most popular
- Complex setup
- https://aws.amazon.com/s3



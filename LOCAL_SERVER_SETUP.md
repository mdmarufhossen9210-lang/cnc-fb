# লোকাল সার্ভার সেটআপ গাইড

## পরিবর্তনসমূহ

সব ফাইলে `https://my-fb-server-2.onrender.com` URL কে `http://localhost:5000` এ পরিবর্তন করা হয়েছে।

## সার্ভার চালু করার পদ্ধতি

### 1. Node.js ইনস্টল করুন (যদি না থাকে)
- Node.js ডাউনলোড করুন: https://nodejs.org/
- ইনস্টল করুন

### 2. Dependencies ইনস্টল করুন
```bash
npm install
```

### 3. সার্ভার চালু করুন
```bash
node server.js
```

অথবা

```bash
npm start
```

### 4. ব্রাউজারে খুলুন
- Main app: `http://localhost:5000/home.html`
- Deposit Admin Panel: `http://localhost:5000/deposit-admin-panel/index.html`
- Withdraw Admin Panel: `http://localhost:5000/withdraw-admin-panel/index.html`

## পরিবর্তিত ফাইলসমূহ

1. ✅ `server.js` - BASE_URL পরিবর্তন
2. ✅ `deposit-admin-panel/index.html` - সব API URL
3. ✅ `deposit-admin-panel/script.js` - সব API URL
4. ✅ `withdraw-admin-panel/index.html` - সব API URL
5. ✅ `withdraw-admin-panel/script.js` - সব API URL
6. ✅ `home.html` - সব API URL
7. ✅ `phone-password.html` - সব API URL
8. ✅ `profile.html` - সব API URL
9. ✅ `profiles.json` - Image URLs
10. ✅ `withdraw-admin-panel/README.md` - Documentation

## গুরুত্বপূর্ণ নোট

- সার্ভার চালু থাকা অবস্থায় সব API calls `http://localhost:5000` এ যাবে
- সার্ভার বন্ধ থাকলে কোনো API কাজ করবে না
- Port 5000 যদি ব্যবহৃত হয়, তাহলে `server.js` ফাইলে PORT পরিবর্তন করুন

## Troubleshooting

### Port already in use
যদি Port 5000 ব্যবহৃত হয়:
1. `server.js` ফাইলে `const PORT = 5000;` পরিবর্তন করুন
2. অথবা অন্য প্রোগ্রাম বন্ধ করুন যা Port 5000 ব্যবহার করছে

### CORS Error
সার্ভার চালু আছে কিনা নিশ্চিত করুন এবং `http://localhost:5000` URL ব্যবহার করুন।



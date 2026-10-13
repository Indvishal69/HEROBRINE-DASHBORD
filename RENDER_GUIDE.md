# 🚀 Render.com Deployment Guide (Minecraft AI Buddy)

Ye guide aapko batata hai ki is project ko **Render.com** (Free Web Service) par kaise deploy karein aur password security ke sath kaise chalayein.

---

## 📋 Features on Render:
1. **Password Panel:** Main dashboard se pehle password screen aayegi. Bina password ke koi bot control nahi kar sakta.
2. **Single-Port 3D Viewer:** Render sirf ek port (`PORT`) deta hai. Humne built-in reverse proxy banaya hai jo `/viewer/` se 3D live POV stream karta hai.
3. **Auto-Reconnect:** Server restart hone par bot automatically reconnect hota hai.
4. **Stacked API Keys:** OpenRouter ya Groq ki 4-5 keys stack karke auto-failover ke sath chalti hain.

---

## 🛠️ Step-by-Step Render Deployment:

### Step 1: GitHub par Repository banayein
1. Apne GitHub account par ek new repository create karein (e.g. `minecraft-ai-buddy`).
2. Is folder ke saare files us GitHub repo par push kar dein:
   ```bash
   git init
   git add .
   git commit -m "Initial commit with Render support and password panel"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/minecraft-ai-buddy.git
   git push -u origin main
   ```

---

### Step 2: Render.com par New Web Service banayein
1. [Render.com](https://render.com) par login karein.
2. Dashboard me **"New +"** button dabakar **"Web Service"** select karein.
3. Apni GitHub repository (`minecraft-ai-buddy`) connect karein.

---

### Step 3: Service Settings Configure karein
- **Name:** `minecraft-ai-buddy` (ya koi bhi manpasand naam)
- **Region:** Singapore / Frankfurt / Oregon (koi bhi select karein)
- **Branch:** `main`
- **Runtime:** `Node`
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Instance Type:** `Free`

---

### Step 4: Environment Variables (Important!)
Render settings ke **"Environment Variables"** tab me ye add karein:

| Variable Name | Value | Description |
|---|---|---|
| `DASHBOARD_PASSWORD` | `ApnaSecretPassword` | Dashboard unlock karne ka password (Default: `buddy123`) |
| `MC_HOST` | `phantomhorizon549.mcsh.io` | Minecraft Server IP / Address |
| `MC_PORT` | `25565` | Server Port |
| `MC_AUTH` | `offline` | Offline / Cracked / LAN mode |
| `MC_USERNAME` | `AIBuddy` | Bot ka Minecraft username |
| `NODE_VERSION` | `22` | Node.js version |
| `GEMINI_API_KEY` | *(Optional)* | Aapki Google Gemini API Key |
| `GROQ_API_KEY` | *(Optional)* | Aapki Groq LPU API Key |
| `OPENROUTER_API_KEY` | *(Optional)* | Aapki OpenRouter API Key |

---

### Step 5: Deploy Web Service!
- Neeche **"Create Web Service"** dabayein.
- 1 se 2 minute me build complete ho jayega aur Render aapko ek live URL dega:
  `https://minecraft-ai-buddy-xxxx.onrender.com`

---

## 🔄 Render Par Latest Code Update Kaise Karein (2 Tarike):

### Tarika 1: Automatic Update (Default)
Render by default aapki GitHub repo ke `main` branch se connect hota hai:
1. Humne latest code already GitHub par push kar diya hai (`main` branch).
2. Render automatically new commit detect karke **Auto-Deploy** shuru kar deta hai.
3. Render Dashboard par check karein: **"In progress"** ya **"Deploying..."** dikhega. 1-2 minute me deploy **"Live"** ho jayega!

### Tarika 2: Manual Update (Agar Auto-Deploy off ho ya turant karna ho)
1. [Render Dashboard](https://dashboard.render.com) open karein.
2. Apni service (`minecraft-nexus-ai` ya `minecraft-ai-buddy`) par click karein.
3. Top-Right corner me **"Manual Deploy"** button par click karein.
4. **"Clear build cache & deploy"** select karein (Isse clean build banta hai).
5. Render latest GitHub commit pull karke build start kar dega:
   - Build logs me `npm install && npm run build` chalega.
   - Status **"Live"** hote hi naya code (Gemini support, POV fix, etc.) live ho jayega!

### 🔑 Render me Gemini Key Kaise Add Karein:
1. Render service ke left menu me **"Environment"** par click karein.
2. **"Add Environment Variable"** par click karein:
   - **Key:** `GEMINI_API_KEY`
   - **Value:** Apna Gemini API Key (`AIzaSy...`) paste karein.
3. Neeche **"Save Changes"** dabayein. Render service ko automatically restart karke nayi key load kar lega!

---

## 🔑 Dashboard Access:
1. Render URL open karein: `https://minecraft-ai-buddy-xxxx.onrender.com`
2. Screen par **🔒 Password Lock Screen** dikhegi.
3. Apna password (Default: `buddy123` ya jo aapne `DASHBOARD_PASSWORD` me daala) daal kar **"Unlock Dashboard"** dabayein.
4. Dashboard unlock ho jayega:
   - **Live First-Person POV** screen me dikhega.
   - Screen click karke **WASD aur mouse** se live game control kar sakte hain.
   - Topbar me **🔒 Lock** button dabakar kisi bhi waqt dashboard ko wapas lock kar sakte hain.

---

## 💡 Important Render Free-Tier Tips:
- **Sleep after 15 mins of inactivity:** Render ka free tier 15 minute bina traffic ke sleep par chala jata hai.
- **24/7 Online rakhne ke liye:** Aap kisi free uptime monitoring service jaise [UptimeRobot](https://uptimerobot.com) ya [Cron-Job.org](https://cron-job.org) par apna Render URL (`https://your-app.onrender.com/api/auth/check`) har 5-10 minute me ping karwa sakte hain, jisse bot 24/7 server me online rahega!


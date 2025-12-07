// server.js
const express = require('express');
const multer  = require('multer');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

const upload = multer({ storage: multer.memoryStorage() });
const app = express();
app.disable('x-powered-by');

const PORT = process.env.PORT || 3000;

app.post('/deploy', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const siteName = (req.body.siteName || '').trim();
    const frontendToken = (req.body.token || '').trim(); // optional
    const serverToken = process.env.VERCEL_TOKEN || '';
    const token = frontendToken || serverToken;
    if(!token) return res.status(400).json({ error: 'No Vercel token provided. Set VERCEL_TOKEN on server or send token in form.' });
    if(!file) return res.status(400).json({ error: 'No file uploaded' });
    if(!siteName) return res.status(400).json({ error: 'siteName required' });

    // read file content (utf-8)
    const content = file.buffer.toString('utf8');

    // Prepare payload per Vercel v13: files array with { file, data, encoding }
    const payload = {
      name: siteName,
      files: [
        {
          file: 'index.html',
          data: content,
          encoding: 'utf-8'
        }
      ]
    };

    // Create deployment
    const createRes = await axios.post('https://api.vercel.com/v13/deployments', payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    });

    const deployment = createRes.data;
    // deployment.url may be in deployment.url or deployment.meta.url - return both raw
    const url = deployment.url || (deployment && deployment.deployment && deployment.deployment.url) || null;

    // Optionally poll for ready state (simple loop)
    let finalUrl = url;
    if(!finalUrl){
      // try to find id and poll status
      const id = deployment.id;
      if(id){
        // poll up to 10 times
        for(let i=0;i<10;i++){
          await new Promise(r=>setTimeout(r, 2000));
          const st = await axios.get(`https://api.vercel.com/v13/deployments/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if(st.data && st.data.url){
            finalUrl = st.data.url;
            break;
          }
        }
      }
    }

    res.json({ success: true, url: finalUrl || `https://${siteName}.vercel.app`, raw: deployment });
  } catch (err) {
    console.error('deploy error', err?.response?.data || err.message || err);
    const msg = err?.response?.data || err.message || 'unknown';
    res.status(500).json({ error: 'Deployment failed', details: msg });
  }
});

app.use(express.static(path.join(__dirname, 'public'))); // optional to serve frontend
app.listen(PORT, ()=> console.log(`Server ready on port ${PORT}`));

// api/waitlist.js
// Saves waitlist signup to Airtable + sends free cheat code PDF via Resend

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch(e) { body = {}; }
  }

  const name  = (body && body.name)  ? body.name.trim()  : '';
  const email = (body && body.email) ? body.email.trim().toLowerCase() : '';
  const source = (body && body.source) ? body.source : 'heyevee.com';

  if (!name || !email) return res.status(400).json({ error: 'Name and email required' });

  const airtableToken = process.env.AIRTABLE_TOKEN;
  const resendKey     = process.env.RESEND_API_KEY;
  const BASE_ID       = 'appHlID1S8XWfT3DD';
  const TABLE_ID      = 'tbleZnK8v4XmFsI2y';

  try {
    // 1. Check for duplicate email
    const formula  = encodeURIComponent('LOWER({email})="' + email + '"');
    const checkRes = await fetch(
      'https://api.airtable.com/v0/' + BASE_ID + '/' + TABLE_ID + '?filterByFormula=' + formula + '&maxRecords=1',
      { headers: { 'Authorization': 'Bearer ' + airtableToken } }
    );
    const checkData = await checkRes.json();

    if (checkData.records && checkData.records.length > 0) {
      // Already on list — still send success so they get the PDF again
      await sendCheatCode(resendKey, email, name);
      return res.status(200).json({ success: true, existing: true });
    }

    // 2. Save to Airtable
    const saveRes = await fetch(
      'https://api.airtable.com/v0/' + BASE_ID + '/' + TABLE_ID,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + airtableToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          records: [{
            fields: {
              email: email,
              name: name,
              joined: new Date().toISOString().split('T')[0],
              source: source
            }
          }]
        })
      }
    );

    if (!saveRes.ok) {
      const err = await saveRes.text();
      console.error('Airtable error:', err);
    } else {
      console.log('Waitlist signup saved:', email);
    }

    // 3. Send cheat code PDF email
    await sendCheatCode(resendKey, email, name);

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Waitlist error:', err.message);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}

async function sendCheatCode(apiKey, email, name) {
  if (!apiKey) { console.log('Resend not configured'); return; }

  const firstName = name ? name.split(' ')[0] : 'Mama';

  // PDF link — update this to your hosted PDF URL once uploaded
  const PDF_URL = 'https://heyevee.com/MomCreatorCheatCode.pdf';

  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>'
    + '<body style="margin:0;padding:0;background:#f5ede8;font-family:Helvetica,Arial,sans-serif">'
    + '<div style="max-width:540px;margin:0 auto;padding:32px 16px">'
    + '<div style="text-align:center;margin-bottom:24px">'
    + '<p style="font-family:Georgia,serif;font-size:26px;font-weight:700;color:#1a0d08;margin:0;letter-spacing:4px">HEY EVEE</p>'
    + '</div>'
    + '<div style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 20px rgba(26,13,8,.08)">'
    + '<div style="background:linear-gradient(135deg,#c4614a,#d4507a);padding:28px 24px;text-align:center">'
    + '<p style="font-size:11px;font-weight:900;color:rgba(255,255,255,.7);letter-spacing:2px;text-transform:uppercase;margin:0 0 8px">Your free gift is here</p>'
    + '<p style="font-family:Georgia,serif;font-size:22px;color:#fff;margin:0;line-height:1.3">The Mom Creator Cheat Code</p>'
    + '</div>'
    + '<div style="padding:28px 24px">'
    + '<p style="font-size:15px;color:#3a1e14;line-height:1.75;margin:0 0 16px">Hey ' + firstName + '! Welcome to the Hey Evee waitlist. You are officially one of the first to know when we launch.</p>'
    + '<p style="font-size:15px;color:#3a1e14;line-height:1.75;margin:0 0 20px">Here is your free cheat code — 5 content formulas that actually convert. Plug in your niche, post, and watch what happens.</p>'
    + '<div style="text-align:center;margin:24px 0">'
    + '<a href="' + PDF_URL + '" style="display:inline-block;background:linear-gradient(135deg,#c4614a,#d4507a);color:#fff;font-size:15px;font-weight:800;text-decoration:none;border-radius:24px;padding:14px 36px">Download Your Free PDF &#8250;</a>'
    + '</div>'
    + '<div style="background:#fdf8f5;border-radius:14px;padding:16px 18px;margin:0 0 20px;border:1px solid rgba(196,97,74,.1)">'
    + '<p style="font-size:12px;font-weight:900;color:#c4614a;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 8px">What is inside the cheat code</p>'
    + '<p style="font-size:13px;color:#3a1e14;line-height:1.8;margin:0">'
    + '&#9671; The Real Mom Confession formula<br/>'
    + '&#9671; The Before &amp; After Flip<br/>'
    + '&#9671; The Hot Take<br/>'
    + '&#9671; The POV Story<br/>'
    + '&#9671; The Number List Hook</p>'
    + '</div>'
    + '<p style="font-size:13px;color:#9a7060;line-height:1.75;margin:0 0 16px">We will be in touch when Hey Evee launches. You will get early access and first dibs on founding member pricing.</p>'
    + '<p style="font-size:13px;color:#9a7060;margin:0">With love,<br/><strong style="color:#1a0d08">Simone</strong><br/>'
    + '<span style="font-size:12px;color:#b09080">Founder, Hey Evee &#9671; Mom of Four &#9671; @lifewith.simone</span></p>'
    + '</div></div>'
    + '<div style="text-align:center;padding:20px 0">'
    + '<p style="font-size:11px;color:#b09080;margin:0">&#169; 2026 Hey Evee &#9671; <a href="https://heyevee.com" style="color:#c4614a;text-decoration:none">heyevee.com</a></p>'
    + '</div></div></body></html>';

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from:    'Simone at Hey Evee <hello@heyevee.com>',
        to:      [email],
        subject: 'Your free cheat code is here, ' + firstName + ' ✦',
        html:    html
      })
    });
    if (!response.ok) {
      console.error('Resend error:', await response.text());
    } else {
      console.log('Cheat code sent to:', email);
    }
  } catch (err) {
    console.error('Email failed:', err.message);
  }
}

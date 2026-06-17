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

    // Add to Mailchimp with waitlist tag
    const mcKey = process.env.MAILCHIMP_API_KEY;
    const mcAudience = process.env.MAILCHIMP_AUDIENCE_ID || '952a37e18e';
    if (mcKey) {
      const dc = mcKey.split('-')[1]; // e.g. us22
      const mcUrl = 'https://' + dc + '.api.mailchimp.com/3.0/lists/' + mcAudience + '/members';
      try {
        const mcRes = await fetch(mcUrl, {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from('anystring:' + mcKey).toString('base64'),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email_address: email,
            status: 'subscribed',
            merge_fields: { FNAME: name },
            tags: ['waitlist']
          })
        });
        const mcData = await mcRes.json();
        if (mcRes.ok) {
          console.log('Added to Mailchimp:', email);
        } else if (mcData.title === 'Member Exists') {
          // Already subscribed — just add the tag
          const memberHash = require('crypto').createHash('md5').update(email.toLowerCase()).digest('hex');
          await fetch('https://' + dc + '.api.mailchimp.com/3.0/lists/' + mcAudience + '/members/' + memberHash + '/tags', {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + Buffer.from('anystring:' + mcKey).toString('base64'),
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ tags: [{ name: 'waitlist', status: 'active' }] })
          });
          console.log('Mailchimp tag added to existing member:', email);
        } else {
          console.error('Mailchimp error:', mcData.detail || mcData.title);
        }
      } catch (mcErr) {
        console.error('Mailchimp request failed:', mcErr.message);
      }
    }
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
  const PDF_URL = 'https://app.heyevee.com/MomCreatorCheatCode.pdf';

  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>'
    + '<body style="margin:0;padding:0;background:#f5ede8;font-family:Helvetica,Arial,sans-serif">'
    + '<div style="max-width:540px;margin:0 auto;padding:32px 16px">'
    + '<div style="text-align:center;margin-bottom:24px">'
    + '<p style="font-family:Georgia,serif;font-size:26px;font-weight:700;color:#1a0d08;margin:0;letter-spacing:4px">HEY EVEE</p>'
    + '</div>'
    + '<div style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 20px rgba(26,13,8,.08)">'
    + '<div style="background:#c4614a;padding:20px 24px;text-align:center">'
    + '<p style="font-size:10px;font-weight:900;color:rgba(255,255,255,.7);letter-spacing:2px;text-transform:uppercase;margin:0 0 6px">Your free gift is here</p>'
    + '<p style="font-family:Georgia,serif;font-size:20px;color:#fff;margin:0;line-height:1.3">The Mom Creator Cheat Code</p>'
    + '</div>'
    + '<div style="padding:20px 24px">'
    + '<p style="font-size:15px;color:#3a1e14;line-height:1.75;margin:0 0 16px">Hey ' + firstName + '! Welcome to the Hey Evee waitlist. You are officially one of the first to know when we launch.</p>'
    + '<p style="font-size:15px;color:#3a1e14;line-height:1.75;margin:0 0 20px">Here is your free cheat code — 5 content formulas that actually convert. Plug in your niche, post, and watch what happens.</p>'
    + '<div style="text-align:center;margin:28px 0">'
    + '<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">'
    + '<table cellpadding="0" cellspacing="0" border="0"><tr>'
    + '<td style="background-color:#c4614a;border-radius:28px;padding:16px 40px">'
    + '<a href="' + PDF_URL + '" target="_blank" style="display:inline-block;color:#ffffff;font-size:16px;font-weight:800;text-decoration:none;font-family:Helvetica,Arial,sans-serif">Download Your Free Cheat Code &rsaquo;</a>'
    + '</td></tr></table>'
    + '</td></tr></table>'
    + '</div>'
    + '<p style="font-size:12px;color:#9a7060;text-align:center;margin:0 0 20px">Tap the button above to download your free PDF</p>'
    + '<div style="background:#fdf8f5;border-radius:14px;padding:16px 18px;margin:0 0 20px;border:1px solid rgba(196,97,74,.1)">'
    + '<p style="font-size:12px;font-weight:900;color:#c4614a;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 8px">What is inside the cheat code</p>'
    + '<p style="font-size:13px;color:#3a1e14;line-height:1.8;margin:0">'
    + '&#9671; The Real Mom Confession formula<br/>'
    + '&#9671; The Before &amp; After Flip<br/>'
    + '&#9671; The Hot Take<br/>'
    + '&#9671; The POV Story<br/>'
    + '&#9671; The Number List Hook</p>'
    + '</div>'
    + '<p style="font-size:13px;color:#9a7060;line-height:1.75;margin:0 0 8px">If the button above does not work, copy and paste this link: <a href="' + PDF_URL + '" style="color:#c4614a">' + PDF_URL + '</a></p>'
    + '<p style="font-size:13px;color:#9a7060;line-height:1.75;margin:0 0 16px">We will be in touch when Hey Evee launches. You will get early access and first dibs on founding member pricing.</p>'
    + '<p style="font-size:13px;color:#9a7060;margin:0">With love,<br/><strong style="color:#1a0d08">Simone</strong><br/>'
    + '<span style="font-size:12px;color:#b09080">Founder, Hey Evee &#9671; Mom of Four &#9671; @heyeveeapp</span></p>'
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

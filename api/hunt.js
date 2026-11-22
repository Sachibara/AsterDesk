const careers = 'https://www.sliick.com/careers/';
const role = careers + 'salesforce-developer/';
const portfolio = 'https://jimcamus.vercel.app/';
async function read(url) {
  const response = await fetch(url, {redirect:'error', signal:AbortSignal.timeout(9000)});
  if (!response.ok) throw Error('Source unavailable');
  return response.text();
}
function plain(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
}
async function emailOpening() {
  const [index, page] = await Promise.all([read(careers),read(role)]);
  const subject = 'Application - Salesforce Developer';
  const text = plain(page);
  if (!/href="(?:https:\/\/www\.sliick\.com)?\/careers\/salesforce-developer\/?"/i.test(index)
    || !page.includes('mailto:careers@sliick.com?subject='+encodeURIComponent(subject))
    || !text.includes('Please send your CV and a brief cover letter highlighting something you have built')
    || !text.includes('based in the Philippines') || /wire transfer|application fee|bank account|crypto payment|position (?:is |has been )?(?:closed|filled)/i.test(text)) return [];
  return [{title:'Salesforce Developer',company:'Sliick',location:'Remote · Philippines',remote:true,url:role,recipient:'careers@sliick.com',subject,skills:['salesforce','apex','lwc']}];
}
async function board() {
  const data = JSON.parse(await read('https://boards-api.greenhouse.io/v1/boards/cloudflare/jobs'));
  return data.jobs.filter(j=>Number.isSafeInteger(j.id)&&/\bremote\b/i.test(j.location?.name)&&!/hybrid|on.?site|office/i.test(j.location?.name)).map(j=>({title:j.title,company:'Cloudflare',source:'Greenhouse',remote:true,location:j.location?.name || '',url:'https://job-boards.greenhouse.io/cloudflare/jobs/'+j.id}));
}
module.exports = async function(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET') return res.status(405).end();
  try {
    if(req.query.verify==='email') return res.json({jobs:await emailOpening()});
    const results=await Promise.allSettled([emailOpening(),board(),read(portfolio)]);
    const [email,ats,site]=results;
    return res.json({jobs:[...(email.value||[]),...(ats.value||[])],portfolio:plain(site.value||'').slice(0,60000),unavailable:['Sliick','Cloudflare','portfolio'].filter((_,i)=>results[i].status==='rejected'),clientId:process.env.GOOGLE_WEB_CLIENT_ID||''});
  } catch { return res.status(503).json({error:'Employer verification unavailable'}); }
};
